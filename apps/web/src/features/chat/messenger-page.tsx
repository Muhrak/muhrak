"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ImagePlus, Loader2, Search, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Channel, StreamChat } from "stream-chat";
import { buyerRfqListResponseSchema, CHAT_ATTACHMENT, CHAT_CHANNEL_TYPE, containsContactDetails, sellerRfqListResponseSchema } from "@/schemas";
import { LogoLoader } from "@/components/ui/logo-loader";
import { authedRequest } from "@/features/auth/authed-request";
import type { PortalSide } from "@/features/auth/paths";
import { useSession } from "@/features/auth/session";
import { useBuyerRfq, useSellerRfq } from "@/features/rfq/api";
import { buyerStatus, neededByLabel, quantityLabel, RfqChip, sellerStatus, shortAge, Thumb } from "@/features/rfq/parts";
import { focusRing } from "@/features/seller/parts";
import { acceptFor, checkFile } from "@/features/upload/upload-file";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { sendChatPhoto, useChatClient, useChatPhoto } from "./api";

/**
 * Messenger (Day 10): Figma "Buyer – Messenger (Dark)" (380:690) and the
 * "AI quote → Order flow" frames, converted to light like the other Centre
 * pages. One conversation per quote request. Shared by the Buyer and Seller
 * Centres; each side uses its own chat connection and session.
 *
 * Names and request details come from the Muhrak API (Stream user names can
 * be changed by their owner, so they are never trusted for display). The
 * active conversation is `?rfq=<id>` in the URL. No pop-up dialogs (the
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

/**
 * Two looks. Buyer: the Buyer Centre design from the developer's reference
 * "dashboard buyer muhrak" (19 Nov 2026; sizes x1.6 in page units under the
 * 85% zoom, like the dashboard). Seller: unchanged.
 */
const LOOK = {
  buyer: {
    page: "flex flex-col gap-5 text-[#262626] lg:gap-[34px]",
    title: "text-[26px] leading-tight font-semibold tracking-[-0.01em] lg:text-[40px]",
    subtitle: "text-[14px] font-medium text-[#9b9b9b] lg:text-[19px]",
    filter: "flex h-10 items-center gap-2 rounded-full px-4 text-[15px] leading-none font-semibold lg:h-[52px] lg:gap-3 lg:px-[24px] lg:text-[19px]",
    filterOn: "bg-ink text-white",
    filterOff: "bg-white text-[#262626] hover:bg-white/70",
    filterCount: "text-xs lg:text-[15px]",
    grid: "grid gap-5 lg:h-[calc(100dvh/0.85-300px)] lg:min-h-[560px] lg:grid-cols-[minmax(360px,520px)_1fr] lg:gap-[38px]",
    aside: "flex min-h-0 flex-col gap-3 rounded-[30px] bg-white p-4 lg:gap-[18px] lg:rounded-[48px] lg:p-[30px]",
    search: "flex h-12 items-center gap-3 rounded-full bg-[#e9e9e9] px-5 focus-within:ring-3 focus-within:ring-sky-blue/35 lg:h-[61px] lg:gap-[14px] lg:px-[22px]",
    searchIcon: "size-[18px] shrink-0 text-[#9b9b9b] lg:size-[25px]",
    searchInput: "min-w-0 flex-1 bg-transparent text-[15px] font-medium text-[#262626] outline-none placeholder:text-[#a3a3a3] lg:text-[20px]",
    note: "px-2 py-10 text-center text-[15px] font-medium text-[#9b9b9b] lg:text-[19px]",
    list: "-mx-2 flex min-h-0 flex-col overflow-y-auto",
    item: "flex w-full items-center gap-3.5 rounded-[18px] px-2 py-2 text-left hover:bg-black/[0.03] lg:gap-[22px] lg:rounded-[22px] lg:px-[12px] lg:py-[12px]",
    itemOn: "bg-[#f4f4f4] hover:bg-[#f4f4f4]",
    avatar: "flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-ink text-[14px] font-bold text-white lg:size-[71px] lg:rounded-[19px] lg:text-[20px]",
    avatarUnread: "bg-sky-blue",
    itemText: "flex min-w-0 flex-1 flex-col gap-0.5 leading-tight lg:gap-[5px]",
    itemName: "min-w-0 flex-1 truncate text-[15px] font-semibold lg:text-[21px]",
    itemTime: "shrink-0 text-[12px] font-medium text-[#9b9b9b] lg:text-[16px]",
    itemPreview: "min-w-0 flex-1 truncate text-[13px] font-medium text-[#9b9b9b] lg:text-[17px]",
    badge: "flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-sky-blue px-1.5 text-[11px] font-bold text-white lg:h-[28px] lg:min-w-[28px] lg:px-2 lg:text-[15px]",
    choose: "hidden items-center justify-center rounded-[48px] bg-white p-10 text-center text-[19px] font-medium text-[#9b9b9b] lg:flex",
    thread: "flex h-[calc(100dvh-246px)] min-h-[420px] min-w-0 flex-col overflow-hidden rounded-[30px] bg-white lg:h-auto lg:min-h-0 lg:rounded-[48px]",
    header: "flex items-center gap-3 border-b border-[#efefef] px-4 py-4 sm:px-6 lg:gap-[18px] lg:px-[36px] lg:pt-[30px] lg:pb-[24px]",
    headAvatar: "flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-ink text-[14px] font-bold text-white lg:size-[61px] lg:rounded-[18px] lg:text-[19px]",
    headText: "flex min-w-0 flex-1 flex-col gap-0.5 leading-tight lg:gap-1",
    headName: "truncate text-[17px] font-semibold lg:text-[25px]",
    headSub: "truncate text-[13px] font-medium text-[#9b9b9b] lg:text-[18px]",
    requestLink: "shrink-0 rounded-full bg-ink px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-ink/90 lg:px-[26px] lg:py-[14px] lg:text-[18px]",
    messages: "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-5 sm:px-6 lg:gap-[16px] lg:px-[36px] lg:py-[28px]",
    bubble: "rounded-[20px] px-4 py-2.5 text-[15px] leading-normal font-medium break-words whitespace-pre-wrap lg:rounded-[24px] lg:px-[22px] lg:py-[14px] lg:text-[19px]",
    mine: "rounded-br-[8px] bg-ink text-white",
    theirs: "rounded-bl-[8px] bg-[#f4f4f4] text-[#262626]",
    time: "px-1 text-[11px] font-medium text-[#9b9b9b] lg:text-[14px]",
    composer: "flex flex-col gap-2 px-4 pt-2 pb-4 sm:px-6 lg:gap-3 lg:px-[30px] lg:pb-[30px]",
    composerRow: "flex items-center gap-2.5 lg:gap-[14px]",
    photoBtn: "flex size-12 shrink-0 items-center justify-center rounded-full bg-ink text-white hover:bg-ink/90 disabled:opacity-50 lg:size-[61px]",
    photoIcon: "size-5 lg:size-[25px]",
    input: "h-12 min-w-0 flex-1 rounded-full bg-[#e9e9e9] px-5 text-[15px] font-medium text-[#262626] outline-none placeholder:text-[#a3a3a3] focus-visible:ring-3 focus-visible:ring-sky-blue/35 lg:h-[61px] lg:px-[26px] lg:text-[20px]",
    send: "h-12 shrink-0 rounded-full bg-sky-blue px-6 text-[15px] font-semibold text-white hover:bg-sky-periwinkle disabled:opacity-50 lg:h-[61px] lg:px-[34px] lg:text-[20px]",
    card: "flex w-full max-w-[440px] items-center gap-3.5 rounded-[18px] bg-[#f4f4f4] p-3 pr-4 hover:bg-[#ececec] lg:max-w-[660px] lg:gap-[20px] lg:rounded-[22px] lg:p-[16px] lg:pr-[26px]",
    cardThumb: "lg:[&>span]:size-[71px] lg:[&>span]:rounded-[19px]",
    cardText: "flex min-w-0 flex-1 flex-col gap-0.5 leading-tight lg:gap-[5px]",
    cardTitle: "truncate text-[15px] font-semibold lg:text-[21px]",
    cardLine: "truncate text-[13px] font-medium text-[#9b9b9b] lg:text-[17px]",
  },
  seller: {
    page: "flex flex-col gap-5",
    title: "text-[28px] font-medium tracking-[-0.02em] text-text-strong sm:text-[40px]",
    subtitle: "text-base text-text-muted",
    filter: "flex h-10 items-center gap-2 rounded-full border px-4 text-[15px] leading-none",
    filterOn: "border-text-strong bg-text-strong text-white",
    filterOff: "border-line text-text-strong hover:bg-black/4",
    filterCount: "text-xs",
    grid: "grid gap-5 lg:h-[calc(100dvh/0.85-250px)] lg:min-h-[520px] lg:grid-cols-[minmax(300px,380px)_1fr]",
    aside: "flex min-h-0 flex-col gap-3 rounded-[24px] bg-panel p-4",
    search: "flex h-11 items-center gap-2.5 rounded-full bg-surface px-4",
    searchIcon: "size-4 text-text-muted",
    searchInput: "min-w-0 flex-1 bg-transparent text-[15px] text-text-strong outline-none placeholder:text-text-subtle",
    note: "px-2 py-10 text-center text-[15px] text-text-muted",
    list: "flex min-h-0 flex-col gap-1 overflow-y-auto",
    item: "flex w-full items-center gap-3 rounded-[16px] px-3 py-3 text-left hover:bg-surface",
    itemOn: "bg-surface",
    avatar: "flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-sm font-medium text-text-strong",
    avatarUnread: "",
    itemText: "flex min-w-0 flex-1 flex-col gap-1 leading-[normal]",
    itemName: "min-w-0 flex-1 truncate text-[15px] font-medium text-text-strong",
    itemTime: "shrink-0 text-xs text-text-subtle",
    itemPreview: "min-w-0 flex-1 truncate text-[13px] text-text-muted",
    badge: "flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-side-accent px-1.5 text-[11px] font-semibold text-white",
    choose: "hidden items-center justify-center rounded-[24px] bg-panel p-10 text-center text-[15px] text-text-muted lg:flex",
    thread: "flex h-[calc(100dvh-240px)] min-h-[420px] min-w-0 flex-col overflow-hidden rounded-[24px] bg-panel lg:h-auto lg:min-h-0",
    header: "flex items-center gap-3 border-b border-line px-4 py-3.5 sm:px-6",
    headAvatar: "flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-sm font-medium",
    headText: "flex min-w-0 flex-1 flex-col gap-0.5 leading-[normal]",
    headName: "truncate text-[17px] font-medium text-text-strong",
    headSub: "truncate text-[13px] text-text-muted",
    requestLink: "shrink-0 rounded-full border border-line px-3.5 py-2 text-sm font-medium text-text-strong hover:bg-black/4 sm:px-4",
    messages: "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-5 sm:px-6",
    bubble: "rounded-[18px] px-4 py-2.5 text-[15px] leading-normal break-words whitespace-pre-wrap",
    mine: "rounded-br-[6px] bg-text-strong text-white",
    theirs: "rounded-bl-[6px] bg-surface text-text-strong",
    time: "px-1 text-[11px] text-text-subtle",
    composer: "flex flex-col gap-2 border-t border-line px-4 py-3.5 sm:px-6",
    composerRow: "flex items-center gap-2.5",
    photoBtn: "flex size-11 shrink-0 items-center justify-center rounded-full text-text-body hover:bg-surface disabled:opacity-50",
    photoIcon: "size-5",
    input: "h-12 min-w-0 flex-1 rounded-full bg-surface px-5 text-[15px] text-text-strong outline-none placeholder:text-text-subtle focus-visible:ring-3 focus-visible:ring-brand-blue/30",
    send: "h-12 shrink-0 rounded-full bg-side-accent px-6 text-[15px] font-semibold text-white hover:opacity-90 disabled:opacity-50",
    card: "flex w-full max-w-[440px] items-center gap-3.5 rounded-[18px] border border-line bg-surface/60 p-3 pr-4 hover:bg-surface",
    cardThumb: "",
    cardText: "flex min-w-0 flex-1 flex-col gap-0.5 leading-[normal]",
    cardTitle: "truncate text-[15px] font-medium text-text-strong",
    cardLine: "truncate text-[13px] text-text-muted",
  },
} satisfies Record<PortalSide, Record<string, string>>;

/** The buyer dashboard's status chips: pale green, grey and red with a dot. */
const BUYER_CHIP = {
  done: { chip: "bg-[#d6efd1] text-[#3d7a35]", dot: "bg-[#3d7a35]" },
  neutral: { chip: "bg-[#e5e5e5] text-[#7a7a7a]", dot: "bg-[#8e8e8e]" },
  closed: { chip: "bg-[#fcd6d6] text-[#a73a3a]", dot: "bg-[#a73a3a]" },
} as const;

function BuyerChip({ status }: { status: ReturnType<typeof buyerStatus> }) {
  const look = BUYER_CHIP[status.tone === "done" ? "done" : status.tone === "closed" ? "closed" : "neutral"];
  return (
    <span className={cn("inline-flex h-[30px] shrink-0 items-center gap-2 rounded-[10px] px-3 text-[13px] font-semibold whitespace-nowrap lg:h-[40px] lg:gap-[12px] lg:rounded-[13px] lg:px-[20px] lg:text-[18px]", look.chip)}>
      <span aria-hidden className={cn("size-1.5 rounded-full lg:size-[8px]", look.dot)} />
      {status.label}
    </span>
  );
}

export function MessengerPage({ side }: { side: PortalSide }) {
  const chat = useChatClient(side);
  const L = LOOK[side];
  return (
    <section className={L.page}>
      <header className="flex flex-col gap-1.5 leading-[normal]">
        <h1 className={L.title}>Messenger</h1>
        <p className={L.subtitle}>{side === "buyer" ? "Chat with sellers about your quote requests." : "Chat with buyers about their quote requests."}</p>
      </header>
      {chat.status === "connecting" ? (
        <LogoLoader label="Connecting to chat" className="py-24" />
      ) : chat.status === "unavailable" ? (
        <p role="alert" className="rounded-[24px] bg-panel px-6 py-10 text-center text-[15px] text-text-muted">
          {chat.message}
        </p>
      ) : (
        <Inbox side={side} client={chat.client} userId={chat.userId} pending={chat.pending} />
      )}
    </section>
  );
}

function Inbox({ side, client, userId, pending }: { side: PortalSide; client: StreamChat; userId: string; pending: number }) {
  const router = useRouter();
  const params = useSearchParams();
  const activeId = params.get("rfq");
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [, setTick] = useState(0);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [query, setQuery] = useState("");
  const names = useCounterparts(side);
  const L = LOOK[side];

  // The caller's conversations, live. Only the API can add them to one (see the API chat module).
  useEffect(() => {
    let cancelled = false;
    // Only the newest load counts: a slow older one never overwrites a newer result or shows an error after a success
    // (developer report, 19 Nov 2026: "Could not load" next to "All 1" on staging).
    let latest = 0;
    let loadedOnce = false;
    let count = 0;
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
        if (!cancelled && mine === latest && !loadedOnce) setLoadError(true);
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
      changed.unsubscribe();
    };
  }, [client, userId, pending]);

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
    <div className="flex flex-col gap-4">
      <div className="flex gap-2" role="group" aria-label="Show">
        {(["all", "unread"] as const).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
            className={cn(
              L.filter,
              filter === key ? L.filterOn : L.filterOff,
              focusRing,
            )}
          >
            {key === "all" ? "All" : "Unread"}
            <span className={cn(L.filterCount, filter === key ? "text-white/70" : "text-text-muted")}>{key === "all" ? (channels?.length ?? 0) : unreadCount}</span>
          </button>
        ))}
      </div>

      <div className={L.grid}>
        {/* Conversations (hidden on phones while one is open). */}
        <aside className={cn(L.aside, active && "max-lg:hidden")}>
          <label className={L.search}>
            <Search aria-hidden className={L.searchIcon} />
            <span className="sr-only">Search conversations</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              maxLength={60}
              placeholder="Search by name, part or RQ number"
              className={L.searchInput}
            />
          </label>
          {loadError ? (
            <p role="alert" className={L.note}>
              Could not load your conversations. Check your connection and reload the page.
            </p>
          ) : channels === null ? (
            <LogoLoader label="Loading conversations" className="py-16" />
          ) : sorted.length === 0 ? (
            <p className={L.note}>
              {(channels?.length ?? 0) === 0
                ? side === "buyer"
                  ? "No conversations yet. Ask a seller for a quote and your chat starts here."
                  : "No conversations yet. When a buyer asks for a quote, the chat starts here."
                : "Nothing matches."}
            </p>
          ) : (
            <ul className={L.list}>
              {sorted.map((channel) => {
                const who = names.data?.get(channel.id ?? "");
                const last = channel.state.messages.at(-1);
                const unread = channel.countUnread();
                const preview = last ? (last.user?.id === userId ? "You: " : "") + (last.text || (last.attachments?.length ? "Photo" : "")) : "";
                return (
                  <li key={channel.cid}>
                    <button
                      type="button"
                      onClick={() => open(channel.id ?? null)}
                      aria-current={channel.id === activeId ? "true" : undefined}
                      className={cn(L.item, channel.id === activeId && L.itemOn, focusRing)}
                    >
                      <span className={cn(L.avatar, unread > 0 && L.avatarUnread)}>
                        {initials(who?.name ?? "?")}
                      </span>
                      <span className={L.itemText}>
                        <span className="flex items-center gap-2">
                          <span className={L.itemName}>{who?.name ?? "Conversation"}</span>
                          {channel.state.last_message_at ? <span className={L.itemTime}>{shortAge(new Date(channel.state.last_message_at).toISOString())}</span> : null}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className={L.itemPreview}>{preview || `${who?.reference ?? ""} · ${who?.partName ?? ""}`}</span>
                          {unread > 0 ? (
                            <span className={L.badge}>{unread}</span>
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
        ) : (
          <div className={L.choose}>
            {activeId && channels ? "This conversation is still being set up. It appears here in a moment." : "Choose a conversation."}
          </div>
        )}
      </div>
    </div>
  );
}

function Thread({ side, channel, userId, who, onBack }: { side: PortalSide; channel: Channel; userId: string; who: Counterpart | undefined; onBack: () => void }) {
  const [messages, setMessages] = useState(() => [...channel.state.messages]);
  const [draft, setDraft] = useState("");
  const [warned, setWarned] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const rfqId = channel.id ?? "";
  const L = LOOK[side];

  // The history (the list loaded only the last message), then live: new, edited and deleted messages; read as they arrive.
  useEffect(() => {
    const sync = () => setMessages([...channel.state.messages]);
    void channel
      .query({ messages: { limit: 100 } })
      .then(sync)
      .catch(() => {});
    const subs = ["message.new", "message.updated", "message.deleted"].map((type) =>
      channel.on(type as "message.new", () => {
        sync();
        void channel.markRead().catch(() => {});
      }),
    );
    void channel.markRead().catch(() => {});
    return () => subs.forEach((sub) => sub.unsubscribe());
  }, [channel]);

  // Newest message in view: scroll the thread only, never the whole page.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

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
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The photo was not sent. Please try again.");
    } finally {
      setSending(false);
    }
  }

  const requestHref = side === "buyer" ? `/buyer/requests?id=${encodeURIComponent(rfqId)}` : `/seller/rfq-inbox?id=${encodeURIComponent(rfqId)}`;

  return (
    // Phones: a fixed-height thread that scrolls inside, so the message box stays on screen.
    <article className={L.thread}>
      <header className={L.header}>
        <button type="button" onClick={onBack} aria-label="Back to conversations" className={cn("flex size-9 items-center justify-center rounded-full hover:bg-surface lg:hidden", focusRing)}>
          <ArrowLeft aria-hidden className="size-5" />
        </button>
        <span className={L.headAvatar}>{initials(who?.name ?? "?")}</span>
        <div className={L.headText}>
          <p className={L.headName}>{who?.name ?? "Conversation"}</p>
          <p className={L.headSub}>{who ? `${who.reference} · ${who.partName}` : ""}</p>
        </div>
        <Link href={requestHref} className={cn(L.requestLink, focusRing)}>
          <span className="sm:hidden">Request</span>
          <span className="max-sm:hidden">View request</span>
        </Link>
      </header>

      <div ref={listRef} className={L.messages} aria-live="polite">
        {messages.length === 0 ? <p className={L.note}>No messages yet. Say hello.</p> : null}
        {messages.map((message) => {
          const mine = message.user?.id === userId;
          const card = message.attachments?.find((item) => item.type === CHAT_ATTACHMENT.rfq);
          const photo = message.attachments?.find((item) => item.type === CHAT_ATTACHMENT.photo);
          const at = message.created_at ? timeFormat.format(new Date(message.created_at)) : "";
          if (card) return <RequestCard key={message.id} side={side} rfqId={String((card as Record<string, unknown>).rfq_id ?? "")} at={at} />;
          return (
            <div key={message.id} className={cn("flex max-w-[78%] flex-col gap-1", mine ? "self-end items-end" : "self-start items-start")}>
              {photo ? (
                <ChatPhoto side={side} rfqId={rfqId} uploadId={String((photo as Record<string, unknown>).upload_id ?? "")} />
              ) : (
                <p
                  className={cn(
                    L.bubble,
                    mine ? L.mine : L.theirs,
                  )}
                >
                  {message.text}
                </p>
              )}
              <span className={L.time}>{at}</span>
            </div>
          );
        })}
      </div>

      <form onSubmit={send} className={L.composer}>
        {warned ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[16px] bg-[#fff4e5] px-4 py-3 text-sm text-text-strong">
            <ShieldAlert aria-hidden className="size-5 shrink-0 text-[#b45309]" />
            <p className="min-w-0 flex-1 leading-snug">
              This looks like a phone number, email or messenger name. Keep the deal and the payment on Muhrak: payments made outside are not protected.
            </p>
            <button type="submit" className={cn("rounded-full bg-text-strong px-4 py-2 text-sm font-medium text-white hover:opacity-90", focusRing)}>
              Send anyway
            </button>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className={L.composerRow}>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={sending}
            aria-label="Send a photo"
            title="Send a photo"
            className={cn(L.photoBtn, focusRing)}
          >
            {sending ? <Loader2 aria-hidden className={cn(L.photoIcon, "animate-spin")} /> : <ImagePlus aria-hidden className={L.photoIcon} />}
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
            className={L.input}
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            className={cn(L.send, focusRing)}
          >
            Send
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
      side="buyer"
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
      side="seller"
      href={`/seller/rfq-inbox?id=${encodeURIComponent(rfq.id)}`}
      photo={rfq.product.photoUrl}
      title={`Quote request · ${rfq.reference}`}
      lines={[`${rfq.partName} × ${quantityLabel(rfq.quantity, rfq.unit)}`, `${neededByLabel(rfq.neededBy)} · Deliver to ${rfq.deliveryCity}`]}
      status={sellerStatus(rfq.status)}
      at={at}
    />
  ) : null;
}

function CardView({
  side,
  href,
  photo,
  title,
  lines,
  status,
  at,
}: {
  side: PortalSide;
  href: string;
  photo: string | null;
  title: string;
  lines: string[];
  status: ReturnType<typeof buyerStatus>;
  at: string;
}) {
  const L = LOOK[side];
  return (
    <div className="flex w-full flex-col items-center gap-1 self-center">
      <Link href={href} className={cn(L.card, focusRing)}>
        <span className={cn("shrink-0", L.cardThumb)}>
          <Thumb src={photo} size="sm" />
        </span>
        <span className={L.cardText}>
          <span className={L.cardTitle}>{title}</span>
          {lines.map((line) => (
            <span key={line} className={L.cardLine}>
              {line}
            </span>
          ))}
        </span>
        {side === "buyer" ? <BuyerChip status={status} /> : <RfqChip tone={status.tone}>{status.label}</RfqChip>}
      </Link>
      <span className={L.time}>{at}</span>
    </div>
  );
}

/** A photo sent in this conversation (short-lived link from the API; opens full size). */
function ChatPhoto({ side, rfqId, uploadId }: { side: PortalSide; rfqId: string; uploadId: string }) {
  const link = useChatPhoto(side, rfqId, uploadId);
  if (!link.data) {
    return <span className="flex size-[180px] items-center justify-center rounded-[18px] bg-surface text-[13px] text-text-subtle">{link.isError ? "Photo unavailable" : "Loading…"}</span>;
  }
  return (
    <a href={link.data} target="_blank" rel="noreferrer noopener" className={cn("block overflow-hidden rounded-[18px] border border-line", focusRing)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed link to a private chat photo */}
      <img src={link.data} alt="Photo sent in chat" referrerPolicy="no-referrer" className="max-h-[260px] w-auto max-w-full object-cover" />
    </a>
  );
}
