import { z } from "zod";

/** Every account has exactly one role. Admins are created by other admins, never by sign-up. */
export const roleSchema = z.enum(["buyer", "seller", "admin"]);
export type Role = z.infer<typeof roleSchema>;

const emailSchema = z.string().trim().toLowerCase().email();
const passwordSchema = z.string().min(10, "Password must be at least 10 characters").max(200);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.string().trim().min(2).max(120),
  role: z.enum(["buyer", "seller"]),
});
export type RegisterInput = z.infer<typeof registerSchema>;

/**
 * `role` is the side the user is logging in on. Buyer and seller are fully
 * separate: an account can only log in on its own side (strict rule).
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
  role: roleSchema,
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(20),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

/** What the API returns about a user. Never includes the password hash. */
export const publicUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  fullName: z.string(),
  role: roleSchema,
  createdAt: z.string(),
});
export type PublicUser = z.infer<typeof publicUserSchema>;

export const authResponseSchema = z.object({
  user: publicUserSchema,
  accessToken: z.string(),
  refreshToken: z.string(),
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

/** POST /v1/auth/forgot-password. Always answers 202, whether or not the email has an account. */
export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/** POST /v1/auth/reset-password. The token comes from the link in the reset email. */
export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** GET /v1/auth/me */
export const meResponseSchema = z.object({
  user: publicUserSchema,
});
export type MeResponse = z.infer<typeof meResponseSchema>;
