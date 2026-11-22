import { randomUUID } from "node:crypto";
import * as repo from "./ledger.repository";

/**
 * The ledger (Day 12, 22 Nov 2026): every money movement as append-only rows
 * in the smallest currency unit (payment rules, docs/PLAN.md).
 *
 * Accounts: gateway = money Muhrak holds at the gateway; platform = Muhrak's
 * fees; seller = owed to a seller; buyer = owed back to a buyer. Every group
 * of rows (one movement) balances: gateway = platform + seller + buyer. This
 * is checked here before anything is written, and the caller writes it in
 * the same transaction as the payment it records.
 */

export type LedgerTx = repo.Tx;

const CURRENCY = "OMR" as const;

/** Thrown when a movement does not add up: a bug, never written. */
export class LedgerImbalance extends Error {}

function assertSafe(...amounts: number[]) {
  for (const amount of amounts) {
    if (!Number.isSafeInteger(amount) || amount < 0) throw new LedgerImbalance(`Not a whole non-negative amount: ${amount}`);
  }
}

/**
 * A captured payment for an order: the gateway received `total`; Muhrak
 * keeps `platformFee`; the seller is owed `sellerAmount`. Written once per
 * payment (also enforced by a unique index).
 */
export async function recordPaymentCaptured(
  tx: repo.Tx,
  input: { orderId: string; paymentId: string; sellerUserId: string; total: number; platformFee: number; sellerAmount: number; at: Date },
): Promise<void> {
  assertSafe(input.total, input.platformFee, input.sellerAmount);
  if (input.total !== input.platformFee + input.sellerAmount || input.total === 0) {
    throw new LedgerImbalance(`Payment ${input.paymentId}: total ${input.total} is not fee ${input.platformFee} + seller ${input.sellerAmount}`);
  }
  if (await repo.hasPaymentEntries(tx, input.paymentId)) return;
  const groupId = randomUUID();
  const base = { groupId, kind: "payment" as const, orderId: input.orderId, paymentId: input.paymentId, currency: CURRENCY, at: input.at };
  await repo.insertEntries(tx, [
    { ...base, account: "gateway", amount: input.total },
    { ...base, account: "platform", amount: input.platformFee },
    { ...base, account: "seller", sellerUserId: input.sellerUserId, amount: input.sellerAmount },
  ]);
}

/**
 * Money received that must go back to the buyer (paid twice, or paid after
 * the order was cancelled): held at the gateway, owed to the buyer. Never
 * counted for the seller or Muhrak. The refund itself is Day 15.
 */
export async function recordRefundDue(tx: repo.Tx, input: { orderId: string; paymentId: string; buyerUserId: string; amount: number; at: Date }): Promise<void> {
  assertSafe(input.amount);
  if (input.amount === 0) throw new LedgerImbalance(`Payment ${input.paymentId}: nothing to hold`);
  if (await repo.hasPaymentEntries(tx, input.paymentId)) return;
  const groupId = randomUUID();
  const base = { groupId, kind: "payment" as const, orderId: input.orderId, paymentId: input.paymentId, currency: CURRENCY, at: input.at };
  await repo.insertEntries(tx, [
    { ...base, account: "gateway", amount: input.amount },
    { ...base, account: "buyer", buyerUserId: input.buyerUserId, amount: input.amount },
  ]);
}

/** What Muhrak owes a seller now: the sum of their ledger rows. */
export function getSellerBalance(sellerUserId: string): Promise<number> {
  return repo.sellerBalance(sellerUserId);
}
