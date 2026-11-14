import type { Request } from "express";
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgres://test:test@localhost:5432/test",
    JWT_SECRET: "test-secret-that-is-at-least-32-characters-long",
    API_PROXY_SECRET: "proxy-secret-that-is-at-least-32-characters",
  });
});

const { clientIp, hit } = await import("./rate-limit");

function request(headers: Record<string, string>, ip = "100.64.0.3"): Request {
  return { headers, ip, socket: { remoteAddress: ip } } as unknown as Request;
}

describe("clientIp", () => {
  it("uses the forwarded visitor IP when the proxy secret matches", () => {
    const req = request({
      "x-muhrak-client-ip": "45.13.57.236",
      "x-muhrak-proxy-secret": "proxy-secret-that-is-at-least-32-characters",
    });
    expect(clientIp(req)).toBe("45.13.57.236");
  });

  it("ignores a forged visitor IP without the secret", () => {
    expect(clientIp(request({ "x-muhrak-client-ip": "6.6.6.6" }))).toBe("100.64.0.3");
  });

  it("ignores a forged visitor IP with a wrong secret", () => {
    const req = request({ "x-muhrak-client-ip": "6.6.6.6", "x-muhrak-proxy-secret": "guess" });
    expect(clientIp(req)).toBe("100.64.0.3");
  });

  it("ignores a forwarded value that is not an IP", () => {
    const req = request({
      "x-muhrak-client-ip": "evil; DROP",
      "x-muhrak-proxy-secret": "proxy-secret-that-is-at-least-32-characters",
    });
    expect(clientIp(req)).toBe("100.64.0.3");
  });
});

describe("hit (in-memory counters)", () => {
  it("allows up to max hits per window, then refuses", async () => {
    const limit = { name: "test", max: 3, windowMs: 60_000 };
    const results = [];
    for (let i = 0; i < 4; i += 1) results.push((await hit(limit, "subject-1")).allowed);
    expect(results).toEqual([true, true, true, false]);
  });
});
