import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { BUYER_FAQ } from "./faq-accordion";
import { MobileGlow } from "./mobile-glow";
import { AiFeature, Benefits, Cta, Faq, Footer, heroUnit, onCanvas, SiteNav, StatsStrip } from "./sections";

/**
 * Buyer landing page: Figma "Buyer – Landing v2 (Light)" (node 423:1138),
 * in the blue palette (refs/new ref blue.jpg). Layout pieces are shared with
 * the seller landing (sections.tsx).
 */

const FIND_A_PART = "/buyer/find-part";

export function LandingPage() {
  return (
    <div className="relative flex flex-1 flex-col bg-canvas font-sans text-ink">
      <Hero />
      <StatsStrip
        stats={[
          { label: "COVERAGE", value: "6 GCC countries" },
          { label: "MANUFACTURERS", value: "2,481+ verified" },
          { label: "PHOTO SEARCH", value: "Muhrak AI" },
          { label: "FIRST QUOTE", value: "Under 2 hours" },
        ]}
      />
      <Benefits
        id="how-it-works"
        chip={{ icon: <Image src="/landing/link.svg" alt="" width={14} height={14} />, label: "How Muhrak works" }}
        intro="Find the right part from the right seller at the right price, without calling around."
        cards={[
          { title: "Snap a photo", text: "Not sure what it’s called? Muhrak AI identifies the part from a single photo." },
          { title: "Verified sellers", text: "Every manufacturer and distributor is checked before they can quote." },
          { title: "Compare quotes", text: "See prices and delivery times side by side, then choose the best." },
          { title: "Across the GCC", text: "Sellers in six countries, so the part you need is never far away." },
        ]}
        glass={{
          0: { src: "/landing/glass-piston.png", x: -70, y: 220, size: 250 },
          2: { src: "/landing/glass-gear.png", x: 30, y: 290, size: 240 },
          3: { src: "/landing/glass-bearing.png", x: 140, y: 120, size: 230 },
        }}
        aurora="/landing/benefits-aurora.svg"
        dome="/landing/benefits-dome.svg"
        cardEdge="border-glass-edge"
      />
      <AiFeature
        side="buyer"
        card={{ label: "Quotes received", value: "38.500 OMR", note: "Best price from 5 sellers", button: "Compare" }}
        glow="/landing/ai-glow.svg"
        cardEdge="border-glass-edge"
        heading={["Snap a part,", "get quotes in hours."]}
        text="Upload one photo. Muhrak AI identifies the part and sends your request to sellers who stock it."
        cta={{ href: FIND_A_PART, label: "Try Muhrak AI" }}
      />
      <Faq items={BUYER_FAQ} contact="Have another question? Contact our team." />
      <Cta
        heading={["Your next part is", "one photo away."]}
        text="Verified sellers, real prices and quotes in hours, not days."
        button={{ href: FIND_A_PART, label: "Find a part" }}
        aurora="/landing/cta-aurora.svg"
        cardEdge="border-glass-edge"
      />
      <Footer side="buyer" />
    </div>
  );
}

// ---------------------------------------------------------------- hero (423:1139)

function Hero() {
  return (
    // Phones and tablets: a full-screen hero in the style of the developer reference
    // (refs/mobile view ref.jpg). Desktop (lg+): the Figma frame, 720 px high.
    <section className="relative flex h-[100svh] min-h-[620px] flex-col bg-canvas lg:block lg:h-[720px] lg:min-h-0" style={heroUnit}>
      <MobileGlow edge="top" className="h-[44%]" />
      <MobileGlow edge="bottom" className="h-[30%]" />
      {/* Desktop decoration layer, clipped, so the mobile menu can open past the hero. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 hidden overflow-hidden lg:block">
        {/* Aurora 2300×1000 at (-430,-520); the SVG adds a 90 px blur margin on each side. */}
        <Image src="/landing/hero-aurora.svg" alt="" width={2480} height={1180} priority className="absolute max-w-none" style={onCanvas(-520, -610, 2480, 1180)} />
        {/* Light dome 1750×1200 at (-155,70) with a 110 px blur margin. */}
        <Image src="/landing/hero-dome.svg" alt="" width={1970} height={1420} priority className="absolute max-w-none" style={onCanvas(-265, -40, 1970, 1420)} />
      </div>

      <SiteNav side="buyer" />

      {/* Figma: copy starts 190 px from the section top; the 84 px nav is above it in the flow. */}
      <div className="relative flex flex-1 flex-col items-center justify-center px-4 pb-[10svh] text-center lg:flex-none lg:justify-start lg:pt-[106px] lg:pb-0">
        <p className="text-[13px] leading-[1.3] tracking-[0.06em] text-[rgba(74,77,89,0.9)]">AI-POWERED SPARE PARTS MARKETPLACE</p>
        <h1 className="mt-10 bg-linear-to-b from-ink via-[#292b36] via-55% to-[#737585] bg-clip-text pb-2 text-[64px] leading-[0.84] font-medium tracking-[-0.05em] text-transparent sm:text-[96px] lg:text-[150px]">
          <span className="block">Find Any</span>
          <span className="block">Spare Part</span>
        </h1>
        <GlowButton href={FIND_A_PART} className="mt-10">
          Find a part
        </GlowButton>
      </div>
    </section>
  );
}

/**
 * Hero "Find a part" with a rotating aurora-coloured border and glow (see
 * .glow-* in globals.css). Same size as the Figma outline pill: 1px ring
 * + 26×13 px padding, like its 1px border.
 */
function GlowButton({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={cn("glow-button relative inline-flex rounded-full p-px outline-none focus-visible:ring-3 focus-visible:ring-ring/50", className)}
    >
      <span aria-hidden className="glow-halo" />
      <span aria-hidden className="glow-ring" />
      <span className="relative rounded-full bg-canvas px-[26px] py-[13px] text-sm leading-[1.3] text-ink transition-colors">{children}</span>
    </Link>
  );
}
