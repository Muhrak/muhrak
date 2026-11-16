import { and, count, eq, gte, inArray, sql, sum } from "drizzle-orm";
import { db } from "../../db/client";
import { aiIdentifications, type AiIdentificationRow } from "../../db/schema";

/** Repository layer: database queries only. Identifications are never deleted. */

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Run `work` in a transaction holding the AI budget lock. Every new
 * identification is checked (daily limit, monthly budget) and inserted
 * inside it, one at a time, so parallel requests cannot all pass the check.
 */
export function withBudgetLock<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('muhrak.ai_budget'))`);
    return work(tx);
  });
}

export async function findById(id: string): Promise<AiIdentificationRow | undefined> {
  const rows = await db.select().from(aiIdentifications).where(eq(aiIdentifications.id, id)).limit(1);
  return rows[0];
}

export async function findByUpload(uploadId: string, ex: typeof db | Tx = db): Promise<AiIdentificationRow | undefined> {
  const rows = await ex.select().from(aiIdentifications).where(eq(aiIdentifications.uploadId, uploadId)).limit(1);
  return rows[0];
}

/** Identifications a user started since `since` (any outcome). */
export async function countByUserSince(tx: Tx, userId: string, since: Date): Promise<number> {
  const rows = await tx
    .select({ n: count() })
    .from(aiIdentifications)
    .where(and(eq(aiIdentifications.userId, userId), gte(aiIdentifications.createdAt, since)));
  return rows[0]?.n ?? 0;
}

/** Spend recorded since `since`, and how many calls are still waiting or running (not costed yet). */
export async function spendSince(since: Date, ex: typeof db | Tx = db): Promise<{ spentMicroUsd: number; unfinished: number }> {
  const rows = await ex
    .select({
      spent: sum(aiIdentifications.costMicroUsd),
      unfinished: sql<number>`count(*) filter (where ${aiIdentifications.status} in ('pending','running'))`.mapWith(Number),
    })
    .from(aiIdentifications)
    .where(gte(aiIdentifications.createdAt, since));
  return { spentMicroUsd: Number(rows[0]?.spent ?? 0), unfinished: rows[0]?.unfinished ?? 0 };
}

/** Insert, or nothing if this photo already has an identification (returns undefined then). */
export async function insert(tx: Tx, values: { userId: string; uploadId: string }): Promise<AiIdentificationRow | undefined> {
  const rows = await tx
    .insert(aiIdentifications)
    .values(values)
    .onConflictDoNothing({ target: aiIdentifications.uploadId })
    .returning();
  return rows[0];
}

/** pending (or running, after a crash or retry) → running. Undefined if it already finished. */
export async function markRunning(id: string): Promise<AiIdentificationRow | undefined> {
  const rows = await db
    .update(aiIdentifications)
    .set({ status: "running" })
    .where(and(eq(aiIdentifications.id, id), inArray(aiIdentifications.status, ["pending", "running"])))
    .returning();
  return rows[0];
}

export interface CallRecord {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costMicroUsd: number;
}

/** Add the cost of one billed call (a retry may follow). Totals add up across attempts. */
export async function addUsage(id: string, call: CallRecord): Promise<void> {
  await db
    .update(aiIdentifications)
    .set({
      provider: call.provider,
      model: call.model,
      inputTokens: sql`${aiIdentifications.inputTokens} + ${call.inputTokens}`,
      outputTokens: sql`${aiIdentifications.outputTokens} + ${call.outputTokens}`,
      costMicroUsd: sql`${aiIdentifications.costMicroUsd} + ${call.costMicroUsd}`,
    })
    .where(eq(aiIdentifications.id, id));
}

/** Finish once: only an unfinished identification changes. */
export async function finish(
  id: string,
  outcome: { status: "done"; result: unknown; durationMs: number } | { status: "failed"; error: string; durationMs?: number },
  now = new Date(),
): Promise<boolean> {
  const rows = await db
    .update(aiIdentifications)
    .set({
      status: outcome.status,
      result: outcome.status === "done" ? outcome.result : null,
      error: outcome.status === "failed" ? outcome.error.slice(0, 500) : null,
      durationMs: outcome.durationMs ?? null,
      finishedAt: now,
    })
    .where(and(eq(aiIdentifications.id, id), inArray(aiIdentifications.status, ["pending", "running"])))
    .returning({ id: aiIdentifications.id });
  return rows.length === 1;
}
