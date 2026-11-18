import { cn } from "@/lib/utils";

/**
 * The soft glow of Muhrak AI (developer reference refs/muhrak ai, 18 Nov
 * 2026), used on the buyer landing instead of the aurora arcs (developer
 * request, 18 Nov 2026): pale blue light rising from the lower edges and the
 * middle, fading into white at the top. Buyer blues only. Fills its
 * positioned parent; `strength` scales the colour (glass parts need more);
 * `fill` adds an even band along the bottom (no white gap in the middle).
 */
export function SoftGlow({
  className,
  strength = 1,
  fill = false,
  fadeBottom = false,
}: {
  className?: string;
  strength?: number;
  fill?: boolean;
  /** Fade into white at the bottom too, so the next section starts on white without a hard line. */
  fadeBottom?: boolean;
}) {
  const a = (alpha: number) => Math.min(1, alpha * strength).toFixed(3);
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div
        className="absolute inset-0"
        style={{
          background: [
            `radial-gradient(45% 60% at 6% 96%, rgba(132,201,232,${a(0.38)}), transparent 70%)`,
            `radial-gradient(45% 60% at 94% 92%, rgba(87,127,186,${a(0.3)}), transparent 70%)`,
            `radial-gradient(60% 50% at 50% 108%, rgba(99,182,226,${a(0.34)}), transparent 75%)`,
            // `fill`: an even band along the whole bottom, so no white gap is left between the corners.
            ...(fill ? [`linear-gradient(to top, rgba(132,201,232,${a(0.3)}), rgba(132,201,232,0) 48%)`] : []),
          ].join(","),
        }}
      />
      {/* White at the top, as in the reference. */}
      <div className="absolute inset-x-0 top-0 h-[42%] bg-linear-to-b from-white to-transparent" />
      {fadeBottom ? <div className="absolute inset-x-0 bottom-0 h-[14%] bg-linear-to-t from-white to-transparent" /> : null}
    </div>
  );
}
