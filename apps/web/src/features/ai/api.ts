"use client";

import { useQuery } from "@tanstack/react-query";
import { aiIdentificationPhotosResponseSchema, aiIdentificationResponseSchema, aiIdentificationSchema, aiStatusResponseSchema, type AiIdentification } from "@/schemas";
import { authedRequest } from "@/features/auth/authed-request";
import type { PortalSide } from "@/features/auth/paths";
import { useSession } from "@/features/auth/session";

/**
 * AI part identification. Sellers use it on Add product (their product
 * photos, /v1/seller/ai); buyers for photo search (their private part
 * photos, /v1/buyer/ai). Every call goes out with the session of the side
 * given, never the other one. The API decides everything (switch, limits,
 * budget); the web app only asks and shows the result.
 */

const BASE: Record<PortalSide, string> = { seller: "/v1/seller/ai", buyer: "/v1/buyer/ai" };

/** Whether to offer AI from a photo. Hidden on any error: the manual route always works. */
export function useAiAvailable(side: PortalSide, enabled: boolean) {
  const session = useSession(side);
  return useQuery({
    queryKey: [side, "ai", "status", session?.user.id],
    queryFn: async () => (await authedRequest(side, `${BASE[side]}/status`, aiStatusResponseSchema)).available,
    enabled: enabled && Boolean(session),
    staleTime: 60_000,
    retry: false,
  });
}

/**
 * Ask the AI to read a ready photo (buyers: up to 3 more photos of the same part, read together).
 * Throws ApiError `ai_unavailable` when AI cannot be used.
 */
export async function startIdentification(side: PortalSide, uploadId: string, moreUploadIds: string[] = []): Promise<AiIdentification> {
  const { identification } = await authedRequest(side, `${BASE[side]}/identifications`, aiIdentificationResponseSchema, {
    method: "POST",
    body: moreUploadIds.length > 0 ? { uploadId, moreUploadIds } : { uploadId },
  });
  return identification;
}

async function fetchIdentification(side: PortalSide, id: string): Promise<AiIdentification> {
  const { identification } = await authedRequest(side, `${BASE[side]}/identifications/${encodeURIComponent(id)}`, aiIdentificationResponseSchema);
  return identification;
}

const POLL_MS = 1500;
/** Give up waiting after this; the user fills in the details (or searches) by hand. */
export const WAIT_MS = 75_000;

/**
 * Seller AI fill: ask and wait for the answer. Resolves with the finished
 * identification (done or failed); throws ApiError when AI cannot be used
 * (`ai_unavailable`) or on a network error.
 */
export async function identifyPhoto(uploadId: string, signal: AbortSignal): Promise<AiIdentification> {
  let identification = await startIdentification("seller", uploadId);
  const deadline = Date.now() + WAIT_MS;
  while (identification.status === "pending" || identification.status === "running") {
    if (Date.now() > deadline) return { ...identification, status: "failed", suggestion: null };
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    identification = await fetchIdentification("seller", identification.id);
  }
  return identification;
}

/**
 * Buyer photo search: one of the buyer's own identifications, asked again
 * every 1.5 s while the AI is still reading. After WAIT_MS it is shown as
 * failed (the buyer edits the details or searches by text).
 */
export function useBuyerIdentification(id: string, enabled = true) {
  const session = useSession("buyer");
  const userId = session?.user.id;
  return useQuery({
    queryKey: ["buyer", "ai", "identification", userId, id],
    queryFn: async () => {
      const identification = await fetchIdentification("buyer", id);
      if (identification.status !== "pending" && identification.status !== "running") {
        if (userId) rememberFinished(userId, identification);
        return identification;
      }
      // Timed from when this browser first asked (not the server's clock, which may differ).
      const since = firstAsked.get(id) ?? Date.now();
      firstAsked.set(id, since);
      return Date.now() - since > WAIT_MS ? { ...identification, status: "failed" as const, suggestion: null } : identification;
    },
    // A finished result (developer report, 19 Nov 2026: Back showed "Identifying" again) is
    // final: shown at once from this tab's memory, and never asked for again.
    initialData: userId && id ? () => recallFinished(userId, id) : undefined,
    staleTime: (query) => (isFinished(query.state.data) ? Infinity : 0),
    gcTime: 60 * 60_000,
    enabled: enabled && Boolean(session),
    retry: false,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "pending" || status === "running" ? POLL_MS : false;
    },
  });
}

function isFinished(identification: AiIdentification | undefined): boolean {
  return identification?.status === "done" || identification?.status === "failed";
}

/**
 * Finished identifications of this tab (sessionStorage: gone when the tab
 * closes, never shared with other tabs or users), so going Back or a phone
 * reloading the page shows the result at once instead of loading again.
 */
const FINISHED_KEY = "muhrak.ai.finished";
const FINISHED_MAX = 20;

function readFinished(): Record<string, AiIdentification> {
  try {
    const raw = sessionStorage.getItem(FINISHED_KEY);
    return raw ? (JSON.parse(raw) as Record<string, AiIdentification>) : {};
  } catch {
    return {};
  }
}

function rememberFinished(userId: string, identification: AiIdentification): void {
  try {
    const all = readFinished();
    all[`${userId}:${identification.id}`] = identification;
    const keys = Object.keys(all);
    for (const key of keys.slice(0, Math.max(0, keys.length - FINISHED_MAX))) delete all[key];
    sessionStorage.setItem(FINISHED_KEY, JSON.stringify(all));
  } catch {
    // Storage blocked or full: the result is simply fetched again next time.
  }
}

function recallFinished(userId: string, id: string): AiIdentification | undefined {
  const saved = readFinished()[`${userId}:${id}`];
  // Only a well-formed finished result of this user is reused; anything else is fetched.
  const parsed = aiIdentificationSchema.safeParse(saved);
  return parsed.success && parsed.data.id === id && isFinished(parsed.data) ? parsed.data : undefined;
}

/** When this browser started waiting for each identification. */
const firstAsked = new Map<string, number>();

/** Short-lived links to the buyer's own (private) photos of a search, in order. Refreshed before they expire. */
export function useBuyerIdentificationPhotos(id: string, enabled = true) {
  const session = useSession("buyer");
  return useQuery({
    queryKey: ["buyer", "ai", "photos", session?.user.id, id],
    queryFn: async () =>
      (await authedRequest("buyer", `${BASE.buyer}/identifications/${encodeURIComponent(id)}/photos`, aiIdentificationPhotosResponseSchema)).photos.map(
        (photo) => photo.url,
      ),
    enabled: enabled && Boolean(session),
    retry: false,
    // The link works 10 minutes; ask for a fresh one after 8.
    staleTime: 8 * 60_000,
    refetchInterval: 8 * 60_000,
  });
}
