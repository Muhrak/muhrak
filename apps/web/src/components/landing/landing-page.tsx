import Image from "next/image";
import Link from "next/link";
import { Suspense, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { FaqAccordion } from "./faq-accordion";
import { NavActions, SignedOutActions } from "./nav-actions";

/**
 * Buyer landing page: Figma "Buyer – Landing v2 (Light)" (node 423:1138).
 *
 * At 1440 px wide every element sits at its Figma position and size.
 * Decorations (auroras, glass parts) are placed on a 1440 px canvas centred
 * in the viewport with `onCanvas(x, y, w, h)`, so on wider screens they stay
 * where the design has them relative to the content. Below `lg` the
 * sections stack for phones.
 */

/** Absolute position on the centred 1440 px design canvas (x, y in Figma pixels). */
function onCanvas(x: number, y: number, w: number, h: number): CSSProperties {
  return { left: `calc(50% - 720px + ${x}px)`, top: y, width: w, height: h };
}

const FIND_A_PART = "/buyer/find-part";

const outlinePill =
  "inline-flex items-center rounded-full border border-black/22 px-[26px] py-[13px] text-sm leading-[1.3] text-ink outline-none transition-colors hover:bg-black/4 focus-visible:ring-3 focus-visible:ring-ring/50";
const solidPill =
  "inline-flex items-center rounded-full bg-ink px-[26px] py-[13px] text-sm leading-[1.3] font-medium text-white outline-none transition-opacity hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50";

export function LandingPage() {
  return (
    <div className="flex flex-1 flex-col bg-canvas font-sans text-ink">
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
    <section className="relative h-[620px] overflow-hidden bg-canvas lg:h-[720px]">
      {/* Aurora 2300×1000 at (-430,-520); the SVG adds a 90 px blur margin on each side. */}
      <Image src="/landing/hero-aurora.svg" alt="" width={2480} height={1180} priority className="pointer-events-none absolute max-w-none" style={onCanvas(-520, -610, 2480, 1180)} />
      {/* Light dome 1750×1200 at (-155,70) with a 110 px blur margin. */}
      <Image src="/landing/hero-dome.svg" alt="" width={1970} height={1420} priority className="pointer-events-none absolute max-w-none" style={onCanvas(-265, -40, 1970, 1420)} />

      <SiteNav />

      {/* Figma: copy starts 190 px from the section top; the 84 px nav is above it in the flow. */}
      <div className="relative flex flex-col items-center px-4 pt-[66px] text-center lg:pt-[106px]">
        <p className="text-[13px] leading-[1.3] tracking-[0.06em] text-[rgba(74,77,89,0.9)]">AI-POWERED SPARE PARTS MARKETPLACE</p>
        <h1 className="mt-10 bg-linear-to-b from-ink via-[#292b36] via-55% to-[#737585] bg-clip-text pb-2 text-[64px] leading-[0.84] font-medium tracking-[-0.05em] text-transparent sm:text-[96px] lg:text-[150px]">
          <span className="block">Find Any</span>
          <span className="block">Spare Part</span>
        </h1>
        <Link href={FIND_A_PART} className={cn(outlinePill, "mt-10")}>
          Find a part
        </Link>
      </div>
    </section>
  );
}

function SiteNav() {
  return (
    <header className="relative z-10 flex items-center px-4 py-5 sm:px-12">
      <Link href="/" aria-label="Muhrak home" className="flex rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <Image src="/auth/muhrak-logo.svg" alt="Muhrak" width={156.357} height={29.8588} priority />
      </Link>
      <div className="flex-1" />
      <nav aria-label="Main" className="hidden gap-10 text-sm leading-[1.3] text-[rgba(10,11,18,0.78)] lg:flex">
        <a href="#how-it-works" className="hover:text-ink">
          Manufacturers
        </a>
        <a href="#how-it-works" className="hover:text-ink">
          Distributors
        </a>
        <a href="#muhrak-ai" className="hover:text-ink">
          Muhrak AI
        </a>
        <span>Garage</span>
      </nav>
      <div className="hidden flex-1 lg:block" />
      <Suspense fallback={<SignedOutActions />}>
        <NavActions />
      </Suspense>
    </header>
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
    <section aria-label="Muhrak in numbers" className="relative grid grid-cols-2 bg-white lg:grid-cols-4">
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

function Benefits() {
  return (
    <section id="how-it-works" className="relative overflow-hidden bg-canvas pt-[110px] pb-[160px] lg:h-[1380px] lg:pt-[150px] lg:pb-0">
      {/* Aurora 2300×720 at (-430,880), 100 px blur margin; light dome 1700×560 at (-130,500), 120 px margin. */}
      <Image src="/landing/benefits-aurora.svg" alt="" width={2500} height={920} className="pointer-events-none absolute max-w-none" style={onCanvas(-530, 780, 2500, 920)} />
      <Image src="/landing/benefits-dome.svg" alt="" width={1940} height={800} className="pointer-events-none absolute max-w-none" style={onCanvas(-250, 380, 1940, 800)} />

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

      <ol className="relative mx-auto mt-16 grid max-w-[1324px] gap-5 px-4 sm:grid-cols-2 lg:absolute lg:top-[760px] lg:left-1/2 lg:mt-0 lg:w-[1324px] lg:-translate-x-1/2 lg:grid-cols-4 lg:px-0">
        {BENEFITS.map((benefit, index) => (
          <li
            key={benefit.title}
            className="relative flex h-[300px] flex-col rounded-[18px] border border-black/10 bg-linear-to-b from-white/78 to-white/50 px-[27px] pt-[31px] backdrop-blur-[15px] lg:h-[430px]"
          >
            <h3 className="text-[26px] leading-[1.2] tracking-[-0.01em]">{benefit.title}</h3>
            <p className="mt-5 max-w-[246px] text-sm leading-[1.55] text-ink-tertiary">{benefit.text}</p>
            <span aria-hidden className="absolute right-7 bottom-[30px] text-[30px] leading-[1.3] font-light text-ink/22">
              {String(index + 1).padStart(2, "0")}
            </span>
          </li>
        ))}
      </ol>

      {/* Glass parts, blended over the cards as in the design. */}
      <GlassPart src="/landing/glass-piston.png" style={onCanvas(-12, 980, 250, 250)} />
      <GlassPart src="/landing/glass-gear.png" style={onCanvas(760, 1050, 240, 240)} />
      <GlassPart src="/landing/glass-bearing.png" style={onCanvas(1206, 880, 230, 230)} />
    </section>
  );
}

function GlassPart({ src, style }: { src: string; style: CSSProperties }) {
  return (
    <Image
      src={src}
      alt=""
      width={Number(style.width)}
      height={Number(style.height)}
      sizes={`${Number(style.width)}px`}
      className="pointer-events-none absolute hidden max-w-none object-cover mix-blend-screen lg:block"
      style={style}
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
      className="flex flex-col items-center gap-14 bg-canvas px-4 pt-[120px] pb-[100px] lg:h-[740px] lg:flex-row lg:justify-center lg:gap-[110px] lg:px-0 lg:pt-[160px] lg:pb-[140px]"
    >
      <div
        aria-hidden
        // A fixed 540×440 illustration: on narrow screens it is scaled down as a whole (zoom) instead of reflowing.
        className="relative h-[440px] w-[540px] shrink-0 overflow-hidden rounded-[24px] border border-black/11 bg-linear-to-b from-white/78 to-white/50 max-[600px]:[zoom:0.65] max-[380px]:[zoom:0.55]"
      >
        <Image src="/landing/ai-glow.svg" alt="" width={600} height={440} className="pointer-events-none absolute top-[229px] left-[-31px] max-w-none" />
        <p className="absolute top-[39px] left-[35px] text-sm leading-[1.3] text-ink-tertiary">Quotes received</p>
        <p className="absolute top-[63px] left-[35px] text-[36px] leading-[1.3] tracking-[-0.02em]">38.500 OMR</p>
        <p className="absolute top-[111px] left-[35px] text-[13px] leading-[1.3] text-ink-tertiary">Best price from 5 sellers</p>
        <span className="absolute top-[51px] left-[391px] rounded-full bg-ink px-[26px] py-[13px] text-sm leading-[1.3] font-medium text-white">
          Compare
        </span>
        <div className="absolute top-[159px] left-[35px] h-px w-[468px] bg-black/11" />
        {BARS.map((bar) => (
          <div
            key={bar.x}
            className={cn("absolute w-[38px]", bar.best ? "bg-linear-to-b from-ink to-ink/60" : "bg-linear-to-b from-black/11 to-black/2")}
            style={{ left: bar.x, top: 439 - bar.h, height: bar.h }}
          />
        ))}
      </div>

      <div className="flex w-full max-w-[430px] shrink-0 flex-col items-start">
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
      <div className="relative h-[360px] w-full max-w-[1160px] overflow-hidden rounded-[24px] border border-black/11 bg-linear-to-b from-white/78 to-white/50">
        <Image src="/landing/cta-grid.svg" alt="" width={1160} height={360} className="pointer-events-none absolute top-[-1px] left-[-1px] max-w-none" />
        <Image
          src="/landing/cta-aurora.svg"
          alt=""
          width={1100}
          height={460}
          className="pointer-events-none absolute top-[199px] left-1/2 max-w-none -translate-x-1/2"
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
    <footer className="flex flex-col gap-14 border-t border-black/7 bg-canvas px-4 pt-16 pb-10 sm:px-10 xl:px-[140px]">
      <div className="flex flex-col gap-10 lg:flex-row lg:gap-6">
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
      <div className="flex min-h-[100px] flex-wrap items-center gap-4">
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
