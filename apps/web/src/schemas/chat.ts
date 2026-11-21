import { z } from "zod";

/**
 * Buyer–seller chat (Day 10, 19 Nov 2026): one Stream Chat conversation per
 * quote request, between exactly that buyer and that seller. Postgres stays
 * the source of truth: the quote request card in the thread carries only the
 * request id and is drawn from the API; photos go through Muhrak's own
 * private uploads (cleaned, short-lived links), never Stream's storage.
 */

/** Background job queue for opening conversations (src/worker). */
export const CHAT_QUEUE = "chat";

/** Muhrak's own Stream channel type: only the API can create conversations (see the chat module). */
export const CHAT_CHANNEL_TYPE = "rfq";

/** Custom attachment types the API posts (clients cannot post attachments). */
export const CHAT_ATTACHMENT = {
  /** The quote request card: `{ type, rfq_id }`. */
  rfq: "muhrak_rfq",
  /** A photo sent through Muhrak's uploads: `{ type, upload_id }`. */
  photo: "muhrak_photo",
  /** A quotation card (Day 11): `{ type, quote_id }`, posted from the seller; drawn from the API. */
  quote: "muhrak_quote",
} as const;

/** GET /v1/{buyer|seller}/chat/token: connect this side's chat. */
export const chatTokenResponseSchema = z.object({
  apiKey: z.string(),
  /** The Stream user id (the Muhrak user id). */
  userId: z.string(),
  token: z.string(),
  expiresAt: z.string(),
  /** Conversations still being opened for this user (older requests); the list checks again until they appear. */
  pending: z.number().int().min(0),
});
export type ChatTokenResponse = z.infer<typeof chatTokenResponseSchema>;

/** POST /v1/{buyer|seller}/chat/:rfqId/photos: send a ready chat photo into the conversation. */
export const chatPhotoSendSchema = z.object({
  uploadId: z.string().uuid(),
});
export type ChatPhotoSendInput = z.infer<typeof chatPhotoSendSchema>;

/**
 * Phone numbers, emails and messenger handles: a sign that someone is moving
 * the deal off Muhrak. The chat warns before sending (developer decision,
 * 19 Nov 2026: warn, do not block). A hint only; it is not a security check.
 */
const CONTACT_PATTERNS = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  // 7+ digits, allowing spaces, dots, dashes and brackets between them (e.g. +968 9123 4567).
  /(?:\+|00)?\d(?:[\s().-]*\d){6,}/,
  /\b(?:whats\s?app|wa\.me|telegram|t\.me|signal|viber|imo)\b/i,
];

export function containsContactDetails(text: string): boolean {
  return CONTACT_PATTERNS.some((pattern) => pattern.test(text));
}
