import { GCC_COUNTRY_NAMES, type DocumentStatus, type DocumentType, type GccCountry, type VerificationStatus } from "@muhrak/schemas";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const focusRing = "outline-none focus-visible:ring-3 focus-visible:ring-brand-blue/40";

/** Light version of the Figma status pills: the tint, dark text and a coloured dot (green text on white is unreadable). */
const TONES = {
  success: { bg: "bg-success/16", dot: "bg-success" },
  warning: { bg: "bg-admin-orange/12", dot: "bg-admin-orange" },
  danger: { bg: "bg-destructive/12", dot: "bg-destructive" },
  neutral: { bg: "bg-surface", dot: "bg-text-subtle" },
} as const;
export type Tone = keyof typeof TONES;

export function StatusChip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={cn("flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs leading-[normal] font-medium whitespace-nowrap text-text-strong", TONES[tone].bg)}>
      <span aria-hidden className={cn("size-1.5 rounded-full", TONES[tone].dot)} />
      {children}
    </span>
  );
}

export const VERIFICATION: Record<VerificationStatus, { label: string; tone: Tone }> = {
  draft: { label: "Not submitted", tone: "neutral" },
  pending: { label: "In review", tone: "warning" },
  approved: { label: "Verified", tone: "success" },
  rejected: { label: "Changes needed", tone: "danger" },
};

export const DOCUMENT_STATUS: Record<DocumentStatus, { label: string; tone: Tone }> = {
  pending: { label: "Not reviewed", tone: "neutral" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
};

/** Short names for the queue's "documents" column, as in Figma ("CR, VAT, bank proof"). */
export const DOC_SHORT: Record<DocumentType, string> = {
  commercial_registration: "CR",
  vat_certificate: "VAT",
  owner_id: "ID",
  bank_proof: "bank proof",
};

export function place(country: GccCountry, city: string) {
  return [city, GCC_COUNTRY_NAMES[country]].filter(Boolean).join(", ");
}

export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? words[0]?.[1] ?? "")).toUpperCase() || "S";
}

/** Initials circle. Grey on white panels; pass `onSurface` when it sits on the grey page. */
export function Avatar({ name, size = 38, onSurface = false }: { name: string; size?: 34 | 38; onSurface?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn("flex shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-text-strong", size === 38 ? "size-[38px]" : "size-[34px]", onSurface ? "bg-panel" : "bg-surface")}
    >
      {initials(name)}
    </span>
  );
}

/** "5 h", "2 days" since a date. */
export function waitingFor(iso: string | null, now = Date.now()): string {
  if (!iso) return "";
  const hours = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 3_600_000));
  if (hours < 1) return "under an hour";
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function Panel({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <section aria-label={label} className={cn("flex flex-col rounded-[24px] bg-panel px-5 py-6 sm:px-[26px]", className)}>
      {children}
    </section>
  );
}
