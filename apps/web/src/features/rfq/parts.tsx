import { RFQ_NEEDED_BY_LABELS, UNIT_LABELS, type RfqStatus, type ProductUnit, type RfqNeededBy } from "@/schemas";
import { cn } from "@/lib/utils";

/** Pieces shared by the buyer "Inquiries & RFQs" and the seller "RFQ Inbox" pages. */

export function quantityLabel(quantity: number, unit: ProductUnit): string {
  const words = UNIT_LABELS[unit];
  return `${quantity.toLocaleString("en-US")} ${quantity === 1 ? words.one : words.many}`;
}

export function neededByLabel(value: RfqNeededBy): string {
  return RFQ_NEEDED_BY_LABELS[value];
}

/** "2m", "5h", "Yesterday", "3 days", "12 Nov": short ages for list rows (Figma). */
export function shortAge(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** "Sent 2 h ago" style line for detail headers. */
export function sentAgo(iso: string, now = Date.now()): string {
  const age = shortAge(iso, now);
  if (age === "now") return "just now";
  if (/^\d+m$/.test(age)) return `${age.slice(0, -1)} min ago`;
  if (/^\d+h$/.test(age)) return `${age.slice(0, -1)} h ago`;
  if (age === "Yesterday") return "yesterday";
  if (/days$/.test(age)) return `${age} ago`;
  return `on ${age}`;
}

/** Days (rounded up) until the request closes by itself. */
export function closesIn(expiresAt: string, now = Date.now()): string {
  const days = Math.ceil((new Date(expiresAt).getTime() - now) / 86_400_000);
  return days <= 1 ? "Closes within a day" : `Closes in ${days} days`;
}

type Tone = "new" | "neutral" | "done" | "closed";

const TONES: Record<Tone, string> = {
  new: "bg-success/16 text-text-strong",
  neutral: "bg-black/6 text-text-strong",
  // The side's colour: orange in the Seller Centre ("Replied", as in Figma), navy for buyers.
  done: "bg-side-accent text-white",
  closed: "bg-black/6 text-text-muted",
};

/** Small status pill, as in Figma ("Waiting", "Replied", "Closed"). */
export function RfqChip({ tone, children }: { tone: Tone; children: string }) {
  return <span className={cn("shrink-0 rounded-full px-2 py-[3px] text-[11px] leading-[normal] font-medium whitespace-nowrap", TONES[tone])}>{children}</span>;
}

/** Status for the buyer (the person waiting for a price). */
export function buyerStatus(status: RfqStatus): { label: string; tone: Tone } {
  switch (status) {
    case "open":
      return { label: "Waiting", tone: "neutral" };
    case "quoted":
      return { label: "Quoted", tone: "done" };
    case "declined":
      return { label: "Declined", tone: "closed" };
    case "cancelled":
      return { label: "Cancelled", tone: "closed" };
    case "expired":
      return { label: "Expired", tone: "closed" };
  }
}

/** Status for the seller (the person who should reply). */
export function sellerStatus(status: RfqStatus): { label: string; tone: Tone } {
  switch (status) {
    case "open":
      return { label: "New request", tone: "new" };
    case "quoted":
      return { label: "Replied", tone: "done" };
    case "declined":
      return { label: "Declined", tone: "closed" };
    case "cancelled":
      return { label: "Cancelled by buyer", tone: "closed" };
    case "expired":
      return { label: "Expired", tone: "closed" };
  }
}

/** The buyer's own photo on a request (Muhrak AI): a short-lived link; opens full size in a new tab. */
/** The buyer's photos on a request (up to 4, short-lived links); each opens full size in a new tab. */
export function BuyerPhotos({ urls, label }: { urls: string[]; label: string }) {
  if (urls.length === 0) return null;
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-sm font-medium text-text-strong">{label}</p>
      <ul className="flex flex-wrap gap-2.5">
        {urls.map((url, index) => (
          <li key={url}>
            <a
              href={url}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={`Open photo ${index + 1} of ${urls.length}`}
              className="block overflow-hidden rounded-[16px] border border-line outline-none focus-visible:ring-3 focus-visible:ring-brand-blue/40"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed link to a private photo */}
              <img
                src={url}
                alt={`${label}, ${index + 1} of ${urls.length}`}
                referrerPolicy="no-referrer"
                className={urls.length === 1 ? "h-[180px] w-auto max-w-full object-cover" : "size-[132px] object-cover"}
              />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Figma detail tiles: Quantity · Condition · Needed by (here: Quantity · Needed by · Deliver to). */
export function DetailTiles({ tiles }: { tiles: { label: string; value: string }[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {tiles.map((tile) => (
        <div key={tile.label} className="flex min-w-0 flex-col gap-1.5 rounded-[14px] bg-surface px-4 py-3 leading-[normal]">
          <p className="text-[13px] text-text-subtle">{tile.label}</p>
          <p className="truncate text-base font-medium text-text-strong" title={tile.value}>
            {tile.value}
          </p>
        </div>
      ))}
    </div>
  );
}

/** Product photo thumbnail (or an empty tile). */
export function Thumb({ src, size }: { src: string | null; size: "sm" | "lg" }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden bg-[#ededf0]", size === "lg" ? "size-[92px] rounded-[14px]" : "size-11 rounded-[10px]")}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- public product photo thumbnail, fixed size
        <img src={src} alt="" className="size-full object-contain" />
      ) : null}
    </span>
  );
}
