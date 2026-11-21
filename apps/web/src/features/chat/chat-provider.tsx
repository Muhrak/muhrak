"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import type { Event } from "stream-chat";
import type { PortalSide } from "@/features/auth/paths";
import { useChatClient, type ChatState } from "./api";
import { ringBell, unlockBell } from "./bell";

/**
 * One chat connection per side for the whole Buyer or Seller Centre
 * (developer request, 21 Nov 2026: a bell for every new message, on any
 * page). It stays open while the person moves between pages, so the
 * Messenger opens already connected. Each side has its own provider and its
 * own client (buyer/seller isolation).
 */
const ChatContext = createContext<ChatState | null>(null);

export function ChatProvider({ side, children }: { side: PortalSide; children: ReactNode }) {
  const chat = useChatClient(side);
  const client = chat.status === "ready" ? chat.client : null;
  const userId = chat.status === "ready" ? chat.userId : null;

  // Sound is allowed only after a click or key press on the page.
  useEffect(() => {
    const unlock = () => unlockBell();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // Ring for messages from the other side. Watched conversations (Messenger open) send "message.new"; the rest
  // send "notification.message_new". No ring for the conversation the person is reading right now.
  useEffect(() => {
    if (!client || !userId) return;
    const seen = new Set<string>();
    const onMessage = (event: Event) => {
      const message = event.message;
      if (!message?.id || seen.has(message.id)) return;
      seen.add(message.id);
      if (message.user?.id === userId) return;
      const channelId = event.channel_id ?? event.channel?.id;
      const open = new URLSearchParams(window.location.search).get("rfq");
      const reading = document.visibilityState === "visible" && document.hasFocus() && window.location.pathname.endsWith("/messages") && open === channelId;
      if (!reading) ringBell();
    };
    const subs = [client.on("message.new", onMessage), client.on("notification.message_new", onMessage)];
    return () => subs.forEach((sub) => sub.unsubscribe());
  }, [client, userId]);

  return <ChatContext.Provider value={chat}>{children}</ChatContext.Provider>;
}

/** This side's chat connection (from the Centre's ChatProvider). */
export function useChat(): ChatState {
  const chat = useContext(ChatContext);
  if (!chat) throw new Error("useChat needs a ChatProvider (the Buyer or Seller Centre layout).");
  return chat;
}
