"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { partSearchResponseSchema } from "@/schemas";
import { apiRequest } from "@/lib/api";

/** Public part search (no sign-in; nothing personal). */
export function usePartSearch(query: { q: string; page: number }) {
  return useQuery({
    queryKey: ["search", "parts", query],
    queryFn: () => apiRequest(`/v1/parts?${new URLSearchParams({ q: query.q, page: String(query.page) })}`, partSearchResponseSchema),
    enabled: query.q.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}
