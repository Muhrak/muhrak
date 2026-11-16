"use client";

import { useQuery } from "@tanstack/react-query";
import { aiIdentificationResponseSchema, aiStatusResponseSchema, type AiIdentification } from "@/schemas";
import { authedRequest } from "@/features/auth/authed-request";
import { useSession } from "@/features/auth/session";

/**
 * AI part identification, seller side only: every call goes out with the
 * seller session, never the buyer's. The API decides everything (switch,
 * limits, budget); the web app only asks and shows the result.
 */

const SIDE = "seller" as const;

/** Whether to offer "fill in from a photo". Hidden on any error: the manual form always works. */
export function useAiAvailable(enabled: boolean) {
  const session = useSession(SIDE);
  return useQuery({
    queryKey: ["seller", "ai", "status", session?.user.id],
    queryFn: async () => (await authedRequest(SIDE, "/v1/seller/ai/status", aiStatusResponseSchema)).available,
    enabled: enabled && Boolean(session),
    staleTime: 60_000,
    retry: false,
  });
}

const POLL_MS = 1500;
/** Give up waiting after this; the seller fills in the form. */
const WAIT_MS = 75_000;

/**
 * Ask the AI to read a ready photo and wait for the answer. Resolves with
 * the finished identification (done or failed); throws ApiError when AI
 * cannot be used (`ai_unavailable`) or on a network error.
 */
export async function identifyPhoto(uploadId: string, signal: AbortSignal): Promise<AiIdentification> {
  let { identification } = await authedRequest(SIDE, "/v1/seller/ai/identifications", aiIdentificationResponseSchema, {
    method: "POST",
    body: { uploadId },
  });
  const deadline = Date.now() + WAIT_MS;
  while (identification.status === "pending" || identification.status === "running") {
    if (Date.now() > deadline) return { ...identification, status: "failed", suggestion: null };
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    ({ identification } = await authedRequest(
      SIDE,
      `/v1/seller/ai/identifications/${encodeURIComponent(identification.id)}`,
      aiIdentificationResponseSchema,
    ));
  }
  return identification;
}
