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
// POST /v1/auth/register answers 202 with no body, whether or not the email
// already has an account (no enumeration). The new account cannot sign in
// until the 6-digit code from the verification email is entered.

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

/**
 * POST /v1/auth/refresh and /v1/auth/logout. The refresh token itself is in
 * an httpOnly cookie for that side (scripts cannot read it); the body only
 * says which side's session to use.
 */
export const sessionSideSchema = z.object({
  role: roleSchema,
});
export type SessionSideInput = z.infer<typeof sessionSideSchema>;

/** What the API returns about a user. Never includes the password hash. */
export const publicUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  fullName: z.string(),
  role: roleSchema,
  createdAt: z.string(),
});
export type PublicUser = z.infer<typeof publicUserSchema>;

/**
 * Register, login and refresh. The short-lived access token is kept in
 * memory by the client; the refresh token never appears in a body (it is
 * set as an httpOnly cookie).
 */
export const authResponseSchema = z.object({
  user: publicUserSchema,
  accessToken: z.string(),
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

/** The 6-digit code from the verification email. */
export const emailCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit code from the email");

/**
 * POST /v1/auth/verify-email. A correct code verifies the email and signs
 * the user in on `role`'s side (answers like login: user + access token,
 * refresh token in the cookie).
 */
export const verifyEmailCodeSchema = z.object({
  email: emailSchema,
  code: emailCodeSchema,
  role: z.enum(["buyer", "seller"]),
});
export type VerifyEmailCodeInput = z.infer<typeof verifyEmailCodeSchema>;

/** POST /v1/auth/resend-verification: a new code. Always answers 202, whether or not the email has an account. */
export const resendVerificationSchema = z.object({
  email: emailSchema,
});
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;

/** Error code of a login refused because the email is not verified yet (403). */
export const EMAIL_NOT_VERIFIED = "email_not_verified";

/** GET /v1/auth/me */
export const meResponseSchema = z.object({
  user: publicUserSchema,
});
export type MeResponse = z.infer<typeof meResponseSchema>;
