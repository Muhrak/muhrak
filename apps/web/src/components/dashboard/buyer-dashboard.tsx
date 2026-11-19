"use client";

import { ArrowUpRight, Camera, ChevronDown, Info, LogOut, MessageCircle, Search, Settings, Store, UserRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { BuyerRfq, RfqStatus } from "@/schemas";
import { useCurrentUser, useSignOut } from "@/features/auth/hooks";
import { initials } from "@/features/auth/user-display";
import { useBuyerRfqsPreview } from "@/features/rfq/api";
import { buyerStatus, quantityLabel, Thumb } from "@/features/rfq/parts";
import { cn } from "@/lib/utils";

/**
 * Buyer dashboard from the developer's reference "dashboard buyer muhrak"
 * (19 Nov 2026), in Muhrak colours. Every block shows the buyer's own data:
 * the two cards are open requests and quotes received, the four buttons go
 * to working pages, the table is the newest requests and the statistic is
 * all requests by status, with the sellers asked. Orders and payments join
 * when they are built (Days 12-16).
 */

/** Requests read for the dashboard (one call: cards, table and sellers). */
const READ = 20;
const TABLE_ROWS = 5;
const SELLER_ROWS = 5;

const focusRing = "outline-none focus-visible:ring-3 focus-visible:ring-sky-blue/45";

export function BuyerDashboard() {
  const user = useCurrentUser("buyer");
  const rfqs = useBuyerRfqsPreview(READ);
  if (!user) return null;

  const items = rfqs.data?.items ?? [];
  const counts = rfqs.data?.counts;
  const latestOpen = items.find((rfq) => rfq.status === "open");
  const latestQuoted = items.find((rfq) => rfq.status === "quoted");

  return (
    <div className="flex flex-col gap-7">
      <TopBar name={user.fullName} email={user.email} />
      <div className="grid grid-cols-1 gap-7 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-7">
          <section aria-labelledby="dash-requests" className="flex flex-col gap-4">
            <SectionHead id="dash-requests" title="Requests" link={{ href: "/buyer/requests", label: "See all" }} />
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <CountCard
                dark
                count={counts?.open}
                unit={counts?.open === 1 ? "request waiting" : "requests waiting"}
                latest={latestOpen}
                emptyLine="Nothing waiting for a reply"
                href="/buyer/requests?filter=open"
                linkLabel="Open requests waiting for a reply"
              />
              <CountCard
                count={counts?.quoted}
                unit={counts?.quoted === 1 ? "quote received" : "quotes received"}
                latest={latestQuoted}
                emptyLine="Quotes from sellers show here"
                href="/buyer/requests?filter=quoted"
                linkLabel="Open quoted requests"
              />
            </div>
            <nav aria-label="Quick actions" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              <Action href="/ai" icon={<Camera aria-hidden className="size-[18px]" />} highlighted>
                Find by photo
              </Action>
              <Action href="/search" icon={<Search aria-hidden className="size-[18px]" />}>
                Search parts
              </Action>
              <Action href="/sellers" icon={<Store aria-hidden className="size-[18px]" />}>
                Sellers
              </Action>
              <Action href="/buyer/messages" icon={<MessageCircle aria-hidden className="size-[18px]" />}>
                Messages
              </Action>
            </nav>
          </section>
          <RecentRequests items={items.slice(0, TABLE_ROWS)} loading={rfqs.isPending} failed={rfqs.isError} />
        </div>
        <Statistic counts={counts} items={items} loading={rfqs.isPending} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- top bar

function TopBar({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    const text = q.trim();
    // Muhrak AI answers typed searches too (developer request: "Find part" goes to Muhrak AI).
    router.push(text.length >= 2 ? `/ai?q=${encodeURIComponent(text)}` : "/ai");
  }
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,430px)_auto] lg:gap-x-8">
      <div className="flex min-w-0 items-center gap-3.5">
        <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-sky-light to-sky-periwinkle text-[15px] font-semibold text-white">
          {initials(name)}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5 leading-tight">
          <h1 className="text-[19px] font-semibold text-text-strong">
            Greetings! <span aria-hidden>👋</span>
          </h1>
          <p className="truncate text-sm text-text-muted">
            Start your day with <span className="font-medium text-text-body">{name}</span>
          </p>
        </div>
      </div>
      <form role="search" onSubmit={submit} className="order-last col-span-2 lg:order-none lg:col-span-1">
        <label className="flex h-12 items-center gap-2.5 rounded-full bg-black/[0.06] px-5 text-text-muted focus-within:ring-3 focus-within:ring-sky-blue/35">
          <Search aria-hidden className="size-[18px] shrink-0" />
          <span className="sr-only">Search parts</span>
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            maxLength={80}
            placeholder="Search a part, part number or machine"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-text-strong outline-none placeholder:text-text-subtle"
          />
        </label>
      </form>
      <AccountMenu name={name} email={email} />
    </div>
  );
}

function AccountMenu({ name, email }: { name: string; email: string }) {
  const signOut = useSignOut("buyer");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => box.current && !box.current.contains(event.target as Node) && setOpen(false);
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const item = cn("flex w-full items-center gap-2.5 rounded-[12px] px-3 py-2.5 text-left text-[15px] text-text-strong hover:bg-black/[0.04]", focusRing);
  return (
    <div ref={box} className="relative justify-self-end">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn("flex h-12 items-center gap-2 rounded-full bg-ink pr-4 pl-3.5 text-[15px] font-medium text-white hover:bg-ink/90", focusRing)}
      >
        <UserRound aria-hidden className="size-[18px]" />
        <span className="hidden sm:inline">My account</span>
        <ChevronDown aria-hidden className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div role="menu" className="absolute top-[calc(100%+8px)] right-0 z-20 w-[260px] rounded-[20px] bg-white p-2 shadow-[0_18px_48px_-12px_rgba(10,11,18,0.28),inset_0_0_0_1px_rgba(10,11,18,0.06)]">
          <div className="px-3 pt-2 pb-3 leading-tight">
            <p className="truncate text-[15px] font-medium text-text-strong">{name}</p>
            <p className="mt-1 truncate text-[13px] text-text-muted">{email}</p>
          </div>
          <Link role="menuitem" href="/buyer/settings" onClick={() => setOpen(false)} className={item}>
            <Settings aria-hidden className="size-[18px] text-text-muted" />
            Settings
          </Link>
          <button role="menuitem" type="button" onClick={() => void signOut()} className={cn(item, "text-[#d93636]")}>
            <LogOut aria-hidden className="size-[18px]" />
            Log out
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- cards and actions

function SectionHead({ id, title, link }: { id: string; title: string; link?: { href: string; label: string } }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 id={id} className="text-[19px] font-medium text-text-strong">
        {title}
      </h2>
      {link ? (
        <Link href={link.href} className={cn("rounded-sm text-sm text-text-muted hover:text-text-strong", focusRing)}>
          {link.label}
        </Link>
      ) : null}
    </div>
  );
}

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** A count of requests in the shape of the reference's bank cards. */
function CountCard({
  dark = false,
  count,
  unit,
  latest,
  emptyLine,
  href,
  linkLabel,
}: {
  dark?: boolean;
  count: number | undefined;
  unit: string;
  latest: BuyerRfq | undefined;
  emptyLine: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div
      className={cn(
        "relative isolate flex min-h-[184px] flex-col overflow-hidden rounded-[28px] px-6 pt-6 pb-5 sm:px-7",
        dark ? "bg-ink text-white" : "bg-white text-text-strong shadow-[inset_0_0_0_1px_rgba(10,11,18,0.04)]",
      )}
    >
      <DotGlobe dark={dark} />
      <div className="flex items-start gap-3">
        <p className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2.5">
          <span className="text-[40px] leading-none font-medium tracking-[-0.02em] tabular-nums">{count ?? "–"}</span>
          <span className={cn("text-[15px]", dark ? "text-white/70" : "text-text-muted")}>{unit}</span>
        </p>
        <Link
          href={href}
          aria-label={linkLabel}
          className={cn(
            "-mt-1 -mr-2 flex size-9 shrink-0 items-center justify-center rounded-full",
            dark ? "text-white/80 hover:bg-white/10 focus-visible:ring-white/40" : "text-text-muted hover:bg-black/5",
            focusRing,
          )}
        >
          <ArrowUpRight aria-hidden className="size-5" />
        </Link>
      </div>
      <p className={cn("mt-5 truncate text-[15px]", dark ? "text-white/85" : "text-text-body")}>
        {latest ? (
          <>
            <span className="tracking-[0.06em]">{latest.reference}</span>
            <span className={dark ? "text-white/55" : "text-text-subtle"}> · {latest.partName}</span>
          </>
        ) : (
          emptyLine
        )}
      </p>
      <div className="mt-auto flex items-end justify-between gap-3 pt-5">
        <span className={cn("text-[15px] tabular-nums", dark ? "text-white/85" : "text-text-body")}>{latest ? dateLabel(latest.createdAt) : ""}</span>
        {dark ? (
          <Image src="/portal/muhrak-logo-white.svg" alt="" width={92} height={17.6} />
        ) : (
          <Image src="/ai/muhrak-mark.svg" alt="" width={30} height={25.6} />
        )}
      </div>
    </div>
  );
}

/** The dotted globe on the reference's cards: a dot grid faded to a circle. */
function DotGlobe({ dark }: { dark: boolean }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute top-1/2 left-[58%] -z-10 size-[260px] -translate-1/2 rounded-full"
      style={{
        backgroundImage: `radial-gradient(${dark ? "rgba(255,255,255,0.13)" : "rgba(10,11,18,0.07)"} 1.1px, transparent 1.4px)`,
        backgroundSize: "9px 9px",
        maskImage: "radial-gradient(circle, #000 45%, transparent 70%)",
        WebkitMaskImage: "radial-gradient(circle, #000 45%, transparent 70%)",
      }}
    />
  );
}

function Action({ href, icon, highlighted = false, children }: { href: string; icon: ReactNode; highlighted?: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex h-[60px] items-center gap-3 rounded-[20px] px-3 text-[15px] font-medium transition-colors sm:px-3.5 sm:text-base",
        highlighted ? "bg-sky-blue text-white hover:bg-sky-periwinkle" : "bg-white text-text-strong shadow-[inset_0_0_0_1px_rgba(10,11,18,0.04)] hover:bg-white/70",
        focusRing,
      )}
    >
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", highlighted ? "bg-white text-sky-blue" : "bg-ink text-white")}>{icon}</span>
      <span className="truncate">{children}</span>
    </Link>
  );
}

// ---------------------------------------------------------------- recent requests

const STATUS_CHIP: Record<"done" | "neutral" | "closed", string> = {
  done: "bg-[#dcf3e3] text-[#1d7a3f] [--dot:#22a356]",
  neutral: "bg-black/[0.07] text-text-body [--dot:#8e8e96]",
  closed: "bg-[#fde2e2] text-[#c23030] [--dot:#e04848]",
};

function StatusChip({ status }: { status: RfqStatus }) {
  const { label, tone } = buyerStatus(status);
  const key = tone === "done" ? "done" : tone === "closed" ? "closed" : "neutral";
  return (
    <span className={cn("inline-flex h-7 items-center gap-1.5 rounded-[9px] px-2.5 text-[13px] font-medium whitespace-nowrap", STATUS_CHIP[key])}>
      <span aria-hidden className="size-1.5 rounded-full bg-(--dot)" />
      {label}
    </span>
  );
}

function RecentRequests({ items, loading, failed }: { items: BuyerRfq[]; loading: boolean; failed: boolean }) {
  // Written out in full so Tailwind sees both classes.
  const columns = "grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1.1fr)]";
  const rowColumns = "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1.1fr)]";
  return (
    <section aria-labelledby="dash-recent" className="flex flex-col gap-3">
      <SectionHead id="dash-recent" title="Recent requests" />
      <div className={cn("hidden px-4 text-[13px] text-text-subtle md:grid", columns)}>
        <span>Part</span>
        <span>Date</span>
        <span>Status</span>
        <span>Seller</span>
      </div>
      {loading ? (
        <p role="status" className="rounded-[18px] bg-white px-4 py-5 text-sm text-text-muted">
          Loading your requests…
        </p>
      ) : failed ? (
        <p role="alert" className="rounded-[18px] bg-white px-4 py-5 text-sm text-text-muted">
          Could not load your requests. Please refresh the page.
        </p>
      ) : items.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] bg-white px-4 py-4">
          <p className="text-[15px] text-text-muted">No requests yet. Snap a photo of a part to ask sellers for a quote.</p>
          <Link href="/ai" className={cn("rounded-full bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-ink/90", focusRing)}>
            Find by photo
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((rfq) => (
            <li key={rfq.id}>
              <Link
                href={`/buyer/requests?id=${encodeURIComponent(rfq.id)}`}
                className={cn("grid items-center gap-x-3 rounded-[18px] bg-white px-4 py-3 transition-colors hover:bg-white/70", rowColumns, focusRing)}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="[&>span]:size-10 [&>span]:rounded-full">
                    <Thumb src={rfq.product.photoUrl} size="sm" />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5 leading-tight">
                    <span className="truncate text-[15px] font-medium text-text-strong">{rfq.partName}</span>
                    <span className="truncate text-[13px] text-text-subtle">
                      {rfq.reference} · {quantityLabel(rfq.quantity, rfq.unit)}
                      <span className="md:hidden"> · {dateLabel(rfq.createdAt)}</span>
                    </span>
                  </span>
                </span>
                <span className="hidden text-sm text-text-muted tabular-nums md:block">{dateLabel(rfq.createdAt)}</span>
                <span>
                  <StatusChip status={rfq.status} />
                </span>
                <span className="hidden truncate text-[15px] text-text-strong md:block">{rfq.seller.companyName}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- statistic

const RING = { quoted: "#4a88c1", open: "#0a0b12", closed: "#d9dae0" } as const;

function Statistic({ counts, items, loading }: { counts: Record<"all" | "open" | "quoted" | "closed", number> | undefined; items: BuyerRfq[]; loading: boolean }) {
  const total = counts?.all ?? 0;
  const parts = (["quoted", "open", "closed"] as const).map((key) => ({ key, value: counts?.[key] ?? 0 }));
  return (
    <section aria-labelledby="dash-stat" className="flex flex-col rounded-[32px] bg-white px-6 py-6 shadow-[inset_0_0_0_1px_rgba(10,11,18,0.04)]">
      <div className="flex items-center gap-2">
        <h2 id="dash-stat" className="text-[19px] font-medium text-text-strong">
          Statistic
        </h2>
        <span title="All your quote requests by status." className="text-text-subtle">
          <Info aria-hidden className="size-4" />
          <span className="sr-only">All your quote requests by status.</span>
        </span>
        <span className="ml-auto rounded-[10px] px-2.5 py-1 text-[12px] text-text-muted shadow-[inset_0_0_0_1px_rgba(10,11,18,0.1)]">All time</span>
      </div>
      <Donut parts={parts} total={total} loading={loading} />
      <ul className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[13px] text-text-muted">
        {[
          ["quoted", "Quoted"],
          ["open", "Waiting"],
          ["closed", "Closed"],
        ].map(([key, label]) => (
          <li key={key} className="flex items-center gap-2">
            <span aria-hidden className="size-3.5 rounded-[4px]" style={{ background: RING[key as keyof typeof RING] }} />
            {label} <span className="text-text-strong tabular-nums">{counts?.[key as keyof typeof RING] ?? 0}</span>
          </li>
        ))}
      </ul>
      <SellersAsked items={items} />
    </section>
  );
}

/** Requests by status as a ring: round-capped arcs with small gaps, total in the middle. */
function Donut({ parts, total, loading }: { parts: { key: keyof typeof RING; value: number }[]; total: number; loading: boolean }) {
  const r = 70;
  const length = 2 * Math.PI * r;
  const gap = 14;
  const shown = parts.filter((part) => part.value > 0);
  const arcs: { key: keyof typeof RING; value: number; arc: number; start: number; mid: number }[] = [];
  for (const part of shown) {
    const share = part.value / total;
    const start = arcs.reduce((sum, done) => sum + (done.value / total) * length, 0);
    arcs.push({ ...part, arc: Math.max(share * length - (shown.length > 1 ? gap : 0), 0.01), start, mid: (start + (share * length) / 2) / length });
  }
  const quoted = arcs.find((arc) => arc.key === "quoted");
  return (
    <div className="relative mx-auto mt-5 aspect-square w-full max-w-[240px]">
      <svg viewBox="0 0 200 200" className="size-full -rotate-90" role="img" aria-label={`${total} requests: ${parts.map((p) => `${p.value} ${p.key}`).join(", ")}`}>
        <circle cx="100" cy="100" r={r} fill="none" stroke="#f1f1f4" strokeWidth="26" />
        {arcs.map((arc) => (
          <circle
            key={arc.key}
            cx="100"
            cy="100"
            r={r}
            fill="none"
            stroke={RING[arc.key]}
            strokeWidth="26"
            strokeLinecap={shown.length > 1 ? "round" : "butt"}
            strokeDasharray={`${arc.arc} ${length}`}
            strokeDashoffset={-(arc.start + (shown.length > 1 ? gap / 2 : 0))}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-tight">
        <span className="text-sm text-text-muted">Total</span>
        <span className="text-[30px] font-medium tracking-[-0.02em] text-text-strong tabular-nums">{loading ? "–" : total}</span>
        <span className="text-[13px] text-text-subtle">{total === 1 ? "request" : "requests"}</span>
      </div>
      {quoted ? <Callout at={quoted.mid}>{`${quoted.value} quoted`}</Callout> : null}
    </div>
  );
}

/** The small dark label on the ring, at a fraction of the way round (0 = top). */
function Callout({ at, children }: { at: number; children: ReactNode }) {
  const angle = at * 2 * Math.PI;
  const x = 50 + 42 * Math.sin(angle);
  const y = 50 - 42 * Math.cos(angle);
  return (
    <span
      className="absolute -translate-1/2 rounded-[8px] bg-ink px-2 py-1 text-[12px] font-medium whitespace-nowrap text-white"
      style={{ left: `${Math.min(Math.max(x, 18), 88)}%`, top: `${y}%` }}
    >
      {children}
    </span>
  );
}

const ago = (iso: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days} ${days === 1 ? "day" : "days"} ago` : dateLabel(iso);
};

/** The sellers of the newest requests: who the buyer asked, how often, how recently. */
function SellersAsked({ items }: { items: BuyerRfq[] }) {
  const sellers = new Map<string, { id: string; name: string; city: string; last: string; count: number; quoted: boolean }>();
  for (const rfq of items) {
    const seen = sellers.get(rfq.seller.id);
    if (seen) {
      seen.count += 1;
      seen.quoted ||= rfq.status === "quoted";
    } else {
      sellers.set(rfq.seller.id, { id: rfq.seller.id, name: rfq.seller.companyName, city: rfq.seller.city, last: rfq.createdAt, count: 1, quoted: rfq.status === "quoted" });
    }
  }
  const rows = [...sellers.values()].slice(0, SELLER_ROWS);
  if (rows.length === 0) return null;
  return (
    <div className="mt-6 flex flex-col gap-1">
      <h3 className="text-[13px] text-text-subtle">Sellers you asked</h3>
      <ul className="flex flex-col">
        {rows.map((seller) => (
          <li key={seller.id}>
            <Link href={`/sellers/${seller.id}`} className={cn("-mx-2 flex items-center gap-3.5 rounded-[16px] px-2 py-2.5 hover:bg-black/[0.03]", focusRing)}>
              <span
                aria-hidden
                className={cn("flex size-12 shrink-0 items-center justify-center rounded-[16px] text-sm font-semibold text-white", seller.quoted ? "bg-sky-blue" : "bg-ink")}
              >
                {initials(seller.name)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate text-[15px] font-medium text-text-strong">{seller.name}</span>
                  <span className="shrink-0 text-[11px] text-text-subtle">{seller.city}</span>
                </span>
                <span className="text-[12px] text-text-subtle">{ago(seller.last)}</span>
              </span>
              <span className="shrink-0 text-[15px] font-medium text-text-strong tabular-nums">
                {seller.count} {seller.count === 1 ? "request" : "requests"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
