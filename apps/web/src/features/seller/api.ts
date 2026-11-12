"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fileLinkSchema,
  sellerAccountSchema,
  type DocumentType,
  type SellerAccount,
  type SellerProfileInput,
} from "@muhrak/schemas";
import { authedRequest } from "@/features/auth/authed-request";
import { useSession } from "@/features/auth/session";

/**
 * The signed-in seller's company profile and verification. Seller side
 * only: every call goes out with the seller session, never the buyer's.
 */

const SIDE = "seller" as const;

function accountKey(userId: string | undefined) {
  return ["seller", "account", userId] as const;
}

export function useSellerAccount() {
  const session = useSession(SIDE);
  return useQuery({
    queryKey: accountKey(session?.user.id),
    queryFn: () => authedRequest(SIDE, "/v1/seller/profile", sellerAccountSchema),
    enabled: Boolean(session),
    // Logo links are signed for an hour; refresh well before they expire.
    staleTime: 10 * 60_000,
  });
}

/** Every write returns the whole account; put it straight into the cache. */
function useAccountWrite<TInput>(write: (input: TInput) => Promise<SellerAccount>) {
  const session = useSession(SIDE);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: write,
    onSuccess: (account) => queryClient.setQueryData(accountKey(session?.user.id), account),
  });
}

export function useSaveProfile() {
  return useAccountWrite((input: SellerProfileInput) =>
    authedRequest(SIDE, "/v1/seller/profile", sellerAccountSchema, { method: "PUT", body: input }),
  );
}

export function useSubmitDocument() {
  return useAccountWrite((input: { type: DocumentType; uploadId: string; documentNumber: string | null }) =>
    authedRequest(SIDE, `/v1/seller/documents/${encodeURIComponent(input.type)}`, sellerAccountSchema, {
      method: "PUT",
      body: { uploadId: input.uploadId, documentNumber: input.documentNumber },
    }),
  );
}

export function useSubmitForReview() {
  return useAccountWrite(() =>
    authedRequest(SIDE, "/v1/seller/verification/submit", sellerAccountSchema, { method: "POST" }),
  );
}

/** A 5-minute link to view one of the seller's own documents. */
export function getDocumentLink(documentId: string) {
  return authedRequest(SIDE, `/v1/seller/documents/${encodeURIComponent(documentId)}/file`, fileLinkSchema);
}
