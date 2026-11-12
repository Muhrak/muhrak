import { authResponseSchema, type AuthResponse } from "@muhrak/schemas";
import type { ZodType } from "zod";
import { ApiError, apiRequest, apiRequestNoContent, type RequestOptions } from "@/lib/api";
import { clearSession, currentAccessToken, refreshAccessToken } from "./session";

export function login(input: { email: string; password: string }): Promise<AuthResponse> {
  return apiRequest("/v1/auth/login", authResponseSchema, { method: "POST", body: { ...input, role: "admin" } });
}

export async function logout(): Promise<void> {
  clearSession();
  await apiRequestNoContent("/v1/auth/logout", { method: "POST", body: { role: "admin" } }).catch(() => undefined);
}

/** A request as the signed-in admin: refreshes the token when needed and retries once after a 401. */
export async function adminRequest<T>(path: string, schema: ZodType<T>, options: Omit<RequestOptions, "accessToken"> = {}): Promise<T> {
  const token = await currentAccessToken();
  try {
    return await apiRequest(path, schema, { ...options, accessToken: token });
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    const renewed = await refreshAccessToken(true);
    if (!renewed) throw new ApiError(401, "unauthorized", "Your session has ended. Please log in again.");
    return apiRequest(path, schema, { ...options, accessToken: renewed });
  }
}
