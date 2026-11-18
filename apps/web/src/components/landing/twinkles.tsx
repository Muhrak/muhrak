"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Twinkling sparkles (developer request, 18 Nov 2026): copies of the
 * section's sparkle star appear two to four at a time at random spots, fade
 * in and out, and new ones keep coming. Kept off the middle column where the
 * heading and text sit. Nothing for visitors who ask for reduced motion.
 * Decorative only (aria-hidden), and drawn in the browser only.
 */

type Star = { id: number; left: number; top: number; size: number; delay: number; born: number };

const LIFE_MS = 2600;
const EVERY_MS = 1800;

function randomSpot(narrow: boolean): { left: number; top: number } {
  const roll = Math.random();
  // Phones: the text spans the width, so only above the heading or at the very edges.
  if (narrow) {
    if (roll < 0.6) return { left: 6 + Math.random() * 88, top: 2 + Math.random() * 14 };
    return { left: roll < 0.8 ? 1 + Math.random() * 5 : 92 + Math.random() * 5, top: 20 + Math.random() * 70 };
  }
  // Wider screens: left or right band most of the time; now and then the gap under the text.
  if (roll < 0.42) return { left: 4 + Math.random() * 24, top: 6 + Math.random() * 86 };
  if (roll < 0.84) return { left: 72 + Math.random() * 24, top: 6 + Math.random() * 86 };
  return { left: 30 + Math.random() * 40, top: 82 + Math.random() * 14 };
}

export function Twinkles({ className }: { className?: string }) {
  const [stars, setStars] = useState<Star[]>([]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let next = 0;
    const spawn = () => {
      const count = 2 + Math.floor(Math.random() * 3);
      const born = Date.now();
      setStars((current) => [
        // Each star lives LIFE_MS plus its delay; drop the ones that are done.
        ...current.filter((star) => born - star.born < LIFE_MS + 800),
        ...Array.from({ length: count }, () => ({
          id: ++next,
          ...randomSpot(window.innerWidth < 640),
          size: 10 + Math.random() * 10,
          delay: Math.random() * 700,
          born,
        })),
      ]);
    };
    const first = window.setTimeout(spawn, 400);
    const timer = window.setInterval(spawn, EVERY_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div aria-hidden className={cn("pointer-events-none absolute", className)}>
      {stars.map((star) => (
        <span
          key={star.id}
          className="twinkle absolute block bg-[url(/landing/sparkle.svg)] bg-contain bg-center bg-no-repeat"
          style={{
            left: `${star.left}%`,
            top: `${star.top}%`,
            width: star.size,
            height: star.size,
            animationDuration: `${LIFE_MS}ms`,
            animationDelay: `${star.delay}ms`,
          }}
        />
      ))}
    </div>
  );
}
