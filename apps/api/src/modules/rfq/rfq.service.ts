import {
  CHAT_QUEUE,
  GCC_COUNTRY_NAMES,
  RFQ_EXPIRY_DAYS,
  RFQ_LIMITS,
  RFQ_NEEDED_BY_LABELS,
  UNIT_LABELS,
  type BuyerRfq,
  type BuyerRfqListResponse,
  type GccCountry,
  type RfqCreateInput,
  type RfqListQuery,
  type RfqStatus,
  type SellerRfq,
  type SellerRfqListResponse,
} from "../../schemas";
import type { RfqRow } from "../../db/schema";
import { badRequest, conflict, forbidden, notFound } from "../../shared/errors";
import { enqueueJob, wakeWorker } from "../../shared/jobs";
import { logger } from "../../shared/logger";
import { getIdentificationPhotoUpload } from "../ai";
import { getUsersByIds } from "../auth";
import { getLiveProductForRfq, getProductSnapshots } from "../catalog";
import { sendNewRfqEmail } from "../notification";
import { getSellerCompanies, isSellerVerified } from "../seller";
import { getDownloadLink } from "../upload";
import * as repo from "./rfq.repository";

/**
 * Quote requests (Day 9). One buyer asks one seller about one live product
 * (developer decision, 15 Nov 2026).
 *
 * Rules:
 * - Buyer endpoints act only on the buyer's own requests, seller endpoints
 *   only on the seller's; anyone else's request looks like one that does
 *   not exist (404).
 * - The seller, product and unit come from the LIVE product of a VERIFIED
 *   seller on the server; the client only names the product.
 * - The same request key returns the first request (double submit). A buyer
 *   has at most one open request per product, and RFQ_LIMITS.maxOpenPerBuyer
 *   open requests in all.
 * - Status changes follow RFQ_TRANSITIONS only, as conditional updates, and
 *   never after the request has expired.
 * - The seller's email is queued in the same transaction as the request.
 * - Requests are never deleted.
 */

const EXPIRY_MS = RFQ_EXPIRY_DAYS * 86_400_000;
const NOT_FOUND = "Quote request not found";
const PRODUCT_GONE = "This part is no longer listed. Search again to find it from another seller.";

/** The one place that says which status changes are allowed, and who may make them. */
export const RFQ_TRANSITIONS = {
  /** Day 11: the seller sends a quotation. */
  quote: { by: "seller", from: ["open"], to: "quoted" },
  decline: { by: "seller", from: ["open"], to: "declined" },
  cancel: { by: "buyer", from: ["open"], to: "cancelled" },
  /** The expiry sweep (rfq.repository expireDue applies exactly this). */
  expire: { by: "system", from: ["open"], to: "expired" },
} as const satisfies Record<string, { by: "buyer" | "seller" | "system"; from: readonly RfqStatus[]; to: RfqStatus }>;

// ---------------------------------------------------------------- mapping

/** An open request past its time counts as expired even before the sweep has run. */
function effective(row: RfqRow, now: Date): { status: RfqStatus; closedAt: Date | null } {
  if (row.status === "open" && row.expiresAt.getTime() <= now.getTime()) return { status: "expired", closedAt: row.expiresAt };
  return { status: row.status, closedAt: row.closedAt };
}

export function reference(number: number): string {
  return `RQ-${number}`;
}

async function baseFields(rows: RfqRow[], now: Date) {
  const products = await getProductSnapshots(rows.map((row) => row.productId));
  return (row: RfqRow) => {
    const state = effective(row, now);
    const product = products.get(row.productId);
    return {
      id: row.id,
      reference: reference(row.number),
      status: state.status,
      partName: row.partName,
      partNumber: row.partNumber,
      fitment: row.fitment,
      quantity: row.quantity,
      unit: row.unit,
      neededBy: row.neededBy,
      deliveryCity: row.deliveryCity,
      deliveryCountryName: GCC_COUNTRY_NAMES[row.deliveryCountry as GccCountry] ?? row.deliveryCountry,
      note: row.note,
      declineReason: row.declineReason,
      hasBuyerPhoto: row.buyerPhotoUploadId !== null,
      buyerPhotoUrl: null as string | null,
      product: { id: row.productId, name: product?.name ?? row.partName, photoUrl: product?.photoUrl ?? null },
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      closedAt: state.closedAt?.toISOString() ?? null,
    };
  };
}

async function toBuyerRfqs(rows: RfqRow[], now: Date): Promise<BuyerRfq[]> {
  const [base, companies] = await Promise.all([baseFields(rows, now), getSellerCompanies(rows.map((row) => row.sellerUserId))]);
  return rows.map((row) => {
    const company = companies.get(row.sellerUserId);
    return {
      ...base(row),
      seller: {
        id: row.sellerUserId,
        companyName: company?.companyName ?? "Seller",
        city: company?.city ?? "",
        countryName: company ? GCC_COUNTRY_NAMES[company.country] : "",
      },
    };
  });
}

async function toSellerRfqs(rows: RfqRow[], now: Date): Promise<SellerRfq[]> {
  const [base, users] = await Promise.all([baseFields(rows, now), getUsersByIds(rows.map((row) => row.buyerUserId))]);
  const names = new Map(users.map((user) => [user.id, user.fullName]));
  return rows.map((row) => ({
    ...base(row),
    // The buyer's name only: never their email or phone.
    buyer: { name: names.get(row.buyerUserId) ?? "Buyer" },
    seen: row.sellerSeenAt !== null,
  }));
}

async function one<T>(mapped: Promise<T[]>): Promise<T> {
  const [item] = await mapped;
  if (!item) throw new Error("RFQ mapping failed");
  return item;
}

// ---------------------------------------------------------------- buyer

export async function createRfq(buyerUserId: string, input: RfqCreateInput, now = new Date()): Promise<{ rfq: BuyerRfq; created: boolean }> {
  // Same form sent again (double click, retry after a lost answer): the first request.
  const repeat = await repo.findByRequestKey(buyerUserId, input.requestKey);
  if (repeat) return { rfq: await sameRequest(repeat, input, now), created: false };

  const product = await getLiveProductForRfq(input.productId);
  if (!product || product.sellerUserId === buyerUserId) throw notFound(PRODUCT_GONE);
  if (!(await isSellerVerified(product.sellerUserId))) throw notFound(PRODUCT_GONE);

  if ((await repo.countOpenForBuyer(buyerUserId, now)) >= RFQ_LIMITS.maxOpenPerBuyer) {
    throw forbidden(`You have ${RFQ_LIMITS.maxOpenPerBuyer} open quote requests. Wait for replies or cancel some before sending more.`);
  }

  // The buyer's photo: only from their OWN finished photo search (checked by the AI module).
  const buyerPhotoUploadId = input.identificationId ? await getIdentificationPhotoUpload(buyerUserId, input.identificationId) : null;

  const users = await getUsersByIds([product.sellerUserId, buyerUserId]);
  const seller = users.find((user) => user.id === product.sellerUserId && user.role === "seller");
  const buyer = users.find((user) => user.id === buyerUserId && user.role === "buyer");
  if (!seller || !buyer) throw notFound(PRODUCT_GONE);

  const row = await repo.inTransaction(async (tx) => {
    await repo.expireStaleForProduct(tx, { buyerUserId, productId: product.id, at: now });
    const created = await repo.insertRfq(tx, {
      buyerUserId,
      sellerUserId: product.sellerUserId,
      productId: product.id,
      requestKey: input.requestKey,
      partName: input.partName,
      partNumber: input.partNumber,
      fitment: input.fitment,
      quantity: input.quantity,
      unit: product.unit,
      neededBy: input.neededBy,
      deliveryCountry: input.deliveryCountry,
      deliveryCity: input.deliveryCity,
      note: input.note,
      buyerPhotoUploadId,
      expiresAt: new Date(now.getTime() + EXPIRY_MS),
      at: now,
    });
    if (!created) return undefined;
    const unit = UNIT_LABELS[created.unit];
    await sendNewRfqEmail(
      {
        to: seller.email,
        fullName: seller.fullName,
        reference: reference(created.number),
        buyerName: buyer.fullName,
        partName: created.partName,
        partNumber: created.partNumber,
        quantity: `${created.quantity} ${created.quantity === 1 ? unit.one : unit.many}`,
        neededBy: RFQ_NEEDED_BY_LABELS[created.neededBy],
        deliverTo: `${created.deliveryCity}, ${GCC_COUNTRY_NAMES[input.deliveryCountry]}`,
        rfqId: created.id,
      },
      tx,
    );
    // The buyer–seller chat (Day 10) is opened by a background job, queued with the request.
    await enqueueJob(CHAT_QUEUE, "open-rfq-chat", { rfqId: created.id }, { dedupeKey: `chat-open-${created.id}`, maxAttempts: 8, tx });
    return created;
  });

  if (!row) {
    // Lost a race with the same request key, or an open request for this product exists.
    const raced = await repo.findByRequestKey(buyerUserId, input.requestKey);
    if (raced) return { rfq: await sameRequest(raced, input, now), created: false };
    throw conflict("You already have an open request for this part with this seller. Find it in Inquiries & RFQs.");
  }
  wakeWorker();
  logger.info({ rfqId: row.id }, "Quote request created");
  return { rfq: await one(toBuyerRfqs([row], now)), created: true };
}

/** A request key reused for a different product is a client bug or tampering, not a repeat. */
async function sameRequest(row: RfqRow, input: RfqCreateInput, now: Date): Promise<BuyerRfq> {
  if (row.productId !== input.productId) throw badRequest("This form was already used for another request. Reload the page and try again.");
  return one(toBuyerRfqs([row], now));
}

async function ownAsBuyer(buyerUserId: string, id: string): Promise<RfqRow> {
  const row = await repo.findRfq(id);
  if (!row || row.buyerUserId !== buyerUserId) throw notFound(NOT_FOUND);
  return row;
}

async function ownAsSeller(sellerUserId: string, id: string): Promise<RfqRow> {
  const row = await repo.findRfq(id);
  if (!row || row.sellerUserId !== sellerUserId) throw notFound(NOT_FOUND);
  return row;
}

/** How long a link to the buyer's photo works. */
export const BUYER_PHOTO_LINK_SECONDS = 10 * 60;

/** A single request, AFTER its owner was checked: add the short-lived link to the buyer's photo. */
async function withPhotoLink<T extends { buyerPhotoUrl: string | null }>(row: RfqRow, rfq: T, now: Date): Promise<T> {
  if (!row.buyerPhotoUploadId) return rfq;
  try {
    const link = await getDownloadLink(row.buyerPhotoUploadId, BUYER_PHOTO_LINK_SECONDS, now);
    return { ...rfq, buyerPhotoUrl: link.url };
  } catch (error) {
    // The request still shows without its photo.
    logger.warn({ rfqId: row.id, err: { message: (error as Error).message } }, "Could not link the buyer's photo");
    return rfq;
  }
}

export async function getBuyerRfq(buyerUserId: string, id: string, now = new Date()): Promise<BuyerRfq> {
  const row = await ownAsBuyer(buyerUserId, id);
  return withPhotoLink(row, await one(toBuyerRfqs([row], now)), now);
}

export async function cancelRfq(buyerUserId: string, id: string, now = new Date()): Promise<BuyerRfq> {
  const current = await ownAsBuyer(buyerUserId, id);
  const t = RFQ_TRANSITIONS.cancel;
  const row = await repo.transition({ id, owner: { buyerUserId }, from: [...t.from], to: t.to, at: now });
  if (!row) throw notAllowed(current, now, "cancelled");
  return one(toBuyerRfqs([row], now));
}

export async function listBuyerRfqs(buyerUserId: string, query: RfqListQuery, now = new Date()): Promise<BuyerRfqListResponse> {
  const rows = await repo.listRfqs({ side: "buyer", userId: buyerUserId, filter: query.filter, cursor: decodeCursor(query.cursor), limit: query.limit + 1 });
  const page = rows.slice(0, query.limit);
  const [items, counts] = await Promise.all([toBuyerRfqs(page, now), repo.countRfqs("buyer", buyerUserId)]);
  const { unseen: _unseen, ...tabs } = counts;
  const last = page.at(-1);
  return { items, nextCursor: rows.length > query.limit && last ? encodeCursor(last) : null, counts: tabs };
}

// ---------------------------------------------------------------- seller

/** Opening a request marks it seen (once). */
export async function getSellerRfq(sellerUserId: string, id: string, now = new Date()): Promise<SellerRfq> {
  const row = await ownAsSeller(sellerUserId, id);
  const seen = row.sellerSeenAt ? row : ((await repo.markSeen(id, sellerUserId, now)) ?? row);
  return withPhotoLink(seen, await one(toSellerRfqs([seen], now)), now);
}

export async function declineRfq(sellerUserId: string, id: string, reason: string | null, now = new Date()): Promise<SellerRfq> {
  const current = await ownAsSeller(sellerUserId, id);
  const t = RFQ_TRANSITIONS.decline;
  const row = await repo.transition({ id, owner: { sellerUserId }, from: [...t.from], to: t.to, at: now, declineReason: reason });
  if (!row) throw notAllowed(current, now, "declined");
  return one(toSellerRfqs([row], now));
}

export async function listSellerRfqs(sellerUserId: string, query: RfqListQuery, now = new Date()): Promise<SellerRfqListResponse> {
  const rows = await repo.listRfqs({ side: "seller", userId: sellerUserId, filter: query.filter, cursor: decodeCursor(query.cursor), limit: query.limit + 1 });
  const page = rows.slice(0, query.limit);
  const [items, counts] = await Promise.all([toSellerRfqs(page, now), repo.countRfqs("seller", sellerUserId)]);
  const { unseen, ...tabs } = counts;
  const last = page.at(-1);
  return { items, nextCursor: rows.length > query.limit && last ? encodeCursor(last) : null, counts: tabs, unseen };
}

// ---------------------------------------------------------------- expiry (background worker)

/** Close every open request whose time is up. Safe to run from several API copies at once. */
export async function expireDueRfqs(now = new Date()): Promise<number> {
  let total = 0;
  for (;;) {
    const count = await repo.expireDue(now, 500);
    total += count;
    if (count < 500) return total;
  }
}

// ---------------------------------------------------------------- helpers

function notAllowed(current: RfqRow, now: Date, verb: string) {
  const state = effective(current, now).status;
  if (state === "open") return conflict("This request was just changed. Reload to see its current state.");
  return conflict(`This request is ${state === "quoted" ? "already quoted" : state}; it cannot be ${verb} now.`);
}

function encodeCursor(row: RfqRow): string {
  return Buffer.from(JSON.stringify([row.createdAt.toISOString(), row.id])).toString("base64url");
}

function decodeCursor(cursor: string | undefined): repo.ListCursor | null {
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

// ---------------------------------------------------------------- for the chat module (Day 10)

/** What the chat needs about a request: who its two sides are. Undefined if it does not exist. */
export async function getRfqForChat(
  id: string,
): Promise<{ id: string; reference: string; buyerUserId: string; sellerUserId: string; partName: string; chatOpenedAt: Date | null } | undefined> {
  const row = await repo.findRfq(id);
  if (!row) return undefined;
  return {
    id: row.id,
    reference: reference(row.number),
    buyerUserId: row.buyerUserId,
    sellerUserId: row.sellerUserId,
    partName: row.partName,
    chatOpenedAt: row.chatOpenedAt,
  };
}

export async function markRfqChatOpened(id: string, at = new Date()): Promise<void> {
  await repo.markChatOpened(id, at);
}

/** The caller's requests whose chat is not open yet (newest first). */
export async function listRfqsWithoutChat(side: "buyer" | "seller", userId: string, limit = 50): Promise<string[]> {
  return repo.listWithoutChat(side, userId, limit);
}

