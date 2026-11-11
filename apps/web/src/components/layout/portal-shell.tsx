"use client";

import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { HOME_PATH, type PortalSide } from "@/features/auth/paths";
import { PortalSidebar } from "./portal-sidebar";

/**
 * Buyer / Seller Centre frame: 256 px sidebar on the left, page on the
 * light grey surface. Below `lg` the sidebar becomes a slide-in drawer
 * opened from a top bar.
 */
export function PortalShell({ side, children }: { side: PortalSide; children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Sidebar links close the drawer themselves (onNavigate); Escape closes it too.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setDrawerOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <div className="flex min-h-dvh flex-1 bg-surface font-portal text-text-strong">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 lg:block">
        <PortalSidebar side={side} />
      </aside>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 max-w-[85vw] shadow-xl">
            <PortalSidebar side={side} onNavigate={() => setDrawerOpen(false)} />
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

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between bg-sidebar-bg px-4 lg:hidden">
          <Link href={HOME_PATH[side]} aria-label="Muhrak home" className="flex">
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
        <main className="flex flex-1 flex-col gap-5 px-4 pt-6 pb-7 sm:px-6 lg:px-10 lg:pt-[30px]">{children}</main>
      </div>
    </div>
  );
}

/** Full-page placeholder while the session is checked (no flash of a protected page). */
export function PortalLoading() {
  return (
    <div className="flex min-h-dvh flex-1 items-center justify-center bg-surface font-portal text-sm text-text-muted" role="status">
      Loading…
    </div>
  );
}
