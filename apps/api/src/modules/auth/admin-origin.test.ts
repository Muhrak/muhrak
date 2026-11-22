import type { Request } from "express";
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgres://test:test@localhost:5432/test",
    JWT_SECRET: "test-secret-that-is-at-least-32-characters-long",
    CORS_ORIGINS: "https://muhrak.test,https://admin.muhrak.test",
    ADMIN_WEB_ORIGIN: "https://admin.muhrak.test",
  });
});

const { refuseOtherOrigins, requireSideOrigin } = await import("./auth.cookies");

const PUBLIC = "https://muhrak.test";
const ADMIN = "https://admin.muhrak.test";

function run(handler: typeof requireSideOrigin, origin: string | undefined, body?: unknown): { status?: number } | undefined {
  const req = { headers: origin ? { origin } : {}, body } as unknown as Request;
  let result: { status?: number } | undefined = { status: 0 };
  handler(req, {} as never, (error?: unknown) => {
    result = error as { status?: number } | undefined;
  });
  return result;
}

describe("the admin console has its own origin", () => {
  it("admin login, refresh and logout only from the admin origin", () => {
    expect(run(requireSideOrigin, ADMIN, { role: "admin" })).toBeUndefined();
    expect(run(requireSideOrigin, PUBLIC, { role: "admin" })).toMatchObject({ status: 403 });
    expect(run(requireSideOrigin, undefined, { role: "admin" })).toMatchObject({ status: 403 });
  });

  it("buyer and seller sessions never from the admin origin", () => {
    expect(run(requireSideOrigin, PUBLIC, { role: "buyer" })).toBeUndefined();
    expect(run(requireSideOrigin, PUBLIC, { role: "seller" })).toBeUndefined();
    expect(run(requireSideOrigin, ADMIN, { role: "buyer" })).toMatchObject({ status: 403 });
    expect(run(requireSideOrigin, ADMIN, { role: "seller" })).toMatchObject({ status: 403 });
  });

  it("no side named: refused", () => {
    expect(run(requireSideOrigin, PUBLIC, {})).toMatchObject({ status: 403 });
  });

  it("the admin API refuses a browser request from the public origin", () => {
    expect(run(refuseOtherOrigins, PUBLIC)).toMatchObject({ status: 403 });
    expect(run(refuseOtherOrigins, "https://evil.test")).toMatchObject({ status: 403 });
    expect(run(refuseOtherOrigins, ADMIN)).toBeUndefined();
    // Same-origin reads carry no Origin header.
    expect(run(refuseOtherOrigins, undefined)).toBeUndefined();
  });
});
