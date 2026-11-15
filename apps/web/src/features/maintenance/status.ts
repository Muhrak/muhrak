"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { siteStatusSchema, type MaintenanceScope } from "@/schemas";
import { useEffect } from "react";
import { apiRequest, MAINTENANCE_EVENT } from "@/lib/api";

export const SITE_STATUS_KEY = ["site-status"] as const;

/**
 * GET /v1/status, re-checked every minute, when the tab comes back, and at
 * once when any API call answers 503 `maintenance`. If the status cannot
 * be read, the site carries on as normal (the API still refuses requests
 * during maintenance; this only decides what the page shows).
 */
export function useSiteStatus() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const recheck = () => void queryClient.invalidateQueries({ queryKey: SITE_STATUS_KEY });
    window.addEventListener(MAINTENANCE_EVENT, recheck);
    return () => window.removeEventListener(MAINTENANCE_EVENT, recheck);
  }, [queryClient]);

  return useQuery({
    queryKey: SITE_STATUS_KEY,
    queryFn: () => apiRequest("/v1/status", siteStatusSchema),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
    staleTime: 15_000,
  });
}

/** Which side of the site a page belongs to. The admin console is never taken offline. */
export type SiteSide = "buyer" | "seller" | "admin";

export function sideOfPath(pathname: string): SiteSide {
  const under = (prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);
  if (under("/admin")) return "admin";
  if (under("/seller") || under("/sell")) return "seller";
  return "buyer";
}

export function scopeCoversSide(scope: MaintenanceScope, side: SiteSide): boolean {
  if (side === "admin") return false;
  return scope === "whole_site" || scope === side;
}
