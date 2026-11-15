import { and, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { maintenanceWindows, type MaintenanceWindowRow } from "../../db/schema";

/** Repository layer: database queries only. Windows are never deleted. */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Executor = typeof db | Tx;

/**
 * Run `work` in a transaction that holds the maintenance lock: every change
 * to the windows goes through here, one at a time, so two admins (or a
 * double click) can never open two windows or close one twice.
 */
export function withMaintenanceLock<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('muhrak.maintenance_windows'))`);
    return work(tx);
  });
}

/** Windows not ended or cancelled whose planned end (if any) is after `now`: running or upcoming. */
export async function findOpenWindows(now: Date, ex: Executor = db): Promise<MaintenanceWindowRow[]> {
  return ex
    .select()
    .from(maintenanceWindows)
    .where(
      and(
        isNull(maintenanceWindows.endedAt),
        isNull(maintenanceWindows.cancelledAt),
        or(isNull(maintenanceWindows.endsAt), gt(maintenanceWindows.endsAt, now)),
      ),
    )
    .orderBy(maintenanceWindows.startsAt)
    .limit(5);
}

export async function lockWindow(tx: Tx, id: string): Promise<MaintenanceWindowRow | undefined> {
  const rows = await tx.select().from(maintenanceWindows).where(eq(maintenanceWindows.id, id)).for("update").limit(1);
  return rows[0];
}

export async function insertWindow(
  tx: Tx,
  values: { scope: MaintenanceWindowRow["scope"]; message: string; startsAt: Date; endsAt: Date | null; createdBy: string; createdAt: Date },
): Promise<MaintenanceWindowRow> {
  const rows = await tx.insert(maintenanceWindows).values(values).returning();
  return rows[0]!;
}

/** End a running window. Conditional: does nothing if it was already ended or cancelled. */
export async function endWindow(tx: Tx, id: string, by: string, at: Date): Promise<MaintenanceWindowRow | undefined> {
  const rows = await tx
    .update(maintenanceWindows)
    .set({ endedAt: at, endedBy: by })
    .where(and(eq(maintenanceWindows.id, id), isNull(maintenanceWindows.endedAt), isNull(maintenanceWindows.cancelledAt)))
    .returning();
  return rows[0];
}

/** Cancel an upcoming window. Conditional: only before it starts, and only once. */
export async function cancelWindow(tx: Tx, id: string, by: string, at: Date): Promise<MaintenanceWindowRow | undefined> {
  const rows = await tx
    .update(maintenanceWindows)
    .set({ cancelledAt: at, cancelledBy: by })
    .where(
      and(
        eq(maintenanceWindows.id, id),
        isNull(maintenanceWindows.endedAt),
        isNull(maintenanceWindows.cancelledAt),
        gt(maintenanceWindows.startsAt, at),
      ),
    )
    .returning();
  return rows[0];
}

export interface HistoryCursor {
  at: Date;
  id: string;
}

/** Every window, newest start first (keyset pages on starts_at, id). */
export async function listWindows(input: { cursor: HistoryCursor | null; limit: number }): Promise<MaintenanceWindowRow[]> {
  const { cursor } = input;
  return db
    .select()
    .from(maintenanceWindows)
    .where(
      cursor
        ? or(lt(maintenanceWindows.startsAt, cursor.at), and(eq(maintenanceWindows.startsAt, cursor.at), lt(maintenanceWindows.id, cursor.id)))
        : undefined,
    )
    .orderBy(desc(maintenanceWindows.startsAt), desc(maintenanceWindows.id))
    .limit(input.limit);
}

/** The latest window that has run and is over (ended or reached its end), for "Last maintenance". */
export async function findLastClosedWindow(now: Date): Promise<MaintenanceWindowRow | undefined> {
  const rows = await db
    .select()
    .from(maintenanceWindows)
    .where(
      and(
        isNull(maintenanceWindows.cancelledAt),
        or(sql`${maintenanceWindows.endedAt} is not null`, lt(maintenanceWindows.endsAt, now), eq(maintenanceWindows.endsAt, now)),
      ),
    )
    .orderBy(desc(maintenanceWindows.startsAt), desc(maintenanceWindows.id))
    .limit(1);
  return rows[0];
}
