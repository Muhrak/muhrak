import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRow } from "../../db/schema";

vi.hoisted(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgres://test:test@localhost:5432/test",
    JWT_SECRET: "test-secret-that-is-at-least-32-characters-long",
  });
});

vi.mock("./auth.repository", () => ({
  findUserByEmail: vi.fn(),
  updateUserEmail: vi.fn(),
  markUserEmailVerified: vi.fn(),
  revokeAllRefreshTokensForUser: vi.fn(),
}));
vi.mock("../notification", () => ({ sendPasswordResetEmail: vi.fn(), sendVerifyEmail: vi.fn(), sendAccountExistsEmail: vi.fn() }));

const repo = await import("./auth.repository");
const { changeAdminEmail } = await import("./auth.service");

const at = new Date("2026-11-14T10:00:00Z");
const account = (overrides: Partial<UserRow>): UserRow => ({
  id: "77777777-7777-4777-8777-777777777777",
  email: "old@muhrak.test",
  passwordHash: "scrypt$00$00",
  fullName: "Muhrak Admin",
  role: "admin",
  emailVerifiedAt: at,
  createdAt: at,
  updatedAt: at,
  ...overrides,
});

beforeEach(() => vi.clearAllMocks());

describe("changeAdminEmail", () => {
  it("moves the admin to the new email and signs them out everywhere", async () => {
    vi.mocked(repo.findUserByEmail).mockImplementation(async (email) => (email === "old@muhrak.test" ? account({}) : undefined));
    await changeAdminEmail({ currentEmail: "old@muhrak.test", newEmail: "new@muhrak.test" });
    expect(repo.updateUserEmail).toHaveBeenCalledWith(account({}).id, "new@muhrak.test");
    expect(repo.revokeAllRefreshTokensForUser).toHaveBeenCalledWith(account({}).id);
  });

  it("never touches a buyer or seller account", async () => {
    vi.mocked(repo.findUserByEmail).mockResolvedValue(account({ role: "seller" }));
    await expect(changeAdminEmail({ currentEmail: "old@muhrak.test", newEmail: "new@muhrak.test" })).rejects.toMatchObject({ status: 404 });
    expect(repo.updateUserEmail).not.toHaveBeenCalled();
  });

  it("refuses an email another account already uses", async () => {
    vi.mocked(repo.findUserByEmail).mockImplementation(async (email) =>
      email === "old@muhrak.test" ? account({}) : account({ id: "88888888-8888-4888-8888-888888888888", email, role: "buyer" }),
    );
    await expect(changeAdminEmail({ currentEmail: "old@muhrak.test", newEmail: "taken@muhrak.test" })).rejects.toMatchObject({ status: 409 });
    expect(repo.updateUserEmail).not.toHaveBeenCalled();
  });
});
