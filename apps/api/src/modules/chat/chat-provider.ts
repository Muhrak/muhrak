/**
 * The chat service behind a small interface (Stream Chat today, developer
 * decision; faked in tests). The provider only talks to the chat service:
 * the chat module decides who may join which conversation.
 */

export interface ChatUser {
  id: string;
  /** Shown by the chat service only; the web app shows names from the Muhrak API. */
  name: string;
}

export interface ChatProvider {
  readonly name: string;
  /** Public key the browser connects with (not a secret). */
  readonly apiKey: string;
  /** Create or update Muhrak's conversation type and the system user (idempotent). */
  ensureSetup(): Promise<void>;
  upsertUsers(users: ChatUser[]): Promise<void>;
  /** Create the conversation with exactly these members, or leave an existing one as it is. */
  openChannel(input: { channelId: string; memberIds: string[]; createdById: string; data: Record<string, unknown> }): Promise<void>;
  /** Post a message as `userId`. `messageId` makes a retry a no-op instead of a second message. */
  sendMessage(input: { channelId: string; userId: string; messageId?: string; text: string; attachments: Record<string, unknown>[] }): Promise<void>;
  /** A short-lived token that lets the browser connect as this user only. */
  createUserToken(userId: string, issuedAt: Date, expiresAt: Date): Promise<string>;
}

/** A failed call to the chat service. `retryable` for rate limits, outages and timeouts. */
export class ChatProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ChatProviderError";
  }
}

/** The Stream user id of Muhrak itself (creates every conversation). */
export const SYSTEM_USER_ID = "muhrak-system";
