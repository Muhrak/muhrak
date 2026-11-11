import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * Mobile-only background, from the developer's reference (refs/mobile view
 * ref.jpg): soft gradient bands at the top and bottom of the screen with a
 * curved light edge (no grain texture, developer decision). Colours: ONLY those visible on the
 * desktop landing page: pink #E0457F, purple #7B2FD3, indigo #2D2F9A. No peach/orange, no cyan.
 * Hidden from `lg` up, where the Figma desktop design is used unchanged.
 */

type Blob = { x: string; y: string; w: string; h: string; color: string; opacity?: number };

const blob = (b: Blob): CSSProperties => ({
  left: b.x,
  top: b.y,
  width: b.w,
  height: b.h,
  opacity: b.opacity ?? 1,
  background: `radial-gradient(closest-side, ${b.color}, transparent)`,
});

/** Top band: pink on the left, purple in the middle, indigo fading out to the right. */
const TOP: Blob[] = [
  { x: "-35%", y: "-55%", w: "105%", h: "130%", color: "#e0457f", opacity: 1 },
  { x: "-30%", y: "-20%", w: "70%", h: "85%", color: "#e0457f", opacity: 0.8 },
  { x: "18%", y: "-65%", w: "95%", h: "120%", color: "#7b2fd3", opacity: 0.9 },
  { x: "55%", y: "-75%", w: "85%", h: "110%", color: "#2d2f9a", opacity: 0.6 },
];

/** Bottom band: the mirror image, pink on the left rising into purple on the right. */
const BOTTOM: Blob[] = [
  { x: "-35%", y: "35%", w: "100%", h: "120%", color: "#e0457f", opacity: 1 },
  { x: "-15%", y: "55%", w: "70%", h: "80%", color: "#e0457f", opacity: 0.8 },
  { x: "35%", y: "30%", w: "95%", h: "130%", color: "#7b2fd3", opacity: 0.85 },
  { x: "70%", y: "45%", w: "70%", h: "100%", color: "#2d2f9a", opacity: 0.55 },
];

/**
 * A gradient band with a curved light edge (a large blurred canvas-coloured
 * ellipse, tilted so the edge sweeps up towards one side as in the reference).
 */
export function MobileGlow({ edge, className, strength = 1 }: { edge: "top" | "bottom"; className?: string; strength?: number }) {
  const blobs = edge === "top" ? TOP : BOTTOM;
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-x-0 overflow-hidden lg:hidden", edge === "top" ? "top-0" : "bottom-0", className)}
      style={{ opacity: strength }}
    >
      <div className="absolute inset-0 blur-[22px]">
        {blobs.map((b) => (
          <span key={`${b.x}${b.y}`} className="absolute" style={blob(b)} />
        ))}
      </div>
      {/* The curved light sweep that shapes the band's inner edge. */}
      <span
        className="absolute rounded-[50%] bg-canvas blur-[30px]"
        style={
          edge === "top"
            ? { left: "-2%", top: "52%", width: "160%", height: "130%", transform: "rotate(-24deg)" }
            : { left: "-45%", bottom: "58%", width: "160%", height: "130%", transform: "rotate(-16deg)" }
        }
      />
    </div>
  );
}
