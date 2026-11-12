import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../db/client";
import {
  passwordResetTokens,
  refreshTokens,
  users,
  type NewUserRow,
  type PasswordResetTokenRow,
  type RefreshTokenRow,
  type UserRow,
} from "../../db/schema";

/**
 * Repository layer: database queries only. No business rules here.
 * If you are writing an `if` about what a user is allowed to do, it belongs
 * in auth.service.ts.
 */

export async function findUserByEmail(email: string): Promise<UserRow | undefined> {
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return rows[0];
}

export async function findUserById(id: string): Promise<UserRow | undefined> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0];
}

export async function findUsersByIds(ids: string[]): Promise<UserRow[]> {
  if (ids.length === 0) return [];
  return db.select().from(users).where(inArray(users.id, ids));
}

export async function insertUser(values: NewUserRow): Promise<UserRow> {
  const rows = await db.insert(users).values(values).returning();
  const row = rows[0];
  if (!row) {
    throw new Error("Insert into users returned no row");
  }
  return row;
}

export async function insertRefreshToken(values: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<void> {
  await db.insert(refreshTokens).values(values);
}

export async function findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRow | undefined> {
  const rows = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .limit(1);
  return rows[0];
}

/**
 * Mark one token as used. Returns true only if THIS call revoked it, so two
 * requests racing with the same token cannot both succeed.
 */
export async function revokeRefreshToken(id: string): Promise<boolean> {
  const rows = await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.id, id), isNull(refreshTokens.revokedAt)))
    .returning({ id: refreshTokens.id });
  return rows.length === 1;
}

export async function revokeAllRefreshTokensForUser(userId: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}

export async function updateUserPassword(userId: string, passwordHash: string): Promise<void> {
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));
}

// ---------------------------------------------------------------- password reset

export async function insertPasswordResetToken(values: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<void> {
  await db.insert(passwordResetTokens).values(values);
}

export async function findLatestPasswordResetToken(userId: string): Promise<PasswordResetTokenRow | undefined> {
  const rows = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.userId, userId))
    .orderBy(desc(passwordResetTokens.createdAt))
    .limit(1);
  return rows[0];
}

export async function findPasswordResetTokenByHash(tokenHash: string): Promise<PasswordResetTokenRow | undefined> {
  const rows = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1);
  return rows[0];
}

/** Mark one token as used. Returns true only if THIS call used it, so a link cannot be used twice. */
export async function markPasswordResetTokenUsed(id: string): Promise<boolean> {
  const rows = await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResetTokens.id, id), isNull(passwordResetTokens.usedAt)))
    .returning({ id: passwordResetTokens.id });
  return rows.length === 1;
}

/** Cancel every unused link for a user, so only the newest email works. */
export async function invalidatePasswordResetTokensForUser(userId: string): Promise<void> {
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));
}
