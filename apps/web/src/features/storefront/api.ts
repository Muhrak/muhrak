"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  publicSellerResponseSchema,
  sellerDirectoryResponseSchema,
  sellerProductsResponseSchema,
  type SellerDirectoryQuery,
} from "@/schemas";
import { apiRequest } from "@/lib/api";

/** Public storefront data (no sign-in; nothing personal). */

export function useSellerDirectory(query: { q?: string; category?: string; sort: SellerDirectoryQuery["sort"]; page: number }) {
  return useQuery({
    queryKey: ["storefront", "directory", query],
    queryFn: () => {
      const params = new URLSearchParams({ sort: query.sort, page: String(query.page) });
      if (query.q) params.set("q", query.q);
      if (query.category) params.set("category", query.category);
      return apiRequest(`/v1/sellers?${params}`, sellerDirectoryResponseSchema);
    },
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

export function usePublicSeller(id: string) {
  return useQuery({
    queryKey: ["storefront", "seller", id],
    queryFn: async () => (await apiRequest(`/v1/sellers/${encodeURIComponent(id)}`, publicSellerResponseSchema)).seller,
    staleTime: 60_000,
    retry: (count, error) => !(error instanceof Error && "status" in error && (error as { status: number }).status === 404) && count < 1,
  });
}

export function useSellerProducts(id: string, query: { category?: string; page: number }) {
  return useQuery({
    queryKey: ["storefront", "seller-products", id, query],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(query.page) });
      if (query.category) params.set("category", query.category);
      return apiRequest(`/v1/sellers/${encodeURIComponent(id)}/products?${params}`, sellerProductsResponseSchema);
    },
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}
