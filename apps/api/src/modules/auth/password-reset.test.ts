import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PasswordResetTokenRow, UserRow } from "../../db/schema";

// The service reads env at import time; give it what it needs without a .env file.
vi.hoisted(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgres://test:test@localhost:5432/test",
    JWT_SECRET: "test-secret-that-is-at-least-32-characters-long",
    WEB_APP_URL: "https://muhrak.test",
    PASSWORD_RESET_TTL_MINUTES: "30",
  });
});

vi.mock("./auth.repository", () => ({
  findUserByEmail: vi.fn(),
  findLatestPasswordResetToken: vi.fn(),
  invalidatePasswordResetTokensForUser: vi.fn(),
  insertPasswordResetToken: vi.fn(),
  findPasswordResetTokenByHash: vi.fn(),
  markPasswordResetTokenUsed: vi.fn(),
  updateUserPassword: vi.fn(),
  revokeAllRefreshTokensForUser: vi.fn(),
  markUserEmailVerified: vi.fn(),
  invalidateEmailVerificationTokensForUser: vi.fn(),
}));
vi.mock("../notification", () => ({ sendPasswordResetEmail: vi.fn() }));

const repo = await import("./auth.repository");
const { sendPasswordResetEmail } = await import("../notification");
const { requestPasswordReset, resetPassword, RESET_REQUEST_COOLDOWN_MS } = await import("./auth.service");
const { hashOneTimeToken } = await import("./tokens");
const { verifyPassword } = await import("./password");

const now = new Date("2026-11-11T10:00:00Z");

const seller: UserRow = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "ahmed@alnoor.om",
  passwordHash: "scrypt$00$00",
  fullName: "Al Noor Spare Parts",
  role: "seller",
  emailVerifiedAt: null,
  createdAt: now,
  updatedAt: now,
};

function tokenRow(overrides: Partial<PasswordResetTokenRow> = {}): PasswordResetTokenRow {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    userId: seller.id,
    tokenHash: "hash",
    expiresAt: new Date(now.getTime() + 30 * 60_000),
    usedAt: null,
    createdAt: new Date(now.getTime() - 10 * 60_000),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repo.markPasswordResetTokenUsed).mockResolvedValue(true);
});

describe("requestPasswordReset", () => {
  it("does nothing, silently, for an unknown email", async () => {
    vi.mocked(repo.findUserByEmail).mockResolvedValue(undefined);
    await expect(requestPasswordReset("nobody@example.com", now)).resolves.toBeUndefined();
    expect(repo.insertPasswordResetToken).not.toHaveBeenCalled();
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("stores only a hash and emails a link to the seller reset page", async () => {
    vi.mocked(repo.findUserByEmail).mockResolvedValue(seller);
    vi.mocked(repo.findLatestPasswordResetToken).mockResolvedValue(undefined);

    await requestPasswordReset(seller.email, now);

    expect(repo.invalidatePasswordResetTokensForUser).toHaveBeenCalledWith(seller.id);
    const stored = vi.mocked(repo.insertPasswordResetToken).mock.calls[0]?.[0];
    const email = vi.mocked(sendPasswordResetEmail).mock.calls[0]?.[0];
    expect(stored?.expiresAt).toEqual(new Date(now.getTime() + 30 * 60_000));
    expect(email?.to).toBe(seller.email);
    expect(email?.expiresInMinutes).toBe(30);

    const url = new URL(email?.resetUrl ?? "");
    expect(`${url.origin}${url.pathname}`).toBe("https://muhrak.test/seller/reset-password");
    const token = url.searchParams.get("token") ?? "";
    expect(token.length).toBeGreaterThan(20);
    expect(stored?.tokenHash).toBe(hashOneTimeToken(token));
    expect(stored?.tokenHash).not.toBe(token);
  });

  it("does not send another email within the cooldown", async () => {
    vi.mocked(repo.findUserByEmail).mockResolvedValue(seller);
    vi.mocked(repo.findLatestPasswordResetToken).mockResolvedValue(
      tokenRow({ createdAt: new Date(now.getTime() - RESET_REQUEST_COOLDOWN_MS / 2) }),
    );
    await requestPasswordReset(seller.email, now);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("cancels the new link if the email cannot be queued", async () => {
    vi.mocked(repo.findUserByEmail).mockResolvedValue(seller);
    vi.mocked(repo.findLatestPasswordResetToken).mockResolvedValue(undefined);
    vi.mocked(sendPasswordResetEmail).mockRejectedValueOnce(new Error("queue down"));

    await expect(requestPasswordReset(seller.email, now)).rejects.toThrow("queue down");
    expect(repo.invalidatePasswordResetTokensForUser).toHaveBeenCalledTimes(2);
  });
});

describe("requestPasswordReset: inbox flooding", () => {
  it("sends at most 5 reset emails per address per hour, however the requests arrive", async () => {
    const target = { ...seller, email: "flood-target@example.com" };
    vi.mocked(repo.findUserByEmail).mockResolvedValue(target);
    vi.mocked(repo.findLatestPasswordResetToken).mockResolvedValue(undefined);
    for (let i = 0; i < 8; i += 1) {
      await requestPasswordReset(target.email, now);
    }
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(5);
  });
});

describe("resetPassword", () => {
  const input = { token: "a-valid-looking-reset-token-value", password: "a new password 123" };

  it("sets the new password and signs out every session", async () => {
    vi.mocked(repo.findPasswordResetTokenByHash).mockResolvedValue(tokenRow());

    await resetPassword(input, now);

    expect(repo.findPasswordResetTokenByHash).toHaveBeenCalledWith(hashOneTimeToken(input.token));
    const [userId, newHash] = vi.mocked(repo.updateUserPassword).mock.calls[0] ?? [];
    expect(userId).toBe(seller.id);
    expect(await verifyPassword(input.password, newHash ?? "")).toBe(true);
    expect(repo.revokeAllRefreshTokensForUser).toHaveBeenCalledWith(seller.id);
  });

  it("verifies the email too (the link proves the user owns the inbox) and cancels old verification links", async () => {
    vi.mocked(repo.findPasswordResetTokenByHash).mockResolvedValue(tokenRow());
    await resetPassword(input, now);
    expect(repo.markUserEmailVerified).toHaveBeenCalledWith(seller.id, now);
    expect(repo.invalidateEmailVerificationTokensForUser).toHaveBeenCalledWith(seller.id);
  });

  it.each([
    ["unknown", undefined],
    ["already used", tokenRow({ usedAt: now })],
    ["expired", tokenRow({ expiresAt: new Date(now.getTime() - 1) })],
  ])("rejects an %s token", async (_label, row) => {
    vi.mocked(repo.findPasswordResetTokenByHash).mockResolvedValue(row);
    await expect(resetPassword(input, now)).rejects.toMatchObject({ status: 400 });
    expect(repo.updateUserPassword).not.toHaveBeenCalled();
  });

  it("rejects a token used by a parallel request", async () => {
    vi.mocked(repo.findPasswordResetTokenByHash).mockResolvedValue(tokenRow());
    vi.mocked(repo.markPasswordResetTokenUsed).mockResolvedValue(false);
    await expect(resetPassword(input, now)).rejects.toMatchObject({ status: 400 });
    expect(repo.updateUserPassword).not.toHaveBeenCalled();
  });
});
