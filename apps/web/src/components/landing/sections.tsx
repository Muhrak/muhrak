import Image from "next/image";
import Link from "next/link";
import { Suspense, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { FaqAccordion, type FaqItem } from "./faq-accordion";
import { MobileGlow } from "./mobile-glow";
import { NavActions, SignedOutActions, type LandingSide } from "./nav-actions";
import { NAV_LINKS, SELLER_NAV_LINKS } from "./nav-links";

/**
 * Building blocks shared by the buyer landing (Figma "Buyer – Landing v2
 * (Light)", 423:1138) and the seller landing (Figma "Seller – Landing",
 * 285:12, converted to light). Both frames use the same grid: at 1440 px
 * every element sits at its Figma position and size.
 *
 * Decorations are placed on a 1440 px canvas centred in the viewport with
 * `onCanvas(x, y, w, h)`, measured in --ux/--uy design pixels (1px on
 * desktop). Glass objects are anchored to their cards, so they appear on
 * every screen.
 */

/** Absolute position on the centred 1440 px design canvas (x, y in Figma pixels). */
export function onCanvas(x: number, y: number, w: number, h: number): CSSProperties {
  const ux = (n: number) => `calc(${n} * var(--ux, 1px))`;
  const uy = (n: number) => `calc(${n} * var(--uy, 1px))`;
  return { left: `calc(50% + ${x - 720} * var(--ux, 1px))`, top: uy(y), width: ux(w), height: uy(h) };
}

/**
 * Hero design-pixel units. Desktop (1440 px+): 1px both ways. Narrower: the
 * width follows the screen so the whole aurora stays in view, the height
 * shrinks less so the colour still reaches down the hero.
 */
export const heroUnit = {
  "--ux": "min(1px, calc(100vw / 1440))",
  "--uy": "max(0.72px, min(1px, calc(100vw / 1440)))",
} as CSSProperties;

const focus = "outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export const outlinePill = cn(
  "inline-flex items-center rounded-full border border-black/22 px-[26px] py-[13px] text-sm leading-[1.3] text-ink transition-colors hover:bg-black/4",
  focus,
);
export const solidPill = cn(
  "inline-flex items-center rounded-full bg-ink px-[26px] py-[13px] text-sm leading-[1.3] font-medium text-white transition-opacity hover:opacity-90",
  focus,
);

// ---------------------------------------------------------------- nav

export function SiteNav({ side }: { side: LandingSide }) {
  const links = side === "seller" ? SELLER_NAV_LINKS : NAV_LINKS;
  return (
    <header className="relative z-20 flex items-center px-4 py-5 sm:px-12">
      <Link href={side === "seller" ? "/sell" : "/"} aria-label="Muhrak home" className={cn("flex rounded-sm", focus)}>
        <Image src="/auth/muhrak-logo.svg" alt="Muhrak" width={156.357} height={29.8588} priority />
      </Link>
      <div className="flex-1" />
      <nav aria-label="Main" className="hidden gap-10 text-sm leading-[1.3] text-[rgba(10,11,18,0.78)] lg:flex">
        {links.map((link) =>
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
      <Suspense fallback={<SignedOutActions side={side} />}>
        <NavActions side={side} />
      </Suspense>
    </header>
  );
}

// ---------------------------------------------------------------- stats strip

export function StatsStrip({ stats }: { stats: { label: string; value: string }[] }) {
  return (
    // Mobile: semi-transparent so the colour glow carries through; desktop: solid white as in Figma.
    <section aria-label="Muhrak in numbers" className="relative grid grid-cols-2 bg-white/60 lg:grid-cols-4 lg:bg-white">
      {stats.map((stat, index) => (
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

// ---------------------------------------------------------------- "What's in it for you?"

export type GlassObject = { src: string; x: number; y: number; size: number };

export interface BenefitsContent {
  id: string;
  chip: { icon: ReactNode; label: string };
  intro: string;
  cards: { title: string; text: string }[];
  /** Glass object per card index, positioned from the card's top-left in Figma pixels. */
  glass: Record<number, GlassObject>;
  aurora: string;
  dome: string;
  /** Card border colour class. */
  cardEdge: string;
}

export function Benefits({ id, chip, intro, cards, glass, aurora, dome, cardEdge }: BenefitsContent) {
  return (
    <section
      id={id}
      className="relative overflow-hidden bg-canvas pt-[110px] pb-[120px] min-[1360px]:h-[1380px] min-[1360px]:pt-[150px] min-[1360px]:pb-0"
    >
      {/* Desktop: aurora 2300×720 at (-430,880), 100 px blur margin; light dome 1700×560 at (-130,500), 120 px margin. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 hidden min-[1360px]:block">
        <Image src={aurora} alt="" width={2500} height={920} className="absolute max-w-none" style={onCanvas(-530, 780, 2500, 920)} />
        <Image src={dome} alt="" width={1940} height={800} className="absolute max-w-none" style={onCanvas(-250, 380, 1940, 800)} />
      </div>

      <div className="relative flex flex-col items-center px-4 text-center">
        <Image src="/landing/sparkle.svg" alt="" width={18} height={18} />
        <p className="mt-[72px] flex items-center gap-1.5 rounded-full bg-black/9 py-1.5 pr-3 pl-2.5 text-[13px] leading-[1.3] font-medium text-ink">
          {chip.icon}
          {chip.label}
        </p>
        <h2 className="mt-[22px] text-[44px] leading-[1.3] tracking-[-0.03em] sm:text-[64px] lg:text-[80px]">What’s in it for you?</h2>
        <p className="mt-10 max-w-[440px] text-base leading-normal text-ink-secondary">{intro}</p>
      </div>

      <div
        // Desktop (1360 px+): one row of 1324 px at Figma y 760. Centred with left, not a transform, so the
        // glass objects can still blend with the aurora behind (a transform would isolate them).
        className="relative mx-auto mt-16 max-w-[760px] px-4 min-[1360px]:absolute min-[1360px]:top-[760px] min-[1360px]:left-[calc(50%-662px)] min-[1360px]:mt-0 min-[1360px]:w-[1324px] min-[1360px]:max-w-none min-[1360px]:px-0"
      >
        {/* Phones and tablets: the same aurora behind the stacked cards, cropped like desktop. */}
        <Image
          src={aurora}
          alt=""
          aria-hidden
          width={2500}
          height={920}
          className="pointer-events-none absolute top-[4%] left-[calc(50%-50vw-36.8vw)] h-[calc(96%+120px)] w-[173.6vw] max-w-none min-[1360px]:hidden"
        />
        <ol className="relative grid gap-5 sm:max-[1359px]:grid-cols-2 min-[1360px]:grid-cols-4">
          {cards.map((card, index) => {
            const object = glass[index];
            return (
              <li key={card.title} className="relative h-[340px] sm:h-[430px]">
                <div
                  className={cn(
                    "relative flex h-full flex-col rounded-[18px] border bg-linear-to-b from-white/78 to-white/50 px-[27px] pt-[31px] backdrop-blur-[15px]",
                    cardEdge,
                  )}
                >
                  <h3 className="text-[26px] leading-[1.2] tracking-[-0.01em]">{card.title}</h3>
                  <p className="mt-5 max-w-[246px] text-sm leading-[1.55] text-ink-tertiary">{card.text}</p>
                  <span aria-hidden className="absolute right-7 bottom-[30px] text-[30px] leading-[1.3] font-light text-ink/22">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                {object ? <GlassPart {...object} /> : null}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

/** Full Figma size from `sm` up; 72% on phones, where the cards are shorter. */
function GlassPart({ src, x, y, size }: GlassObject) {
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

// ---------------------------------------------------------------- Muhrak AI feature

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

export interface AiFeatureContent {
  card: { label: string; value: string; note: string; button: string };
  glow: string;
  cardEdge: string;
  heading: [string, string];
  text: string;
  cta: { href: string; label: string };
  side: LandingSide;
}

export function AiFeature({ card, glow, cardEdge, heading, text, cta, side }: AiFeatureContent) {
  return (
    <section
      id="muhrak-ai"
      className="relative flex flex-col items-center gap-14 overflow-hidden bg-canvas px-4 pt-[120px] pb-[100px] [--bar-unit:0.8px] sm:[--bar-unit:1px] lg:h-[740px] lg:flex-row lg:justify-center lg:gap-[110px] lg:px-0 lg:pt-[160px] lg:pb-[140px]"
    >
      <MobileGlow edge="top" className="h-[320px]" strength={0.45} palette={side} />
      {/*
        Figma 540×440 card, laid out with flex so it keeps its proportions on
        phones; at 540 px every element lands on its Figma position (text at
        35,39; button at 391,51; rule at y 159; bars 38 px wide, 14 px apart).
      */}
      <div
        aria-hidden
        className={cn(
          "relative flex h-[380px] w-full max-w-[540px] shrink-0 flex-col overflow-hidden rounded-[24px] border bg-linear-to-b from-white/78 to-white/50 px-5 pt-6 sm:h-[440px] sm:px-[35px] sm:pt-[38px]",
          cardEdge,
        )}
      >
        <Image src={glow} alt="" width={600} height={440} className="pointer-events-none absolute -bottom-[229px] left-1/2 w-[111%] max-w-none -translate-x-1/2" />
        <div className="relative flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col leading-[1.3]">
            <p className="text-sm text-ink-tertiary">{card.label}</p>
            <p className="mt-[5px] text-[28px] tracking-[-0.02em] whitespace-nowrap sm:text-[36px]">{card.value}</p>
            <p className="text-[13px] text-ink-tertiary">{card.note}</p>
          </div>
          <span className="mt-3 shrink-0 rounded-full bg-ink px-5 py-[11px] text-sm leading-[1.3] font-medium text-white sm:px-[26px] sm:py-[13px]">
            {card.button}
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
          <span className="block text-ink">{heading[0]}</span>
          <span className="block text-ink-tertiary">{heading[1]}</span>
        </h2>
        <p className="mt-[22px] text-[15px] leading-[1.55] text-ink-tertiary">{text}</p>
        <Link href={cta.href} className={cn(outlinePill, "mt-8")}>
          {cta.label}
        </Link>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- FAQ

export function Faq({ items, contact }: { items: FaqItem[]; contact: string }) {
  return (
    <section id="faq" className="flex flex-col items-center bg-canvas px-4 pt-[60px] pb-[140px]">
      <h2 className="text-center text-[40px] leading-[1.12] tracking-[-0.02em] sm:text-[48px]">
        <span className="block text-ink">Frequently Asked</span>
        <span className="block text-ink-tertiary">Questions</span>
      </h2>
      <p className="mt-[18px] text-center text-sm leading-[1.3] text-ink-tertiary">{contact}</p>
      <div className="mt-12 flex w-full justify-center">
        <FaqAccordion items={items} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- CTA

export interface CtaContent {
  heading: [string, string];
  text: string;
  button: { href: string; label: string };
  aurora: string;
  cardEdge: string;
}

export function Cta({ heading, text, button, aurora, cardEdge }: CtaContent) {
  return (
    <section className="flex flex-col items-center bg-canvas px-4 pb-[120px]">
      <div className={cn("relative h-[360px] w-full max-w-[1160px] overflow-hidden rounded-[24px] border bg-linear-to-b from-white/78 to-white/50", cardEdge)}>
        <Image src="/landing/cta-grid.svg" alt="" width={1160} height={360} className="pointer-events-none absolute top-[-1px] left-[-1px] max-w-none" />
        <Image
          src={aurora}
          alt=""
          width={1100}
          height={460}
          // Figma: 1100×460 at (29,199) in the 1160 px card, sized as a share of the card so phones see every colour.
          className="pointer-events-none absolute top-[55%] left-1/2 h-auto w-[94.8%] max-w-none -translate-x-1/2"
        />
        <div className="relative flex flex-col items-center px-4 pt-[71px] text-center">
          <h2 className="text-[34px] leading-[1.12] tracking-[-0.02em] sm:text-[44px]">
            <span className="block text-ink">{heading[0]}</span>
            <span className="block text-ink-tertiary">{heading[1]}</span>
          </h2>
          <p className="mt-4 text-sm leading-[1.3] text-ink-tertiary">{text}</p>
          <Link href={button.href} className={cn(solidPill, "mt-7")}>
            {button.label}
          </Link>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- footer (identical in both frames)

type FooterLink = { label: string; href?: string };

const FOOTER_COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Buy",
    links: [
      { label: "Manufacturers", href: "/#how-it-works" },
      { label: "Distributors", href: "/#how-it-works" },
      { label: "Muhrak AI", href: "/#muhrak-ai" },
      { label: "Garage" },
    ],
  },
  {
    title: "Sell",
    links: [
      { label: "Sell on Muhrak", href: "/sell" },
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

export function Footer({ side }: { side: LandingSide }) {
  return (
    <footer className="relative flex flex-col gap-14 overflow-hidden border-t border-black/7 bg-canvas px-4 pt-16 pb-10 sm:px-10 xl:px-[140px]">
      {/* Mobile: the page closes with the same band as the hero's bottom edge. */}
      <MobileGlow edge="bottom" className="h-[75%]" palette={side} />
      <div className="relative flex flex-col gap-10 lg:flex-row lg:gap-6">
        <Link href={side === "seller" ? "/sell" : "/"} aria-label="Muhrak home" className={cn("flex self-start rounded-sm", focus)}>
          <Image src="/auth/muhrak-logo.svg" alt="Muhrak" width={156.357} height={29.8588} />
        </Link>
        <div className="hidden flex-1 lg:block" />
        <div className="grid grid-cols-2 gap-x-20 gap-y-10 text-[13px] leading-[1.3] sm:flex sm:gap-20">
          {FOOTER_COLUMNS.map((column) => (
            <div key={column.title} className="flex flex-col gap-3 whitespace-nowrap">
              <p className="font-medium text-ink">{column.title}</p>
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
            </div>
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
