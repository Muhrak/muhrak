import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/** Single-colour icons exported from Figma into /public/portal. */
export type IconName =
  | "alert-circle"
  | "arrow-right"
  | "bar-chart"
  | "bell"
  | "box"
  | "building"
  | "check-circle"
  | "check-circle-done"
  | "chevron-down"
  | "clock"
  | "cog"
  | "credit-card"
  | "empty-box"
  | "empty-message"
  | "file"
  | "folder"
  | "globe"
  | "grid"
  | "help-circle"
  | "image"
  | "layers"
  | "list"
  | "log-out"
  | "mail"
  | "message"
  | "muhrak-ai"
  | "plus"
  | "refresh"
  | "search"
  | "shield"
  | "tag"
  | "truck"
  | "upload"
  | "users"
  | "wrench";

/**
 * Draws the Figma SVG as a mask filled with the current text colour, so one
 * file serves every state (grey in the menu, white when active) without
 * editing the exported asset. Size it with `size-*` in `className`.
 */
export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("icon-mask inline-block shrink-0", className)}
      style={{ "--icon": `url(/portal/${name}.svg)` } as CSSProperties}
    />
  );
}
