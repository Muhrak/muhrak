"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import type { Event } from "stream-chat";
import type { PortalSide } from "@/features/auth/paths";
import { BellRing } from "lucide-react";
import { useChatClient, type ChatState } from "./api";
import { ringBell, turnOnSoundAndRing, unlockBell, useMissedRing } from "./bell";

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

  // Sound is allowed only after a click, tap or key press in this tab (phones count "touchend" and "click").
  useEffect(() => {
    // The prompt below handles its own click (it also rings once), so skip it here.
    const unlock = (event: globalThis.Event) => {
      if (event.target instanceof Element && event.target.closest("[data-sound-prompt]")) return;
      unlockBell();
    };
    const events = ["pointerdown", "click", "touchend", "keydown"] as const;
    events.forEach((type) => window.addEventListener(type, unlock, { capture: true }));
    return () => events.forEach((type) => window.removeEventListener(type, unlock, { capture: true }));
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

  return (
    <ChatContext.Provider value={chat}>
      {children}
      <MissedRingPrompt />
    </ChatContext.Provider>
  );
}

/** This side's chat connection (from the Centre's ChatProvider). */
export function useChat(): ChatState {
  const chat = useContext(ChatContext);
  if (!chat) throw new Error("useChat needs a ChatProvider (the Buyer or Seller Centre layout).");
  return chat;
}

/**
 * A message came in but the browser blocked the bell (no click in this tab
 * yet): a small prompt in the corner. One click turns sound on and rings
 * once; any click elsewhere on the page also turns it on and hides this.
 */
function MissedRingPrompt() {
  const missed = useMissedRing();
  if (!missed) return null;
  return (
    <button
      type="button"
      data-sound-prompt
      onClick={turnOnSoundAndRing}
      className="fixed right-4 bottom-4 z-50 flex items-center gap-2.5 rounded-full bg-text-strong py-2.5 pr-4 pl-3 text-sm font-medium text-white shadow-[0_12px_30px_-10px_rgba(10,11,18,0.45)] outline-none hover:opacity-95 focus-visible:ring-3 focus-visible:ring-brand-blue/40"
    >
      <span className="relative flex">
        <BellRing aria-hidden className="size-[18px]" strokeWidth={1.75} />
        <span aria-hidden className="absolute -top-0.5 -right-0.5 size-2 animate-pulse rounded-full bg-seller-orange" />
      </span>
      New message · Turn on sound
    </button>
  );
}
