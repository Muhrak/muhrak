"use client";

import { MAINTENANCE_SCOPE_LABELS } from "@/schemas";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { MaintenanceScreen } from "./screen";
import { scopeCoversSide, sideOfPath, useSiteStatus } from "./status";
import { formatGulfRange } from "./time";

/** The root layout wraps every page in an element with this id (see app/layout.tsx). */
export const SITE_CONTENT_ID = "site-content";

/**
 * Sits next to every page (root layout, in its own Suspense so pages stay
 * prerendered). While maintenance covers the side of the page being viewed
 * (buyer site, Seller Centre, or the whole site), covers the page with the
 * maintenance screen and makes the page underneath unreachable (`inert`:
 * no focus, no clicks, hidden from screen readers). Within 24 hours of a
 * scheduled window, shows a warning bar pinned to the bottom. The admin console
 * (/admin) is never covered.
 *
 * This is only what the page shows: the API itself refuses the requests
 * (503) during maintenance, so removing this component changes nothing.
 * Sessions are kept: a 503 never signs anyone out (features/auth).
 */
export function MaintenanceOverlay() {
  const side = sideOfPath(usePathname() ?? "/");
  const status = useSiteStatus();
  const active = status.data?.maintenance;
  const blocking = !!active && scopeCoversSide(active.scope, side);

  useEffect(() => {
    if (!blocking) return;
    const content = document.getElementById(SITE_CONTENT_ID);
    content?.setAttribute("inert", "");
    const root = document.documentElement;
    const previous = [root.style.overflow, document.body.style.overflow];
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      content?.removeAttribute("inert");
      [root.style.overflow, document.body.style.overflow] = previous;
    };
  }, [blocking]);

  if (blocking) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col overflow-y-auto">
        <MaintenanceScreen message={active.message} endsAt={active.endsAt} tone={side === "seller" ? "seller" : "buyer"} />
      </div>
    );
  }

  const upcoming = status.data?.upcoming;
  if (upcoming && scopeCoversSide(upcoming.scope, side)) {
    return (
      <div
        role="status"
        // Sticky, last in the page: stays in view while scrolling, and at the end sits below the content instead of over it.
        className="sticky bottom-0 z-[90] bg-text-strong px-4 py-2.5 text-center font-portal text-[13px] leading-[1.4] text-white"
      >
        <span className="font-medium">
          Planned maintenance{upcoming.scope === "whole_site" ? "" : ` (${MAINTENANCE_SCOPE_LABELS[upcoming.scope]})`}:{" "}
          {formatGulfRange(upcoming.startsAt, upcoming.endsAt)} Gulf time.
        </span>{" "}
        <span className="break-words text-white/80">{upcoming.message}</span>
      </div>
    );
  }
  return null;
}
