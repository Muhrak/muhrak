import {
  authResponseSchema,
  meResponseSchema,
  type AuthResponse,
  type LoginInput,
  type PublicUser,
  type RegisterInput,
} from "@muhrak/schemas";
import { apiRequest, apiRequestNoContent } from "@/lib/api";

export function register(input: RegisterInput): Promise<AuthResponse> {
  return apiRequest("/v1/auth/register", authResponseSchema, { method: "POST", body: input });
}

export function login(input: LoginInput): Promise<AuthResponse> {
  return apiRequest("/v1/auth/login", authResponseSchema, { method: "POST", body: input });
}

export async function getMe(accessToken: string): Promise<PublicUser> {
  const { user } = await apiRequest("/v1/auth/me", meResponseSchema, { accessToken });
  return user;
}

export function logout(refreshToken: string): Promise<void> {
  return apiRequestNoContent("/v1/auth/logout", { method: "POST", body: { refreshToken } });
}
