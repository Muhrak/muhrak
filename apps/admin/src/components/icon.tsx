import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/** Single-colour Figma icons in /public/icons, drawn in the current text colour. */
export type IconName =
  | "alert-circle"
  | "arrow-right"
  | "bell"
  | "box"
  | "building"
  | "check-circle"
  | "clock"
  | "cog"
  | "credit-card"
  | "file"
  | "globe"
  | "grid"
  | "image"
  | "list"
  | "log-out"
  | "muhrak-ai"
  | "refresh"
  | "search"
  | "shield"
  | "truck"
  | "users"
  | "wrench";

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("icon-mask inline-block shrink-0", className)}
      style={{ "--icon": `url(/icons/${name}.svg)` } as CSSProperties}
    />
  );
}
