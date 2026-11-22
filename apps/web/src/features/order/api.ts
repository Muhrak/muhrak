"use client";

import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  lastDeliveryResponseSchema,
  orderListResponseSchema,
  orderResponseSchema,
  payStartResponseSchema,
  type OrderCreateInput,
  type TestPaymentComplete,
} from "@/schemas";
import { authedRequest } from "@/features/auth/authed-request";
import type { PortalSide } from "@/features/auth/paths";
import { useSession } from "@/features/auth/session";

/**
 * Orders and payments (Day 12). STRICT RULE: every call goes out with the
 * session of the side named (buyer or seller), never the other one; query
 * keys carry the side and the user id. The server decides every amount and
 * checks the caller owns the order.
 */

export function ordersKey(side: PortalSide, userId: string | undefined) {
  return [side, "orders", userId] as const;
}

export function useOrders(side: PortalSide) {
  const session = useSession(side);
  return useInfiniteQuery({
    queryKey: [...ordersKey(side, session?.user.id), "list"],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: "20" });
      if (pageParam) params.set("cursor", pageParam);
      return authedRequest(side, `/v1/${side}/orders?${params}`, orderListResponseSchema);
    },
    getNextPageParam: (last) => last.nextCursor,
    enabled: Boolean(session),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
}

/** One order. `checking`: poll every 2 s while waiting for the gateway's confirmation. */
export function useOrder(side: PortalSide, id: string | null, options: { checking?: boolean } = {}) {
  const session = useSession(side);
  return useQuery({
    queryKey: [...ordersKey(side, session?.user.id), "detail", id],
    queryFn: async () => (await authedRequest(side, `/v1/${side}/orders/${encodeURIComponent(id!)}`, orderResponseSchema)).order,
    enabled: Boolean(session && id),
    retry: false,
    refetchInterval: (query) => (options.checking && query.state.data?.status === "awaiting_payment" ? 2000 : false),
  });
}

/** Buyer: the address of their last order, to fill in the next one. */
export function useLastDelivery() {
  const session = useSession("buyer");
  return useQuery({
    queryKey: [...ordersKey("buyer", session?.user.id), "last-delivery"],
    queryFn: async () => (await authedRequest("buyer", "/v1/buyer/orders/last-delivery", lastDeliveryResponseSchema)).delivery,
    enabled: Boolean(session),
    staleTime: Infinity,
  });
}

function useInvalidateBuyer() {
  const session = useSession("buyer");
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ordersKey("buyer", session?.user.id) });
    void queryClient.invalidateQueries({ queryKey: ["buyer", "quotes", session?.user.id] });
  };
}

/** Buyer: confirm a quotation as an order. */
export function useCreateOrder() {
  const invalidate = useInvalidateBuyer();
  return useMutation({
    mutationFn: async (input: OrderCreateInput) => (await authedRequest("buyer", "/v1/buyer/orders", orderResponseSchema, { method: "POST", body: input })).order,
    onSettled: invalidate,
  });
}

/** Buyer: cancel before paying. */
export function useCancelOrder() {
  const invalidate = useInvalidateBuyer();
  return useMutation({
    mutationFn: async (id: string) => (await authedRequest("buyer", `/v1/buyer/orders/${encodeURIComponent(id)}/cancel`, orderResponseSchema, { method: "POST" })).order,
    onSettled: invalidate,
  });
}

/** Buyer: open the gateway's checkout for an order. The caller sends the browser to `checkoutUrl`. */
export function startPayment(orderId: string) {
  return authedRequest("buyer", `/v1/buyer/orders/${encodeURIComponent(orderId)}/pay`, payStartResponseSchema, { method: "POST" });
}

/** Buyer, TEST gateway only: finish a test payment (the API sends a signed webhook through the normal path). */
export function completeTestPayment(paymentId: string, outcome: TestPaymentComplete["outcome"]) {
  return authedRequest("buyer", `/v1/buyer/payments/${encodeURIComponent(paymentId)}/test-complete`, z.object({ outcome: z.string() }), {
    method: "POST",
    body: { outcome },
  });
}
