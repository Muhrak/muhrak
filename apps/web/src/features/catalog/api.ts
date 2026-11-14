"use client";

import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  categoriesResponseSchema,
  productListResponseSchema,
  productResponseSchema,
  type Product,
  type ProductInput,
  type ProductListFilter,
  type ProductStatusAction,
} from "@/schemas";
import { authedRequest } from "@/features/auth/authed-request";
import { apiRequest } from "@/lib/api";
import { useSession } from "@/features/auth/session";

/**
 * The signed-in seller's products. Seller side only: every call goes out
 * with the seller session, never the buyer's.
 */

const SIDE = "seller" as const;

export function useCategories() {
  return useQuery({
    queryKey: ["catalog", "categories"],
    queryFn: async () => (await apiRequest("/v1/catalog/categories", categoriesResponseSchema)).categories,
    staleTime: 30 * 60_000,
  });
}

function productsKey(userId: string | undefined) {
  return ["seller", "products", userId] as const;
}

export function useProductList(filter: ProductListFilter, q: string) {
  const session = useSession(SIDE);
  return useInfiniteQuery({
    queryKey: [...productsKey(session?.user.id), "list", filter, q],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ filter, limit: "20" });
      if (q) params.set("q", q);
      if (pageParam) params.set("cursor", pageParam);
      return authedRequest(SIDE, `/v1/seller/products?${params}`, productListResponseSchema);
    },
    getNextPageParam: (last) => last.nextCursor,
    enabled: Boolean(session),
    placeholderData: keepPreviousData,
  });
}

export function useProduct(id: string) {
  const session = useSession(SIDE);
  return useQuery({
    queryKey: [...productsKey(session?.user.id), "detail", id],
    queryFn: async () => (await authedRequest(SIDE, `/v1/seller/products/${encodeURIComponent(id)}`, productResponseSchema)).product,
    enabled: Boolean(session),
  });
}

/** After any write: store the new product and refresh the lists and counts. */
function useProductWrite<TInput>(write: (input: TInput) => Promise<Product>) {
  const session = useSession(SIDE);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: write,
    onSuccess: (product) => {
      queryClient.setQueryData([...productsKey(session?.user.id), "detail", product.id], product);
      void queryClient.invalidateQueries({ queryKey: [...productsKey(session?.user.id), "list"] });
    },
  });
}

export function useCreateProduct() {
  return useProductWrite(
    async (input: ProductInput) =>
      (await authedRequest(SIDE, "/v1/seller/products", productResponseSchema, { method: "POST", body: input })).product,
  );
}

export function useUpdateProduct(id: string) {
  return useProductWrite(
    async (input: { version: number; product: ProductInput }) =>
      (await authedRequest(SIDE, `/v1/seller/products/${encodeURIComponent(id)}`, productResponseSchema, { method: "PUT", body: input }))
        .product,
  );
}

export function useProductStatus() {
  return useProductWrite(
    async ({ id, action }: { id: string; action: ProductStatusAction }) =>
      (
        await authedRequest(SIDE, `/v1/seller/products/${encodeURIComponent(id)}/status`, productResponseSchema, {
          method: "POST",
          body: { action },
        })
      ).product,
  );
}
