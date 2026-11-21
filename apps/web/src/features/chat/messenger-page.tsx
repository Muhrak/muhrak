"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileText, ImagePlus, Loader2, MessagesSquare, Search, SendHorizontal, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Channel, StreamChat } from "stream-chat";
import { buyerRfqListResponseSchema, CHAT_ATTACHMENT, CHAT_CHANNEL_TYPE, containsContactDetails, formatMoney, sellerRfqListResponseSchema } from "@/schemas";
import { PageLoader } from "@/components/ui/logo-loader";
import { Spinner } from "@/components/ui/spinner";
import { FilterChips, WorkspacePanel } from "@/components/layout/workspace";
import { authedRequest } from "@/features/auth/authed-request";
import type { PortalSide } from "@/features/auth/paths";
import { useSession } from "@/features/auth/session";
import { useQuote } from "@/features/quotation/api";
import { itemCountLabel, quoteDate, quoteStatus } from "@/features/quotation/quote-view";
import { useBuyerRfq, useSellerRfq } from "@/features/rfq/api";
import { buyerStatus, neededByLabel, quantityLabel, RfqChip, sellerStatus, shortAge, Thumb } from "@/features/rfq/parts";
import { focusRing } from "@/features/seller/parts";
import { acceptFor, checkFile } from "@/features/upload/upload-file";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { sendChatPhoto, useChatPhoto } from "./api";
import { useChat } from "./chat-provider";


/**
 * Messenger (Day 10): Figma "Buyer – Messenger (Dark)" (380:690) and the
 * "AI quote → Order flow" frames, converted to light like the other Centre
 * pages. One conversation per quote request. Shared by the Buyer and Seller
 * Centres; each side uses its own chat connection and session.
 *
 * Names and request details come from the Muhrak API (Stream user names can
 * be changed by their owner, so they are never trusted for display). The
 * active conversation is `?rfq=<id>` in the URL. Layout (21 Nov 2026,
 * developer request): one full-height panel, compact title, list and chat
 * inside; the chat opens at the newest message and loads older ones on
 * scroll up, with date chips and grouped bubbles (WhatsApp style). No pop-up dialogs (the
 * Centres are zoomed): the contact-details warning is a bar above the box.
 */

interface Counterpart {
  name: string;
  partName: string;
  reference: string;
}

/** Who each conversation is with, from the caller's own quote requests (Muhrak API). */
function useCounterparts(side: PortalSide) {
  const session = useSession(side);
  return useQuery({
    queryKey: [side, "rfqs", session?.user.id, "list", "chat-names"],
    queryFn: async () => {
      const map = new Map<string, Counterpart>();
      if (side === "buyer") {
        const data = await authedRequest(side, "/v1/buyer/rfqs?filter=all&limit=50", buyerRfqListResponseSchema);
        for (const rfq of data.items) map.set(rfq.id, { name: rfq.seller.companyName, partName: rfq.partName, reference: rfq.reference });
      } else {
        const data = await authedRequest(side, "/v1/seller/rfqs?filter=all&limit=50", sellerRfqListResponseSchema);
        for (const rfq of data.items) map.set(rfq.id, { name: rfq.buyer.name, partName: rfq.partName, reference: rfq.reference });
      }
      return map;
    },
    enabled: Boolean(session),
    staleTime: 60_000,
  });
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? words[0]?.[1] ?? "")).toUpperCase() || "M";
}

const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });

/** "Today", "Yesterday" or "21 November 2026": the date chips between messages (as in WhatsApp). */
function dayLabel(date: Date, now = new Date()): string {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(now) - start(date)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return dayFormat.format(date);
}

/** Messages per page: the newest first, older ones load when the reader scrolls up. */
const PAGE = 30;

export function MessengerPage({ side }: { side: PortalSide }) {
  const chat = useChat(); // the Centre's connection (opened by the layout, kept between pages)
  return (
    // One panel that fills the screen (no page scroll), shared with Inquiries & RFQs and the RFQ Inbox.
    <WorkspacePanel
      side={side}
      title="Messenger"
      description={side === "buyer" ? "Chat with sellers about your quote requests." : "Chat with buyers about their quote requests."}
    >
      {chat.status === "connecting" ? (
        <PageLoader label="Connecting to chat" className="min-h-0" />
      ) : chat.status === "unavailable" ? (
        <p role="alert" className="flex flex-1 items-center justify-center px-6 text-center text-[15px] text-text-muted">
          {chat.message}
        </p>
      ) : (
        <Inbox side={side} client={chat.client} userId={chat.userId} pending={chat.pending} />
      )}
    </WorkspacePanel>
  );
}

function Inbox({ side, client, userId, pending }: { side: PortalSide; client: StreamChat; userId: string; pending: number }) {
  const router = useRouter();
  const params = useSearchParams();
  const activeId = params.get("rfq");
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  /** "Try again" after every automatic retry failed. */
  const [retryKey, setRetryKey] = useState(0);
  const [, setTick] = useState(0);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [query, setQuery] = useState("");
  const names = useCounterparts(side);

  // The caller's conversations, live. Only the API can add them to one (see the API chat module).
  useEffect(() => {
    let cancelled = false;
    // Only the newest load counts: a slow older one never overwrites a newer result or shows an error after a success
    // (developer report, 19 Nov 2026: "Could not load" next to "All 1" on staging).
    let latest = 0;
    let loadedOnce = false;
    let count = 0;
    // Stream can be slow or drop a first request: retry quietly (spinner stays) before showing an error.
    let attempt = 0;
    let retryTimer: number | undefined;
    const load = async () => {
      const mine = ++latest;
      try {
        // The list needs only each conversation's last message; a thread loads its history when opened (faster first load).
        const found = await client.queryChannels({ type: CHAT_CHANNEL_TYPE, members: { $in: [userId] } }, [{ last_message_at: -1 }], {
          watch: true,
          state: true,
          limit: 30,
          message_limit: 1,
        });
        if (cancelled || mine !== latest) return;
        loadedOnce = true;
        count = found.length;
        setChannels(found);
        setLoadError(false);
      } catch (error) {
        // The reason, for support; no tokens or message text in it.
        console.warn("Chat: could not load conversations", error instanceof Error ? error.message : error);
        if (cancelled || mine !== latest || loadedOnce) return;
        attempt += 1;
        if (attempt < 4) retryTimer = window.setTimeout(() => void load(), 1500 * attempt);
        else setLoadError(true);
      }
    };
    void load();

    // Conversations the API is still opening for older requests: check again every 2 s (up to 30 s) until they appear.
    // The "added to channel" event is not sent for conversations created with their members, so this does not rely on it.
    let checks = 0;
    const expected = pending;
    const timer =
      expected > 0
        ? window.setInterval(() => {
            checks += 1;
            if (cancelled || checks > 15 || (loadedOnce && count >= expected)) {
              window.clearInterval(timer);
              return;
            }
            void load();
          }, 2000)
        : undefined;

    const changed = client.on((event) => {
      // A conversation the list does not know yet (new request, or one opened just now): load again.
      if (event.type === "notification.added_to_channel" || event.type === "notification.message_new" || event.type === "channel.created") void load();
      else if (event.type === "message.new" || event.type === "notification.mark_read" || event.type === "message.read") setTick((n) => n + 1);
    });
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      if (retryTimer) window.clearTimeout(retryTimer);
      changed.unsubscribe();
    };
  }, [client, userId, pending, retryKey]);

  const sorted = useMemo(() => {
    const list = [...(channels ?? [])].sort(
      (a, b) => new Date(b.state.last_message_at ?? 0).getTime() - new Date(a.state.last_message_at ?? 0).getTime(),
    );
    const text = query.trim().toLowerCase();
    return list.filter((channel) => {
      if (filter === "unread" && channel.countUnread() === 0) return false;
      if (!text) return true;
      const who = names.data?.get(channel.id ?? "");
      return [who?.name, who?.partName, who?.reference].some((value) => value?.toLowerCase().includes(text));
    });
    // channels' state changes in place; the tick re-runs this.
  }, [channels, filter, query, names.data]);

  const active = activeId ? (channels ?? []).find((channel) => channel.id === activeId) : undefined;
  const unreadCount = (channels ?? []).filter((channel) => channel.countUnread() > 0).length;
  const open = (id: string | null) => router.replace(id ? `/${side}/messages?rfq=${encodeURIComponent(id)}` : `/${side}/messages`, { scroll: false });

  return (
    <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(280px,360px)_1fr]">
      {/* Conversations (hidden on phones while one is open). */}
      <aside className={cn("flex min-h-0 flex-col border-line lg:border-r", active && "max-lg:hidden")}>
        <div className="flex shrink-0 flex-col gap-2.5 px-3 pt-3 pb-2">
          <label className="flex h-10 items-center gap-2.5 rounded-full bg-surface px-4">
            <Search aria-hidden className="size-4 text-text-muted" />
            <span className="sr-only">Search conversations</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              maxLength={60}
              placeholder="Search name, part or RQ number"
              className="min-w-0 flex-1 bg-transparent text-sm text-text-strong outline-none placeholder:text-text-subtle"
            />
          </label>
          <FilterChips
            label="Show"
            value={filter}
            onChange={setFilter}
            items={[
              { key: "all" as const, label: "All", count: channels?.length ?? 0 },
              { key: "unread" as const, label: "Unread", count: unreadCount },
            ]}
          />
        </div>
        {channels === null && loadError ? (
          <div role="alert" className="flex flex-col items-center gap-3 px-5 py-10 text-center text-sm text-text-muted">
            <p>Could not load your conversations. Check your connection.</p>
            <button
              type="button"
              onClick={() => {
                setLoadError(false);
                setRetryKey((key) => key + 1);
              }}
              className={cn("rounded-full border border-line px-4 py-1.5 text-[13px] font-medium text-text-strong hover:bg-black/4", focusRing)}
            >
              Try again
            </button>
          </div>
        ) : channels === null ? (
          <Spinner label="Loading conversations" className="py-16" />
        ) : sorted.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-text-muted">
            {(channels?.length ?? 0) === 0
              ? side === "buyer"
                ? "No conversations yet. Ask a seller for a quote and your chat starts here."
                : "No conversations yet. When a buyer asks for a quote, the chat starts here."
              : "Nothing matches."}
          </p>
        ) : (
          <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-2">
            {sorted.map((channel) => {
              const who = names.data?.get(channel.id ?? "");
              const last = channel.state.messages.at(-1);
              const unread = channel.countUnread();
              const preview = last ? (last.user?.id === userId ? "You: " : "") + (last.text || (last.attachments?.length ? "Photo" : "")) : "";
              const isActive = channel.id === activeId;
              return (
                <li key={channel.cid}>
                  <button
                    type="button"
                    onClick={() => open(channel.id ?? null)}
                    aria-current={isActive ? "true" : undefined}
                    className={cn("flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left hover:bg-surface", isActive && "bg-surface", focusRing)}
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-sm font-medium text-text-strong ring-1 ring-line">
                      {initials(who?.name ?? "?")}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5 leading-[normal]">
                      <span className="flex items-center gap-2">
                        <span className={cn("min-w-0 flex-1 truncate text-[15px] text-text-strong", unread > 0 ? "font-semibold" : "font-medium")}>{who?.name ?? "Conversation"}</span>
                        {channel.state.last_message_at ? (
                          <span className={cn("shrink-0 text-xs", unread > 0 ? "font-medium text-side-accent" : "text-text-subtle")}>
                            {shortAge(new Date(channel.state.last_message_at).toISOString())}
                          </span>
                        ) : null}
                      </span>
                      <span className="truncate text-xs text-text-subtle">{who ? `${who.reference} · ${who.partName}` : ""}</span>
                      <span className="flex items-center gap-2">
                        <span className={cn("min-w-0 flex-1 truncate text-[13px]", unread > 0 ? "text-text-strong" : "text-text-muted")}>{preview}</span>
                        {unread > 0 ? (
                          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-side-accent px-1.5 text-[11px] font-semibold text-white">{unread}</span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      {active ? (
        <Thread key={active.cid} side={side} channel={active} userId={userId} who={names.data?.get(active.id ?? "")} onBack={() => open(null)} />
      ) : channels === null ? (
        // Still loading the conversations: a spinner, not "Choose a conversation" (developer request, 21 Nov 2026).
        <Spinner label="Loading" className="bg-surface/50 max-lg:hidden" />
      ) : (
        <div className="hidden flex-col items-center justify-center gap-2 bg-surface/50 p-10 text-center lg:flex">
          <span className="flex size-14 items-center justify-center rounded-full bg-panel text-text-muted ring-1 ring-line">
            <MessagesSquare aria-hidden className="size-6" />
          </span>
          <p className="text-[15px] font-medium text-text-strong">{activeId && channels ? "This conversation is being set up" : "Your conversations"}</p>
          <p className="max-w-[320px] text-sm text-text-muted">
            {activeId && channels ? "It appears here in a moment." : "Choose a conversation to read and reply. Quotations and photos appear in the chat."}
          </p>
        </div>
      )}
    </div>
  );
}

type Item =
  | { kind: "day"; key: string; label: string }
  | { kind: "message"; key: string; message: Channel["state"]["messages"][number]; mine: boolean; first: boolean; last: boolean; at: string };

/** Chronological items with a date chip whenever the day changes, and grouping of consecutive messages (WhatsApp style). */
function toItems(messages: Channel["state"]["messages"], userId: string): Item[] {
  const items: Item[] = [];
  let day = "";
  messages.forEach((message, index) => {
    const created = message.created_at ? new Date(message.created_at) : new Date();
    const label = dayLabel(created);
    if (label !== day) {
      day = label;
      items.push({ kind: "day", key: `day-${message.id}`, label });
    }
    const previous = messages[index - 1];
    const next = messages[index + 1];
    const sameDay = (other: typeof message | undefined) => Boolean(other?.created_at) && dayLabel(new Date(other!.created_at!)) === label;
    const sender = message.user?.id;
    items.push({
      kind: "message",
      key: message.id,
      message,
      mine: sender === userId,
      first: !previous || previous.user?.id !== sender || !sameDay(previous),
      last: !next || next.user?.id !== sender || !sameDay(next),
      at: timeFormat.format(created),
    });
  });
  return items;
}

function Thread({ side, channel, userId, who, onBack }: { side: PortalSide; channel: Channel; userId: string; who: Counterpart | undefined; onBack: () => void }) {
  const [messages, setMessages] = useState(() => [...channel.state.messages]);
  // The list already has the newest message: show it at once; a small spinner above it while the rest loads.
  const [loadingFirst, setLoadingFirst] = useState(true);
  const ready = !loadingFirst || messages.length > 0;
  const [hasOlder, setHasOlder] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState("");
  const [warned, setWarned] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const rfqId = channel.id ?? "";

  // The newest messages first (the list starts at the bottom, like WhatsApp), then live: new, edited and deleted
  // messages, read as they arrive. Older messages load when the reader scrolls up.
  useEffect(() => {
    const sync = () => setMessages([...channel.state.messages]);
    void channel
      .query({ messages: { limit: PAGE } })
      .then((state) => {
        setHasOlder((state.messages?.length ?? 0) >= PAGE);
        sync();
      })
      .catch(() => {})
      .finally(() => setLoadingFirst(false));
    const subs = ["message.new", "message.updated", "message.deleted"].map((type) =>
      channel.on(type as "message.new", () => {
        sync();
        void channel.markRead().catch(() => {});
      }),
    );
    void channel.markRead().catch(() => {});
    return () => subs.forEach((sub) => sub.unsubscribe());
  }, [channel]);

  async function loadOlder() {
    const oldest = channel.state.messages[0]?.id;
    if (!oldest || loadingFirst || loadingOlder || !hasOlder) return;
    setLoadingOlder(true);
    try {
      const state = await channel.query({ messages: { limit: PAGE, id_lt: oldest } });
      setHasOlder((state.messages?.length ?? 0) >= PAGE);
      setMessages([...channel.state.messages]);
    } catch {
      // Try again on the next scroll.
    } finally {
      setLoadingOlder(false);
    }
  }

  // The list is drawn bottom-up (flex-col-reverse): it opens at the newest message and stays there as messages arrive,
  // unless the reader has scrolled up. Near the top, the older page loads.
  function onScroll() {
    const list = listRef.current;
    if (!list) return;
    const fromTop = list.scrollHeight - list.clientHeight - Math.abs(list.scrollTop);
    if (fromTop < 120) void loadOlder();
  }

  function toBottom() {
    listRef.current?.scrollTo({ top: 0 });
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    // Payment and orders must stay on Muhrak: warn once before contact details are sent (developer decision).
    if (containsContactDetails(text) && !warned) {
      setWarned(true);
      return;
    }
    setSending(true);
    setError(null);
    try {
      await channel.sendMessage({ text });
      setDraft("");
      setWarned(false);
      toBottom();
    } catch {
      setError("The message was not sent. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  async function sendPhoto(file: File | undefined) {
    if (!file || sending) return;
    const problem = checkFile("chat_photo", file);
    if (problem) {
      setError(problem);
      return;
    }
    setSending(true);
    setError(null);
    try {
      await sendChatPhoto(side, rfqId, file);
      toBottom();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The photo was not sent. Please try again.");
    } finally {
      setSending(false);
    }
  }

  const requestHref = side === "buyer" ? `/buyer/requests?id=${encodeURIComponent(rfqId)}` : `/seller/rfq-inbox?id=${encodeURIComponent(rfqId)}`;
  const items = useMemo(() => toItems(messages, userId), [messages, userId]);

  return (
    <article className="flex min-h-0 min-w-0 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-line px-3 py-2.5 sm:px-5">
        <button type="button" onClick={onBack} aria-label="Back to conversations" className={cn("flex size-9 items-center justify-center rounded-full hover:bg-surface lg:hidden", focusRing)}>
          <ArrowLeft aria-hidden className="size-5" />
        </button>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-sm font-medium ring-1 ring-line">{initials(who?.name ?? "?")}</span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-[normal]">
          <p className="truncate text-[15px] font-semibold text-text-strong">{who?.name ?? "Conversation"}</p>
          <p className="truncate text-xs text-text-muted">{who ? `${who.reference} · ${who.partName}` : ""}</p>
        </div>
        <Link href={requestHref} className={cn("shrink-0 rounded-full border border-line px-3.5 py-1.5 text-[13px] font-medium text-text-strong hover:bg-black/4", focusRing)}>
          <span className="sm:hidden">Request</span>
          <span className="max-sm:hidden">View request</span>
        </Link>
      </header>

      <div ref={listRef} onScroll={onScroll} className="flex min-h-0 flex-1 flex-col-reverse overflow-y-auto bg-surface/60 px-3 py-3 sm:px-6" aria-live="polite">
        {/* Drawn newest first because of flex-col-reverse: the first child is at the bottom. */}
        {!ready ? (
          <Spinner label="Loading messages" className="flex-1" />
        ) : items.length === 0 ? (
          <p className="m-auto text-center text-sm text-text-muted">No messages yet. Say hello.</p>
        ) : (
          [...items].reverse().map((item) => {
            if (item.kind === "day") {
              return (
                <div key={item.key} className="my-2 flex justify-center">
                  <span className="rounded-full bg-panel px-3 py-1 text-[11px] font-medium text-text-muted shadow-[0_1px_2px_rgba(0,0,0,0.06)]">{item.label}</span>
                </div>
              );
            }
            const { message, mine, first, last, at } = item;
            const card = message.attachments?.find((attachment) => attachment.type === CHAT_ATTACHMENT.rfq);
            const quoteCard = message.attachments?.find((attachment) => attachment.type === CHAT_ATTACHMENT.quote);
            const photo = message.attachments?.find((attachment) => attachment.type === CHAT_ATTACHMENT.photo);
            if (card) return <RequestCard key={item.key} side={side} rfqId={String((card as Record<string, unknown>).rfq_id ?? "")} at={at} />;
            if (quoteCard) return <QuoteCard key={item.key} side={side} rfqId={rfqId} quoteId={String((quoteCard as Record<string, unknown>).quote_id ?? "")} at={at} />;
            return (
              <div key={item.key} className={cn("flex max-w-[78%] flex-col sm:max-w-[65%]", mine ? "self-end items-end" : "self-start items-start", first ? "mt-2" : "mt-0.5")}>
                {photo ? (
                  <div className={cn("relative rounded-[14px] p-1", mine ? "bg-text-strong" : "bg-panel shadow-[0_1px_2px_rgba(0,0,0,0.08)]")}>
                    <ChatPhoto side={side} rfqId={rfqId} uploadId={String((photo as Record<string, unknown>).upload_id ?? "")} />
                    <span className="absolute right-3 bottom-2.5 rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] text-white">{at}</span>
                  </div>
                ) : (
                  <p
                    className={cn(
                      "rounded-[14px] px-3 pt-1.5 pb-1 text-[15px] leading-snug break-words whitespace-pre-wrap",
                      mine ? "bg-text-strong text-white" : "bg-panel text-text-strong shadow-[0_1px_2px_rgba(0,0,0,0.08)]",
                      last && (mine ? "rounded-br-[4px]" : "rounded-bl-[4px]"),
                    )}
                  >
                    {message.text}
                    {/* The time sits inside the bubble, bottom right (WhatsApp style). */}
                    <span className={cn("float-right mt-1.5 ml-2.5 text-[10.5px] leading-none", mine ? "text-white/60" : "text-text-subtle")}>{at}</span>
                  </p>
                )}
              </div>
            );
          })
        )}
        {loadingOlder || (loadingFirst && messages.length > 0) ? <Spinner label="Loading older messages" size={18} className="py-2" /> : null}
        {!loadingFirst && !hasOlder && items.length > 0 ? <p className="py-2 text-center text-[11px] text-text-subtle">Start of the conversation</p> : null}
      </div>

      <form onSubmit={send} className="flex shrink-0 flex-col gap-2 border-t border-line px-3 py-2.5 sm:px-5">
        {warned ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[14px] bg-[#fff4e5] px-4 py-2.5 text-sm text-text-strong">
            <ShieldAlert aria-hidden className="size-5 shrink-0 text-[#b45309]" />
            <p className="min-w-0 flex-1 leading-snug">
              This looks like a phone number, email or messenger name. Keep the deal and the payment on Muhrak: payments made outside are not protected.
            </p>
            <button type="submit" className={cn("rounded-full bg-text-strong px-4 py-1.5 text-sm font-medium text-white hover:opacity-90", focusRing)}>
              Send anyway
            </button>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={sending}
            aria-label="Send a photo"
            title="Send a photo"
            className={cn("flex size-10 shrink-0 items-center justify-center rounded-full text-text-body hover:bg-surface disabled:opacity-50", focusRing)}
          >
            {sending ? <Loader2 aria-hidden className="size-5 animate-spin" /> : <ImagePlus aria-hidden className="size-5" />}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={acceptFor("chat_photo")}
            tabIndex={-1}
            aria-hidden
            className="sr-only"
            onChange={(event) => {
              void sendPhoto(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <label htmlFor={`chat-input-${rfqId}`} className="sr-only">
            Write a message
          </label>
          <input
            id={`chat-input-${rfqId}`}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setWarned(false);
            }}
            maxLength={2000}
            autoComplete="off"
            placeholder="Write a message…"
            className="h-11 min-w-0 flex-1 rounded-full bg-surface px-5 text-[15px] text-text-strong outline-none placeholder:text-text-subtle focus-visible:ring-3 focus-visible:ring-brand-blue/30"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            aria-label="Send"
            className={cn("flex size-11 shrink-0 items-center justify-center rounded-full bg-side-accent text-white hover:opacity-90 disabled:opacity-40", focusRing)}
          >
            <SendHorizontal aria-hidden className="size-5" />
          </button>
        </div>
      </form>
    </article>
  );
}

/** The quote request card: only the id travels in chat; the details come from the API (owner-checked). */
function RequestCard({ side, rfqId, at }: { side: PortalSide; rfqId: string; at: string }) {
  return side === "buyer" ? <BuyerRequestCard rfqId={rfqId} at={at} /> : <SellerRequestCard rfqId={rfqId} at={at} />;
}

function BuyerRequestCard({ rfqId, at }: { rfqId: string; at: string }) {
  const rfq = useBuyerRfq(rfqId).data;
  return rfq ? (
    <CardView
      href={`/buyer/requests?id=${encodeURIComponent(rfq.id)}`}
      photo={rfq.product.photoUrl}
      title={`Quote request · ${rfq.reference}`}
      lines={[`${rfq.partName} × ${quantityLabel(rfq.quantity, rfq.unit)}`, `${neededByLabel(rfq.neededBy)} · Deliver to ${rfq.deliveryCity}`]}
      status={buyerStatus(rfq.status)}
      at={at}
    />
  ) : null;
}

function SellerRequestCard({ rfqId, at }: { rfqId: string; at: string }) {
  const rfq = useSellerRfq(rfqId).data;
  return rfq ? (
    <CardView
      href={`/seller/rfq-inbox?id=${encodeURIComponent(rfq.id)}`}
      photo={rfq.product.photoUrl}
      title={`Quote request · ${rfq.reference}`}
      lines={[`${rfq.partName} × ${quantityLabel(rfq.quantity, rfq.unit)}`, `${neededByLabel(rfq.neededBy)} · Deliver to ${rfq.deliveryCity}`]}
      status={sellerStatus(rfq.status)}
      at={at}
    />
  ) : null;
}

/**
 * A quotation card (Day 11): only the quotation id travels in chat; the
 * numbers come from the API, which checks the caller is this request's buyer
 * or seller. A card from another conversation (tampered) is not shown.
 */
function QuoteCard({ side, rfqId, quoteId, at }: { side: PortalSide; rfqId: string; quoteId: string; at: string }) {
  const quote = useQuote(side, quoteId).data;
  if (!quote || quote.rfqId !== rfqId) return null;
  const href = side === "buyer" ? `/buyer/requests?id=${encodeURIComponent(rfqId)}` : `/seller/rfq-inbox?id=${encodeURIComponent(rfqId)}`;
  return (
    <CardView
      href={href}
      icon={<FileText aria-hidden className="size-5 text-text-strong" />}
      title={`Quotation · ${quote.reference}`}
      lines={[
        `${itemCountLabel(quote)} · Total ${formatMoney(quote.total)}`,
        quote.status === "active" ? `Valid until ${quoteDate(quote.validUntil)} · Delivery ${quote.deliveryDays} days` : `Delivery ${quote.deliveryDays} days`,
      ]}
      status={quoteStatus(quote.status)}
      at={at}
    />
  );
}

function CardView({
  href,
  photo,
  icon,
  title,
  lines,
  status,
  at,
}: {
  href: string;
  photo?: string | null;
  icon?: ReactNode;
  title: string;
  lines: string[];
  status: { label: string; tone: Parameters<typeof RfqChip>[0]["tone"] };
  at: string;
}) {
  return (
    <div className="my-2 flex w-full flex-col items-center gap-1 self-center">
      <Link href={href} className={cn("flex w-full max-w-[440px] items-center gap-3.5 rounded-[18px] border border-line bg-surface/60 p-3 pr-4 hover:bg-surface", focusRing)}>
        {icon ? <span className="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-[#ededf0]">{icon}</span> : <Thumb src={photo ?? null} size="sm" />}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 leading-[normal]">
          <span className="truncate text-[15px] font-medium text-text-strong">{title}</span>
          {lines.map((line) => (
            <span key={line} className="truncate text-[13px] text-text-muted">
              {line}
            </span>
          ))}
        </span>
        <RfqChip tone={status.tone}>{status.label}</RfqChip>
      </Link>
      <span className="text-[11px] text-text-subtle">{at}</span>
    </div>
  );
}

/** A photo sent in this conversation (short-lived link from the API; opens full size). */
function ChatPhoto({ side, rfqId, uploadId }: { side: PortalSide; rfqId: string; uploadId: string }) {
  const link = useChatPhoto(side, rfqId, uploadId);
  if (!link.data) {
    return <span className="flex size-[180px] items-center justify-center rounded-[18px] bg-surface text-[13px] text-text-subtle">{link.isError ? "Photo unavailable" : <Spinner label="Loading photo" />}</span>;
  }
  return (
    <a href={link.data} target="_blank" rel="noreferrer noopener" className={cn("block overflow-hidden rounded-[10px]", focusRing)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed link to a private chat photo */}
      <img src={link.data} alt="Photo sent in chat" referrerPolicy="no-referrer" className="max-h-[260px] w-auto max-w-full rounded-[10px] object-cover" />
    </a>
  );
}
