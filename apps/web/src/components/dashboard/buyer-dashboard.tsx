"use client";

import { Camera, ChevronDown, EllipsisVertical, LogOut, MessageCircle, Search, Settings, Store } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { BuyerRfq, RfqStatus } from "@/schemas";
import { useCurrentUser, useSignOut } from "@/features/auth/hooks";
import { initials } from "@/features/auth/user-display";
import { useBuyerRfqsPreview } from "@/features/rfq/api";
import { buyerStatus, quantityLabel } from "@/features/rfq/parts";
import { cn } from "@/lib/utils";

/**
 * Buyer dashboard, laid out exactly like the developer's reference
 * "dashboard buyer muhrak" (19 Nov 2026) in Muhrak colours. Sizes are the
 * reference's, measured on its 967 px panel and scaled to ours (x1.6 in page
 * units under the Centre's 85% zoom). Every block shows the buyer's own
 * data: cards = open requests and quotes received; buttons = working pages;
 * table = newest requests; statistic = all requests by status, then the
 * sellers asked. Orders and payments join when they are built (Days 12-16).
 */

/** Requests read for the dashboard (one call: cards, table and sellers). */
const READ = 20;
const TABLE_ROWS = 5;
const SELLER_ROWS = 5;

/** Reference colours that are not Muhrak tokens: greys of its light panel. */
const GREY = "text-[#9b9b9b]";
const TEXT = "text-[#262626]";
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
    <div className={cn("flex flex-col gap-7 lg:gap-[46px]", TEXT)}>
      <TopBar name={user.fullName} email={user.email} />
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_454px] xl:gap-[50px]">
        <div className="flex min-w-0 flex-col gap-8 lg:gap-[64px]">
          <section aria-labelledby="dash-requests" className="flex flex-col">
            <SectionHead id="dash-requests" title="Requests" link={{ href: "/buyer/requests", label: "See all" }} />
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:mt-[30px] lg:gap-[38px]">
              <CountCard
                dark
                count={counts?.open}
                unit="waiting"
                latest={latestOpen}
                emptyLine="Nothing waiting"
                href="/buyer/requests?filter=open"
                linkLabel="Open requests waiting for a reply"
              />
              <CountCard
                count={counts?.quoted}
                unit="quoted"
                latest={latestQuoted}
                emptyLine="No quotes yet"
                href="/buyer/requests?filter=quoted"
                linkLabel="Open quoted requests"
              />
            </div>
            <nav aria-label="Quick actions" className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:mt-[40px] lg:grid-cols-[1.2fr_1fr_1fr_1.2fr] lg:gap-[38px]">
              <Action href="/ai" icon={<Camera aria-hidden className="size-[18px] lg:size-[26px]" />} highlighted>
                Find by photo
              </Action>
              <Action href="/search" icon={<Search aria-hidden className="size-[18px] lg:size-[24px]" />}>
                Search
              </Action>
              <Action href="/sellers" icon={<Store aria-hidden className="size-[18px] lg:size-[24px]" />}>
                Sellers
              </Action>
              <Action href="/buyer/messages" icon={<MessageCircle aria-hidden className="size-[18px] lg:size-[24px]" />}>
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
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,685px)_auto] lg:gap-x-[48px]">
      <div className="flex min-w-0 items-center gap-3 lg:gap-[15px]">
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-sky-light to-sky-periwinkle text-[15px] font-semibold text-white lg:size-[58px] lg:text-[20px]"
        >
          {initials(name)}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5 lg:gap-[3px]">
          <h1 className="text-[18px] leading-tight font-semibold tracking-[-0.01em] lg:text-[27px]">
            Greetings! <span aria-hidden>👋</span>
          </h1>
          <p className={cn("truncate text-[13px] leading-tight font-medium lg:text-[18.5px]", GREY)}>
            Start your day with <span className="font-semibold text-[#5c5c5c] uppercase">{name}</span>
          </p>
        </div>
      </div>
      <form role="search" onSubmit={submit} className="order-last col-span-2 lg:order-none lg:col-span-1">
        <label className="flex h-12 items-center gap-3 rounded-full bg-[#e9e9e9] px-5 focus-within:ring-3 focus-within:ring-sky-blue/35 lg:h-[61px] lg:gap-[14px] lg:px-[22px]">
          <Search aria-hidden className={cn("size-[18px] shrink-0 lg:size-[25px]", GREY)} strokeWidth={1.8} />
          <span className="sr-only">Search parts</span>
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            maxLength={80}
            placeholder="Search"
            className="min-w-0 flex-1 bg-transparent text-[15px] font-medium outline-none placeholder:text-[#a3a3a3] lg:text-[20px]"
          />
        </label>
      </form>
      <AccountMenu name={name} email={email} />
    </div>
  );
}

/** The reference's account glyph: a filled head and shoulders. */
function PersonGlyph({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="currentColor" className={className}>
      <circle cx="12" cy="7.4" r="4.4" />
      <path d="M3.8 20.2c0-4 3.6-6.7 8.2-6.7s8.2 2.7 8.2 6.7c0 .6-.5 1-1 1H4.8c-.5 0-1-.4-1-1Z" />
    </svg>
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
  const item = cn("flex w-full items-center gap-3 rounded-[14px] px-3.5 py-3 text-left text-[15px] font-medium hover:bg-black/[0.04] lg:text-[18px]", focusRing);
  return (
    <div ref={box} className="relative justify-self-end">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex h-12 items-center gap-2 rounded-full bg-ink pr-4 pl-4 text-[15px] font-semibold text-white hover:bg-ink/90 lg:h-[61px] lg:gap-[12px] lg:pr-[30px] lg:pl-[26px] lg:text-[20px]",
          focusRing,
        )}
      >
        <PersonGlyph className="size-[18px] lg:size-[24px]" />
        <span className="hidden sm:inline">My account</span>
        <ChevronDown aria-hidden className={cn("size-4 transition-transform lg:size-[20px]", open && "rotate-180")} strokeWidth={2.2} />
      </button>
      {open ? (
        <div role="menu" className="absolute top-[calc(100%+10px)] right-0 z-20 w-[280px] rounded-[24px] bg-white p-2.5 shadow-[0_18px_48px_-12px_rgba(10,11,18,0.28),inset_0_0_0_1px_rgba(10,11,18,0.06)] lg:w-[330px]">
          <div className="px-3.5 pt-2.5 pb-3.5 leading-tight">
            <p className="truncate text-[16px] font-semibold lg:text-[19px]">{name}</p>
            <p className={cn("mt-1 truncate text-[13px] font-medium lg:text-[16px]", GREY)}>{email}</p>
          </div>
          <Link role="menuitem" href="/buyer/settings" onClick={() => setOpen(false)} className={item}>
            <Settings aria-hidden className={cn("size-[18px] lg:size-[21px]", GREY)} />
            Settings
          </Link>
          <button role="menuitem" type="button" onClick={() => void signOut()} className={cn(item, "text-[#d93636]")}>
            <LogOut aria-hidden className="size-[18px] lg:size-[21px]" />
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
      <h2 id={id} className="text-[18px] leading-tight font-semibold tracking-[-0.01em] lg:text-[25px]">
        {title}
      </h2>
      {link ? (
        <Link href={link.href} className={cn("rounded-sm text-[13px] font-medium hover:text-[#262626] lg:text-[18px]", GREY, focusRing)}>
          {link.label}
        </Link>
      ) : null}
    </div>
  );
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const fullDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

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
        "relative isolate flex aspect-[285/172] min-h-[180px] flex-col overflow-hidden rounded-[22px] px-6 pt-6 pb-5 lg:rounded-[29px] lg:px-[40px] lg:pt-[44px] lg:pb-[34px]",
        dark ? "bg-ink text-white" : "bg-white",
      )}
    >
      <DotGlobe dark={dark} />
      <Link
        href={href}
        aria-label={linkLabel}
        className={cn(
          "absolute top-4 right-3 flex size-9 items-center justify-center rounded-full lg:top-[26px] lg:right-[26px] lg:size-11",
          dark ? "text-white hover:bg-white/10" : "text-[#262626] hover:bg-black/5",
          focusRing,
        )}
      >
        <EllipsisVertical aria-hidden className="size-5 lg:size-[26px]" strokeWidth={2.6} />
      </Link>
      <p className="flex items-baseline gap-2 pr-10 lg:gap-3">
        <span className="text-[34px] leading-none font-semibold tracking-[-0.01em] tabular-nums lg:text-[46px]">{count ?? "–"}</span>
        <span className="text-[22px] leading-none font-semibold lg:text-[30px]">{unit}</span>
      </p>
      <p className={cn("mt-4 truncate text-[16px] font-medium lg:mt-[30px] lg:text-[24px]", dark ? "text-white" : "text-[#262626]")}>
        {latest ? (
          <>
            {latest.reference}
            <span className={dark ? "text-white/55" : "text-[#9b9b9b]"}> · {latest.partName}</span>
          </>
        ) : (
          <span className={dark ? "text-white/60" : "text-[#9b9b9b]"}>{emptyLine}</span>
        )}
      </p>
      <div className="mt-auto flex items-end justify-between gap-3">
        <span className="text-[16px] font-medium tabular-nums lg:text-[24px]">{latest ? shortDate(latest.createdAt) : ""}</span>
        {dark ? (
          <Image src="/portal/muhrak-logo-white.svg" alt="" width={110} height={21} className="lg:h-[27px] lg:w-[141px]" />
        ) : (
          // The reference's two overlapping circles, in Muhrak ink and grey.
          <span aria-hidden className="flex">
            <span className="size-7 rounded-full bg-ink lg:size-[38px]" />
            <span className="-ml-3 size-7 rounded-full bg-[#9b9b9b]/85 lg:-ml-[17px] lg:size-[38px]" />
          </span>
        )}
      </div>
    </div>
  );
}

/** The dotted globe behind the reference's cards: a dot grid shaded into a sphere. */
function DotGlobe({ dark }: { dark: boolean }) {
  const dot = dark ? "rgba(255,255,255,0.16)" : "rgba(10,11,18,0.09)";
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute top-[62%] left-[60%] -z-10 aspect-square w-[78%] -translate-1/2 rounded-full"
      style={{
        backgroundImage: `radial-gradient(${dot} 1.15px, transparent 1.5px)`,
        backgroundSize: "7px 7px",
        maskImage: "radial-gradient(circle at 42% 40%, #000 30%, rgba(0,0,0,0.55) 55%, transparent 71%)",
        WebkitMaskImage: "radial-gradient(circle at 42% 40%, #000 30%, rgba(0,0,0,0.55) 55%, transparent 71%)",
      }}
    />
  );
}

function Action({ href, icon, highlighted = false, children }: { href: string; icon: ReactNode; highlighted?: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "flex h-[60px] items-center gap-3 rounded-[18px] px-3 text-[15px] font-semibold transition-colors lg:h-[92px] lg:gap-[22px] lg:rounded-[22px] lg:px-[18px] lg:text-[24px]",
        highlighted ? "bg-sky-blue text-white hover:bg-sky-periwinkle" : "bg-white text-[#262626] hover:bg-white/70",
        focusRing,
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full lg:size-[55px]",
          highlighted ? "bg-white text-[#262626]" : "bg-ink text-white",
        )}
      >
        {icon}
      </span>
      <span className="truncate">{children}</span>
    </Link>
  );
}

// ---------------------------------------------------------------- recent requests

/** The reference's chips: pale green, grey and red with a dot. */
const STATUS_CHIP = {
  done: { chip: "bg-[#d6efd1] text-[#3d7a35]", dot: "bg-[#3d7a35]" },
  neutral: { chip: "bg-[#e5e5e5] text-[#7a7a7a]", dot: "bg-[#8e8e8e]" },
  closed: { chip: "bg-[#fcd6d6] text-[#a73a3a]", dot: "bg-[#a73a3a]" },
} as const;

function toneOf(status: RfqStatus): keyof typeof STATUS_CHIP {
  const { tone } = buyerStatus(status);
  return tone === "done" ? "done" : tone === "closed" ? "closed" : "neutral";
}

function StatusChip({ status }: { status: RfqStatus }) {
  const look = STATUS_CHIP[toneOf(status)];
  return (
    <span
      className={cn(
        "inline-flex h-[30px] items-center gap-2 rounded-[10px] px-3 text-[13px] font-semibold whitespace-nowrap lg:h-[40px] lg:gap-[12px] lg:rounded-[13px] lg:px-[22px] lg:text-[19px]",
        look.chip,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full lg:size-[8px]", look.dot)} />
      {buyerStatus(status).label}
    </span>
  );
}

/** The part's photo in a circle with the status dot at its top right, like the reference's avatars. */
function Avatar({ rfq }: { rfq: BuyerRfq }) {
  const look = STATUS_CHIP[toneOf(rfq.status)];
  return (
    <span className="relative shrink-0">
      <span className="flex size-11 items-center justify-center overflow-hidden rounded-full bg-[#ececec] text-[13px] font-semibold text-[#8e8e8e] lg:size-[61px] lg:text-[18px]">
        {rfq.product.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- public product photo thumbnail, fixed size
          <img src={rfq.product.photoUrl} alt="" className="size-full object-cover" />
        ) : (
          initials(rfq.partName)
        )}
      </span>
      <span aria-hidden className={cn("absolute top-0 right-0 size-2.5 rounded-full ring-2 ring-white lg:size-[13px]", look.dot)} />
    </span>
  );
}

function RecentRequests({ items, loading, failed }: { items: BuyerRfq[]; loading: boolean; failed: boolean }) {
  // Written out in full so Tailwind sees both classes. Columns as in the reference (name, date, status, amount).
  const columns = "lg:grid-cols-[minmax(0,1.55fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,0.85fr)]";
  const rowColumns = "grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1.55fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,0.85fr)]";
  return (
    <section aria-labelledby="dash-recent" className="flex flex-col">
      <SectionHead id="dash-recent" title="Recent requests" />
      <div className={cn("mt-5 hidden px-[36px] text-[18px] font-medium lg:grid", columns, GREY)}>
        <span>Part</span>
        <span>Date</span>
        <span>Status</span>
        <span>Seller</span>
      </div>
      <div className="mt-3 lg:mt-[12px]">
        {loading ? (
          <p role="status" className={cn("rounded-[16px] bg-white px-5 py-5 text-[15px] font-medium lg:rounded-[19px] lg:text-[20px]", GREY)}>
            Loading your requests…
          </p>
        ) : failed ? (
          <p role="alert" className={cn("rounded-[16px] bg-white px-5 py-5 text-[15px] font-medium lg:rounded-[19px] lg:text-[20px]", GREY)}>
            Could not load your requests. Please refresh the page.
          </p>
        ) : items.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] bg-white px-5 py-4 lg:rounded-[19px] lg:px-[36px] lg:py-[26px]">
            <p className={cn("text-[15px] font-medium lg:text-[20px]", GREY)}>No requests yet. Snap a photo of a part to ask sellers for a quote.</p>
            <Link href="/ai" className={cn("rounded-full bg-ink px-5 py-2.5 text-[14px] font-semibold text-white hover:bg-ink/90 lg:text-[18px]", focusRing)}>
              Find by photo
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5 lg:gap-[7px]">
            {items.map((rfq) => (
              <li key={rfq.id}>
                <Link
                  href={`/buyer/requests?id=${encodeURIComponent(rfq.id)}`}
                  className={cn(
                    "grid items-center gap-x-3 rounded-[16px] bg-white py-3 pr-3 pl-3 transition-colors hover:bg-white/70 lg:h-[100px] lg:rounded-[19px] lg:py-0 lg:pr-[36px] lg:pl-[20px]",
                    rowColumns,
                    focusRing,
                  )}
                >
                  <span className="flex min-w-0 items-center gap-3 lg:gap-[22px]">
                    <Avatar rfq={rfq} />
                    <span className="flex min-w-0 flex-col gap-0.5 leading-tight">
                      <span className="truncate text-[16px] font-semibold lg:text-[24px]">{rfq.partName}</span>
                      <span className={cn("truncate text-[13px] font-medium lg:hidden", GREY)}>
                        {rfq.reference} · {quantityLabel(rfq.quantity, rfq.unit)} · {shortDate(rfq.createdAt)}
                      </span>
                    </span>
                  </span>
                  <span className={cn("hidden text-[19px] font-medium tabular-nums lg:block", GREY)}>{fullDate(rfq.createdAt)}</span>
                  <span>
                    <StatusChip status={rfq.status} />
                  </span>
                  <span className="hidden truncate text-[19px] font-semibold lg:block">{rfq.seller.companyName}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- statistic

const RING = { quoted: "#4a88c1", open: "#0a0b12", closed: "#d4d4d8" } as const;
const LEGEND = [
  ["quoted", "Quoted"],
  ["open", "Waiting"],
  ["closed", "Closed"],
] as const;

function Statistic({ counts, items, loading }: { counts: Record<"all" | "open" | "quoted" | "closed", number> | undefined; items: BuyerRfq[]; loading: boolean }) {
  const total = counts?.all ?? 0;
  const parts = LEGEND.map(([key]) => ({ key, value: counts?.[key] ?? 0 }));
  return (
    <section
      aria-labelledby="dash-stat"
      className="flex flex-col rounded-[30px] bg-white px-6 pt-6 pb-4 lg:rounded-[48px] lg:px-[42px] lg:pt-[44px] lg:pb-[30px]"
    >
      <div className="flex items-center gap-2 lg:gap-[12px]">
        <h2 id="dash-stat" className="text-[18px] leading-tight font-semibold tracking-[-0.01em] lg:text-[26px]">
          Statistic
        </h2>
        <span title="All your quote requests by status." className={GREY}>
          <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="size-[17px] lg:size-[24px]">
            <circle cx="12" cy="12" r="9.2" />
            <path d="M12 11v5.2M12 7.6v.1" strokeLinecap="round" />
          </svg>
          <span className="sr-only">All your quote requests by status.</span>
        </span>
        <span
          className={cn(
            "ml-auto rounded-[10px] px-3 py-1.5 text-[12px] font-medium shadow-[inset_0_0_0_1.5px_#ececec] lg:rounded-[13px] lg:px-[14px] lg:py-[9px] lg:text-[16px]",
            GREY,
          )}
        >
          All time
        </span>
      </div>
      <Donut parts={parts} total={total} loading={loading} />
      <ul className="mt-5 flex flex-wrap justify-between gap-x-4 gap-y-2 lg:mt-[34px]">
        {LEGEND.map(([key, label]) => (
          <li key={key} className={cn("flex items-center gap-2 text-[12px] font-medium lg:gap-[13px] lg:text-[16px]", GREY)}>
            <span aria-hidden className="size-4 rounded-[5px] lg:size-[26px] lg:rounded-[7px]" style={{ background: RING[key] }} />
            {label}
          </li>
        ))}
      </ul>
      <SellersAsked items={items} />
    </section>
  );
}

/** Requests by status as a thick ring: round-capped arcs on a pale track, total in the middle. */
function Donut({ parts, total, loading }: { parts: { key: keyof typeof RING; value: number }[]; total: number; loading: boolean }) {
  const r = 78;
  const width = 36;
  const length = 2 * Math.PI * r;
  const shown = parts.filter((part) => part.value > 0);
  const round = shown.length > 1;
  const arcs: { key: keyof typeof RING; value: number; arc: number; start: number; mid: number }[] = [];
  for (const part of shown) {
    const share = part.value / total;
    const start = arcs.reduce((sum, done) => sum + (done.value / total) * length, 0);
    // Round caps reach half the stroke past each end: shorten so neighbours just touch.
    const arc = round ? Math.max(share * length - width, 0.01) : share * length;
    arcs.push({ ...part, arc, start: start + (round ? width / 2 : 0), mid: (start + (share * length) / 2) / length });
  }
  const quoted = arcs.find((arc) => arc.key === "quoted");
  return (
    <div className="relative mx-auto mt-5 aspect-square w-full max-w-[230px] lg:mt-[30px] lg:max-w-[274px]">
      <svg viewBox="0 0 200 200" className="size-full -rotate-90" role="img" aria-label={`${total} requests: ${parts.map((p) => `${p.value} ${p.key}`).join(", ")}`}>
        <circle cx="100" cy="100" r={r} fill="none" stroke="#f3f3f3" strokeWidth={width} />
        {/* Drawn last-first so the first arc's round cap sits on top, as in the reference. */}
        {[...arcs].reverse().map((arc) => (
          <circle
            key={arc.key}
            cx="100"
            cy="100"
            r={r}
            fill="none"
            stroke={RING[arc.key]}
            strokeWidth={width}
            strokeLinecap={round ? "round" : "butt"}
            strokeDasharray={`${arc.arc} ${length}`}
            strokeDashoffset={-arc.start}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-tight">
        <span className={cn("text-[14px] font-medium lg:text-[21px]", GREY)}>Total</span>
        <span className="text-[28px] font-semibold tracking-[-0.01em] tabular-nums lg:text-[38px]">{loading ? "–" : total}</span>
        <span className={cn("text-[12px] font-medium lg:text-[16px]", GREY)}>{total === 1 ? "request" : "requests"}</span>
      </div>
      {quoted ? <Callout at={quoted.mid}>{`${quoted.value} quoted`}</Callout> : null}
    </div>
  );
}

/** The dark label on the ring's outer edge, at a fraction of the way round (0 = top). */
function Callout({ at, children }: { at: number; children: ReactNode }) {
  const angle = at * 2 * Math.PI;
  const x = 50 + 52 * Math.sin(angle);
  const y = 50 - 40 * Math.cos(angle);
  return (
    <span
      className="absolute -translate-1/2 rounded-[8px] bg-ink px-2 py-1 text-[12px] font-semibold whitespace-nowrap text-white lg:rounded-[10px] lg:px-[12px] lg:py-[8px] lg:text-[17px]"
      style={{ left: `${Math.min(Math.max(x, 20), 92)}%`, top: `${y}%` }}
    >
      {children}
    </span>
  );
}

const ago = (iso: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days} ${days === 1 ? "day" : "days"} ago` : shortDate(iso);
};

/** The sellers of the newest requests (the reference's transactions list): who, where, how recently, how many. */
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
    <div className="mt-5 lg:mt-[34px]">
      <h3 className="sr-only">Sellers you asked</h3>
      <ul className="flex flex-col">
        {rows.map((seller) => (
          <li key={seller.id}>
            <Link
              href={`/sellers/${seller.id}`}
              className={cn("-mx-2 flex items-center gap-3.5 rounded-[18px] px-2 py-2 hover:bg-black/[0.03] lg:gap-[22px] lg:py-[11px]", focusRing)}
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-12 shrink-0 items-center justify-center rounded-[14px] text-[14px] font-bold text-white lg:size-[71px] lg:rounded-[19px] lg:text-[20px]",
                  seller.quoted ? "bg-sky-blue" : "bg-ink",
                )}
              >
                {initials(seller.name)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight lg:gap-[5px]">
                <span className="flex min-w-0 items-baseline gap-2 lg:gap-[12px]">
                  <span className="truncate text-[15px] font-semibold lg:text-[19px]">{seller.name}</span>
                  <span className="shrink-0 text-[10px] font-medium text-[#c9c9c9] lg:text-[13px]">{seller.city}</span>
                </span>
                <span className={cn("text-[12px] font-medium lg:text-[16px]", GREY)}>{ago(seller.last)}</span>
              </span>
              <span className="shrink-0 text-[16px] font-bold tabular-nums lg:text-[22px]">{seller.count} req.</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
