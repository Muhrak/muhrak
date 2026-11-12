import {
  authResponseSchema,
  meResponseSchema,
  type AuthResponse,
  type ForgotPasswordInput,
  type LoginInput,
  type PublicUser,
  type RegisterInput,
  type ResetPasswordInput,
} from "@muhrak/schemas";
import { apiRequest, apiRequestNoContent } from "@/lib/api";
import { authedRequest } from "./authed-request";
import type { PortalSide } from "./paths";

export function register(input: RegisterInput): Promise<AuthResponse> {
  return apiRequest("/v1/auth/register", authResponseSchema, { method: "POST", body: input });
}

export function login(input: LoginInput): Promise<AuthResponse> {
  return apiRequest("/v1/auth/login", authResponseSchema, { method: "POST", body: input });
}

/** The signed-in user of `side`, fresh from the API (refreshes the token if needed). */
export async function getMe(side: PortalSide): Promise<PublicUser> {
  const { user } = await authedRequest(side, "/v1/auth/me", meResponseSchema);
  return user;
}

export function logout(refreshToken: string): Promise<void> {
  return apiRequestNoContent("/v1/auth/logout", { method: "POST", body: { refreshToken } });
}

export function forgotPassword(input: ForgotPasswordInput): Promise<void> {
  return apiRequestNoContent("/v1/auth/forgot-password", { method: "POST", body: input });
}

export function resetPassword(input: ResetPasswordInput): Promise<void> {
  return apiRequestNoContent("/v1/auth/reset-password", { method: "POST", body: input });
}
