import type { PortalSide } from "@/features/auth/paths";
import type { IconName } from "./icon";

/**
 * Sidebar menus, from Figma "Buyer Sidebar" and "Seller Sidebar".
 * Each item's slug is the first path segment after /buyer or /seller. Pages
 * not built yet show a "coming soon" screen (see the [...section] routes).
 */

export interface NavLink {
  label: string;
  slug: string;
  icon?: IconName;
}

export interface NavGroup {
  /** Small uppercase heading (seller), or an expandable parent item (buyer "Messages"). */
  label: string;
  icon?: IconName;
  collapsible?: boolean;
  items: NavLink[];
}

export type NavEntry = NavLink | NavGroup;

export function isGroup(entry: NavEntry): entry is NavGroup {
  return "items" in entry;
}

export const BUYER_NAV: NavEntry[] = [
  { label: "Dashboard", slug: "dashboard", icon: "grid" },
  {
    label: "Messages",
    icon: "message",
    collapsible: true,
    items: [
      { label: "Messenger", slug: "messages" },
      { label: "Inquiries & RFQs", slug: "requests" },
    ],
  },
  { label: "Orders", slug: "orders", icon: "box" },
  { label: "Payments", slug: "payments", icon: "credit-card" },
  { label: "Saved & history", slug: "saved", icon: "clock" },
  { label: "Settings", slug: "settings", icon: "cog" },
];

export const SELLER_NAV: NavEntry[] = [
  {
    label: "Workspace",
    items: [
      { label: "Dashboard", slug: "dashboard", icon: "grid" },
      { label: "RFQ Inbox", slug: "rfq-inbox", icon: "mail" },
      { label: "Messages", slug: "messages", icon: "message" },
      { label: "Quotations", slug: "quotations", icon: "file" },
      { label: "Orders", slug: "orders", icon: "truck" },
    ],
  },
  {
    label: "Product management",
    items: [
      { label: "Products", slug: "products", icon: "box" },
      { label: "Categories", slug: "categories", icon: "folder" },
      { label: "Inventory", slug: "inventory", icon: "layers" },
      { label: "Pricing", slug: "pricing", icon: "tag" },
    ],
  },
  {
    label: "Business & finance",
    items: [
      { label: "Payments", slug: "payments", icon: "credit-card" },
      { label: "Transactions", slug: "transactions", icon: "refresh" },
      { label: "Analytics", slug: "analytics", icon: "bar-chart" },
    ],
  },
  {
    label: "Company",
    items: [
      { label: "Company Profile", slug: "company-profile", icon: "building" },
      { label: "Team Members", slug: "team", icon: "users" },
      { label: "Verification", slug: "verification", icon: "check-circle" },
    ],
  },
  {
    label: "Preferences",
    items: [
      { label: "Settings", slug: "settings", icon: "cog" },
      { label: "Help & Support", slug: "help", icon: "help-circle" },
    ],
  },
];

export const PORTAL_NAV: Record<PortalSide, NavEntry[]> = { buyer: BUYER_NAV, seller: SELLER_NAV };

/** Pages linked from dashboards that are not in the menu. */
const EXTRA_SECTIONS: Record<PortalSide, Record<string, string>> = {
  buyer: { "find-part": "Find a part" },
  seller: { store: "My store" },
};

/** Label for a section slug, or undefined if the slug is not a known page. */
export function sectionLabel(side: PortalSide, slug: string): string | undefined {
  for (const entry of PORTAL_NAV[side]) {
    const links = isGroup(entry) ? entry.items : [entry];
    const match = links.find((link) => link.slug === slug);
    if (match) return match.label;
  }
  return EXTRA_SECTIONS[side][slug];
}

export function allSectionSlugs(side: PortalSide): string[] {
  const slugs = PORTAL_NAV[side].flatMap((entry) => (isGroup(entry) ? entry.items : [entry]).map((link) => link.slug));
  return [...slugs, ...Object.keys(EXTRA_SECTIONS[side])];
}
