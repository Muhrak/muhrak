import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRow } from "../../db/schema";

vi.hoisted(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgres://test:test@localhost:5432/test",
    JWT_SECRET: "test-secret-that-is-at-least-32-characters-long",
  });
});

vi.mock("./auth.repository", () => ({ findUserById: vi.fn() }));
vi.mock("./password", () => ({ verifyPassword: vi.fn(), hashPassword: vi.fn() }));
vi.mock("../notification", () => ({}));

const repo = await import("./auth.repository");
const { verifyPassword } = await import("./password");
const { confirmPassword, PASSWORD_CONFIRM_LIMIT } = await import("./auth.service");

let n = 0;
function admin(role: UserRow["role"] = "admin"): UserRow {
  n += 1;
  return { id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, role, passwordHash: "scrypt$00$00" } as UserRow;
}

beforeEach(() => vi.clearAllMocks());

describe("confirmPassword (step-up check before sensitive admin actions)", () => {
  it("accepts the right password", async () => {
    const user = admin();
    vi.mocked(repo.findUserById).mockResolvedValue(user);
    vi.mocked(verifyPassword).mockResolvedValue(true);
    await expect(confirmPassword(user.id, "right", "admin")).resolves.toBeUndefined();
  });

  it("refuses a wrong password with 403 password_incorrect (not 401, so the web app does not refresh and resend it)", async () => {
    const user = admin();
    vi.mocked(repo.findUserById).mockResolvedValue(user);
    vi.mocked(verifyPassword).mockResolvedValue(false);
    await expect(confirmPassword(user.id, "wrong", "admin")).rejects.toMatchObject({ status: 403, code: "password_incorrect" });
  });

  it("refuses an account of another side even with its right password", async () => {
    const user = admin("seller");
    vi.mocked(repo.findUserById).mockResolvedValue(user);
    vi.mocked(verifyPassword).mockResolvedValue(true);
    await expect(confirmPassword(user.id, "right", "admin")).rejects.toMatchObject({ status: 403 });
  });

  it("still runs the password hash for a missing account (same timing)", async () => {
    vi.mocked(repo.findUserById).mockResolvedValue(undefined);
    vi.mocked(verifyPassword).mockResolvedValue(false);
    await expect(confirmPassword(admin().id, "x", "admin")).rejects.toMatchObject({ status: 403 });
    expect(verifyPassword).toHaveBeenCalledTimes(1);
  });

  it("locks after repeated wrong passwords, even for the right one, and even when the guesses arrive at once", async () => {
    const user = admin();
    vi.mocked(repo.findUserById).mockResolvedValue(user);
    vi.mocked(verifyPassword).mockResolvedValue(false);
    const burst = await Promise.allSettled(Array.from({ length: PASSWORD_CONFIRM_LIMIT.max + 3 }, () => confirmPassword(user.id, "guess", "admin")));
    const checked = vi.mocked(verifyPassword).mock.calls.length;
    expect(checked).toBe(PASSWORD_CONFIRM_LIMIT.max);
    expect(burst.filter((r) => r.status === "rejected" && (r.reason as { status: number }).status === 429)).toHaveLength(3);

    vi.mocked(verifyPassword).mockResolvedValue(true);
    await expect(confirmPassword(user.id, "right", "admin")).rejects.toMatchObject({ status: 429 });
  });

  it("a right password clears earlier wrong ones", async () => {
    const user = admin();
    vi.mocked(repo.findUserById).mockResolvedValue(user);
    vi.mocked(verifyPassword).mockResolvedValue(false);
    for (let i = 0; i < PASSWORD_CONFIRM_LIMIT.max - 1; i++) await confirmPassword(user.id, "wrong", "admin").catch(() => undefined);
    vi.mocked(verifyPassword).mockResolvedValue(true);
    await confirmPassword(user.id, "right", "admin");
    vi.mocked(verifyPassword).mockResolvedValue(false);
    await expect(confirmPassword(user.id, "wrong", "admin")).rejects.toMatchObject({ status: 403 });
  });
});
