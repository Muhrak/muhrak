"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { partSearchResponseSchema } from "@/schemas";
import { apiRequest } from "@/lib/api";

/**
 * Public part search (no sign-in; nothing personal). `q` alone is the
 * search box; photo search also sends the part number, machine and category
 * read from the photo (and edited by the buyer), each matched as itself.
 */
export interface PartSearchParams {
  q: string;
  partNumber?: string;
  machine?: string;
  category?: string;
  page: number;
}

/** Whether there is anything to search for (the API's own rule: 2+ characters somewhere). */
export function canSearch(query: PartSearchParams): boolean {
  return [query.q, query.partNumber, query.machine].some((value) => (value?.trim().length ?? 0) >= 2);
}

export function usePartSearch(query: PartSearchParams, enabled = true) {
  return useQuery({
    queryKey: ["search", "parts", query],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(query.page) });
      if (query.q.trim()) params.set("q", query.q.trim());
      if (query.partNumber?.trim()) params.set("partNumber", query.partNumber.trim());
      if (query.machine?.trim()) params.set("machine", query.machine.trim());
      if (query.category) params.set("category", query.category);
      return apiRequest(`/v1/parts?${params}`, partSearchResponseSchema);
    },
    enabled: enabled && canSearch(query),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}
