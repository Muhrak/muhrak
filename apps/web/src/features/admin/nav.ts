import type { IconName } from "@/components/layout/icon";

/**
 * Figma "Admin Sidebar" (403:1592). Day 4 builds Sellers; the other items
 * open a "Coming soon" page until their day in the plan.
 */
export interface NavItem {
  label: string;
  href: string;
  icon: IconName;
  count?: number;
}

export function navGroups(pending: number | undefined): { label?: string; items: NavItem[] }[] {
  const soon = (slug: string) => `/admin/soon/${slug}`;
  return [
    { items: [{ label: "Dashboard", href: soon("dashboard"), icon: "grid" }] },
    {
      label: "Marketplace management",
      items: [
        { label: "Users & Organizations", href: soon("users"), icon: "users" },
        { label: "Sellers", href: "/admin/sellers", icon: "building", count: pending },
        { label: "Products & Categories", href: soon("products"), icon: "box" },
        { label: "RFQs", href: soon("rfqs"), icon: "file" },
        { label: "Orders", href: soon("orders"), icon: "truck" },
      ],
    },
    {
      label: "Finance",
      items: [
        { label: "Payments & Transactions", href: soon("payments"), icon: "credit-card" },
        { label: "Refunds & Disputes", href: soon("refunds"), icon: "refresh" },
      ],
    },
    {
      label: "Platform operations",
      items: [
        { label: "MUHRAK AI", href: soon("ai"), icon: "muhrak-ai" },
        { label: "Support & Complaints", href: soon("support"), icon: "alert-circle" },
        { label: "Notifications", href: soon("notifications"), icon: "bell" },
      ],
    },
    {
      label: "Website management",
      items: [
        { label: "Website Overview", href: soon("website"), icon: "globe" },
        { label: "Pages & Content", href: soon("pages"), icon: "list" },
        { label: "Banners & Media", href: soon("banners"), icon: "image" },
        { label: "SEO & Metadata", href: soon("seo"), icon: "search" },
        { label: "Maintenance Mode", href: soon("maintenance"), icon: "wrench" },
      ],
    },
    {
      label: "Administration",
      items: [
        { label: "Admin Users & Roles", href: soon("admins"), icon: "shield" },
        { label: "Activity Logs", href: soon("activity"), icon: "clock" },
        { label: "System Settings", href: soon("settings"), icon: "cog" },
      ],
    },
  ];
}

export const SOON_PAGES: Record<string, string> = Object.fromEntries(
  navGroups(undefined)
    .flatMap((group) => group.items)
    .filter((item) => item.href.startsWith("/admin/soon/"))
    .map((item) => [item.href.slice("/admin/soon/".length), item.label]),
);
