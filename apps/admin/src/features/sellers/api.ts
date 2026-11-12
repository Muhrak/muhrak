"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adminSellerDetailSchema,
  adminSellerListSchema,
  fileLinkSchema,
  type ReviewSellerInput,
  type VerificationStatus,
} from "@muhrak/schemas";
import { adminRequest } from "@/features/auth/api";

export function useSellerList(status: VerificationStatus | undefined, pageSize = 20) {
  return useInfiniteQuery({
    queryKey: ["admin", "sellers", "list", status ?? "all", pageSize],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(pageSize) });
      if (status) params.set("status", status);
      if (pageParam) params.set("cursor", pageParam);
      return adminRequest(`/v1/admin/sellers?${params}`, adminSellerListSchema);
    },
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useSellerDetail(userId: string) {
  return useQuery({
    queryKey: ["admin", "sellers", "detail", userId],
    queryFn: () => adminRequest(`/v1/admin/sellers/${encodeURIComponent(userId)}`, adminSellerDetailSchema),
  });
}

export function useReviewSeller(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReviewSellerInput) =>
      adminRequest(`/v1/admin/sellers/${encodeURIComponent(userId)}/review`, adminSellerDetailSchema, { method: "POST", body: input }),
    onSuccess: (detail) => {
      queryClient.setQueryData(["admin", "sellers", "detail", userId], detail);
      // Lists and counts changed too.
      void queryClient.invalidateQueries({ queryKey: ["admin", "sellers"], predicate: (query) => query.queryKey[2] !== "detail" });
    },
  });
}

/** A 5-minute link to one document. The API audit logs every request. */
export function getDocumentLink(userId: string, documentId: string) {
  return adminRequest(
    `/v1/admin/sellers/${encodeURIComponent(userId)}/documents/${encodeURIComponent(documentId)}/file`,
    fileLinkSchema,
  );
}
