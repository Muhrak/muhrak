import { SignJWT } from "jose";
import { CHAT_CHANNEL_TYPE } from "../../../schemas";
import { ChatProviderError, SYSTEM_USER_ID, type ChatProvider, type ChatUser } from "../chat-provider";

/**
 * Stream Chat over its REST API with plain fetch (no SDK, like the Gemini
 * provider). Server calls are signed with a server token made from the app
 * secret; the secret never leaves the API.
 *
 * Security (Day 10): Muhrak's own channel type "rfq" where normal users can
 * NOT create conversations, add members, upload files or post attachments;
 * members can only read and write in conversations the API put them in.
 */

const BASE = "https://chat.stream-io-api.com";
const TIMEOUT_MS = 15_000;

/** Members of a conversation: read and write, nothing that changes who is in it. */
const MEMBER_GRANTS = [
  "read-channel",
  "read-channel-members",
  "create-message",
  "create-reply",
  "create-mention",
  "create-reaction",
  "add-links",
  "flag-message",
  "mute-channel",
  "send-custom-event",
  "update-own-channel-member-custom-data",
];
/** Any signed-in user, outside membership: only edit or delete what they wrote themselves. */
const USER_GRANTS = ["update-message-owner", "delete-message-owner", "delete-reaction-owner"];

const CHANNEL_TYPE_SETTINGS = {
  typing_events: true,
  read_events: true,
  connect_events: true,
  reactions: true,
  replies: true,
  quotes: true,
  mutes: true,
  search: true,
  // Photos go through Muhrak's private uploads; link previews would fetch outside pages.
  uploads: false,
  url_enrichment: false,
  polls: false,
  shared_locations: false,
  push_notifications: false,
  max_message_length: 2000,
};

export function createStreamProvider(config: { apiKey: string; secret: string }): ChatProvider {
  const secret = new TextEncoder().encode(config.secret);
  let serverToken: string | undefined;

  async function authToken(): Promise<string> {
    serverToken ??= await new SignJWT({ server: true }).setProtectedHeader({ alg: "HS256" }).sign(secret);
    return serverToken;
  }

  async function call(method: string, path: string, body?: unknown, okCodes: number[] = []): Promise<unknown> {
    const url = `${BASE}${path}${path.includes("?") ? "&" : "?"}api_key=${encodeURIComponent(config.apiKey)}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: { Authorization: await authToken(), "stream-auth-type": "jwt", "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new ChatProviderError(`Stream ${method} ${path.split("?")[0]} failed: ${(error as Error).message}`, true);
    }
    const json = (await response.json().catch(() => ({}))) as { code?: number; message?: string };
    if (response.ok) return json;
    if (json.code !== undefined && okCodes.includes(json.code)) return json;
    // Only the status and Stream's error code are kept: messages can echo request data.
    throw new ChatProviderError(`Stream ${method} ${path.split("?")[0]} answered ${response.status} (code ${json.code ?? "?"})`, response.status === 429 || response.status >= 500);
  }

  return {
    name: "stream",
    apiKey: config.apiKey,

    async ensureSetup() {
      const types = (await call("GET", "/channeltypes")) as { channel_types?: Record<string, unknown> };
      if (!types.channel_types?.[CHANNEL_TYPE_NAME]) {
        await call("POST", "/channeltypes", { name: CHANNEL_TYPE_NAME, ...CHANNEL_TYPE_SETTINGS });
      }
      // Always (re)apply settings and grants, so a change here reaches existing apps.
      await call("PUT", `/channeltypes/${CHANNEL_TYPE_NAME}`, {
        ...CHANNEL_TYPE_SETTINGS,
        grants: { user: USER_GRANTS, channel_member: MEMBER_GRANTS },
      });
      await this.upsertUsers([{ id: SYSTEM_USER_ID, name: "Muhrak" }]);
    },

    async upsertUsers(users: ChatUser[]) {
      if (users.length === 0) return;
      await call("POST", "/users", { users: Object.fromEntries(users.map((user) => [user.id, { id: user.id, name: user.name }])) });
    },

    async openChannel({ channelId, memberIds, createdById, data }) {
      await call("POST", `/channels/${CHANNEL_TYPE_NAME}/${encodeURIComponent(channelId)}/query`, {
        data: { ...data, created_by_id: createdById, members: memberIds },
        state: false,
      });
    },

    async sendMessage({ channelId, userId, messageId, text, attachments }) {
      // Code 4 = "message with this id already exists": a retried job, already posted.
      await call(
        "POST",
        `/channels/${CHANNEL_TYPE_NAME}/${encodeURIComponent(channelId)}/message`,
        { message: { ...(messageId ? { id: messageId } : {}), text, user_id: userId, attachments } },
        messageId ? [4] : [],
      );
    },

    async createUserToken(userId: string, issuedAt: Date, expiresAt: Date) {
      return new SignJWT({ user_id: userId })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setIssuedAt(Math.floor(issuedAt.getTime() / 1000))
        .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
        .sign(secret);
    },
  };
}

const CHANNEL_TYPE_NAME = CHAT_CHANNEL_TYPE;
