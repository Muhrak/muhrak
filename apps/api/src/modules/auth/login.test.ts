import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RefreshTokenRow, UserRow } from "../../db/schema";

// The service reads env at import time; give it what it needs without a .env file.
vi.hoisted(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgres://test:test@localhost:5432/test",
    REDIS_URL: "redis://localhost:6379",
    JWT_SECRET: "test-secret-that-is-at-least-32-characters-long",
    WEB_APP_URL: "https://muhrak.test",
  });
});

vi.mock("./auth.repository", () => ({
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
  insertRefreshToken: vi.fn(),
  findRefreshTokenByHash: vi.fn(),
  revokeRefreshToken: vi.fn(),
  revokeAllRefreshTokensForUser: vi.fn(),
}));
vi.mock("./password", () => ({ verifyPassword: vi.fn(), hashPassword: vi.fn() }));
vi.mock("../notification", () => ({ sendPasswordResetEmail: vi.fn() }));
// No Redis in unit tests: the rate limiter falls back to its in-memory counters.
vi.mock("../../shared/redis", () => ({
  getRedis: () => {
    throw new Error("no redis in tests");
  },
}));

const repo = await import("./auth.repository");
const { verifyPassword } = await import("./password");
const { login, refresh } = await import("./auth.service");

function user(role: UserRow["role"]): UserRow {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    email: "khalid@email.com",
    passwordHash: "scrypt$00$00",
    fullName: "Khalid Al Balushi",
    role,
    createdAt: new Date("2026-11-10T08:00:00Z"),
    updatedAt: new Date("2026-11-10T08:00:00Z"),
  } as UserRow;
}

let n = 0;
/** A fresh email and IP per test, so in-memory rate-limit counters do not leak between tests. */
function credentials() {
  n += 1;
  return { email: `user${n}@email.com`, password: "correct horse battery", ip: `10.0.0.${n}` };
}

describe("login: buyer and seller sides are separate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(verifyPassword).mockResolvedValue(true);
  });

  it("logs a buyer in on the buyer side", async () => {
    const { ip, ...c } = credentials();
    vi.mocked(repo.findUserByEmail).mockResolvedValue(user("buyer"));
    const result = await login({ ...c, role: "buyer" }, ip);
    expect(result.user.role).toBe("buyer");
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
  });

  it("logs a seller in on the seller side", async () => {
    const { ip, ...c } = credentials();
    vi.mocked(repo.findUserByEmail).mockResolvedValue(user("seller"));
    const result = await login({ ...c, role: "seller" }, ip);
    expect(result.user.role).toBe("seller");
  });

  it("refuses a buyer account on the seller side, without issuing tokens", async () => {
    const { ip, ...c } = credentials();
    vi.mocked(repo.findUserByEmail).mockResolvedValue(user("buyer"));
    await expect(login({ ...c, role: "seller" }, ip)).rejects.toMatchObject({
      status: 403,
      message: "This is a buyer account. Log in on the buyer side.",
    });
    expect(repo.insertRefreshToken).not.toHaveBeenCalled();
  });

  it("refuses a seller account on the buyer side", async () => {
    const { ip, ...c } = credentials();
    vi.mocked(repo.findUserByEmail).mockResolvedValue(user("seller"));
    await expect(login({ ...c, role: "buyer" }, ip)).rejects.toMatchObject({ status: 403 });
    expect(repo.insertRefreshToken).not.toHaveBeenCalled();
  });

  it("checks the password before revealing the account's side", async () => {
    const { ip, ...c } = credentials();
    vi.mocked(repo.findUserByEmail).mockResolvedValue(user("seller"));
    vi.mocked(verifyPassword).mockResolvedValue(false);
    await expect(login({ ...c, role: "buyer" }, ip)).rejects.toMatchObject({
      status: 401,
      message: "Email or password is incorrect",
    });
  });
});

describe("login: password guessing", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("still checks a password for an unknown email (same timing as a real account)", async () => {
    const { ip, ...c } = credentials();
    vi.mocked(repo.findUserByEmail).mockResolvedValue(undefined);
    vi.mocked(verifyPassword).mockResolvedValue(false);
    await expect(login({ ...c, role: "buyer" }, ip)).rejects.toMatchObject({ status: 401 });
    expect(verifyPassword).toHaveBeenCalledTimes(1);
  });

  it("locks an email after 5 failures from one IP, even for the right password", async () => {
    const { ip, ...c } = credentials();
    vi.mocked(repo.findUserByEmail).mockResolvedValue(user("buyer"));
    vi.mocked(verifyPassword).mockResolvedValue(false);
    for (let i = 0; i < 5; i += 1) {
      await expect(login({ ...c, role: "buyer" }, ip)).rejects.toMatchObject({ status: 401 });
    }
    vi.mocked(verifyPassword).mockResolvedValue(true);
    await expect(login({ ...c, role: "buyer" }, ip)).rejects.toMatchObject({ status: 429 });
    expect(repo.insertRefreshToken).not.toHaveBeenCalled();
  });

  it("locks an email after 20 failures spread over many IPs", async () => {
    const { ip: _ip, ...c } = credentials();
    vi.mocked(repo.findUserByEmail).mockResolvedValue(user("buyer"));
    vi.mocked(verifyPassword).mockResolvedValue(false);
    for (let i = 0; i < 20; i += 1) {
      await expect(login({ ...c, role: "buyer" }, `192.168.${i}.1`)).rejects.toMatchObject({ status: 401 });
    }
    await expect(login({ ...c, role: "buyer" }, "172.16.0.1")).rejects.toMatchObject({ status: 429 });
  });

  it("a successful login clears the per-IP failure count", async () => {
    const { ip, ...c } = credentials();
    vi.mocked(repo.findUserByEmail).mockResolvedValue(user("buyer"));
    vi.mocked(verifyPassword).mockResolvedValue(false);
    for (let i = 0; i < 4; i += 1) {
      await expect(login({ ...c, role: "buyer" }, ip)).rejects.toMatchObject({ status: 401 });
    }
    vi.mocked(verifyPassword).mockResolvedValue(true);
    await login({ ...c, role: "buyer" }, ip);
    vi.mocked(verifyPassword).mockResolvedValue(false);
    await expect(login({ ...c, role: "buyer" }, ip)).rejects.toMatchObject({ status: 401 });
  });
});

describe("refresh: a session only works on its own side", () => {
  const stored = {
    id: "33333333-3333-4333-8333-333333333333",
    userId: "22222222-2222-4222-8222-222222222222",
    tokenHash: "hash",
    expiresAt: new Date(Date.now() + 86_400_000),
    revokedAt: null,
    createdAt: new Date(),
  } as RefreshTokenRow;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(repo.findRefreshTokenByHash).mockResolvedValue(stored);
    vi.mocked(repo.revokeRefreshToken).mockResolvedValue(true);
  });

  it("renews a buyer session on the buyer side", async () => {
    vi.mocked(repo.findUserById).mockResolvedValue(user("buyer"));
    const result = await refresh("x".repeat(43), "buyer");
    expect(result.user.role).toBe("buyer");
  });

  it("refuses a buyer's refresh token on the seller side, and spends it", async () => {
    vi.mocked(repo.findUserById).mockResolvedValue(user("buyer"));
    await expect(refresh("x".repeat(43), "seller")).rejects.toMatchObject({ status: 401 });
    expect(repo.revokeRefreshToken).toHaveBeenCalled();
    expect(repo.insertRefreshToken).not.toHaveBeenCalled();
  });

  it("signs out every session when a used token is presented again", async () => {
    vi.mocked(repo.findRefreshTokenByHash).mockResolvedValue({ ...stored, revokedAt: new Date() });
    await expect(refresh("x".repeat(43), "buyer")).rejects.toMatchObject({ status: 401 });
    expect(repo.revokeAllRefreshTokensForUser).toHaveBeenCalledWith(stored.userId);
  });
});
