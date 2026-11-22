import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RefreshTokenRow, UserRow } from "../../db/schema";

vi.hoisted(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgres://test:test@localhost:5432/test",
    JWT_SECRET: "test-secret-that-is-at-least-32-characters-long",
    ADMIN_SESSION_IDLE_MINUTES: "60",
    ADMIN_SESSION_MAX_HOURS: "8",
  });
});

vi.mock("./auth.repository", () => ({
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
  insertRefreshToken: vi.fn(),
  findRefreshTokenByHash: vi.fn(),
  revokeRefreshToken: vi.fn(),
  revokeAllRefreshTokensForUser: vi.fn(),
  useTotpStep: vi.fn(),
  setUserTotpSecret: vi.fn(),
}));
vi.mock("./password", () => ({ verifyPassword: vi.fn(), hashPassword: vi.fn() }));
vi.mock("../notification", () => ({ sendPasswordResetEmail: vi.fn(), sendVerifyEmail: vi.fn(), sendAccountExistsEmail: vi.fn() }));

const repo = await import("./auth.repository");
const { verifyPassword } = await import("./password");
const { confirmAdminTwoFactorSetup, login, refresh, sessionExpiry, startAdminTwoFactorSetup } = await import("./auth.service");
const totp = await import("./totp");

const HOUR = 60 * 60_000;

// ---------------------------------------------------------------- the code itself

describe("TOTP codes (RFC 6238 test vectors, SHA-1)", () => {
  const key = Buffer.from("12345678901234567890");
  it.each([
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
  ])("time %i gives %s", (seconds, expected) => {
    expect(totp.totpCode(key, Math.floor(seconds / 30), 8)).toBe(expected);
  });

  it("base32 round trip (what the admin types into the app)", () => {
    const k = totp.generateTotpKey();
    expect(totp.base32Decode(totp.base32Encode(k)).equals(k)).toBe(true);
    expect(totp.base32Encode(Buffer.from("12345678901234567890"))).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(totp.base32Decode("gezd gnbv-gy3t qojq gezd gnbv gy3t qojq").equals(key)).toBe(true);
  });

  it("accepts the current step and one either side, nothing further", () => {
    const now = new Date("2026-11-22T10:00:10Z");
    const step = totp.totpStep(now);
    expect(totp.matchTotp(key, totp.totpCode(key, step), now, null)).toBe(step);
    expect(totp.matchTotp(key, totp.totpCode(key, step - 1), now, null)).toBe(step - 1);
    expect(totp.matchTotp(key, totp.totpCode(key, step + 1), now, null)).toBe(step + 1);
    expect(totp.matchTotp(key, totp.totpCode(key, step - 2), now, null)).toBeNull();
    expect(totp.matchTotp(key, totp.totpCode(key, step + 2), now, null)).toBeNull();
  });

  it("never accepts a step already used (replay), or junk", () => {
    const now = new Date("2026-11-22T10:00:10Z");
    const step = totp.totpStep(now);
    expect(totp.matchTotp(key, totp.totpCode(key, step), now, step)).toBeNull();
    expect(totp.matchTotp(key, totp.totpCode(key, step - 1), now, step - 1)).toBeNull();
    expect(totp.matchTotp(key, "12345", now, null)).toBeNull();
    expect(totp.matchTotp(key, "abcdef", now, null)).toBeNull();
  });

  it("stores the key encrypted; a damaged or foreign value does not open", () => {
    const k = totp.generateTotpKey();
    const sealed = totp.sealTotpKey(k);
    expect(sealed).not.toContain(totp.base32Encode(k));
    expect(totp.openTotpKey(sealed)?.equals(k)).toBe(true);
    const parts = sealed.split(".");
    parts[3] = Buffer.from("tampered-value-here").toString("base64url");
    expect(totp.openTotpKey(parts.join("."))).toBeNull();
    expect(totp.openTotpKey("v2.a.b.c")).toBeNull();
    expect(totp.openTotpKey("")).toBeNull();
  });
});

// ---------------------------------------------------------------- admin login

const key = totp.generateTotpKey();
function admin(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: "88888888-8888-4888-8888-888888888888",
    email: "admin@muhrak.test",
    passwordHash: "scrypt$00$00",
    fullName: "Muhrak Admin",
    role: "admin",
    emailVerifiedAt: new Date("2026-11-10T08:00:00Z"),
    totpSecret: totp.sealTotpKey(key),
    totpLastStep: null,
    createdAt: new Date("2026-11-10T08:00:00Z"),
    updatedAt: new Date("2026-11-10T08:00:00Z"),
    ...overrides,
  };
}

let n = 0;
function credentials() {
  n += 1;
  return { email: `admin${n}@muhrak.test`, password: "correct horse battery staple", ip: `10.9.0.${n}` };
}
const now = new Date("2026-11-22T10:00:10Z");
const codeNow = () => totp.totpCode(key, totp.totpStep(now));

describe("admin login needs the authenticator code", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(verifyPassword).mockResolvedValue(true);
    vi.mocked(repo.useTotpStep).mockResolvedValue(true);
    vi.mocked(repo.findUserByEmail).mockResolvedValue(admin());
  });

  it("right password, no code: asks for the code, issues nothing", async () => {
    const { ip, ...c } = credentials();
    await expect(login({ ...c, role: "admin" }, ip, now)).rejects.toMatchObject({ status: 401, code: "two_factor_required" });
    expect(repo.insertRefreshToken).not.toHaveBeenCalled();
  });

  it("wrong password with a code: the generic answer (the code is not even looked at)", async () => {
    const { ip, ...c } = credentials();
    vi.mocked(verifyPassword).mockResolvedValue(false);
    await expect(login({ ...c, role: "admin", totpCode: codeNow() }, ip, now)).rejects.toMatchObject({ status: 401, code: "unauthorized" });
    expect(repo.useTotpStep).not.toHaveBeenCalled();
  });

  it("password and right code: signed in, and the code's step is spent", async () => {
    const { ip, ...c } = credentials();
    const session = await login({ ...c, role: "admin", totpCode: codeNow() }, ip, now);
    expect(session.user.role).toBe("admin");
    expect(repo.useTotpStep).toHaveBeenCalledWith(admin().id, totp.totpStep(now));
  });

  it("a wrong code is refused", async () => {
    const { ip, ...c } = credentials();
    const wrong = codeNow() === "000000" ? "111111" : "000000";
    await expect(login({ ...c, role: "admin", totpCode: wrong }, ip, now)).rejects.toMatchObject({ status: 401, code: "two_factor_invalid" });
    expect(repo.insertRefreshToken).not.toHaveBeenCalled();
  });

  it("a code already used (two logins racing, or replay) is refused", async () => {
    const { ip, ...c } = credentials();
    vi.mocked(repo.useTotpStep).mockResolvedValue(false);
    await expect(login({ ...c, role: "admin", totpCode: codeNow() }, ip, now)).rejects.toMatchObject({ code: "two_factor_invalid" });
    vi.mocked(repo.useTotpStep).mockResolvedValue(true);
    vi.mocked(repo.findUserByEmail).mockResolvedValue(admin({ totpLastStep: totp.totpStep(now) }));
    await expect(login({ ...c, role: "admin", totpCode: codeNow() }, ip, now)).rejects.toMatchObject({ code: "two_factor_invalid" });
    expect(repo.insertRefreshToken).not.toHaveBeenCalled();
  });

  it("wrong codes count as failed logins: after 5, even the right code is locked out", async () => {
    const { ip, ...c } = credentials();
    const wrong = codeNow() === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i += 1) {
      await expect(login({ ...c, role: "admin", totpCode: wrong }, ip, now)).rejects.toMatchObject({ code: "two_factor_invalid" });
    }
    await expect(login({ ...c, role: "admin", totpCode: codeNow() }, ip, now)).rejects.toMatchObject({ status: 429 });
    expect(repo.insertRefreshToken).not.toHaveBeenCalled();
  });

  it("an admin with no key (or one sealed under another secret) cannot log in at all", async () => {
    const { ip, ...c } = credentials();
    vi.mocked(repo.findUserByEmail).mockResolvedValue(admin({ totpSecret: null }));
    await expect(login({ ...c, role: "admin", totpCode: "123456" }, ip, now)).rejects.toMatchObject({ status: 403, code: "two_factor_not_set_up" });
    vi.mocked(repo.findUserByEmail).mockResolvedValue(admin({ totpSecret: "v1.AAAA.BBBB.CCCC" }));
    await expect(login({ ...c, role: "admin", totpCode: "123456" }, ip, now)).rejects.toMatchObject({ code: "two_factor_not_set_up" });
    expect(repo.insertRefreshToken).not.toHaveBeenCalled();
  });

  it("buyers and sellers are not asked for a code", async () => {
    const { ip, ...c } = credentials();
    vi.mocked(repo.findUserByEmail).mockResolvedValue(admin({ role: "buyer", totpSecret: null }));
    const session = await login({ ...c, role: "buyer" }, ip, now);
    expect(session.user.role).toBe("buyer");
    expect(repo.useTotpStep).not.toHaveBeenCalled();
  });

  it("an admin account on the buyer side is still refused before any code", async () => {
    const { ip, ...c } = credentials();
    await expect(login({ ...c, role: "buyer", totpCode: codeNow() }, ip, now)).rejects.toMatchObject({ status: 403, code: "forbidden" });
    expect(repo.useTotpStep).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- admin session length

describe("admin sessions are short", () => {
  it("expire after 1 hour idle, and never later than 8 hours after login", () => {
    const start = new Date("2026-11-22T08:00:00Z");
    expect(sessionExpiry("admin", start, start).getTime()).toBe(start.getTime() + HOUR);
    const late = new Date(start.getTime() + 7.5 * HOUR);
    expect(sessionExpiry("admin", start, late).getTime()).toBe(start.getTime() + 8 * HOUR);
  });

  it("buyers and sellers keep the long session", () => {
    const start = new Date("2026-11-22T08:00:00Z");
    expect(sessionExpiry("buyer", start, start).getTime()).toBe(start.getTime() + 30 * 24 * HOUR);
  });

  const stored = (startedAt: Date): RefreshTokenRow => ({
    id: "33333333-3333-4333-8333-333333333333",
    userId: admin().id,
    tokenHash: "hash",
    expiresAt: new Date(Date.now() + HOUR),
    revokedAt: null,
    sessionStartedAt: startedAt,
    createdAt: new Date(),
  });

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(repo.revokeRefreshToken).mockResolvedValue(true);
    vi.mocked(repo.findUserById).mockResolvedValue(admin());
  });

  it("a refresh keeps the login time, so the 8-hour end does not move", async () => {
    const startedAt = new Date(Date.now() - 2 * HOUR);
    vi.mocked(repo.findRefreshTokenByHash).mockResolvedValue(stored(startedAt));
    const session = await refresh("x".repeat(43), "admin");
    expect(vi.mocked(repo.insertRefreshToken).mock.calls[0]![0].sessionStartedAt).toEqual(startedAt);
    expect(session.refreshExpiresAt.getTime()).toBeLessThanOrEqual(Date.now() + HOUR + 1000);
  });

  it("an admin session past 8 hours cannot be refreshed", async () => {
    vi.mocked(repo.findRefreshTokenByHash).mockResolvedValue(stored(new Date(Date.now() - 8 * HOUR - 1000)));
    await expect(refresh("x".repeat(43), "admin")).rejects.toMatchObject({ status: 401 });
    expect(repo.insertRefreshToken).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- setup from the command line

describe("two-factor setup (command line)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(repo.findUserByEmail).mockResolvedValue(admin({ totpSecret: null }));
  });

  it("saves the key only after a right code, encrypted, and signs the admin out", async () => {
    const { key: shown, uri } = await startAdminTwoFactorSetup("admin@muhrak.test");
    expect(uri).toContain(`secret=${shown}`);
    const code = totp.totpCode(totp.base32Decode(shown), totp.totpStep(new Date()));
    await confirmAdminTwoFactorSetup({ email: "admin@muhrak.test", key: shown, code });
    const saved = vi.mocked(repo.setUserTotpSecret).mock.calls[0]![1];
    expect(saved).not.toContain(shown);
    expect(totp.openTotpKey(saved)?.equals(totp.base32Decode(shown))).toBe(true);
    expect(repo.revokeAllRefreshTokensForUser).toHaveBeenCalledWith(admin().id);
  });

  it("a wrong code saves nothing", async () => {
    const { key: shown } = await startAdminTwoFactorSetup("admin@muhrak.test");
    const right = totp.totpCode(totp.base32Decode(shown), totp.totpStep(new Date()));
    await expect(confirmAdminTwoFactorSetup({ email: "admin@muhrak.test", key: shown, code: right === "000000" ? "111111" : "000000" })).rejects.toMatchObject({ status: 400 });
    expect(repo.setUserTotpSecret).not.toHaveBeenCalled();
  });

  it("only for admin accounts", async () => {
    vi.mocked(repo.findUserByEmail).mockResolvedValue(admin({ role: "seller" }));
    await expect(startAdminTwoFactorSetup("admin@muhrak.test")).rejects.toMatchObject({ status: 404 });
    await expect(confirmAdminTwoFactorSetup({ email: "admin@muhrak.test", key: "GEZDGNBV", code: "123456" })).rejects.toMatchObject({ status: 404 });
    expect(repo.setUserTotpSecret).not.toHaveBeenCalled();
  });
});
