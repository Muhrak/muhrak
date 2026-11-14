import {
  authResponseSchema,
  meResponseSchema,
  verifyEmailResponseSchema,
  type AuthResponse,
  type ForgotPasswordInput,
  type LoginInput,
  type PublicUser,
  type RegisterInput,
  type ResetPasswordInput,
  type VerifyEmailResponse,
} from "@/schemas";
import { apiRequest, apiRequestNoContent } from "@/lib/api";
import { authedRequest } from "./authed-request";
import type { AuthSide } from "./paths";

/**
 * Sign up. 202 with no body: the account cannot sign in until its email is
 * verified, and the answer is the same if the email already has an account.
 */
export function register(input: RegisterInput): Promise<void> {
  return apiRequestNoContent("/v1/auth/register", { method: "POST", body: input });
}

/** Open the link from the verification email. Returns the account's side; does not sign in. */
export function verifyEmail(token: string): Promise<VerifyEmailResponse> {
  return apiRequest("/v1/auth/verify-email", verifyEmailResponseSchema, { method: "POST", body: { token } });
}

/** Ask for a new verification link. Always 202, whether or not the email has an account. */
export function resendVerification(email: string): Promise<void> {
  return apiRequestNoContent("/v1/auth/resend-verification", { method: "POST", body: { email } });
}

export function login(input: LoginInput): Promise<AuthResponse> {
  return apiRequest("/v1/auth/login", authResponseSchema, { method: "POST", body: input });
}

/** The signed-in user of `side`, fresh from the API (refreshes the token if needed). */
export async function getMe(side: AuthSide): Promise<PublicUser> {
  const { user } = await authedRequest(side, "/v1/auth/me", meResponseSchema);
  return user;
}

/** Revoke this side's refresh token on the server and clear its cookie. */
export function logout(side: AuthSide): Promise<void> {
  return apiRequestNoContent("/v1/auth/logout", { method: "POST", body: { role: side } });
}

export function forgotPassword(input: ForgotPasswordInput): Promise<void> {
  return apiRequestNoContent("/v1/auth/forgot-password", { method: "POST", body: input });
}

export function resetPassword(input: ResetPasswordInput): Promise<void> {
  return apiRequestNoContent("/v1/auth/reset-password", { method: "POST", body: input });
}
