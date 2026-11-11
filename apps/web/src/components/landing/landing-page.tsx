import Image from "next/image";
import Link from "next/link";
import { Suspense, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { FaqAccordion } from "./faq-accordion";
import { MobileGlow } from "./mobile-glow";
import { NavActions, SignedOutActions } from "./nav-actions";
import { NAV_LINKS } from "./nav-links";

/**
 * Buyer landing page: Figma "Buyer – Landing v2 (Light)" (node 423:1138).
 *
 * At 1440 px wide every element sits at its Figma position and size.
 * Decorations (auroras) are placed on a 1440 px canvas centred in the
 * viewport with `onCanvas(x, y, w, h)`, measured in `--u` design pixels:
 * 1px on desktop, smaller on phones so the whole colour range stays in view.
 * Glass parts are anchored to their cards, so they appear on every screen.
 */

/**
 * Absolute position on the centred 1440 px design canvas (x, y in Figma pixels).
 * Horizontal values scale by --ux and vertical ones by --uy (both 1px on desktop).
 */
function onCanvas(x: number, y: number, w: number, h: number): CSSProperties {
  const ux = (n: number) => `calc(${n} * var(--ux, 1px))`;
  const uy = (n: number) => `calc(${n} * var(--uy, 1px))`;
  return { left: `calc(50% + ${x - 720} * var(--ux, 1px))`, top: uy(y), width: ux(w), height: uy(h) };
}

/**
 * Hero design-pixel units. Desktop (1440 px+): 1px both ways, exact Figma
 * positions. Narrower screens: the width follows the screen, so the whole
 * aurora (pink left, blue right) stays in view, while the height shrinks
 * less, so on a tall phone the colour reaches as far down the hero as on
 * desktop instead of becoming a thin strip.
 */
const heroUnit = {
  "--ux": "min(1px, calc(100vw / 1440))",
  "--uy": "max(0.72px, min(1px, calc(100vw / 1440)))",
} as CSSProperties;

const FIND_A_PART = "/buyer/find-part";

const outlinePill =
  "inline-flex items-center rounded-full border border-black/22 px-[26px] py-[13px] text-sm leading-[1.3] text-ink outline-none transition-colors hover:bg-black/4 focus-visible:ring-3 focus-visible:ring-ring/50";
const solidPill =
  "inline-flex items-center rounded-full bg-ink px-[26px] py-[13px] text-sm leading-[1.3] font-medium text-white outline-none transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50";

export function LandingPage() {
  return (
    <div className="relative flex flex-1 flex-col bg-canvas font-sans text-ink">
      <Hero />
      <StatsStrip />
      <Benefits />
      <MuhrakAiFeature />
      <Faq />
      <Cta />
      <Footer />
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

      <SiteNav />

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

function SiteNav() {
  return (
    <header className="relative z-20 flex items-center px-4 py-5 sm:px-12">
      <Link href="/" aria-label="Muhrak home" className="flex rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <Image src="/auth/muhrak-logo.svg" alt="Muhrak" width={156.357} height={29.8588} priority />
      </Link>
      <div className="flex-1" />
      <nav aria-label="Main" className="hidden gap-10 text-sm leading-[1.3] text-[rgba(10,11,18,0.78)] lg:flex">
        {NAV_LINKS.map((link) =>
          link.href ? (
            <a key={link.label} href={link.href} className="hover:text-ink">
              {link.label}
            </a>
          ) : (
            <span key={link.label}>{link.label}</span>
          ),
        )}
      </nav>
      <div className="hidden flex-1 lg:block" />
      <Suspense fallback={<SignedOutActions />}>
        <NavActions />
      </Suspense>
    </header>
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

// ---------------------------------------------------------------- stats strip (423:1174)

const STATS = [
  { label: "COVERAGE", value: "6 GCC countries" },
  { label: "MANUFACTURERS", value: "2,481+ verified" },
  { label: "PHOTO SEARCH", value: "Muhrak AI" },
  { label: "FIRST QUOTE", value: "Under 2 hours" },
];

function StatsStrip() {
  return (
    // Mobile: semi-transparent so the colour glow carries through; desktop: solid white as in Figma.
    <section aria-label="Muhrak in numbers" className="relative grid grid-cols-2 bg-white/60 lg:grid-cols-4 lg:bg-white">
      {STATS.map((stat, index) => (
        <div
          key={stat.label}
          className={cn(
            "flex flex-col gap-2 px-6 py-[30px] leading-[1.3] lg:px-[90px]",
            index % 2 === 1 && "border-l border-black/8",
            index >= 2 && "border-t border-black/8 lg:border-t-0",
            index === 2 && "lg:border-l",
          )}
        >
          <p className="text-[11px] tracking-[0.06em] text-ink-tertiary">{stat.label}</p>
          <p className="text-[15px] text-ink">{stat.value}</p>
        </div>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------- what's in it for you (423:1187)

const BENEFITS = [
  { title: "Snap a photo", text: "Not sure what it’s called? Muhrak AI identifies the part from a single photo." },
  { title: "Verified sellers", text: "Every manufacturer and distributor is checked before they can quote." },
  { title: "Compare quotes", text: "See prices and delivery times side by side, then choose the best." },
  { title: "Across the GCC", text: "Sellers in six countries, so the part you need is never far away." },
];

/**
 * Glass parts, positioned relative to the top-left of their card in Figma
 * pixels (piston on card 1, gear on card 3, bearing on card 4). They use
 * mix-blend-screen, so they show over the coloured aurora band.
 */
const GLASS_PARTS: Record<number, { src: string; x: number; y: number; size: number }> = {
  0: { src: "/landing/glass-piston.png", x: -70, y: 220, size: 250 },
  2: { src: "/landing/glass-gear.png", x: 30, y: 290, size: 240 },
  3: { src: "/landing/glass-bearing.png", x: 140, y: 120, size: 230 },
};

function Benefits() {
  return (
    <section
      id="how-it-works"
      className="relative overflow-hidden bg-canvas pt-[110px] pb-[120px] min-[1360px]:h-[1380px] min-[1360px]:pt-[150px] min-[1360px]:pb-0"
    >
      {/* Desktop: aurora 2300×720 at (-430,880), 100 px blur margin; light dome 1700×560 at (-130,500), 120 px margin. */}
      <div aria-hidden className={"pointer-events-none absolute inset-0 hidden min-[1360px]:block"}>
        <Image src="/landing/benefits-aurora.svg" alt="" width={2500} height={920} className="absolute max-w-none" style={onCanvas(-530, 780, 2500, 920)} />
        <Image src="/landing/benefits-dome.svg" alt="" width={1940} height={800} className="absolute max-w-none" style={onCanvas(-250, 380, 1940, 800)} />
      </div>

      <div className="relative flex flex-col items-center px-4 text-center">
        <Image src="/landing/sparkle.svg" alt="" width={18} height={18} />
        <p className="mt-[72px] flex items-center gap-1.5 rounded-full bg-black/9 py-1.5 pr-3 pl-2.5 text-[13px] leading-[1.3] font-medium text-ink">
          <Image src="/landing/link.svg" alt="" width={14} height={14} />
          How Muhrak works
        </p>
        <h2 className="mt-[22px] text-[44px] leading-[1.3] tracking-[-0.03em] sm:text-[64px] lg:text-[80px]">What’s in it for you?</h2>
        <p className="mt-10 max-w-[440px] text-base leading-normal text-ink-secondary">
          Find the right part from the right seller at the right price, without calling around.
        </p>
      </div>

      <div
        // Desktop (1360 px+): one row of 1324 px at Figma y 760. Centred with left, not a transform, so the
        // glass parts can still blend with the aurora behind (a transform would isolate them).
        className="relative mx-auto mt-16 max-w-[760px] px-4 min-[1360px]:absolute min-[1360px]:top-[760px] min-[1360px]:left-[calc(50%-662px)] min-[1360px]:mt-0 min-[1360px]:w-[1324px] min-[1360px]:max-w-none min-[1360px]:px-0"
      >
        {/*
          Phones and tablets: the same aurora runs behind the stacked cards, so
          the cards and glass parts read as they do on desktop. It is sized and
          offset like the desktop crop (2500 px wide at x -530 of 1440), so phones
          see the same colours as desktop and none of the cropped-off ends.
        */}
        <Image
          src="/landing/benefits-aurora.svg"
          alt=""
          aria-hidden
          width={2500}
          height={920}
          className="pointer-events-none absolute top-[4%] left-[calc(50%-50vw-36.8vw)] h-[calc(96%+120px)] w-[173.6vw] max-w-none min-[1360px]:hidden"
        />
        <ol className="relative grid gap-5 sm:max-[1359px]:grid-cols-2 min-[1360px]:grid-cols-4">
          {BENEFITS.map((benefit, index) => {
            const part = GLASS_PARTS[index];
            return (
              <li key={benefit.title} className="relative h-[340px] sm:h-[430px]">
                <div className="relative flex h-full flex-col rounded-[18px] border border-glass-edge bg-linear-to-b from-white/78 to-white/50 px-[27px] pt-[31px] backdrop-blur-[15px]">
                  <h3 className="text-[26px] leading-[1.2] tracking-[-0.01em]">{benefit.title}</h3>
                  <p className="mt-5 max-w-[246px] text-sm leading-[1.55] text-ink-tertiary">{benefit.text}</p>
                  <span aria-hidden className="absolute right-7 bottom-[30px] text-[30px] leading-[1.3] font-light text-ink/22">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                {part ? <GlassPart {...part} /> : null}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

/** Full Figma size from `sm` up; 72% on phones, where the cards are shorter. */
function GlassPart({ src, x, y, size }: { src: string; x: number; y: number; size: number }) {
  const g = (n: number) => `calc(${n} * var(--g))`;
  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      sizes={`${size}px`}
      className="pointer-events-none absolute max-w-none object-cover mix-blend-screen [--g:0.72px] sm:[--g:1px]"
      style={{ left: g(x), top: g(y), width: g(size), height: g(size) }}
    />
  );
}

// ---------------------------------------------------------------- Muhrak AI feature (423:1223)

const BARS = [
  { x: 35, h: 46 },
  { x: 87, h: 58 },
  { x: 139, h: 52 },
  { x: 191, h: 64 },
  { x: 243, h: 180, best: true },
  { x: 295, h: 96 },
  { x: 347, h: 72 },
  { x: 399, h: 88 },
];

function MuhrakAiFeature() {
  return (
    <section
      id="muhrak-ai"
      className="relative flex flex-col items-center gap-14 overflow-hidden bg-canvas px-4 pt-[120px] pb-[100px] [--bar-unit:0.8px] sm:[--bar-unit:1px] lg:h-[740px] lg:flex-row lg:justify-center lg:gap-[110px] lg:px-0 lg:pt-[160px] lg:pb-[140px]"
    >
      <MobileGlow edge="top" className="h-[320px]" strength={0.45} />
      {/*
        Figma 540×440 card. Laid out with flex (not absolute pixels) so it keeps
        its proportions on phones: at 540 px every element lands on its Figma
        position (text block at 35,39; Compare at 391,51; rule at y 159; bars
        38 px wide, 14 px apart, bottom-aligned from x 35).
      */}
      <div
        aria-hidden
        className="relative flex h-[380px] w-full max-w-[540px] shrink-0 flex-col overflow-hidden rounded-[24px] border border-glass-edge bg-linear-to-b from-white/78 to-white/50 px-5 pt-6 sm:h-[440px] sm:px-[35px] sm:pt-[38px]"
      >
        <Image
          src="/landing/ai-glow.svg"
          alt=""
          width={600}
          height={440}
          className="pointer-events-none absolute -bottom-[229px] left-1/2 w-[111%] max-w-none -translate-x-1/2"
        />
        <div className="relative flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col leading-[1.3]">
            <p className="text-sm text-ink-tertiary">Quotes received</p>
            <p className="mt-[5px] text-[28px] tracking-[-0.02em] whitespace-nowrap sm:text-[36px]">38.500 OMR</p>
            <p className="text-[13px] text-ink-tertiary">Best price from 5 sellers</p>
          </div>
          <span className="mt-3 shrink-0 rounded-full bg-ink px-5 py-[11px] text-sm leading-[1.3] font-medium text-white sm:px-[26px] sm:py-[13px]">
            Compare
          </span>
        </div>
        <div className="relative mt-[22px] h-px w-full bg-black/11 sm:mt-[29px]" />
        <div className="relative mt-auto flex w-[86%] items-end gap-[3.48%] sm:w-[402px] sm:gap-[14px]">
          {BARS.map((bar) => (
            <div
              key={bar.x}
              className={cn("flex-1 sm:w-[38px] sm:flex-none", bar.best ? "bg-linear-to-b from-ink to-ink/60" : "bg-linear-to-b from-black/11 to-black/2")}
              style={{ height: `calc(${bar.h} * var(--bar-unit))` }}
            />
          ))}
        </div>
      </div>

      <div className="relative flex w-full max-w-[430px] shrink-0 flex-col items-start">
        <h2 className="text-[40px] leading-[1.12] tracking-[-0.02em] sm:text-[48px]">
          <span className="block text-ink">Snap a part,</span>
          <span className="block text-ink-tertiary">get quotes in hours.</span>
        </h2>
        <p className="mt-[22px] text-[15px] leading-[1.55] text-ink-tertiary">
          Upload one photo. Muhrak AI identifies the part and sends your request to sellers who stock it.
        </p>
        <Link href={FIND_A_PART} className={cn(outlinePill, "mt-8")}>
          Try Muhrak AI
        </Link>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- FAQ (423:1247)

function Faq() {
  return (
    <section id="faq" className="flex flex-col items-center bg-canvas px-4 pt-[60px] pb-[140px]">
      <h2 className="text-center text-[40px] leading-[1.12] tracking-[-0.02em] sm:text-[48px]">
        <span className="block text-ink">Frequently Asked</span>
        <span className="block text-ink-tertiary">Questions</span>
      </h2>
      <p className="mt-[18px] text-center text-sm leading-[1.3] text-ink-tertiary">Have another question? Contact our team.</p>
      <div className="mt-12 flex w-full justify-center">
        <FaqAccordion />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- CTA (423:1279)

function Cta() {
  return (
    <section className="flex flex-col items-center bg-canvas px-4 pb-[120px]">
      <div className="relative h-[360px] w-full max-w-[1160px] overflow-hidden rounded-[24px] border border-glass-edge bg-linear-to-b from-white/78 to-white/50">
        <Image src="/landing/cta-grid.svg" alt="" width={1160} height={360} className="pointer-events-none absolute top-[-1px] left-[-1px] max-w-none" />
        <Image
          src="/landing/cta-aurora.svg"
          alt=""
          width={1100}
          height={460}
          // Figma: 1100×460 at (29,199) in the 1160 px card. Sized as a share of the card so phones see every colour.
          className="pointer-events-none absolute top-[55%] left-1/2 h-auto w-[94.8%] max-w-none -translate-x-1/2"
        />
        <div className="relative flex flex-col items-center px-4 pt-[71px] text-center">
          <h2 className="text-[34px] leading-[1.12] tracking-[-0.02em] sm:text-[44px]">
            <span className="block text-ink">Your next part is</span>
            <span className="block text-ink-tertiary">one photo away.</span>
          </h2>
          <p className="mt-4 text-sm leading-[1.3] text-ink-tertiary">Verified sellers, real prices and quotes in hours, not days.</p>
          <Link href={FIND_A_PART} className={cn(solidPill, "mt-7")}>
            Find a part
          </Link>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- footer (423:1291)

type FooterLink = { label: string; href?: string };

const FOOTER_COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Buy",
    links: [
      { label: "Manufacturers", href: "#how-it-works" },
      { label: "Distributors", href: "#how-it-works" },
      { label: "Muhrak AI", href: "#muhrak-ai" },
      { label: "Garage" },
    ],
  },
  {
    title: "Sell",
    links: [
      { label: "Sell on Muhrak", href: "/seller/signup" },
      { label: "Seller Centre", href: "/seller/login" },
    ],
  },
  // Company and legal pages are not built yet (Day 15); they show as plain text until then.
  { title: "Company", links: [{ label: "About us" }, { label: "Contact us" }, { label: "Careers" }] },
  {
    title: "Help",
    links: [{ label: "FAQs", href: "#faq" }, { label: "Refund policy" }, { label: "Terms & conditions" }, { label: "Privacy policy" }],
  },
];

function Footer() {
  return (
    <footer className="relative flex flex-col gap-14 overflow-hidden border-t border-black/7 bg-canvas px-4 pt-16 pb-10 sm:px-10 xl:px-[140px]">
      {/* Mobile: the page closes with the same band as the hero's bottom edge. */}
      <MobileGlow edge="bottom" className="h-[75%]" />
      <div className="relative flex flex-col gap-10 lg:flex-row lg:gap-6">
        <Link href="/" aria-label="Muhrak home" className="flex self-start rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <Image src="/auth/muhrak-logo.svg" alt="Muhrak" width={156.357} height={29.8588} />
        </Link>
        <div className="hidden flex-1 lg:block" />
        <div className="grid grid-cols-2 gap-x-20 gap-y-10 text-[13px] leading-[1.3] sm:flex sm:gap-20">
          {FOOTER_COLUMNS.map((column) => (
            <FooterColumn key={column.title} title={column.title}>
              {column.links.map((link) =>
                link.href ? (
                  <a key={link.label} href={link.href} className="text-ink-tertiary hover:text-ink">
                    {link.label}
                  </a>
                ) : (
                  <span key={link.label} className="text-ink-tertiary">
                    {link.label}
                  </span>
                ),
              )}
            </FooterColumn>
          ))}
        </div>
      </div>
      <div className="relative flex min-h-[100px] flex-wrap items-center gap-4">
        <div className="flex items-center gap-[18px]" aria-label="Social media">
          <Image src="/landing/instagram.svg" alt="Instagram" width={16} height={16} />
          <Image src="/landing/x.svg" alt="X" width={16} height={16} />
          <Image src="/landing/youtube.svg" alt="YouTube" width={16} height={16} />
        </div>
        <div className="flex-1" />
        <p className="text-xs leading-[1.3] text-ink-tertiary">© 2026 Muhrak. All rights reserved.</p>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 whitespace-nowrap">
      <p className="font-medium text-ink">{title}</p>
      {children}
    </div>
  );
}
