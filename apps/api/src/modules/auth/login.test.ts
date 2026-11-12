import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRow } from "../../db/schema";

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
  insertRefreshToken: vi.fn(),
}));
vi.mock("./password", () => ({ verifyPassword: vi.fn(), hashPassword: vi.fn() }));
vi.mock("../notification", () => ({ sendPasswordResetEmail: vi.fn() }));

const repo = await import("./auth.repository");
const { verifyPassword } = await import("./password");
const { login } = await import("./auth.service");

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

const credentials = { email: "khalid@email.com", password: "correct horse battery" };

describe("login: buyer and seller sides are separate", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(verifyPassword).mockResolvedValue(true);
  });

  it("logs a buyer in on the buyer side", async () => {
    vi.mocked(repo.findUserByEmail).mockResolvedValue(user("buyer"));
    const result = await login({ ...credentials, role: "buyer" });
    expect(result.user.role).toBe("buyer");
    expect(result.accessToken).toBeTruthy();
  });

  it("logs a seller in on the seller side", async () => {
    vi.mocked(repo.findUserByEmail).mockResolvedValue(user("seller"));
    const result = await login({ ...credentials, role: "seller" });
    expect(result.user.role).toBe("seller");
  });

  it("refuses a buyer account on the seller side, without issuing tokens", async () => {
    vi.mocked(repo.findUserByEmail).mockResolvedValue(user("buyer"));
    await expect(login({ ...credentials, role: "seller" })).rejects.toMatchObject({
      status: 403,
      message: "This is a buyer account. Log in on the buyer side.",
    });
    expect(repo.insertRefreshToken).not.toHaveBeenCalled();
  });

  it("refuses a seller account on the buyer side", async () => {
    vi.mocked(repo.findUserByEmail).mockResolvedValue(user("seller"));
    await expect(login({ ...credentials, role: "buyer" })).rejects.toMatchObject({ status: 403 });
    expect(repo.insertRefreshToken).not.toHaveBeenCalled();
  });

  it("checks the password before revealing the account's side", async () => {
    vi.mocked(repo.findUserByEmail).mockResolvedValue(user("seller"));
    vi.mocked(verifyPassword).mockResolvedValue(false);
    await expect(login({ ...credentials, role: "buyer" })).rejects.toMatchObject({
      status: 401,
      message: "Email or password is incorrect",
    });
  });
});
