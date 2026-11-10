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

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
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

/** GET /v1/auth/me */
export const meResponseSchema = z.object({
  user: publicUserSchema,
});
export type MeResponse = z.infer<typeof meResponseSchema>;
