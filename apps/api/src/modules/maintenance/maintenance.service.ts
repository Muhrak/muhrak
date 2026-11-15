import {
  MAINTENANCE_MAX_DAYS_AHEAD,
  MAINTENANCE_MAX_HOURS,
  MAINTENANCE_MIN_MINUTES,
  MAINTENANCE_SCOPE_LABELS,
  MAINTENANCE_WARNING_HOURS,
  type AdminMaintenance,
  type CloseMaintenanceInput,
  type MaintenanceHistory,
  type MaintenanceHistoryQuery,
  type MaintenanceScope,
  type MaintenanceState,
  type MaintenanceWindow,
  type ScheduleMaintenanceInput,
  type SiteStatus,
  type StartMaintenanceInput,
} from "../../schemas";
import type { MaintenanceWindowRow } from "../../db/schema";
import { AppError, badRequest, conflict, notFound } from "../../shared/errors";
import { logger } from "../../shared/logger";
import { recordAudit } from "../audit";
import { confirmPassword, getUsersByIds } from "../auth";
import * as repo from "./maintenance.repository";

/**
 * Service layer: the rules of maintenance mode.
 *
 * - One open window (running or upcoming) at a time; every change runs
 *   under one database lock, so double clicks and two admins cannot race.
 * - Every change needs the admin's password again (confirmPassword) and is
 *   audit logged in the same transaction.
 * - Times are checked here on the server: no window in the past, none
 *   longer than MAINTENANCE_MAX_HOURS, none more than
 *   MAINTENANCE_MAX_DAYS_AHEAD ahead.
 * - Windows are never deleted or edited: end, cancel, or schedule a new one.
 * - The admin console never goes offline (see maintenance.gate.ts), so an
 *   admin can always turn maintenance off again.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export interface Actor {
  userId: string;
  ip: string | null;
}

// ---------------------------------------------------------------- open windows (cached for the gate)

/**
 * The gate runs on every request, so the open windows are kept in memory
 * and re-read at most every CACHE_MS. A change made on this API copy
 * clears the cache at once; another copy (when there are several) sees it
 * within CACHE_MS. Scheduled windows start on time without a reload: the
 * cache holds upcoming windows too and the clock is checked per request.
 */
const CACHE_MS = 5_000;
let cache: { loadedAt: number; windows: MaintenanceWindowRow[] } | null = null;
let loading: Promise<MaintenanceWindowRow[]> | null = null;
/** Bumped on every change, so a read that started before the change never stores the old state. */
let generation = 0;

export function clearMaintenanceCache(): void {
  generation += 1;
  cache = null;
  loading = null;
}

export async function getOpenWindows(now = new Date()): Promise<MaintenanceWindowRow[]> {
  if (cache && now.getTime() - cache.loadedAt < CACHE_MS) return cache.windows;
  if (!loading) {
    const started = generation;
    const load: Promise<MaintenanceWindowRow[]> = repo
      .findOpenWindows(now)
      .then((windows) => {
        if (started === generation) cache = { loadedAt: Date.now(), windows };
        return windows;
      })
      .finally(() => {
        if (loading === load) loading = null;
      });
    loading = load;
  }
  try {
    return await loading;
  } catch (err) {
    // Database trouble: keep the last known state (fail safe both ways: a
    // site under maintenance stays under maintenance). Nothing known yet:
    // let the error through (the request would fail on the database anyway).
    if (cache) {
      logger.error({ err }, "Could not refresh maintenance state; using the last known one");
      return cache.windows;
    }
    throw err;
  }
}

export function stateOf(row: MaintenanceWindowRow, now: Date): MaintenanceState {
  if (row.cancelledAt) return "cancelled";
  if (row.endedAt) return "ended";
  if (row.startsAt > now) return "scheduled";
  if (row.endsAt && row.endsAt <= now) return "finished";
  return "active";
}

export function activeWindow(windows: MaintenanceWindowRow[], now: Date): MaintenanceWindowRow | undefined {
  return windows.find((row) => stateOf(row, now) === "active");
}

/** The part of the site a request belongs to; "shared" is blocked only by whole-site maintenance. */
export type RequestSide = "buyer" | "seller" | "shared";

export function scopeCovers(scope: MaintenanceScope, side: RequestSide): boolean {
  return scope === "whole_site" || scope === side;
}

/** The 503 the API answers while maintenance covers a request. */
export function maintenanceError(row: MaintenanceWindowRow, now: Date): AppError {
  const retryAfterSeconds = row.endsAt ? Math.max(60, Math.ceil((row.endsAt.getTime() - now.getTime()) / 1000)) : 300;
  return new AppError(503, "maintenance", row.message, {
    scope: row.scope,
    endsAt: row.endsAt?.toISOString() ?? null,
    retryAfterSeconds,
  });
}

// ---------------------------------------------------------------- public status

export async function getSiteStatus(now = new Date()): Promise<SiteStatus> {
  const windows = await getOpenWindows(now);
  const active = activeWindow(windows, now);
  const upcoming = windows.find(
    (row) => stateOf(row, now) === "scheduled" && row.startsAt.getTime() - now.getTime() <= MAINTENANCE_WARNING_HOURS * HOUR,
  );
  return {
    maintenance: active ? { scope: active.scope, message: active.message, endsAt: active.endsAt?.toISOString() ?? null } : null,
    upcoming:
      upcoming && !active
        ? { scope: upcoming.scope, message: upcoming.message, startsAt: upcoming.startsAt.toISOString(), endsAt: upcoming.endsAt?.toISOString() ?? null }
        : null,
  };
}

// ---------------------------------------------------------------- admin: read

async function toWindows(rows: MaintenanceWindowRow[], now: Date): Promise<MaintenanceWindow[]> {
  const ids = [...new Set(rows.flatMap((row) => [row.createdBy, row.endedBy, row.cancelledBy].filter((id): id is string => !!id)))];
  const users = new Map((await getUsersByIds(ids)).map((user) => [user.id, user]));
  const actor = (id: string | null) => (id ? { id, fullName: users.get(id)?.fullName ?? "Removed admin" } : null);
  return rows.map((row) => {
    const state = stateOf(row, now);
    const closedAt = row.cancelledAt ?? row.endedAt ?? (state === "finished" ? row.endsAt : null);
    return {
      id: row.id,
      scope: row.scope,
      message: row.message,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt?.toISOString() ?? null,
      state,
      closedAt: closedAt?.toISOString() ?? null,
      createdBy: actor(row.createdBy)!,
      closedBy: actor(row.cancelledBy ?? row.endedBy),
      createdAt: row.createdAt.toISOString(),
    };
  });
}

export async function getAdminMaintenance(now = new Date()): Promise<AdminMaintenance> {
  // Straight from the database (not the cache): the console shows the truth.
  const [open, last] = await Promise.all([repo.findOpenWindows(now), repo.findLastClosedWindow(now)]);
  const [current = null, lastWindow = null] = await Promise.all([
    open[0] ? toWindows([open[0]], now).then((list) => list[0]) : undefined,
    last ? toWindows([last], now).then((list) => list[0]) : undefined,
  ]);
  return { current, last: lastWindow, serverTime: now.toISOString() };
}

function encodeCursor(row: MaintenanceWindowRow): string {
  return Buffer.from(JSON.stringify([row.startsAt.toISOString(), row.id])).toString("base64url");
}

function decodeCursor(cursor: string | undefined): repo.HistoryCursor | null {
  if (!cursor) return null;
  try {
    const [at, id] = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as [unknown, unknown];
    const date = typeof at === "string" ? new Date(at) : null;
    if (!date || Number.isNaN(date.getTime()) || typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("bad");
    return { at: date, id };
  } catch {
    throw badRequest("This page link is not valid. Go back to the first page.");
  }
}

export async function listMaintenanceHistory(query: MaintenanceHistoryQuery, now = new Date()): Promise<MaintenanceHistory> {
  const rows = await repo.listWindows({ cursor: decodeCursor(query.cursor), limit: query.limit + 1 });
  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  return {
    items: await toWindows(page, now),
    nextCursor: rows.length > query.limit && last ? encodeCursor(last) : null,
  };
}

// ---------------------------------------------------------------- admin: changes

const ONE_AT_A_TIME = "Maintenance is already on or scheduled. End or cancel it first.";

function parseTime(value: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw badRequest("That date is not valid.");
  return date;
}

function checkLength(startsAt: Date, endsAt: Date): void {
  const length = endsAt.getTime() - startsAt.getTime();
  if (length < MAINTENANCE_MIN_MINUTES * MINUTE) throw badRequest(`The window must last at least ${MAINTENANCE_MIN_MINUTES} minutes.`);
  if (length > MAINTENANCE_MAX_HOURS * HOUR) throw badRequest(`The window can last at most ${MAINTENANCE_MAX_HOURS} hours.`);
}

function auditDetails(row: MaintenanceWindowRow) {
  return {
    scope: row.scope,
    scopeLabel: MAINTENANCE_SCOPE_LABELS[row.scope],
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    message: row.message,
  };
}

/** Turn maintenance on now, until `endsAt` or until an admin ends it. */
export async function startMaintenance(actor: Actor, input: StartMaintenanceInput, now = new Date()): Promise<AdminMaintenance> {
  const endsAt = input.endsAt ? parseTime(input.endsAt) : null;
  if (endsAt) checkLength(now, endsAt);
  await confirmPassword(actor.userId, input.password, "admin");

  await repo.withMaintenanceLock(async (tx) => {
    if ((await repo.findOpenWindows(now, tx)).length > 0) throw conflict(ONE_AT_A_TIME);
    const row = await repo.insertWindow(tx, {
      scope: input.scope,
      message: input.message,
      startsAt: now,
      endsAt,
      createdBy: actor.userId,
      createdAt: now,
    });
    await recordAudit(
      { actorUserId: actor.userId, action: "maintenance.started", entityType: "maintenance_window", entityId: row.id, details: auditDetails(row), ip: actor.ip },
      tx,
    );
  });
  clearMaintenanceCache();
  logger.warn({ userId: actor.userId, scope: input.scope }, "Maintenance mode turned on");
  return getAdminMaintenance(now);
}

/** Schedule a window ahead of time. Users see a warning banner MAINTENANCE_WARNING_HOURS before it starts. */
export async function scheduleMaintenance(actor: Actor, input: ScheduleMaintenanceInput, now = new Date()): Promise<AdminMaintenance> {
  const startsAt = parseTime(input.startsAt);
  const endsAt = parseTime(input.endsAt);
  if (startsAt.getTime() < now.getTime() + MINUTE) throw badRequest("The start must be in the future. To start now, use Turn on now.");
  if (startsAt.getTime() > now.getTime() + MAINTENANCE_MAX_DAYS_AHEAD * 24 * HOUR) {
    throw badRequest(`Schedule at most ${MAINTENANCE_MAX_DAYS_AHEAD} days ahead.`);
  }
  if (endsAt <= startsAt) throw badRequest("The end must be after the start.");
  checkLength(startsAt, endsAt);
  await confirmPassword(actor.userId, input.password, "admin");

  await repo.withMaintenanceLock(async (tx) => {
    if ((await repo.findOpenWindows(now, tx)).length > 0) throw conflict(ONE_AT_A_TIME);
    const row = await repo.insertWindow(tx, {
      scope: input.scope,
      message: input.message,
      startsAt,
      endsAt,
      createdBy: actor.userId,
      createdAt: now,
    });
    await recordAudit(
      { actorUserId: actor.userId, action: "maintenance.scheduled", entityType: "maintenance_window", entityId: row.id, details: auditDetails(row), ip: actor.ip },
      tx,
    );
  });
  clearMaintenanceCache();
  return getAdminMaintenance(now);
}

/** Turn a running window off now: the site comes back at once. */
export async function endMaintenance(actor: Actor, windowId: string, input: CloseMaintenanceInput, now = new Date()): Promise<AdminMaintenance> {
  await confirmPassword(actor.userId, input.password, "admin");
  await repo.withMaintenanceLock(async (tx) => {
    const row = await repo.lockWindow(tx, windowId);
    if (!row) throw notFound("Maintenance window not found");
    const state = stateOf(row, now);
    if (state === "scheduled") throw conflict("This window has not started yet. Cancel it instead.");
    if (state !== "active") throw conflict("This maintenance is already over.");
    const ended = await repo.endWindow(tx, row.id, actor.userId, now);
    if (!ended) throw conflict("This maintenance is already over.");
    await recordAudit(
      {
        actorUserId: actor.userId,
        action: "maintenance.ended",
        entityType: "maintenance_window",
        entityId: row.id,
        details: { ...auditDetails(row), endedAt: now.toISOString() },
        ip: actor.ip,
      },
      tx,
    );
  });
  clearMaintenanceCache();
  logger.warn({ userId: actor.userId, windowId }, "Maintenance mode turned off");
  return getAdminMaintenance(now);
}

/** Cancel a window that has not started. */
export async function cancelMaintenance(actor: Actor, windowId: string, input: CloseMaintenanceInput, now = new Date()): Promise<AdminMaintenance> {
  await confirmPassword(actor.userId, input.password, "admin");
  await repo.withMaintenanceLock(async (tx) => {
    const row = await repo.lockWindow(tx, windowId);
    if (!row) throw notFound("Maintenance window not found");
    const state = stateOf(row, now);
    if (state === "active") throw conflict("This window has already started. Turn it off instead.");
    if (state !== "scheduled") throw conflict("This window is already over.");
    const cancelled = await repo.cancelWindow(tx, row.id, actor.userId, now);
    if (!cancelled) throw conflict("This window is already over.");
    await recordAudit(
      { actorUserId: actor.userId, action: "maintenance.cancelled", entityType: "maintenance_window", entityId: row.id, details: auditDetails(row), ip: actor.ip },
      tx,
    );
  });
  clearMaintenanceCache();
  return getAdminMaintenance(now);
}
