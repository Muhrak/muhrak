import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "../db/client";
import { jobs, type JobRow } from "../db/schema";

/**
 * Background job queue in PostgreSQL (no Redis; developer decision,
 * 14 Nov 2026). Requests only ADD jobs here; the worker (src/worker) runs
 * them, with retries and backoff, and jobs survive a restart.
 *
 * Shared infrastructure, like the database client: modules add jobs through
 * their own services (e.g. notification), never by touching other modules'
 * tables.
 */

export interface EnqueueOptions {
  /** Unique per real-world event: adding the same key twice is ignored, so a retried request cannot send twice. */
  dedupeKey: string;
  maxAttempts?: number;
  /** Run no earlier than this. Default: now. */
  runAt?: Date;
}

type Listener = () => void;
const listeners = new Set<Listener>();

/** The worker subscribes, so a new job starts at once instead of at the next poll. */
export function onJobAdded(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Add a job. Returns false if a job with this dedupe key already exists. */
export async function enqueueJob(queue: string, name: string, payload: unknown, options: EnqueueOptions): Promise<boolean> {
  const rows = await db
    .insert(jobs)
    .values({
      queue,
      name,
      payload,
      dedupeKey: options.dedupeKey,
      maxAttempts: options.maxAttempts ?? 5,
      runAt: options.runAt ?? new Date(),
    })
    .onConflictDoNothing({ target: jobs.dedupeKey })
    .returning({ id: jobs.id });
  if (rows.length === 1) for (const listener of listeners) listener();
  return rows.length === 1;
}

/**
 * Claim up to `limit` due jobs of `queue` for this process. FOR UPDATE SKIP
 * LOCKED means two API copies polling at once never claim the same row.
 * Each claim counts as an attempt.
 */
export async function claimDueJobs(queue: string, limit: number): Promise<JobRow[]> {
  const result = await db.execute<Record<string, unknown>>(sql`
    UPDATE ${jobs}
    SET status = 'running', locked_at = now(), attempts = attempts + 1, updated_at = now()
    WHERE id IN (
      SELECT id FROM ${jobs}
      WHERE queue = ${queue} AND status = 'pending' AND run_at <= now()
      ORDER BY run_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `);
  const ids = result.rows.map((row) => String(row.id));
  if (ids.length === 0) return [];
  return db.select().from(jobs).where(inArray(jobs.id, ids));
}

/** Finished: keep the row for the record, drop the payload (it may hold one-time links). */
export async function markJobDone(id: string): Promise<void> {
  await db
    .update(jobs)
    .set({ status: "done", payload: null, lockedAt: null, lastError: null, updatedAt: new Date() })
    .where(eq(jobs.id, id));
}

/**
 * Failed this attempt. Retries with exponential backoff (10 s, 20 s, 40 s,
 * ...) until `maxAttempts`, or stops at once when `permanent`. A job that
 * gives up keeps its error but loses its payload.
 */
export async function markJobFailed(job: JobRow, error: string, permanent: boolean, now = new Date()): Promise<"retry" | "failed"> {
  const message = error.slice(0, 500);
  if (permanent || job.attempts >= job.maxAttempts) {
    await db
      .update(jobs)
      .set({ status: "failed", payload: null, lockedAt: null, lastError: message, updatedAt: now })
      .where(eq(jobs.id, job.id));
    return "failed";
  }
  const delayMs = 10_000 * 2 ** Math.max(0, job.attempts - 1);
  await db
    .update(jobs)
    .set({ status: "pending", lockedAt: null, lastError: message, runAt: new Date(now.getTime() + delayMs), updatedAt: now })
    .where(eq(jobs.id, job.id));
  return "retry";
}

/**
 * Jobs left "running" by a process that stopped mid-job (crash, deploy) go
 * back to pending. The email provider's idempotency key (the job id)
 * prevents a second send if the first one had in fact gone out.
 */
export async function releaseStaleJobs(olderThanMs: number, now = new Date()): Promise<number> {
  const rows = await db
    .update(jobs)
    .set({ status: "pending", lockedAt: null, updatedAt: now })
    .where(and(eq(jobs.status, "running"), lt(jobs.lockedAt, new Date(now.getTime() - olderThanMs))))
    .returning({ id: jobs.id });
  return rows.length;
}
