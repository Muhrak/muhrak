import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailVerificationTokenRow, RefreshTokenRow, UserRow } from "../../db/schema";

// The service reads env at import time; give it what it needs without a .env file.
vi.hoisted(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgres://test:test@localhost:5432/test",
    JWT_SECRET: "test-secret-that-is-at-least-32-characters-long",
    WEB_APP_URL: "https://muhrak.test",
    EMAIL_VERIFICATION_TTL_HOURS: "24",
  });
});

vi.mock("./auth.repository", () => ({
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
  insertUser: vi.fn(),
  insertRefreshToken: vi.fn(),
  findRefreshTokenByHash: vi.fn(),
  revokeRefreshToken: vi.fn(),
  revokeAllRefreshTokensForUser: vi.fn(),
  markUserEmailVerified: vi.fn(),
  insertEmailVerificationToken: vi.fn(),
  findLatestEmailVerificationToken: vi.fn(),
  findEmailVerificationTokenByHash: vi.fn(),
  markEmailVerificationTokenUsed: vi.fn(),
  invalidateEmailVerificationTokensForUser: vi.fn(),
}));
vi.mock("./password", () => ({ verifyPassword: vi.fn(), hashPassword: vi.fn(async () => "scrypt$hash") }));
vi.mock("../notification", () => ({
  sendPasswordResetEmail: vi.fn(),
  sendVerifyEmail: vi.fn(),
  sendAccountExistsEmail: vi.fn(),
}));

const repo = await import("./auth.repository");
const { verifyPassword, hashPassword } = await import("./password");
const { sendVerifyEmail, sendAccountExistsEmail } = await import("../notification");
const { register, login, refresh, verifyEmail, resendVerificationEmail, VERIFY_REQUEST_COOLDOWN_MS } = await import("./auth.service");
const { hashOneTimeToken, hashRefreshToken } = await import("./tokens");

const now = new Date("2026-11-14T10:00:00Z");
let n = 0;
/** A fresh address per test, so the in-memory per-address limits do not leak between tests. */
const freshEmail = () => `user${++n}@example.com`;

function user(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    email: "khalid@example.com",
    passwordHash: "scrypt$00$00",
    fullName: "Khalid Al Amri",
    role: "seller",
    emailVerifiedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function linkRow(overrides: Partial<EmailVerificationTokenRow> = {}): EmailVerificationTokenRow {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    userId: user().id,
    tokenHash: "hash",
    expiresAt: new Date(now.getTime() + 24 * 3_600_000),
    usedAt: null,
    createdAt: new Date(now.getTime() - 10 * 60_000),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repo.markEmailVerificationTokenUsed).mockResolvedValue(true);
  vi.mocked(repo.revokeRefreshToken).mockResolvedValue(true);
});

describe("register", () => {
  const input = (email = freshEmail()) => ({ email, password: "a long password 1", fullName: "Khalid Al Amri", role: "seller" as const });

  it("creates an unverified account, stores only a hash of the link and emails it", async () => {
    const data = input();
    vi.mocked(repo.findUserByEmail).mockResolvedValue(undefined);
    vi.mocked(repo.insertUser).mockResolvedValue(user({ email: data.email }));

    await register(data, now);

    const inserted = vi.mocked(repo.insertUser).mock.calls[0]?.[0];
    expect(inserted).toMatchObject({ email: data.email, role: "seller", passwordHash: "scrypt$hash" });
    expect(inserted).not.toHaveProperty("emailVerifiedAt");
    const stored = vi.mocked(repo.insertEmailVerificationToken).mock.calls[0]?.[0];
    expect(stored?.expiresAt).toEqual(new Date(now.getTime() + 24 * 3_600_000));
    const email = vi.mocked(sendVerifyEmail).mock.calls[0]?.[0];
    expect(email?.to).toBe(data.email);
    const url = new URL(email?.verifyUrl ?? "");
    expect(url.origin + url.pathname).toBe("https://muhrak.test/seller/verify-email");
    const token = url.searchParams.get("token") ?? "";
    expect(token.length).toBeGreaterThanOrEqual(20);
    expect(stored?.tokenHash).toBe(hashOneTimeToken(token));
    expect(stored?.tokenHash).not.toBe(token);
  });

  it("does not sign the new user in (no session is created)", async () => {
    vi.mocked(repo.findUserByEmail).mockResolvedValue(undefined);
    vi.mocked(repo.insertUser).mockResolvedValue(user());
    await expect(register(input(), now)).resolves.toBeUndefined();
    expect(repo.insertRefreshToken).not.toHaveBeenCalled();
  });

  it("for an existing email: changes nothing and tells the owner, without revealing anything to the caller", async () => {
    const owner = user({ email: freshEmail(), emailVerifiedAt: now, role: "buyer" });
    vi.mocked(repo.findUserByEmail).mockResolvedValue(owner);

    await expect(register(input(owner.email), now)).resolves.toBeUndefined();

    expect(repo.insertUser).not.toHaveBeenCalled();
    expect(sendVerifyEmail).not.toHaveBeenCalled();
    expect(sendAccountExistsEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: owner.email, loginUrl: "https://muhrak.test/buyer/login", resetUrl: "https://muhrak.test/buyer/reset-password" }),
    );
    // The password is hashed in both branches, so timing does not give the answer away.
    expect(hashPassword).toHaveBeenCalled();
  });

  it("never emails an admin through the public sign-up form", async () => {
    vi.mocked(repo.findUserByEmail).mockResolvedValue(user({ role: "admin", emailVerifiedAt: now }));
    await register(input(), now);
    expect(sendAccountExistsEmail).not.toHaveBeenCalled();
    expect(repo.insertUser).not.toHaveBeenCalled();
  });

  it("two sign-ups racing for one new email: the loser behaves like 'already exists'", async () => {
    vi.mocked(repo.findUserByEmail).mockResolvedValue(undefined);
    vi.mocked(repo.insertUser).mockRejectedValue(Object.assign(new Error("duplicate key"), { code: "23505" }));
    await expect(register(input(), now)).resolves.toBeUndefined();
    expect(sendVerifyEmail).not.toHaveBeenCalled();
  });

  it("sends at most 5 sign-up emails per address per hour (no inbox flooding)", async () => {
    const email = freshEmail();
    vi.mocked(repo.findUserByEmail).mockResolvedValue(user({ email, emailVerifiedAt: now }));
    for (let i = 0; i < 8; i++) await register(input(email), now);
    expect(sendAccountExistsEmail).toHaveBeenCalledTimes(5);
  });

  it("cancels the link if the email cannot be queued", async () => {
    vi.mocked(repo.findUserByEmail).mockResolvedValue(undefined);
    vi.mocked(repo.insertUser).mockResolvedValue(user());
    vi.mocked(sendVerifyEmail).mockRejectedValueOnce(new Error("queue down"));
    await expect(register(input(), now)).rejects.toThrow("queue down");
    expect(repo.invalidateEmailVerificationTokensForUser).toHaveBeenCalledTimes(2);
  });
});

describe("login before verification", () => {
  const credentials = () => ({ email: freshEmail(), password: "a long password 1" });

  it("refuses the right password with 403 email_not_verified and creates no session", async () => {
    vi.mocked(repo.findUserByEmail).mockResolvedValue(user());
    vi.mocked(verifyPassword).mockResolvedValue(true);
    await expect(login({ ...credentials(), role: "seller" }, "203.0.113.7")).rejects.toMatchObject({ status: 403, code: "email_not_verified" });
    expect(repo.insertRefreshToken).not.toHaveBeenCalled();
  });

  it("says only 'incorrect' for a wrong password, so a stranger cannot learn the account is unverified", async () => {
    vi.mocked(repo.findUserByEmail).mockResolvedValue(user());
    vi.mocked(verifyPassword).mockResolvedValue(false);
    await expect(login({ ...credentials(), role: "seller" }, "203.0.113.7")).rejects.toMatchObject({ status: 401 });
  });

  it("still refuses the wrong side first", async () => {
    vi.mocked(repo.findUserByEmail).mockResolvedValue(user());
    vi.mocked(verifyPassword).mockResolvedValue(true);
    await expect(login({ ...credentials(), role: "buyer" }, "203.0.113.7")).rejects.toMatchObject({ status: 403, code: "forbidden" });
  });

  it("lets a verified user in", async () => {
    vi.mocked(repo.findUserByEmail).mockResolvedValue(user({ emailVerifiedAt: now }));
    vi.mocked(verifyPassword).mockResolvedValue(true);
    await expect(login({ ...credentials(), role: "seller" }, "203.0.113.7")).resolves.toMatchObject({ user: { role: "seller" } });
  });

  it("refresh refuses an unverified account", async () => {
    const stored: RefreshTokenRow = {
      id: "55555555-5555-4555-8555-555555555555",
      userId: user().id,
      tokenHash: hashRefreshToken("r".repeat(43)),
      expiresAt: new Date(Date.now() + 3_600_000),
      revokedAt: null,
      createdAt: new Date(),
    } as RefreshTokenRow;
    vi.mocked(repo.findRefreshTokenByHash).mockResolvedValue(stored);
    vi.mocked(repo.findUserById).mockResolvedValue(user());
    await expect(refresh("r".repeat(43), "seller")).rejects.toMatchObject({ status: 401 });
    expect(repo.insertRefreshToken).not.toHaveBeenCalled();
  });
});

describe("verifyEmail", () => {
  const token = "a-valid-looking-verification-token";

  it("verifies the account, uses the link once and returns the side, without signing in", async () => {
    vi.mocked(repo.findEmailVerificationTokenByHash).mockResolvedValue(linkRow());
    vi.mocked(repo.findUserById).mockResolvedValue(user());

    await expect(verifyEmail(token, now)).resolves.toEqual({ role: "seller" });

    expect(repo.findEmailVerificationTokenByHash).toHaveBeenCalledWith(hashOneTimeToken(token));
    expect(repo.markEmailVerificationTokenUsed).toHaveBeenCalledWith(linkRow().id);
    expect(repo.markUserEmailVerified).toHaveBeenCalledWith(user().id, now);
    expect(repo.insertRefreshToken).not.toHaveBeenCalled();
  });

  it.each([
    ["unknown", undefined],
    ["already used", linkRow({ usedAt: now })],
    ["expired", linkRow({ expiresAt: new Date(now.getTime() - 1) })],
  ])("rejects an %s link", async (_label, row) => {
    vi.mocked(repo.findEmailVerificationTokenByHash).mockResolvedValue(row);
    await expect(verifyEmail(token, now)).rejects.toMatchObject({ status: 400 });
    expect(repo.markUserEmailVerified).not.toHaveBeenCalled();
  });

  it("rejects a link used by a parallel request (double click)", async () => {
    vi.mocked(repo.findEmailVerificationTokenByHash).mockResolvedValue(linkRow());
    vi.mocked(repo.markEmailVerificationTokenUsed).mockResolvedValue(false);
    await expect(verifyEmail(token, now)).rejects.toMatchObject({ status: 400 });
    expect(repo.markUserEmailVerified).not.toHaveBeenCalled();
  });
});

describe("resendVerificationEmail", () => {
  it.each([
    ["an unknown email", undefined],
    ["a verified account", user({ emailVerifiedAt: now })],
    ["an admin", user({ role: "admin" })],
  ])("silently sends nothing for %s", async (_label, row) => {
    vi.mocked(repo.findUserByEmail).mockResolvedValue(row);
    await expect(resendVerificationEmail(freshEmail(), now)).resolves.toBeUndefined();
    expect(sendVerifyEmail).not.toHaveBeenCalled();
  });

  it("sends a new link and cancels the old ones for an unverified account", async () => {
    vi.mocked(repo.findUserByEmail).mockResolvedValue(user());
    vi.mocked(repo.findLatestEmailVerificationToken).mockResolvedValue(linkRow({ createdAt: new Date(now.getTime() - 10 * 60_000) }));
    await resendVerificationEmail(freshEmail(), now);
    expect(repo.invalidateEmailVerificationTokensForUser).toHaveBeenCalledWith(user().id);
    expect(sendVerifyEmail).toHaveBeenCalledTimes(1);
  });

  it("does not send another link within the cooldown", async () => {
    vi.mocked(repo.findUserByEmail).mockResolvedValue(user());
    vi.mocked(repo.findLatestEmailVerificationToken).mockResolvedValue(
      linkRow({ createdAt: new Date(now.getTime() - VERIFY_REQUEST_COOLDOWN_MS + 1_000) }),
    );
    await resendVerificationEmail(freshEmail(), now);
    expect(sendVerifyEmail).not.toHaveBeenCalled();
  });
});
