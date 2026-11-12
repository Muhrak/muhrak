import type { LoginInput, PublicUser, RegisterInput, ResetPasswordInput, Role } from "@muhrak/schemas";
import { env } from "../../config/env";
import type { UserRow } from "../../db/schema";
import { badRequest, conflict, forbidden, notFound, unauthorized } from "../../shared/errors";
import { logger } from "../../shared/logger";
import { hit, peek, reset, subjectHash, tooManyRequests, type Limit } from "../../shared/rate-limit";
import { sendPasswordResetEmail } from "../notification";
import * as repo from "./auth.repository";
import { hashPassword, verifyPassword } from "./password";
import {
  generateOneTimeToken,
  generateRefreshToken,
  hashOneTimeToken,
  hashRefreshToken,
  refreshTokenExpiry,
  signAccessToken,
} from "./tokens";

/**
 * Service layer: the business rules of the auth module.
 * It knows nothing about HTTP (no req/res) and writes no SQL.
 */

function toPublicUser(user: UserRow): PublicUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

/**
 * A new session. The routes layer puts `refreshToken` in an httpOnly cookie
 * and sends only `user` and `accessToken` in the body, so page scripts never
 * see the refresh token.
 */
export interface IssuedSession {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

async function issueTokens(user: UserRow): Promise<IssuedSession> {
  const refreshToken = generateRefreshToken();
  const refreshExpiresAt = refreshTokenExpiry();
  await repo.insertRefreshToken({
    userId: user.id,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: refreshExpiresAt,
  });
  const accessToken = await signAccessToken({ userId: user.id, role: user.role });
  return { user: toPublicUser(user), accessToken, refreshToken, refreshExpiresAt };
}

export async function register(input: RegisterInput): Promise<IssuedSession> {
  const existing = await repo.findUserByEmail(input.email);
  if (existing) {
    throw conflict("An account with this email already exists");
  }
  const user = await repo.insertUser({
    email: input.email,
    passwordHash: await hashPassword(input.password),
    fullName: input.fullName,
    role: input.role,
  });
  return issueTokens(user);
}

/**
 * Failed-login limits (password guessing). Counted per email from one IP
 * (tight), and per email from anywhere (looser, so an attacker spreading
 * guesses over many IPs is still stopped without letting one stranger lock
 * a user out for long). Emails are hashed before they become Redis keys.
 */
export const LOGIN_FAILURE_LIMITS = {
  emailAndIp: { name: "login-fail:email-ip", max: 5, windowMs: 15 * 60_000 },
  email: { name: "login-fail:email", max: 20, windowMs: 60 * 60_000 },
} satisfies Record<string, Limit>;

const LOCKED_MESSAGE = "Too many failed attempts. Wait a few minutes, or reset your password.";

/** Checked for unknown emails too, so the response time does not reveal whether an account exists. */
const DUMMY_PASSWORD_HASH = ["scrypt", "00".repeat(16), "00".repeat(64)].join("$");

export async function login(input: LoginInput, clientIp: string): Promise<IssuedSession> {
  const emailKey = subjectHash(input.email);
  const pairKey = `${emailKey}:${clientIp}`;
  const checks: [Limit, string][] = [
    [LOGIN_FAILURE_LIMITS.emailAndIp, pairKey],
    [LOGIN_FAILURE_LIMITS.email, emailKey],
  ];
  for (const [limit, subject] of checks) {
    const state = await peek(limit, subject);
    if (!state.allowed) throw tooManyRequests(state.retryAfterMs, LOCKED_MESSAGE);
  }

  const user = await repo.findUserByEmail(input.email);
  const passwordOk = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  // Same message for "no such user" and "wrong password", so an attacker
  // cannot use this endpoint to find out which emails are registered.
  if (!user || !passwordOk) {
    for (const [limit, subject] of checks) await hit(limit, subject);
    throw unauthorized("Email or password is incorrect");
  }
  await reset(LOGIN_FAILURE_LIMITS.emailAndIp, pairKey);
  // Buyer, seller and admin are separate sides: an account logs in only on its own.
  if (user.role !== input.role) {
    throw forbidden(WRONG_SIDE_MESSAGE[user.role]);
  }
  return issueTokens(user);
}

const WRONG_SIDE_MESSAGE: Record<Role, string> = {
  buyer: "This is a buyer account. Log in on the buyer side.",
  seller: "This is a seller account. Log in on the seller side.",
  admin: "This is an admin account. Log in on the admin app.",
};

/**
 * Exchange a refresh token for a new pair. Each refresh token works once.
 * If a token that was already used shows up again, it may have been stolen,
 * so every session for that user is signed out.
 */
export async function refresh(refreshToken: string, side: Role): Promise<IssuedSession> {
  const stored = await repo.findRefreshTokenByHash(hashRefreshToken(refreshToken));
  if (!stored) {
    throw unauthorized("Session is not valid");
  }
  if (stored.revokedAt) {
    await repo.revokeAllRefreshTokensForUser(stored.userId);
    throw unauthorized("Session is not valid");
  }
  if (stored.expiresAt.getTime() <= Date.now()) {
    throw unauthorized("Session has expired");
  }
  const revokedByThisCall = await repo.revokeRefreshToken(stored.id);
  if (!revokedByThisCall) {
    throw unauthorized("Session is not valid");
  }
  const user = await repo.findUserById(stored.userId);
  // A session only ever works on its own side (buyer, seller, admin).
  if (!user || user.role !== side) {
    throw unauthorized("Session is not valid");
  }
  return issueTokens(user);
}

export async function logout(refreshToken: string): Promise<void> {
  const stored = await repo.findRefreshTokenByHash(hashRefreshToken(refreshToken));
  if (stored) {
    await repo.revokeRefreshToken(stored.id);
  }
}

export async function getCurrentUser(userId: string): Promise<PublicUser> {
  const user = await repo.findUserById(userId);
  if (!user) {
    throw notFound("User not found");
  }
  return toPublicUser(user);
}

// ---------------------------------------------------------------- password reset

/** A new reset email is not sent if the previous one went out less than this long ago. */
export const RESET_REQUEST_COOLDOWN_MS = 60_000;

/** Where the reset link opens. Admins use the buyer page until the admin app has its own (Day 4). */
const RESET_PAGE_BY_ROLE: Record<Role, string> = {
  buyer: "/buyer/reset-password",
  seller: "/seller/reset-password",
  admin: "/buyer/reset-password",
};

/**
 * Start a password reset. The caller always gets the same answer, whether
 * or not the email has an account, so this cannot be used to find out who
 * is registered. Only the newest link works; older unused links are cancelled.
 */
/** At most this many reset emails per address per hour, however many IPs ask (inbox flooding). */
export const RESET_EMAIL_LIMIT: Limit = { name: "forgot:email", max: 5, windowMs: 60 * 60_000 };

export async function requestPasswordReset(email: string, now = new Date()): Promise<void> {
  if (!(await hit(RESET_EMAIL_LIMIT, subjectHash(email))).allowed) {
    return;
  }
  const user = await repo.findUserByEmail(email);
  if (!user) {
    return;
  }

  const latest = await repo.findLatestPasswordResetToken(user.id);
  if (latest && !latest.usedAt && now.getTime() - latest.createdAt.getTime() < RESET_REQUEST_COOLDOWN_MS) {
    // A link was sent moments ago. Do not flood the inbox; the earlier email is still valid.
    return;
  }

  await repo.invalidatePasswordResetTokensForUser(user.id);
  const token = generateOneTimeToken();
  const tokenHash = hashOneTimeToken(token);
  await repo.insertPasswordResetToken({
    userId: user.id,
    tokenHash,
    expiresAt: new Date(now.getTime() + env.PASSWORD_RESET_TTL_MINUTES * 60_000),
  });

  const resetUrl = `${env.WEB_APP_URL}${RESET_PAGE_BY_ROLE[user.role]}?token=${encodeURIComponent(token)}`;
  try {
    await sendPasswordResetEmail({
      to: user.email,
      fullName: user.fullName,
      resetUrl,
      expiresInMinutes: env.PASSWORD_RESET_TTL_MINUTES,
      dedupeKey: tokenHash.slice(0, 32),
    });
  } catch (err) {
    // The queue is down. Cancel the link nobody will receive and report a server error.
    await repo.invalidatePasswordResetTokensForUser(user.id);
    logger.error({ err }, "Could not queue password reset email");
    throw err;
  }
}

/**
 * Set a new password from a reset link. The link works once. Every existing
 * session is signed out, so whoever had the old password loses access.
 */
export async function resetPassword(input: ResetPasswordInput, now = new Date()): Promise<void> {
  const stored = await repo.findPasswordResetTokenByHash(hashOneTimeToken(input.token));
  const invalid = badRequest("This reset link is not valid or has expired. Request a new one.");
  if (!stored || stored.usedAt || stored.expiresAt.getTime() <= now.getTime()) {
    throw invalid;
  }
  if (!(await repo.markPasswordResetTokenUsed(stored.id))) {
    throw invalid;
  }
  await repo.updateUserPassword(stored.userId, await hashPassword(input.password));
  await repo.revokeAllRefreshTokensForUser(stored.userId);
}
