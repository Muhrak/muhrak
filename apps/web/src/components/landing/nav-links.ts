/** Landing page nav links (Figma "Buyer – Landing v2" › Nav › Links). Garage has no page yet, so it is plain text. */
export const NAV_LINKS: { label: string; href?: string }[] = [
  { label: "Manufacturers", href: "#how-it-works" },
  { label: "Muhrak AI", href: "#muhrak-ai" },
  { label: "Garage" },
];

/**
 * Seller landing nav (Figma "Seller – Landing" › Nav › Links). Pages for
 * these do not exist yet, so they point at the matching section; Resources
 * has nothing to show yet, so it is plain text.
 */
export const SELLER_NAV_LINKS: { label: string; href?: string }[] = [
  { label: "Solutions", href: "#why-sell" },
  { label: "Resources" },
  { label: "Pricing", href: "#faq" },
  { label: "Muhrak AI", href: "#muhrak-ai" },
];
