import type { AuthResponse, LoginInput, PublicUser, RegisterInput } from "@muhrak/schemas";
import type { UserRow } from "../../db/schema";
import { conflict, notFound, unauthorized } from "../../shared/errors";
import * as repo from "./auth.repository";
import { hashPassword, verifyPassword } from "./password";
import {
  generateRefreshToken,
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

async function issueTokens(user: UserRow): Promise<AuthResponse> {
  const refreshToken = generateRefreshToken();
  await repo.insertRefreshToken({
    userId: user.id,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: refreshTokenExpiry(),
  });
  const accessToken = await signAccessToken({ userId: user.id, role: user.role });
  return { user: toPublicUser(user), accessToken, refreshToken };
}

export async function register(input: RegisterInput): Promise<AuthResponse> {
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

export async function login(input: LoginInput): Promise<AuthResponse> {
  const user = await repo.findUserByEmail(input.email);
  // Same message for "no such user" and "wrong password", so an attacker
  // cannot use this endpoint to find out which emails are registered.
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw unauthorized("Email or password is incorrect");
  }
  return issueTokens(user);
}

/**
 * Exchange a refresh token for a new pair. Each refresh token works once.
 * If a token that was already used shows up again, it may have been stolen,
 * so every session for that user is signed out.
 */
export async function refresh(refreshToken: string): Promise<AuthResponse> {
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
  if (!user) {
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
