import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { Role } from "../../schemas";
import { env } from "../../config/env";

const secret = new TextEncoder().encode(env.JWT_SECRET);
const ISSUER = "muhrak-api";

export interface AccessTokenClaims {
  userId: string;
  role: Role;
}

/** Short-lived token sent on every request in the Authorization header. */
export async function signAccessToken(claims: AccessTokenClaims): Promise<string> {
  return new SignJWT({ role: claims.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_MINUTES}m`)
    .sign(secret);
}

/** Returns the claims, or null if the token is missing, expired or forged. */
export async function verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: ISSUER,
      algorithms: ["HS256"],
    });
    const role = payload.role;
    if (!payload.sub || (role !== "buyer" && role !== "seller" && role !== "admin")) {
      return null;
    }
    return { userId: payload.sub, role };
  } catch {
    return null;
  }
}

/**
 * Long-lived token used only to get a new access token. It is a random
 * string, not a JWT: the database decides whether it is still valid.
 */
export function generateRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Random one-time token for links sent by email (password reset). Stored only as a hash. */
export function generateOneTimeToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOneTimeToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A 6-digit email verification code, from the crypto random generator. */
export function generateEmailCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Codes are short, so a plain hash could be reversed by trying all million.
 * Stored instead as an HMAC with a server-side key (derived from
 * JWT_SECRET), bound to the user: a leaked database row is useless without
 * the key, and a code works only for its own account.
 */
const emailCodeKey = createHash("sha256").update(`muhrak-email-code:${env.JWT_SECRET}`).digest();

export function hashEmailCode(userId: string, code: string): string {
  return createHmac("sha256", emailCodeKey).update(`${userId}:${code}`).digest("hex");
}

/** Constant-time comparison of two hex hashes. */
export function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function refreshTokenExpiry(now = new Date()): Date {
  return new Date(now.getTime() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}
