import type { LoginInput, PublicUser, RegisterInput, ResetPasswordInput, Role, VerifyEmailCodeInput } from "../../schemas";
import { env } from "../../config/env";
import type { UserRow } from "../../db/schema";
import { badRequest, conflict, emailNotVerified, forbidden, notFound, unauthorized } from "../../shared/errors";
import { logger } from "../../shared/logger";
import { hit, peek, reset, subjectHash, tooManyRequests, type Limit } from "../../shared/rate-limit";
import { sendAccountExistsEmail, sendPasswordResetEmail, sendVerifyEmail } from "../notification";
import * as repo from "./auth.repository";
import { hashPassword, verifyPassword } from "./password";
import {
  generateEmailCode,
  generateOneTimeToken,
  generateRefreshToken,
  hashEmailCode,
  hashOneTimeToken,
  hashRefreshToken,
  refreshTokenExpiry,
  sameHash,
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

// ---------------------------------------------------------------- sign-up and email verification

const LOGIN_PAGE_BY_ROLE: Record<Role, string> = { buyer: "/buyer/login", seller: "/seller/login", admin: "/admin/login" };

/** A new code is not sent if the previous one went out less than this long ago. */
export const VERIFY_REQUEST_COOLDOWN_MS = 60_000;

/** Wrong guesses allowed per code; then it is dead and a new one must be requested. */
export const EMAIL_CODE_MAX_ATTEMPTS = 5;

/**
 * Code checks per address (any IP) per 15 minutes, on top of the per-code
 * limit, so guessing across many fresh codes stays hopeless.
 */
export const VERIFY_CODE_EMAIL_LIMIT: Limit = { name: "verify-code:email", max: 15, windowMs: 15 * 60_000 };

/**
 * At most this many sign-up related emails (verification codes and "you
 * already have an account") per address per hour, however many IPs ask, so
 * nobody can flood a stranger's inbox through the sign-up form.
 */
export const SIGNUP_EMAIL_LIMIT: Limit = { name: "signup:email", max: 5, windowMs: 60 * 60_000 };

/**
 * Sign up. The account is created UNVERIFIED and cannot sign in until the
 * 6-digit code from the verification email is entered (developer decision,
 * 14 Nov 2026; a code replaced the first version's link the same day). The caller gets the same answer whether or not the email already
 * has an account, so sign-up cannot be used to find out who is registered:
 * - new email: create the account and send the verification link;
 * - existing email: change nothing, and tell the owner by email that
 *   someone tried to sign up (with links to log in or reset the password).
 *   If the existing account is unverified (someone may have signed up with
 *   a stranger's email), the real owner gets in with "Forgot password",
 *   which also verifies the email.
 */
export async function register(input: RegisterInput, now = new Date()): Promise<void> {
  // Hash in both branches, so the time taken does not reveal the answer.
  const passwordHash = await hashPassword(input.password);
  if (!(await hit(SIGNUP_EMAIL_LIMIT, subjectHash(input.email))).allowed) return;

  const existing = await repo.findUserByEmail(input.email);
  if (existing) {
    // Admins are never contacted through the public sign-up form.
    if (existing.role === "admin") return;
    await sendAccountExistsEmail({
      to: existing.email,
      fullName: existing.fullName,
      loginUrl: `${env.WEB_APP_URL}${LOGIN_PAGE_BY_ROLE[existing.role]}`,
      resetUrl: `${env.WEB_APP_URL}${RESET_PAGE_BY_ROLE[existing.role]}`,
      // At most one per address per minute (the job's unique key dedupes).
      dedupeKey: `${existing.id}-${Math.floor(now.getTime() / 60_000)}`,
    });
    return;
  }

  let user: UserRow;
  try {
    user = await repo.insertUser({ email: input.email, passwordHash, fullName: input.fullName, role: input.role });
  } catch (err) {
    // Two sign-ups for the same new email at once: the unique email lets
    // exactly one through; the other behaves like "already exists".
    if (isUniqueViolation(err)) return;
    throw err;
  }
  await sendVerificationCode(user, now);
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: unknown; cause?: { code?: unknown } } | undefined;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

/** Cancel older codes, store a new one (HMAC only) and queue the email. */
async function sendVerificationCode(user: UserRow, now: Date): Promise<void> {
  await repo.invalidateEmailVerificationTokensForUser(user.id);
  const code = generateEmailCode();
  const tokenHash = hashEmailCode(user.id, code);
  await repo.insertEmailVerificationToken({
    userId: user.id,
    tokenHash,
    expiresAt: new Date(now.getTime() + env.EMAIL_CODE_TTL_MINUTES * 60_000),
  });
  try {
    await sendVerifyEmail({
      to: user.email,
      fullName: user.fullName,
      code,
      expiresInMinutes: env.EMAIL_CODE_TTL_MINUTES,
      dedupeKey: tokenHash.slice(0, 32),
    });
  } catch (err) {
    // The queue is down. Cancel the code nobody will receive; the user can ask for a new one.
    await repo.invalidateEmailVerificationTokensForUser(user.id);
    logger.error({ err }, "Could not queue verification email");
    throw err;
  }
}

/**
 * "Send me a new code". Same answer for every email (no enumeration). Only
 * an unverified buyer or seller gets one, at most one a minute and five an
 * hour per address.
 */
export async function resendVerificationEmail(email: string, now = new Date()): Promise<void> {
  if (!(await hit(SIGNUP_EMAIL_LIMIT, subjectHash(email))).allowed) return;
  const user = await repo.findUserByEmail(email);
  if (!user || user.role === "admin" || user.emailVerifiedAt) return;
  const latest = await repo.findLatestEmailVerificationToken(user.id);
  if (latest && !latest.usedAt && now.getTime() - latest.createdAt.getTime() < VERIFY_REQUEST_COOLDOWN_MS) return;
  await sendVerificationCode(user, now);
}

/**
 * Check a 6-digit code. Right: the email is verified and the user is signed
 * in on their side (the code proves the inbox; the password was set a
 * moment ago in the same sign-up). Wrong, expired, used, unknown email or
 * the other side: one and the same answer, so nothing leaks. Five wrong
 * guesses kill the code; the address is limited across codes too.
 */
export async function verifyEmailCode(input: VerifyEmailCodeInput, now = new Date()): Promise<IssuedSession> {
  const invalid = badRequest("That code is not right or has expired. Check the newest email, or send a new code.");
  const emailKey = subjectHash(input.email);
  const limited = await peek(VERIFY_CODE_EMAIL_LIMIT, emailKey);
  if (!limited.allowed) throw tooManyRequests(limited.retryAfterMs, "Too many tries. Wait a few minutes, then send a new code.");
  await hit(VERIFY_CODE_EMAIL_LIMIT, emailKey);

  const user = await repo.findUserByEmail(input.email);
  if (!user || user.role !== input.role || user.emailVerifiedAt) throw invalid;
  const latest = await repo.findLatestEmailVerificationToken(user.id);
  if (!latest || latest.usedAt || latest.expiresAt.getTime() <= now.getTime() || latest.attempts >= EMAIL_CODE_MAX_ATTEMPTS) {
    throw invalid;
  }

  if (!sameHash(latest.tokenHash, hashEmailCode(user.id, input.code))) {
    const attempts = await repo.addEmailVerificationAttempt(latest.id);
    if (attempts !== null && attempts >= EMAIL_CODE_MAX_ATTEMPTS) {
      await repo.markEmailVerificationTokenUsed(latest.id);
    }
    throw invalid;
  }

  // Right code: use it exactly once (a double submit cannot sign in twice).
  if (!(await repo.markEmailVerificationTokenUsed(latest.id))) throw invalid;
  await repo.markUserEmailVerified(user.id, now);
  return issueTokens({ ...user, emailVerifiedAt: now });
}

/**
 * Failed-login limits (password guessing). Counted per email from one IP
 * (tight), and per email from anywhere (looser, so an attacker spreading
 * guesses over many IPs is still stopped without letting one stranger lock
 * a user out for long). Emails are hashed before they become counter keys.
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
  // Checked only after the password is right, so it tells a stranger nothing.
  if (!user.emailVerifiedAt) {
    throw emailNotVerified("Verify your email first. Enter the code we sent you, or ask for a new one.");
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
  // A session only ever works on its own side (buyer, seller, admin), and only for a verified email.
  if (!user || user.role !== side || !user.emailVerifiedAt) {
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

/** For other modules: public details of several users (e.g. sellers in the admin queue). */
export async function getUsersByIds(ids: string[]): Promise<PublicUser[]> {
  return (await repo.findUsersByIds([...new Set(ids)])).map(toPublicUser);
}

/**
 * Create an admin, or set a new password for an existing admin, from the
 * command line (scripts/admin.ts). There is no admin sign-up endpoint.
 * A new password signs out every session of that admin.
 */
export async function upsertAdminAccount(input: { email: string; fullName: string; password: string }): Promise<"created" | "updated"> {
  const existing = await repo.findUserByEmail(input.email);
  if (existing && existing.role !== "admin") {
    throw conflict("This email belongs to a buyer or seller account. Use a different email for the admin.");
  }
  const passwordHash = await hashPassword(input.password);
  if (existing) {
    await repo.updateUserPassword(existing.id, passwordHash);
    await repo.markUserEmailVerified(existing.id);
    await repo.revokeAllRefreshTokensForUser(existing.id);
    return "updated";
  }
  // Admins are created by the developer on the server: verified from the start.
  await repo.insertUser({ email: input.email, passwordHash, fullName: input.fullName, role: "admin", emailVerifiedAt: new Date() });
  return "created";
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

/** Where the reset link opens. Admins never get one (their passwords are reset from the command line). */
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
  // Admin passwords are reset only from the command line (scripts/admin.ts),
  // so a stolen inbox is not enough to take over an admin account.
  if (!user || user.role === "admin") {
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
  // The link reached this inbox, which proves the user owns the email, so
  // verify it too. This is also how the real owner takes back an email that
  // someone else signed up with (that account could never sign in).
  await repo.markUserEmailVerified(stored.userId, now);
  await repo.invalidateEmailVerificationTokensForUser(stored.userId);
  await repo.revokeAllRefreshTokensForUser(stored.userId);
}
