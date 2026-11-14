/**
 * Buyer nav links (Figma "Buyer – Landing v2" › Nav › Links). "Manufacturers"
 * was renamed "Sellers" (developer decision, 14 Nov 2026: one seller type).
 * Garage has no page yet, so it is plain text.
 */
export const NAV_LINKS: { label: string; href?: string }[] = [
  { label: "Sellers", href: "/sellers" },
  { label: "Muhrak AI", href: "/#muhrak-ai" },
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
