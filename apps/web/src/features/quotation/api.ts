"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { quoteListResponseSchema, quoteResponseSchema, type QuoteCreateInput } from "@/schemas";
import { authedFile, authedRequest } from "@/features/auth/authed-request";
import type { PortalSide } from "@/features/auth/paths";
import { useSession } from "@/features/auth/session";

/**
 * Quotations (Day 11). STRICT RULE: every call goes out with the session of
 * the side named (buyer or seller), never the other one; query keys carry
 * the side and the user id. The server checks the caller owns the request.
 */

function quotesKey(side: PortalSide, userId: string | undefined) {
  return [side, "quotes", userId] as const;
}

/** The quotations of one request, newest first (a request has at most 20). */
export function useRfqQuotes(side: PortalSide, rfqId: string | null) {
  const session = useSession(side);
  return useQuery({
    queryKey: [...quotesKey(side, session?.user.id), "rfq", rfqId],
    queryFn: async () =>
      (await authedRequest(side, `/v1/${side}/quotes?${new URLSearchParams({ rfqId: rfqId!, limit: "20" })}`, quoteListResponseSchema)).items,
    enabled: Boolean(session && rfqId),
  });
}

/** One quotation (the chat card). */
export function useQuote(side: PortalSide, id: string) {
  const session = useSession(side);
  return useQuery({
    queryKey: [...quotesKey(side, session?.user.id), "one", id],
    queryFn: async () => (await authedRequest(side, `/v1/${side}/quotes/${encodeURIComponent(id)}`, quoteResponseSchema)).quote,
    enabled: Boolean(session && id),
    retry: false,
  });
}

/** Seller: send a quotation. Refreshes the seller's quotations and quote requests. */
export function useSendQuote() {
  const session = useSession("seller");
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: QuoteCreateInput) =>
      (await authedRequest("seller", "/v1/seller/quotes", quoteResponseSchema, { method: "POST", body: input })).quote,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: quotesKey("seller", session?.user.id) });
      void queryClient.invalidateQueries({ queryKey: ["seller", "rfqs", session?.user.id] });
    },
  });
}

/** Seller: withdraw an active quotation. */
export function useWithdrawQuote() {
  const session = useSession("seller");
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await authedRequest("seller", `/v1/seller/quotes/${encodeURIComponent(id)}/withdraw`, quoteResponseSchema, { method: "POST" })).quote,
    onSettled: () => void queryClient.invalidateQueries({ queryKey: quotesKey("seller", session?.user.id) }),
  });
}

/** Save the quotation PDF (made by the API from the saved quotation). */
export async function downloadQuotePdf(side: PortalSide, quote: { id: string; reference: string }): Promise<void> {
  const { blob, filename } = await authedFile(side, `/v1/${side}/quotes/${encodeURIComponent(quote.id)}/pdf`);
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename ?? `Muhrak-Quotation-${quote.reference}.pdf`;
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    // Give the browser a moment to start the download before the link is freed.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
