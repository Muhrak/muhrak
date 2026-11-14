"use client";

import { ArrowLeft, ArrowRight, ArrowUpDown } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { heroUnit, onCanvas } from "@/components/landing/sections";
import { cn } from "@/lib/utils";

/**
 * Pieces of Figma "Buyer – Manufacturers v2" (244:6812) and "Buyer –
 * Manufacturer Profile v2" (245:6812), renamed to Sellers. Both frames are
 * dark only; converted to light with the buyer palette of "Buyer – Landing
 * v2 (Light)" (developer decision, 14 Nov 2026): canvas instead of #090B14,
 * ink text, white cards, the same aurora and dome as the landing hero.
 */

export const focus = "outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Hero band: the landing's aurora + light dome at the same Figma positions
 * (aurora 2300×1000 at -430,-520; dome 1750×1200 at -155,70), clipped to
 * the frame's height.
 */
export function AuroraBand({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <section className={cn("relative overflow-hidden bg-canvas", className)} style={heroUnit}>
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <Image src="/landing/hero-aurora.svg" alt="" width={2480} height={1180} priority className="absolute max-w-none" style={onCanvas(-520, -610, 2480, 1180)} />
        <Image src="/landing/hero-dome.svg" alt="" width={1970} height={1420} priority className="absolute max-w-none" style={onCanvas(-265, -40, 1970, 1420)} />
      </div>
      {children}
    </section>
  );
}

/** Figma "Tabs bar": uppercase labels, small count, underline on the active one, sort icon at the end. */
export function CategoryTabs({
  tabs,
  active,
  onSelect,
  sort,
}: {
  tabs: { key: string; label: string; count: number }[];
  active: string;
  onSelect: (key: string) => void;
  sort?: { label: string; onToggle: () => void };
}) {
  return (
    <div className="flex items-center gap-4 border-b border-black/8 pb-[18px]">
      <nav aria-label="Categories" className="-mx-1 flex min-w-0 flex-1 gap-7 overflow-x-auto px-1">
        {tabs.map((tab) => {
          const on = tab.key === active;
          return (
            <button
              key={tab.key}
              type="button"
              aria-pressed={on}
              onClick={() => onSelect(tab.key)}
              className={cn("flex shrink-0 items-start gap-[3px] rounded-sm leading-[normal] whitespace-nowrap", focus)}
            >
              <span className="flex flex-col gap-1">
                <span className={cn("text-sm tracking-[0.04em] uppercase", on ? "text-ink" : "text-ink-tertiary hover:text-ink")}>{tab.label}</span>
                <span aria-hidden className={cn("h-px w-full", on ? "bg-ink" : "bg-transparent")} />
              </span>
              <span className={cn("text-[11px]", on ? "text-ink" : "text-ink-tertiary")}>{tab.count.toLocaleString("en-US")}</span>
            </button>
          );
        })}
      </nav>
      {sort ? (
        <button
          type="button"
          onClick={sort.onToggle}
          aria-label={sort.label}
          title={sort.label}
          className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-ink hover:bg-black/4", focus)}
        >
          <ArrowUpDown aria-hidden className="size-[18px]" strokeWidth={1.6} />
        </button>
      ) : null}
    </div>
  );
}

/** Figma card image: 1:1, 14 px radius, light gradient fill, hairline border (white-on-dark converted). */
export function CardImage({ src, children }: { src: string | null; children?: ReactNode }) {
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-[14px] border border-black/8 bg-linear-to-b from-white to-[#f1f1f5]">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- public product photo from storage, sized by CSS
        <img src={src} alt="" loading="lazy" className="absolute inset-[6%] size-[88%] object-contain" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-[13px] text-ink-placeholder">No photo yet</span>
      )}
      {children}
    </div>
  );
}

/** Figma "Pagination": a progress hairline, "Showing x–y of n", page pills, "Page p of q". */
export function Pagination({
  page,
  pageSize,
  total,
  noun,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  noun: string;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const numbers = pageNumbers(page, pages);
  return (
    <div className="flex flex-col items-center gap-[26px]">
      <div className="relative h-px w-full bg-black/10">
        <div className="absolute top-[-0.25px] left-0 h-[1.5px] bg-ink" style={{ width: `${Math.max(64 / 1320, page / pages) * 100}%` }} />
      </div>
      <div className="flex w-full flex-col items-center gap-4 sm:flex-row">
        <p className="flex-1 text-[13px] leading-[normal] text-ink-tertiary">
          Showing {from.toLocaleString("en-US")}–{to.toLocaleString("en-US")} of {total.toLocaleString("en-US")} {total === 1 ? noun.replace(/s$/, "") : noun}
        </p>
        {pages > 1 ? (
          <nav aria-label="Pages" className="flex items-center gap-1 rounded-full border border-black/9 bg-white/60 p-[5px] backdrop-blur-[10px]">
            <PageButton label="Previous page" disabled={page === 1} onClick={() => onPage(page - 1)} outline>
              <ArrowLeft aria-hidden className="size-4" />
            </PageButton>
            <span className="w-1.5" />
            {numbers.map((value, index) =>
              value === null ? (
                <span key={`gap-${index}`} className="flex size-[38px] items-center justify-center text-sm text-ink-tertiary">
                  …
                </span>
              ) : (
                <PageButton key={value} label={`Page ${value}`} current={value === page} onClick={() => onPage(value)}>
                  {value}
                </PageButton>
              ),
            )}
            <span className="w-1.5" />
            <PageButton label="Next page" disabled={page === pages} onClick={() => onPage(page + 1)} outline>
              <ArrowRight aria-hidden className="size-4" />
            </PageButton>
          </nav>
        ) : null}
        <p className="flex-1 text-right text-[13px] leading-[normal] text-ink-tertiary">
          Page {page} of {pages}
        </p>
      </div>
    </div>
  );
}

function PageButton({
  children,
  label,
  current,
  disabled,
  outline,
  onClick,
}: {
  children: ReactNode;
  label: string;
  current?: boolean;
  disabled?: boolean;
  outline?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={current ? "page" : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-[38px] items-center justify-center rounded-full text-sm leading-[normal]",
        current ? "bg-ink font-medium text-white" : "text-ink-secondary hover:bg-black/5",
        outline && "border border-black/20 disabled:opacity-35 disabled:hover:bg-transparent",
        focus,
      )}
    >
      {children}
    </button>
  );
}

/** 1 2 3 4 … last, as in Figma; around the current page in the middle. */
function pageNumbers(page: number, pages: number): (number | null)[] {
  if (pages <= 6) return Array.from({ length: pages }, (_, i) => i + 1);
  if (page <= 3) return [1, 2, 3, 4, null, pages];
  if (page >= pages - 2) return [1, null, pages - 3, pages - 2, pages - 1, pages];
  return [1, null, page - 1, page, page + 1, null, pages];
}

/** Initials for a seller without a logo. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? words[0]?.[1] ?? "")).toUpperCase() || "M";
}
