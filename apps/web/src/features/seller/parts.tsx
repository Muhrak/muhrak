import type { DocumentStatus, VerificationStatus } from "@muhrak/schemas";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Pieces of the Seller Centre "Company profile" and "Verification" frames,
 * converted from the dark Figma frames to the light Seller Centre palette.
 */

export const focusRing = "outline-none focus-visible:ring-3 focus-visible:ring-brand-blue/40";

/** Figma "Seller Input" field (52 px, 12 px radius), light. */
export const inputClass = cn(
  "h-[52px] w-full min-w-0 rounded-[12px] border border-line bg-panel px-4 text-base leading-[normal] text-text-strong",
  "placeholder:text-text-subtle disabled:cursor-not-allowed disabled:bg-surface disabled:text-text-muted [&[readonly]]:bg-surface [&[readonly]]:text-text-muted",
  "aria-invalid:border-destructive",
  focusRing,
);

export function FieldBlock({
  id,
  label,
  optional,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <label htmlFor={id} className="flex items-center gap-1.5 leading-[normal]">
        <span className="text-sm font-medium text-text-strong">{label}</span>
        {optional ? <span className="text-[13px] text-text-subtle">Optional</span> : null}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-[13px] leading-[normal] text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[13px] leading-[normal] text-text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function describedBy(id: string, error?: string, hint?: string) {
  return error ? `${id}-error` : hint ? `${id}-hint` : undefined;
}

/**
 * Status chip ("Approved", "Required"…). Light version: the tint from the
 * Figma frame with dark text and a coloured dot, so the label stays
 * readable on white (green text on white is too faint).
 */
const TONES = {
  success: { bg: "bg-success/16", dot: "bg-success" },
  warning: { bg: "bg-seller-orange/12", dot: "bg-seller-orange" },
  danger: { bg: "bg-destructive/12", dot: "bg-destructive" },
  neutral: { bg: "bg-surface", dot: "bg-text-subtle" },
} as const;

export type Tone = keyof typeof TONES;

export function StatusChip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full px-[9px] py-[3px] text-xs leading-[normal] font-medium whitespace-nowrap text-text-strong",
        TONES[tone].bg,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", TONES[tone].dot)} />
      {children}
    </span>
  );
}

export const DOCUMENT_STATUS: Record<DocumentStatus, { label: string; tone: Tone }> = {
  pending: { label: "In review", tone: "neutral" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
};

export const VERIFICATION_STATUS: Record<VerificationStatus, { label: string; tone: Tone }> = {
  draft: { label: "Not submitted", tone: "neutral" },
  pending: { label: "In review", tone: "warning" },
  approved: { label: "Verified", tone: "success" },
  rejected: { label: "Changes needed", tone: "danger" },
};

/** Up to two initials for the logo placeholder, e.g. "Najd Equipment" → "NE". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0]![0]}${words[1]![0]}` : (words[0] ?? "").slice(0, 2)).toUpperCase() || "M";
}
