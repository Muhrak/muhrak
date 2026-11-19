"use client";

import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useSignOut } from "@/features/auth/hooks";
import { LANDING_PATH } from "@/features/auth/paths";
import { cn } from "@/lib/utils";
import { Icon, type IconName } from "./icon";
import { PortalSidebar } from "./portal-sidebar";

/**
 * Buyer Centre frame (developer reference "dashboard buyer muhrak", 19 Nov
 * 2026): a dark icon rail and the page on a rounded light panel inside the
 * dark frame. Muhrak colours instead of the reference's. Pages not built
 * yet open the "coming soon" screen. Below `lg` the rail becomes a top bar
 * with the labelled menu in a drawer.
 */

const RAIL: { label: string; slug: string; icon: IconName }[] = [
  { label: "Dashboard", slug: "dashboard", icon: "grid" },
  { label: "Messenger", slug: "messages", icon: "message" },
  { label: "Inquiries & RFQs", slug: "requests", icon: "list" },
  { label: "Orders", slug: "orders", icon: "box" },
  { label: "Payments", slug: "payments", icon: "credit-card" },
  { label: "Saved & history", slug: "saved", icon: "clock" },
  { label: "Settings", slug: "settings", icon: "cog" },
];

export function BuyerFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const signOut = useSignOut("buyer");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isActive = (slug: string) => pathname === `/buyer/${slug}` || pathname.startsWith(`/buyer/${slug}/`);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <div data-side="buyer" className="flex min-h-dvh flex-1 flex-col bg-ink font-portal text-text-strong lg:flex-row">
      {/* Icon rail (laptop and desktop). */}
      <nav aria-label="Buyer Centre" className="sticky top-0 hidden h-dvh w-[92px] shrink-0 flex-col items-center py-8 lg:flex">
        <Link
          href={LANDING_PATH.buyer}
          aria-label="Muhrak home"
          className="flex size-11 items-center justify-center rounded-[14px] outline-none focus-visible:ring-3 focus-visible:ring-white/40"
        >
          <Image src="/ai/muhrak-mark.svg" alt="" width={35} height={29.86} className="invert" priority />
        </Link>
        <ul className="mt-16 flex flex-col gap-3">
          {RAIL.map((item) => {
            const active = isActive(item.slug);
            return (
              <li key={item.slug} className="relative">
                {active ? <span aria-hidden className="absolute top-1/2 -left-[24px] h-5 w-[7px] -translate-y-1/2 rounded-r-full bg-white" /> : null}
                <Link
                  href={`/buyer/${item.slug}`}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex size-11 items-center justify-center rounded-[14px] outline-none transition-colors focus-visible:ring-3 focus-visible:ring-white/40",
                    active ? "text-white" : "text-white/40 hover:bg-white/6 hover:text-white/80",
                  )}
                >
                  <Icon name={item.icon} className="size-[22px]" />
                  <RailTip>{item.label}</RailTip>
                </Link>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={() => void signOut()}
          aria-label="Log out"
          className="group relative mt-auto flex size-11 items-center justify-center rounded-[14px] text-white/85 outline-none transition-colors hover:bg-white/6 hover:text-white focus-visible:ring-3 focus-visible:ring-white/40"
        >
          <Icon name="log-out" className="size-[22px]" />
          <RailTip>Log out</RailTip>
        </button>
      </nav>

      {/* Top bar (phones and tablets). */}
      <header className="flex h-14 items-center justify-between px-4 lg:hidden">
        <Link href={LANDING_PATH.buyer} aria-label="Muhrak home" className="flex">
          <Image src="/portal/muhrak-logo-white.svg" alt="Muhrak" width={120} height={22.9} />
        </Link>
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
          className="flex size-10 items-center justify-center rounded-full text-white outline-none hover:bg-white/10 focus-visible:ring-3 focus-visible:ring-white/40"
        >
          <Menu aria-hidden className="size-5" />
        </button>
      </header>
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 max-w-[85vw] shadow-xl">
            <PortalSidebar side="buyer" onNavigate={() => setDrawerOpen(false)} />
          </div>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute top-4 right-4 flex size-10 items-center justify-center rounded-full bg-white text-text-strong"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
      ) : null}

      {/* The light panel. */}
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-t-[28px] bg-surface lg:my-4 lg:mr-4 lg:rounded-[36px]">
        <PanelLines />
        <main
          className={cn(
            "relative flex flex-1 flex-col gap-5 px-4 pt-6 pb-7 sm:px-6 lg:px-10 lg:pt-[30px]",
            // Everything at 85% on laptops and desktops (developer request, 16 Nov 2026).
            // No pop-up dialogs in Centre pages: a zoomed parent misplaces them.
            "lg:[zoom:0.85]",
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

/** The label next to a rail icon, on hover and keyboard focus. */
function RailTip({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute top-1/2 left-[calc(100%+14px)] z-10 -translate-y-1/2 rounded-full bg-white px-3 py-1.5 text-[13px] font-medium whitespace-nowrap text-ink opacity-0 shadow-[0_8px_24px_rgba(10,11,18,0.18)] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
    >
      {children}
    </span>
  );
}

/** Faint curved lines across the panel, as in the reference. */
function PanelLines() {
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 size-full text-black/[0.05]" preserveAspectRatio="none" viewBox="0 0 1000 700" fill="none">
      <path d="M380 0 C 460 120, 620 160, 760 120 S 960 60, 1000 140" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      <path d="M0 520 C 180 470, 300 600, 520 560 S 820 420, 1000 470" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      <path d="M640 700 C 700 560, 860 520, 1000 600" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
