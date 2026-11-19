"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { StreamChat } from "stream-chat";
import { chatTokenResponseSchema, fileLinkSchema } from "@/schemas";
import { authedRequest, authedRequestNoContent } from "@/features/auth/authed-request";
import type { PortalSide } from "@/features/auth/paths";
import { useSession } from "@/features/auth/session";
import { uploadFile } from "@/features/upload/upload-file";

/**
 * Buyer–seller chat (Day 10) over Stream Chat. STRICT RULE: each side has its
 * own chat client, signed in with a token from that side's own session; the
 * buyer and seller never share one. The API decides who is in which
 * conversation; the browser only reads and writes text there. Photos go
 * through Muhrak's uploads and the API, never Stream's file storage.
 */

async function fetchToken(side: PortalSide) {
  return authedRequest(side, `/v1/${side}/chat/token`, chatTokenResponseSchema);
}

export type ChatState =
  | { status: "connecting" }
  | { status: "ready"; client: StreamChat; userId: string }
  | { status: "unavailable"; message: string };

/** This side's chat connection, for as long as the component using it is on screen. */
export function useChatClient(side: PortalSide): ChatState {
  const session = useSession(side);
  const userId = session?.user.id;
  const [state, setState] = useState<ChatState>({ status: "connecting" });

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let client: StreamChat | null = null;
    (async () => {
      try {
        const first = await fetchToken(side);
        if (cancelled) return;
        // Not the shared singleton: a buyer and a seller signed in on one browser stay apart.
        // 15 s per request: Stream's default (3 s) cut off the first load on slower connections.
        client = new StreamChat(first.apiKey, { timeout: 15_000 });
        let initial: string | null = first.token;
        // The SDK asks again when the token expires or the connection is rebuilt.
        const tokenProvider = async () => {
          if (initial) {
            const token = initial;
            initial = null;
            return token;
          }
          return (await fetchToken(side)).token;
        };
        await client.connectUser({ id: first.userId }, tokenProvider);
        if (cancelled) {
          void client.disconnectUser();
          return;
        }
        setState({ status: "ready", client, userId: first.userId });
      } catch {
        if (!cancelled) setState({ status: "unavailable", message: "Chat is not available right now. Please try again later." });
      }
    })();
    return () => {
      cancelled = true;
      if (client) void client.disconnectUser();
    };
  }, [side, userId]);

  return state;
}

/** Send one photo into a request's conversation: upload (cleaned, private), then the API posts it. */
export async function sendChatPhoto(side: PortalSide, rfqId: string, file: File): Promise<void> {
  const uploadId = await uploadFile(side, "chat_photo", file);
  await authedRequestNoContent(side, `/v1/${side}/chat/${encodeURIComponent(rfqId)}/photos`, { method: "POST", body: { uploadId } });
}

/** A short-lived link to a photo of this conversation (the API checks the caller is in it). */
export function useChatPhoto(side: PortalSide, rfqId: string, uploadId: string) {
  const session = useSession(side);
  return useQuery({
    queryKey: [side, "chat", "photo", session?.user.id, rfqId, uploadId],
    queryFn: async () =>
      (await authedRequest(side, `/v1/${side}/chat/${encodeURIComponent(rfqId)}/photos/${encodeURIComponent(uploadId)}`, fileLinkSchema)).url,
    enabled: Boolean(session),
    retry: false,
    staleTime: 8 * 60_000,
  });
}
