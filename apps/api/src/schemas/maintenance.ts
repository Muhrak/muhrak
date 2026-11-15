import { z } from "zod";

/**
 * Maintenance mode (admin console "Maintenance Mode", Figma 414:5122).
 *
 * An admin turns maintenance on now or schedules a window. While a window
 * is in effect the API answers 503 `maintenance` to the part of the site it
 * covers; the admin console always stays up. Every change needs the admin's
 * password again and is audit logged.
 */

export const maintenanceScopeSchema = z.enum(["whole_site", "buyer", "seller"]);
export type MaintenanceScope = z.infer<typeof maintenanceScopeSchema>;

export const MAINTENANCE_SCOPE_LABELS: Record<MaintenanceScope, string> = {
  whole_site: "Whole site",
  buyer: "Buyer app",
  seller: "Seller Centre",
};

export const MAINTENANCE_MESSAGE_MAX = 300;
/** Longest window, scheduled or "until" on a turn-on-now. */
export const MAINTENANCE_MAX_HOURS = 72;
/** Shortest scheduled window. */
export const MAINTENANCE_MIN_MINUTES = 5;
/** How far ahead a window may be scheduled. */
export const MAINTENANCE_MAX_DAYS_AHEAD = 90;
/** Users see the warning banner this long before a scheduled window starts. */
export const MAINTENANCE_WARNING_HOURS = 24;

/**
 * Plain text only: no control characters other than line breaks, and no
 * invisible direction overrides (they can make text read differently from
 * what it is). Shown as text, never as HTML.
 */
function isPlainText(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if (code === 10) continue;
    if (code < 32 || (code >= 0x7f && code <= 0x9f)) return false;
    if (code === 0x2028 || code === 0x2029 || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069)) return false;
  }
  return true;
}

export const maintenanceMessageSchema = z
  .string()
  .trim()
  .min(10, "Write at least 10 characters")
  .max(MAINTENANCE_MESSAGE_MAX, `Keep it under ${MAINTENANCE_MESSAGE_MAX} characters`)
  .refine(isPlainText, "Use plain text only");

const dateTimeSchema = z.iso.datetime({ offset: true });

/** The admin's password, asked again for every change (a stolen session alone cannot take the site down). */
const confirmPasswordSchema = z.string().min(1, "Enter your password").max(200);

/** POST /v1/admin/maintenance/start: turn on now, optionally until a time. */
export const startMaintenanceSchema = z.object({
  scope: maintenanceScopeSchema,
  message: maintenanceMessageSchema,
  endsAt: dateTimeSchema.nullable().optional(),
  password: confirmPasswordSchema,
});
export type StartMaintenanceInput = z.infer<typeof startMaintenanceSchema>;

/** POST /v1/admin/maintenance/schedule */
export const scheduleMaintenanceSchema = z.object({
  scope: maintenanceScopeSchema,
  message: maintenanceMessageSchema,
  startsAt: dateTimeSchema,
  endsAt: dateTimeSchema,
  password: confirmPasswordSchema,
});
export type ScheduleMaintenanceInput = z.infer<typeof scheduleMaintenanceSchema>;

/**
 * POST /v1/admin/maintenance/:id/end (running window) and /:id/cancel
 * (upcoming window). The id names the window the admin is looking at, so
 * a stale page can never end or cancel a different one.
 */
export const closeMaintenanceSchema = z.object({
  password: confirmPasswordSchema,
});
export type CloseMaintenanceInput = z.infer<typeof closeMaintenanceSchema>;

export const maintenanceStateSchema = z.enum(["scheduled", "active", "finished", "ended", "cancelled"]);
export type MaintenanceState = z.infer<typeof maintenanceStateSchema>;

const actorSchema = z.object({ id: z.string().uuid(), fullName: z.string() });

/** A window as admins see it. */
export const maintenanceWindowSchema = z.object({
  id: z.string().uuid(),
  scope: maintenanceScopeSchema,
  message: z.string(),
  startsAt: z.string(),
  /** Planned end; null = until an admin ends it. */
  endsAt: z.string().nullable(),
  /**
   * scheduled: not started yet. active: in effect now. finished: reached
   * its planned end. ended: turned off by an admin. cancelled: never started.
   */
  state: maintenanceStateSchema,
  /** When it actually stopped (ended, finished) or was cancelled; null while scheduled or active. */
  closedAt: z.string().nullable(),
  createdBy: actorSchema,
  closedBy: actorSchema.nullable(),
  createdAt: z.string(),
});
export type MaintenanceWindow = z.infer<typeof maintenanceWindowSchema>;

/** GET /v1/admin/maintenance: the open window (running or upcoming), if any. */
export const adminMaintenanceSchema = z.object({
  current: maintenanceWindowSchema.nullable(),
  /** The most recent window that is over, for "Last maintenance: ...". */
  last: maintenanceWindowSchema.nullable(),
  serverTime: z.string(),
});
export type AdminMaintenance = z.infer<typeof adminMaintenanceSchema>;

/** GET /v1/admin/maintenance/history?cursor=&limit= */
export const maintenanceHistoryQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type MaintenanceHistoryQuery = z.infer<typeof maintenanceHistoryQuerySchema>;

export const maintenanceHistorySchema = z.object({
  items: z.array(maintenanceWindowSchema),
  nextCursor: z.string().nullable(),
});
export type MaintenanceHistory = z.infer<typeof maintenanceHistorySchema>;

/** GET /v1/status: public. What the web app needs to show the maintenance page or the warning banner. */
export const siteStatusSchema = z.object({
  maintenance: z
    .object({
      scope: maintenanceScopeSchema,
      message: z.string(),
      endsAt: z.string().nullable(),
    })
    .nullable(),
  /** A window starting within MAINTENANCE_WARNING_HOURS. */
  upcoming: z
    .object({
      scope: maintenanceScopeSchema,
      message: z.string(),
      startsAt: z.string(),
      endsAt: z.string().nullable(),
    })
    .nullable(),
});
export type SiteStatus = z.infer<typeof siteStatusSchema>;

/** Body of the API's 503 while maintenance is on (`error.details`). */
export const maintenanceErrorDetailsSchema = z.object({
  scope: maintenanceScopeSchema,
  endsAt: z.string().nullable(),
});
