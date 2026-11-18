"use client";

import { ArrowUp, BadgeCheck, Search } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { SoftGlow } from "@/components/landing/soft-glow";
import { cn } from "@/lib/utils";
import { initials } from "./parts";

/**
 * Building blocks of the buyer-side Sellers pages in the Muhrak AI style
 * (developer request, 18 Nov 2026): white page, the soft blue glow, Manrope
 * text, a serif heading (Gloock), grey chips, white rounded cards and the
 * AI page's search pill. Buyer blues only.
 */

export const softFocus = "outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** Hero area: the soft glow rising from the bottom, content centred above it. */
export function SoftHero({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("relative isolate", className)}>
      {/* Fades into white at the bottom, so the next section starts without a hard line. */}
      <SoftGlow fill fadeBottom strength={1.2} className="-z-10" />
      {children}
    </section>
  );
}

/** A filter chip, like the Muhrak AI suggestion chips; dark when selected. */
export function Chip({
  active = false,
  count,
  onClick,
  children,
}: {
  active?: boolean;
  count?: number;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-[15px] leading-none whitespace-nowrap transition-colors",
        active ? "bg-ink text-white" : "bg-black/[0.055] text-ink-secondary hover:bg-black/[0.09]",
        softFocus,
      )}
    >
      {children}
      {count !== undefined ? <span className={cn("text-[12px]", active ? "text-white/70" : "text-ink-tertiary")}>{count.toLocaleString("en-US")}</span> : null}
    </button>
  );
}

/** The Muhrak AI search pill: white, rounded, a dark round submit button once there is text. */
export function SearchPill({
  id,
  label,
  placeholder,
  initial,
  maxLength,
  onSearch,
}: {
  id: string;
  label: string;
  placeholder: string;
  initial: string;
  maxLength: number;
  onSearch: (text: string) => void;
}) {
  const [draft, setDraft] = useState(initial);
  function submit(event: FormEvent) {
    event.preventDefault();
    onSearch(draft.trim());
  }
  return (
    <form
      role="search"
      onSubmit={submit}
      className="flex h-16 w-full items-center rounded-full bg-white pr-2 pl-6 shadow-[0_10px_30px_-12px_rgba(10,11,18,0.18),inset_0_0_0_1px_rgba(10,11,18,0.06)] focus-within:ring-3 focus-within:ring-ring/40 sm:h-[68px] sm:pl-7"
    >
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="search"
        value={draft}
        maxLength={maxLength}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={placeholder}
        className="h-full min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-[#8b8d96] sm:text-[17px]"
      />
      {draft.trim() ? (
        <button type="submit" aria-label="Search" className={cn("flex size-11 shrink-0 items-center justify-center rounded-full bg-ink text-white hover:opacity-90 sm:size-12", softFocus)}>
          <ArrowUp aria-hidden className="size-5" />
        </button>
      ) : (
        <button type="submit" aria-label="Search" className={cn("mr-2 flex size-9 shrink-0 items-center justify-center rounded-full text-ink-placeholder hover:text-ink", softFocus)}>
          <Search aria-hidden className="size-5" />
        </button>
      )}
    </form>
  );
}

/** White rounded card with a hairline and a soft shadow (Muhrak AI result card). */
export const softCard =
  "rounded-[28px] bg-white shadow-[0_14px_40px_-24px_rgba(10,11,18,0.28),inset_0_0_0_1px_rgba(10,11,18,0.06)]";

/** The seller's logo on a pale tile, or their initials in the serif. */
export function LogoTile({ name, logoUrl, className, initialsClass }: { name: string; logoUrl: string | null; className?: string; initialsClass?: string }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden bg-[#f3f6fa]", className)}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- public logo from storage, sized by CSS
        <img src={logoUrl} alt={`${name} logo`} className="size-full object-contain" />
      ) : (
        <span className={cn("font-ai-serif text-ink-secondary", initialsClass)}>{initials(name)}</span>
      )}
    </span>
  );
}

export function VerifiedMark({ className }: { className?: string }) {
  return <BadgeCheck aria-label="Verified by Muhrak" className={cn("shrink-0 fill-sky-blue text-white", className)} />;
}
