import { z } from "zod";
import { env } from "../../config/env";
import { CHAT_ATTACHMENT, CHAT_QUEUE, type ChatTokenResponse, type FileLink, type Role } from "../../schemas";
import type { JobRow } from "../../db/schema";
import { AppError, notFound } from "../../shared/errors";
import { enqueueJob, wakeWorker } from "../../shared/jobs";
import { logger } from "../../shared/logger";
import { getUsersByIds } from "../auth";
import { getRfqForChat, listRfqsWithoutChat, markRfqChatOpened } from "../rfq";
import { getSellerCompanies } from "../seller";
import { attachUpload, getDownloadLink } from "../upload";
import { ChatProviderError, SYSTEM_USER_ID, type ChatProvider, type ChatUser } from "./chat-provider";
import { createStreamProvider } from "./providers/stream";
import * as repo from "./chat.repository";

/**
 * Buyer–seller chat (Day 10, 19 Nov 2026). One conversation per quote
 * request, with exactly that request's buyer and seller.
 *
 * Rules:
 * - Only the API opens conversations (background job when a request is
 *   sent); in Stream, normal users cannot create conversations, add members,
 *   upload files or post attachments (see providers/stream.ts).
 * - Each side gets its own short-lived chat token for its OWN user only; the
 *   buyer and seller sessions never mix.
 * - Photos go through Muhrak's private uploads: the API checks the sender is
 *   in the conversation and owns the upload, ties it to that request, and
 *   posts it. Links to a photo go only to that request's buyer or seller.
 * - The quote request card carries only the request id; the web app draws it
 *   from the API, which checks ownership again.
 */

// ---------------------------------------------------------------- provider

let provider: ChatProvider | null | undefined;

/** Tests replace the provider with a fake (null = chat off). */
export function setChatProvider(value: ChatProvider | null | undefined): void {
  provider = value;
  setupDone = undefined;
  profileSent.clear();
}

function getProvider(): ChatProvider | null {
  if (provider !== undefined) return provider;
  provider = env.STREAM_API_KEY && env.STREAM_API_SECRET ? createStreamProvider({ apiKey: env.STREAM_API_KEY, secret: env.STREAM_API_SECRET }) : null;
  return provider;
}

let setupDone: Promise<void> | undefined;

/** Users whose chat profile this process already sent (each connect after that skips it: faster connect). */
const profileSent = new Set<string>();

/** The conversation type and system user, once per process (retried after a failure). */
function ensureSetup(chat: ChatProvider): Promise<void> {
  setupDone ??= chat.ensureSetup().catch((error) => {
    setupDone = undefined;
    throw error;
  });
  return setupDone;
}

const UNAVAILABLE = "Chat is not available right now. Please try again later.";
const NOT_FOUND = "Conversation not found";

/**
 * Called once when the API starts: set up the chat service in the background,
 * so the first person to open the messenger does not wait for it. A failure
 * is only logged (the first connect tries again).
 */
export function prepareChat(): void {
  const chat = getProvider();
  if (!chat) return;
  ensureSetup(chat).catch((error) => logger.warn({ err: { message: (error as Error).message } }, "Chat setup at startup failed; retried on first use"));
}

// ---------------------------------------------------------------- names

/** What each side is called in chat: buyers by their name, sellers by their company. */
async function chatUsers(ids: { buyers: string[]; sellers: string[] }): Promise<ChatUser[]> {
  const [users, companies] = await Promise.all([getUsersByIds([...ids.buyers, ...ids.sellers]), getSellerCompanies(ids.sellers)]);
  const byId = new Map(users.map((user) => [user.id, user]));
  return [
    ...ids.buyers.map((id) => ({ id, name: byId.get(id)?.fullName ?? "Buyer" })),
    ...ids.sellers.map((id) => ({ id, name: companies.get(id)?.companyName ?? byId.get(id)?.fullName ?? "Seller" })),
  ];
}

// ---------------------------------------------------------------- token

/** Chat tokens work this long; the browser asks for a new one before then. */
export const CHAT_TOKEN_MS = 60 * 60_000;
/** How many of the caller's older requests get their chat opened on connect. */
const BACKFILL = 50;

export async function issueChatToken(user: { userId: string; role: Role }, now = new Date()): Promise<ChatTokenResponse> {
  const chat = getProvider();
  if (!chat) throw new AppError(503, "chat_unavailable", UNAVAILABLE);
  if (user.role !== "buyer" && user.role !== "seller") throw notFound(NOT_FOUND);
  const side = user.role;

  try {
    await ensureSetup(chat);
    // Once per process: the user must exist in chat before connecting; names are refreshed by every
    // conversation job too. Repeating it on each connect cost a round trip (developer report: slow load).
    if (!profileSent.has(user.userId)) {
      await chat.upsertUsers(await chatUsers(side === "buyer" ? { buyers: [user.userId], sellers: [] } : { buyers: [], sellers: [user.userId] }));
      profileSent.add(user.userId);
    }
  } catch (error) {
    logger.error({ err: { message: (error as Error).message } }, "Chat connect failed");
    throw new AppError(503, "chat_unavailable", UNAVAILABLE);
  }

  // Requests sent before chat existed (or whose job failed): open their conversations now.
  const missing = await listRfqsWithoutChat(side, user.userId, BACKFILL);
  if (missing.length > 0) {
    const hour = now.toISOString().slice(0, 13);
    for (const rfqId of missing) {
      await enqueueJob(CHAT_QUEUE, "open-rfq-chat", { rfqId }, { dedupeKey: `chat-open-${rfqId}-${hour}`, maxAttempts: 5 });
    }
    wakeWorker();
  }

  const expiresAt = new Date(now.getTime() + CHAT_TOKEN_MS);
  return {
    apiKey: chat.apiKey,
    userId: user.userId,
    token: await chat.createUserToken(user.userId, now, expiresAt),
    expiresAt: expiresAt.toISOString(),
    pending: missing.length,
  };
}

// ---------------------------------------------------------------- one conversation

/** The request, only if the caller is its buyer or seller (anyone else: not found). */
async function ownConversation(userId: string, rfqId: string) {
  const rfq = await getRfqForChat(rfqId);
  if (!rfq || (rfq.buyerUserId !== userId && rfq.sellerUserId !== userId)) throw notFound(NOT_FOUND);
  return rfq;
}

/** Send one of the caller's ready chat photos into the request's conversation. */
export async function sendPhoto(userId: string, rfqId: string, uploadId: string): Promise<void> {
  const chat = getProvider();
  if (!chat) throw new AppError(503, "chat_unavailable", UNAVAILABLE);
  const rfq = await ownConversation(userId, rfqId);
  if (!rfq.chatOpenedAt) throw new AppError(409, "chat_not_ready", "This conversation is still being set up. Try again in a moment.");

  // The caller's own ready chat photo, used once (attachUpload checks owner, kind and state).
  await attachUpload(userId, uploadId, "chat_photo");
  if (!(await repo.insertPhoto({ rfqId, uploadId, senderUserId: userId }))) throw notFound("Photo not found");
  try {
    await chat.sendMessage({ channelId: rfqId, userId, messageId: `photo-${uploadId}`, text: "", attachments: [{ type: CHAT_ATTACHMENT.photo, upload_id: uploadId }] });
  } catch (error) {
    logger.error({ rfqId, err: { message: (error as Error).message } }, "Chat photo could not be posted");
    throw new AppError(503, "chat_unavailable", "The photo could not be sent. Please try again.");
  }
}

/** How long a link to a chat photo works. */
export const PHOTO_LINK_SECONDS = 10 * 60;

/** A short-lived link to a photo of this conversation, for its buyer or seller only. */
export async function getPhotoLink(userId: string, rfqId: string, uploadId: string, now = new Date()): Promise<FileLink> {
  await ownConversation(userId, rfqId);
  if (!(await repo.findPhoto(rfqId, uploadId))) throw notFound("Photo not found");
  return getDownloadLink(uploadId, PHOTO_LINK_SECONDS, now);
}

// ---------------------------------------------------------------- background job

/** A failure retrying cannot fix: the worker stops the job. */
export class PermanentChatJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentChatJobError";
  }
}

const jobPayloadSchema = z.object({ rfqId: z.string().uuid() });

/** Open a request's conversation: both users, the conversation, then the quote request card. Safe to repeat. */
export async function runChatJob(job: Pick<JobRow, "id" | "payload">, now = new Date()): Promise<void> {
  const payload = jobPayloadSchema.safeParse(job.payload);
  if (!payload.success) throw new PermanentChatJobError(`Invalid chat job ${job.id}`);
  const rfq = await getRfqForChat(payload.data.rfqId);
  if (!rfq) throw new PermanentChatJobError(`Quote request ${payload.data.rfqId} not found`);
  if (rfq.chatOpenedAt) return;
  const chat = getProvider();
  // Chat off: retried later (the keys may be added); the token endpoint queues it again too.
  if (!chat) throw new Error("Chat is not configured");

  try {
    await ensureSetup(chat);
    await chat.upsertUsers(await chatUsers({ buyers: [rfq.buyerUserId], sellers: [rfq.sellerUserId] }));
    await chat.openChannel({
      channelId: rfq.id,
      memberIds: [rfq.buyerUserId, rfq.sellerUserId],
      createdById: SYSTEM_USER_ID,
      data: { rfq_id: rfq.id, name: `${rfq.reference} · ${rfq.partName}` },
    });
    // The card, from the buyer (it is their request); only the id travels.
    await chat.sendMessage({
      channelId: rfq.id,
      userId: rfq.buyerUserId,
      messageId: `card-${rfq.id}`,
      text: `Quote request ${rfq.reference}`,
      attachments: [{ type: CHAT_ATTACHMENT.rfq, rfq_id: rfq.id }],
    });
  } catch (error) {
    if (error instanceof ChatProviderError && !error.retryable) throw new PermanentChatJobError(error.message);
    throw error;
  }
  await markRfqChatOpened(rfq.id, now);
  logger.info({ rfqId: rfq.id }, "Chat opened for quote request");
}
