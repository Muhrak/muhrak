import { Bricolage_Grotesque, Familjen_Grotesk, Manrope, Onest, Schibsted_Grotesk } from "next/font/google";
import Image from "next/image";
import type { CSSProperties } from "react";
import { SIGNUP_PATH } from "@/features/auth/paths";
import { cn } from "@/lib/utils";
import type { FaqItem } from "./faq-accordion";
import { MobileGlow } from "./mobile-glow";
import { AiFeature, Benefits, Cta, Faq, Footer, heroUnit, onCanvas, SiteNav, StatsStrip } from "./sections";
import { SellerEmailCapture } from "./seller-email-capture";

/**
 * Seller landing page: Figma "Seller – Landing" (node 285:12), converted
 * to light (developer decision, 11 Nov 2026) the same way the buyer
 * "(Light)" frame converts the dark one: canvas background, dark text,
 * frosted white cards, dark domes become the light canvas, white buttons
 * become ink. Layout, sizes, copy and the seller palette (orange #FF5A1F,
 * amber #FF7A2E, burnt orange #C2410C, blue #2B7BD8) follow the frame.
 */

// Fonts of the "Seller logos" wordmarks in the Figma hero.
const manrope = Manrope({ subsets: ["latin"], weight: "800" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], weight: "700" });
const schibsted = Schibsted_Grotesk({ subsets: ["latin"], weight: "900" });
const familjen = Familjen_Grotesk({ subsets: ["latin"], weight: "600" });
const onest = Onest({ subsets: ["latin"], weight: "500" });

const START_SELLING = SIGNUP_PATH.seller;

const SELLER_FAQ: FaqItem[] = [
  {
    question: "Who can sell on Muhrak?",
    answer:
      "Manufacturers, distributors and parts sellers registered in the GCC. Create a seller account, add your company details and start listing in minutes.",
  },
  {
    question: "How do quote requests reach me?",
    answer:
      "When a buyer asks for a part you sell, the request arrives in your RFQ Inbox and by email. Reply with your price and delivery time, then agree the details with the buyer in chat.",
  },
  {
    question: "How are sellers verified?",
    answer:
      "You upload your commercial registration, VAT certificate, owner ID and bank proof. Our team reviews them, and once approved your store shows as verified.",
  },
  {
    question: "Which countries can I sell to?",
    answer: "Buyers in all six GCC countries: Oman, the United Arab Emirates, Saudi Arabia, Qatar, Kuwait and Bahrain.",
  },
  {
    question: "Does it cost anything to start?",
    answer: "No. There are no listing fees and the seller dashboard is free. Buyers pay you directly for their orders.",
  },
];

export function SellerLandingPage() {
  return (
    <div className="relative flex flex-1 flex-col bg-canvas font-sans text-ink">
      <Hero />
      <StatsStrip
        stats={[
          { label: "COVERAGE", value: "6 GCC countries" },
          { label: "BUYERS", value: "12,940 members" },
          { label: "QUOTE REQUESTS", value: "Muhrak AI" },
          { label: "LISTING FEES", value: "Zero to start" },
        ]}
      />
      <Benefits
        id="why-sell"
        chip={{
          icon: (
            <span
              aria-hidden
              className="icon-mask inline-block size-3.5 text-ink"
              style={{ "--icon": "url(/sell/store.svg)" } as CSSProperties}
            />
          ),
          label: "Why sell on Muhrak",
        }}
        intro="Reach buyers who are already searching, and turn their requests into orders without cold calls."
        cards={[
          { title: "Get quote requests", text: "Muhrak AI sends you buyers who need the exact parts you stock." },
          { title: "Verified storefront", text: "A company profile that builds trust with workshops and fleets." },
          { title: "One dashboard", text: "Reply to requests, manage products and track orders in one place." },
          { title: "Across the GCC", text: "Sell to buyers in six countries from a single seller account." },
        ]}
        glass={{
          0: { src: "/sell/glass-price-tag.png", x: -70, y: 220, size: 250 },
          2: { src: "/sell/glass-parcel.png", x: 30, y: 290, size: 240 },
          3: { src: "/sell/glass-storefront.png", x: 140, y: 120, size: 230 },
        }}
        aurora="/sell/benefits-aurora.svg"
        dome="/sell/benefits-dome.svg"
        cardEdge="border-black/10"
      />
      <AiFeature
        side="seller"
        card={{ label: "Quote requests this month", value: "185 requests", note: "From buyers in 6 GCC countries", button: "Reply" }}
        glow="/sell/ai-glow.svg"
        cardEdge="border-black/11"
        heading={["Buyers snap a part,", "you get the request."]}
        text="Muhrak AI identifies the part from the buyer’s photo and sends the request straight to sellers who stock it. Reply with your price in seconds."
        cta={{ href: START_SELLING, label: "Start selling now" }}
      />
      <Faq items={SELLER_FAQ} contact="Have another question? Talk to our seller team." />
      <Cta
        heading={["Your next buyer is", "one request away."]}
        text="Set up your store in minutes and start receiving quote requests from across the Gulf."
        button={{ href: START_SELLING, label: "Start selling now" }}
        aurora="/sell/cta-aurora.svg"
        cardEdge="border-black/11"
      />
      <Footer side="seller" />
    </div>
  );
}

// ---------------------------------------------------------------- hero (285:13)

/**
 * Seller wordmarks (Figma "Seller logos", 1120×96 at x 160, y 650), each in
 * its own font, at its Figma position inside the box.
 */
const LOGOS: { name: string; font: string; x: number; y: number; tracking?: string }[] = [
  { name: "GULFLINE", font: manrope.className, x: 57, y: 5, tracking: "0.04em" },
  { name: "al noor parts", font: bricolage.className, x: 268, y: 7 },
  { name: "HYDRAX", font: schibsted.className, x: 509, y: 6.5, tracking: "0.02em" },
  { name: "Petromax", font: familjen.className, x: 737, y: 6 },
  { name: "Najd Motors", font: onest.className, x: 944, y: 6 },
  { name: "SEALCO", font: bricolage.className, x: 65, y: 63, tracking: "0.08em" },
  { name: "Bayan Trading", font: familjen.className, x: 265.5, y: 62 },
  { name: "TORQ.", font: schibsted.className, x: 524, y: 62.5 },
  { name: "oasis fleet", font: onest.className, x: 731, y: 62 },
  { name: "DELTA·PARTS", font: manrope.className, x: 932.5, y: 61, tracking: "0.03em" },
];

function Hero() {
  return (
    // Phones and tablets: full-screen hero with the mobile bands in the seller palette.
    // Desktop (lg+): the Figma frame, 820 px high.
    <section className="relative flex min-h-[100svh] flex-col bg-canvas lg:block lg:h-[820px] lg:min-h-0" style={heroUnit}>
      <MobileGlow edge="top" className="h-[40%]" palette="seller" />
      <MobileGlow edge="bottom" className="h-[34%]" palette="seller" />
      {/*
        Desktop decorations at their Figma positions (each SVG includes its
        blur margin): orange 1840×620 at (-200,360), amber 1200×300 at
        (120,560), blue 520×620 at (1180,40), blue-left 420×360 at (-120,640),
        then the dome 1080×760 at (180,-260), light canvas instead of dark.
      */}
      <div aria-hidden className="pointer-events-none absolute inset-0 hidden overflow-hidden lg:block">
        <Image src="/sell/hero-glow-orange.svg" alt="" width={2180} height={960} priority className="absolute max-w-none" style={onCanvas(-370, 190, 2180, 960)} />
        <Image src="/sell/hero-glow-amber.svg" alt="" width={1440} height={540} priority className="absolute max-w-none" style={onCanvas(0, 440, 1440, 540)} />
        <Image src="/sell/hero-glow-blue.svg" alt="" width={860} height={960} priority className="absolute max-w-none" style={onCanvas(1010, -130, 860, 960)} />
        <Image src="/sell/hero-glow-blue-left.svg" alt="" width={740} height={680} priority className="absolute max-w-none" style={onCanvas(-280, 480, 740, 680)} />
        <Image src="/sell/hero-dome.svg" alt="" width={1300} height={980} priority className="absolute max-w-none" style={onCanvas(70, -370, 1300, 980)} />
      </div>

      <SiteNav side="seller" />

      {/* Figma y positions: eyebrow 170, headline 212, text 400, email 488, note 566, logos 650 (nav is 84 px). */}
      <div className="relative flex flex-1 flex-col items-center justify-center px-4 pb-[8svh] text-center lg:block lg:pt-[86px] lg:pb-0">
        <p className="text-[13px] leading-[1.3] tracking-[0.06em] text-[rgba(74,77,89,0.9)]">SELL ON THE GULF’S SPARE PARTS MARKETPLACE</p>
        <h1 className="mx-auto mt-6 max-w-[1000px] bg-linear-to-b from-ink via-[#292b36] via-55% to-[#737585] bg-clip-text text-[40px] leading-none font-medium tracking-[-0.04em] text-transparent sm:text-[56px] lg:mt-[25px] lg:text-[80px]">
          <span className="block">Grow your parts business,</span>
          <span className="block">sell across the Gulf.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-[760px] text-base leading-[1.5] text-ink-secondary lg:mt-7 lg:text-[17px]">
          Workshops, fleets and contractors search Muhrak for parts every day.
          <br className="hidden sm:block" /> One seller account puts your store in front of them.
        </p>
        <SellerEmailCapture className="mx-auto mt-8 lg:mt-[37px]" />
        <p className="mt-5 text-[13px] leading-[1.3] text-ink-tertiary">No listing fees · Free seller dashboard · Live in 24 hours</p>

        {/* Desktop: wordmarks at their Figma positions. */}
        <div aria-label="Sellers on Muhrak" className="relative mx-auto mt-[67px] hidden h-24 w-[1120px] text-[22px] leading-[1.3] text-ink/90 lg:block">
          {LOGOS.map((logo) => (
            <span key={logo.name} className={cn("absolute whitespace-nowrap", logo.font)} style={{ left: logo.x, top: logo.y, letterSpacing: logo.tracking }}>
              {logo.name}
            </span>
          ))}
        </div>
        {/* Phones and tablets: the same wordmarks in a grid. */}
        <div aria-label="Sellers on Muhrak" className="mt-10 grid w-full max-w-[520px] grid-cols-2 gap-x-6 gap-y-4 text-lg leading-[1.3] text-ink/85 sm:grid-cols-3 lg:hidden">
          {LOGOS.map((logo) => (
            <span key={logo.name} className={cn("whitespace-nowrap", logo.font)} style={{ letterSpacing: logo.tracking }}>
              {logo.name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
