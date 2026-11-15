"use client";

import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  buyerRfqListResponseSchema,
  buyerRfqResponseSchema,
  sellerRfqListResponseSchema,
  sellerRfqResponseSchema,
  type RfqCreateInput,
  type RfqListFilter,
} from "@/schemas";
import { authedRequest } from "@/features/auth/authed-request";
import { useSession } from "@/features/auth/session";

/**
 * Quote requests. STRICT RULE: buyer hooks use only the buyer session and
 * buyer endpoints; seller hooks only the seller session and seller
 * endpoints. Query keys carry the side and user id, so one side's data is
 * never shown on the other.
 */

// ---------------------------------------------------------------- buyer

const BUYER = "buyer" as const;

function buyerKey(userId: string | undefined) {
  return ["buyer", "rfqs", userId] as const;
}

export function useBuyerRfqs(filter: RfqListFilter) {
  const session = useSession(BUYER);
  return useInfiniteQuery({
    queryKey: [...buyerKey(session?.user.id), "list", filter],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ filter, limit: "20" });
      if (pageParam) params.set("cursor", pageParam);
      return authedRequest(BUYER, `/v1/buyer/rfqs?${params}`, buyerRfqListResponseSchema);
    },
    getNextPageParam: (last) => last.nextCursor,
    enabled: Boolean(session),
    placeholderData: keepPreviousData,
  });
}

export function useBuyerRfq(id: string | null) {
  const session = useSession(BUYER);
  return useQuery({
    queryKey: [...buyerKey(session?.user.id), "detail", id],
    queryFn: async () => (await authedRequest(BUYER, `/v1/buyer/rfqs/${encodeURIComponent(id!)}`, buyerRfqResponseSchema)).rfq,
    enabled: Boolean(session && id),
  });
}

export function useCreateRfq() {
  const session = useSession(BUYER);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RfqCreateInput) => (await authedRequest(BUYER, "/v1/buyer/rfqs", buyerRfqResponseSchema, { method: "POST", body: input })).rfq,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: buyerKey(session?.user.id) }),
  });
}

export function useCancelRfq() {
  const session = useSession(BUYER);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await authedRequest(BUYER, `/v1/buyer/rfqs/${encodeURIComponent(id)}/cancel`, buyerRfqResponseSchema, { method: "POST" })).rfq,
    onSettled: () => void queryClient.invalidateQueries({ queryKey: buyerKey(session?.user.id) }),
  });
}

// ---------------------------------------------------------------- seller

const SELLER = "seller" as const;

function sellerKey(userId: string | undefined) {
  return ["seller", "rfqs", userId] as const;
}

export function useSellerRfqs(filter: RfqListFilter) {
  const session = useSession(SELLER);
  return useInfiniteQuery({
    queryKey: [...sellerKey(session?.user.id), "list", filter],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ filter, limit: "20" });
      if (pageParam) params.set("cursor", pageParam);
      return authedRequest(SELLER, `/v1/seller/rfqs?${params}`, sellerRfqListResponseSchema);
    },
    getNextPageParam: (last) => last.nextCursor,
    enabled: Boolean(session),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
}

/** Unread requests, for the sidebar badge (first page of the list carries the count). */
export function useSellerUnseenRfqs(): number {
  const session = useSession(SELLER);
  const query = useQuery({
    queryKey: [...sellerKey(session?.user.id), "unseen"],
    queryFn: async () => (await authedRequest(SELLER, "/v1/seller/rfqs?filter=open&limit=1", sellerRfqListResponseSchema)).unseen,
    enabled: Boolean(session),
    refetchInterval: 60_000,
  });
  return query.data ?? 0;
}

/** Opening a request marks it seen on the server, so the lists and badge refresh afterwards. */
export function useSellerRfq(id: string | null) {
  const session = useSession(SELLER);
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: [...sellerKey(session?.user.id), "detail", id],
    queryFn: async () => {
      const rfq = (await authedRequest(SELLER, `/v1/seller/rfqs/${encodeURIComponent(id!)}`, sellerRfqResponseSchema)).rfq;
      void queryClient.invalidateQueries({ queryKey: [...sellerKey(session?.user.id), "list"] });
      void queryClient.invalidateQueries({ queryKey: [...sellerKey(session?.user.id), "unseen"] });
      return rfq;
    },
    enabled: Boolean(session && id),
  });
}

export function useDeclineRfq() {
  const session = useSession(SELLER);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string | null }) =>
      (await authedRequest(SELLER, `/v1/seller/rfqs/${encodeURIComponent(id)}/decline`, sellerRfqResponseSchema, { method: "POST", body: { reason } })).rfq,
    onSettled: () => void queryClient.invalidateQueries({ queryKey: sellerKey(session?.user.id) }),
  });
}
