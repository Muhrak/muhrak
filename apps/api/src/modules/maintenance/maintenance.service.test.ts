import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MaintenanceWindowRow } from "../../db/schema";
import { AppError } from "../../shared/errors";

vi.hoisted(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgres://test:test@localhost:5432/test",
    JWT_SECRET: "test-secret-that-is-at-least-32-characters-long",
  });
});
vi.mock("./maintenance.repository", () => ({
  withMaintenanceLock: vi.fn(async (work: (tx: unknown) => Promise<unknown>) => work({ tx: true })),
  findOpenWindows: vi.fn(async () => []),
  findLastClosedWindow: vi.fn(async () => undefined),
  lockWindow: vi.fn(),
  insertWindow: vi.fn(),
  endWindow: vi.fn(),
  cancelWindow: vi.fn(),
  listWindows: vi.fn(async () => []),
}));
vi.mock("../audit", () => ({ recordAudit: vi.fn() }));
vi.mock("../auth", () => ({
  confirmPassword: vi.fn(async () => undefined),
  getUsersByIds: vi.fn(async (ids: string[]) => ids.map((id) => ({ id, fullName: "Sara Al Mahrooqi", email: "a@muhrak.om", role: "admin", createdAt: "" }))),
  tokenRole: vi.fn(async () => null),
}));

const ADMIN = "99999999-9999-4999-8999-999999999999";
const WINDOW = "11111111-1111-4111-8111-111111111111";
const repo = await import("./maintenance.repository");
const { recordAudit } = await import("../audit");
const auth = await import("../auth");
const service = await import("./maintenance.service");
const { maintenanceGate, requestSide } = await import("./maintenance.gate");

const now = new Date("2026-11-15T10:00:00Z");
const actor = { userId: ADMIN, ip: "1.2.3.4" };
const minutes = (m: number) => new Date(now.getTime() + m * 60_000);
const MESSAGE = "We are upgrading Muhrak. Back soon.";

function row(overrides: Partial<MaintenanceWindowRow> = {}): MaintenanceWindowRow {
  return {
    id: WINDOW,
    scope: "whole_site",
    message: MESSAGE,
    startsAt: minutes(-10),
    endsAt: minutes(60),
    createdBy: ADMIN,
    createdAt: minutes(-10),
    endedAt: null,
    endedBy: null,
    cancelledAt: null,
    cancelledBy: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(repo.findOpenWindows).mockResolvedValue([]);
  vi.mocked(auth.confirmPassword).mockResolvedValue(undefined);
  vi.mocked(auth.tokenRole).mockResolvedValue(null);
  vi.mocked(repo.insertWindow).mockImplementation(async (_tx, values) => row({ ...values, id: WINDOW }));
  service.clearMaintenanceCache();
});

const wrongPassword = () => new AppError(403, "password_incorrect", "That password is not correct.");

// ---------------------------------------------------------------- state

describe("stateOf", () => {
  it("names every state", () => {
    expect(service.stateOf(row({ startsAt: minutes(5) }), now)).toBe("scheduled");
    expect(service.stateOf(row(), now)).toBe("active");
    expect(service.stateOf(row({ endsAt: null }), now)).toBe("active");
    expect(service.stateOf(row({ endsAt: now }), now)).toBe("finished");
    expect(service.stateOf(row({ endedAt: now, endedBy: ADMIN }), now)).toBe("ended");
    expect(service.stateOf(row({ startsAt: minutes(5), cancelledAt: now, cancelledBy: ADMIN }), now)).toBe("cancelled");
  });
});

// ---------------------------------------------------------------- turn on now

describe("startMaintenance", () => {
  it("opens a window from now, audit logged in the same transaction", async () => {
    await service.startMaintenance(actor, { scope: "buyer", message: MESSAGE, endsAt: minutes(90).toISOString(), password: "pw" }, now);
    expect(auth.confirmPassword).toHaveBeenCalledWith(ADMIN, "pw", "admin");
    expect(repo.insertWindow).toHaveBeenCalledWith({ tx: true }, expect.objectContaining({ scope: "buyer", startsAt: now, endsAt: minutes(90), createdBy: ADMIN }));
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "maintenance.started", actorUserId: ADMIN, ip: "1.2.3.4" }), { tx: true });
  });

  it("allows no end time (until an admin turns it off)", async () => {
    await service.startMaintenance(actor, { scope: "whole_site", message: MESSAGE, password: "pw" }, now);
    expect(repo.insertWindow).toHaveBeenCalledWith({ tx: true }, expect.objectContaining({ endsAt: null }));
  });

  it("refuses a wrong password and changes nothing", async () => {
    vi.mocked(auth.confirmPassword).mockRejectedValue(wrongPassword());
    await expect(service.startMaintenance(actor, { scope: "whole_site", message: MESSAGE, password: "bad" }, now)).rejects.toMatchObject({ status: 403 });
    expect(repo.withMaintenanceLock).not.toHaveBeenCalled();
    expect(repo.insertWindow).not.toHaveBeenCalled();
  });

  it("refuses a second window while one is open (double click, two admins)", async () => {
    vi.mocked(repo.findOpenWindows).mockResolvedValue([row()]);
    await expect(service.startMaintenance(actor, { scope: "whole_site", message: MESSAGE, password: "pw" }, now)).rejects.toMatchObject({ status: 409 });
    expect(repo.insertWindow).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it("checks the open windows inside the lock, with the transaction", async () => {
    await service.startMaintenance(actor, { scope: "whole_site", message: MESSAGE, password: "pw" }, now);
    expect(repo.findOpenWindows).toHaveBeenCalledWith(now, { tx: true });
  });

  it("refuses an end in the past, too soon or too far", async () => {
    for (const endsAt of [minutes(-5), minutes(2), minutes(73 * 60)]) {
      await expect(
        service.startMaintenance(actor, { scope: "whole_site", message: MESSAGE, endsAt: endsAt.toISOString(), password: "pw" }, now),
      ).rejects.toMatchObject({ status: 400 });
    }
    expect(repo.insertWindow).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- schedule

describe("scheduleMaintenance", () => {
  const input = (startsAt: Date, endsAt: Date) => ({ scope: "seller" as const, message: MESSAGE, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), password: "pw" });

  it("schedules a future window", async () => {
    await service.scheduleMaintenance(actor, input(minutes(60 * 30), minutes(60 * 31)), now);
    expect(repo.insertWindow).toHaveBeenCalledWith({ tx: true }, expect.objectContaining({ scope: "seller", startsAt: minutes(60 * 30), endsAt: minutes(60 * 31) }));
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "maintenance.scheduled" }), { tx: true });
  });

  it("refuses a start in the past, an end before the start, a too short or too long window, and more than 90 days ahead", async () => {
    const bad = [
      input(minutes(-30), minutes(30)),
      input(minutes(60), minutes(30)),
      input(minutes(60), minutes(62)),
      input(minutes(60), minutes(60 + 73 * 60)),
      input(minutes(91 * 24 * 60), minutes(91 * 24 * 60 + 60)),
    ];
    for (const body of bad) await expect(service.scheduleMaintenance(actor, body, now)).rejects.toMatchObject({ status: 400 });
    expect(auth.confirmPassword).not.toHaveBeenCalled();
    expect(repo.insertWindow).not.toHaveBeenCalled();
  });

  it("refuses when another window is open", async () => {
    vi.mocked(repo.findOpenWindows).mockResolvedValue([row({ startsAt: minutes(100) })]);
    await expect(service.scheduleMaintenance(actor, input(minutes(300), minutes(360)), now)).rejects.toMatchObject({ status: 409 });
  });
});

// ---------------------------------------------------------------- end / cancel

describe("endMaintenance", () => {
  it("ends a running window", async () => {
    vi.mocked(repo.lockWindow).mockResolvedValue(row());
    vi.mocked(repo.endWindow).mockResolvedValue(row({ endedAt: now, endedBy: ADMIN }));
    await service.endMaintenance(actor, WINDOW, { password: "pw" }, now);
    expect(repo.endWindow).toHaveBeenCalledWith({ tx: true }, WINDOW, ADMIN, now);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "maintenance.ended", entityId: WINDOW }), { tx: true });
  });

  it("refuses a wrong password before touching anything", async () => {
    vi.mocked(auth.confirmPassword).mockRejectedValue(wrongPassword());
    await expect(service.endMaintenance(actor, WINDOW, { password: "bad" }, now)).rejects.toMatchObject({ status: 403 });
    expect(repo.lockWindow).not.toHaveBeenCalled();
  });

  it("404 for an unknown window, 409 for one not started, already ended, finished, or ended by someone else meanwhile", async () => {
    vi.mocked(repo.lockWindow).mockResolvedValueOnce(undefined);
    await expect(service.endMaintenance(actor, WINDOW, { password: "pw" }, now)).rejects.toMatchObject({ status: 404 });
    for (const current of [row({ startsAt: minutes(5) }), row({ endedAt: now, endedBy: ADMIN }), row({ endsAt: minutes(-1) })]) {
      vi.mocked(repo.lockWindow).mockResolvedValueOnce(current);
      await expect(service.endMaintenance(actor, WINDOW, { password: "pw" }, now)).rejects.toMatchObject({ status: 409 });
    }
    vi.mocked(repo.lockWindow).mockResolvedValueOnce(row());
    vi.mocked(repo.endWindow).mockResolvedValueOnce(undefined);
    await expect(service.endMaintenance(actor, WINDOW, { password: "pw" }, now)).rejects.toMatchObject({ status: 409 });
    expect(recordAudit).not.toHaveBeenCalled();
  });
});

describe("cancelMaintenance", () => {
  it("cancels an upcoming window", async () => {
    vi.mocked(repo.lockWindow).mockResolvedValue(row({ startsAt: minutes(60), endsAt: minutes(120) }));
    vi.mocked(repo.cancelWindow).mockResolvedValue(row({ cancelledAt: now, cancelledBy: ADMIN }));
    await service.cancelMaintenance(actor, WINDOW, { password: "pw" }, now);
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "maintenance.cancelled" }), { tx: true });
  });

  it("refuses to cancel a window that has started (end it instead) or is over", async () => {
    for (const current of [row(), row({ startsAt: minutes(60), cancelledAt: now, cancelledBy: ADMIN })]) {
      vi.mocked(repo.lockWindow).mockResolvedValueOnce(current);
      await expect(service.cancelMaintenance(actor, WINDOW, { password: "pw" }, now)).rejects.toMatchObject({ status: 409 });
    }
    expect(repo.cancelWindow).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- public status

describe("getSiteStatus", () => {
  it("shows a running window with only public fields", async () => {
    vi.mocked(repo.findOpenWindows).mockResolvedValue([row({ scope: "seller" })]);
    const status = await service.getSiteStatus(now);
    expect(status).toEqual({ maintenance: { scope: "seller", message: MESSAGE, endsAt: minutes(60).toISOString() }, upcoming: null });
    expect(JSON.stringify(status)).not.toContain(ADMIN);
    expect(JSON.stringify(status)).not.toContain(WINDOW);
  });

  it("warns only within 24 hours of a scheduled start", async () => {
    vi.mocked(repo.findOpenWindows).mockResolvedValue([row({ startsAt: minutes(25 * 60), endsAt: minutes(26 * 60) })]);
    expect((await service.getSiteStatus(now)).upcoming).toBeNull();
    service.clearMaintenanceCache();
    vi.mocked(repo.findOpenWindows).mockResolvedValue([row({ startsAt: minutes(23 * 60), endsAt: minutes(24 * 60) })]);
    expect((await service.getSiteStatus(now)).upcoming).toMatchObject({ startsAt: minutes(23 * 60).toISOString() });
  });
});

describe("history", () => {
  it("refuses a tampered cursor", async () => {
    await expect(service.listMaintenanceHistory({ limit: 10, cursor: "not-a-cursor" }, now)).rejects.toMatchObject({ status: 400 });
  });
});

// ---------------------------------------------------------------- gate

function request(method: string, path: string, body?: unknown, authorization?: string) {
  return { method, path, body, headers: authorization ? { authorization } : {} } as unknown as Request;
}

async function gate(req: Request): Promise<{ error?: AppError; headers: Record<string, string> }> {
  const headers: Record<string, string> = {};
  const res = { setHeader: (name: string, value: string) => (headers[name] = value) } as unknown as Response;
  let error: AppError | undefined;
  await maintenanceGate(req, res, ((err?: unknown) => (error = err as AppError | undefined)) as NextFunction);
  return { error, headers };
}

async function blocked(req: Request) {
  return (await gate(req)).error?.status === 503;
}

describe("maintenance gate", () => {
  it("lets everything through when no window is in effect, including an upcoming one", async () => {
    vi.mocked(repo.findOpenWindows).mockResolvedValue([row({ startsAt: minutes(30) })]);
    expect(await blocked(request("GET", "/sellers"))).toBe(false);
    expect(await blocked(request("POST", "/auth/login", { role: "buyer" }))).toBe(false);
  });

  it("starts a scheduled window on time without a database reload", async () => {
    // Real clock here (the gate reads Date.now()), so no fixed end time: one would pass as the days go by.
    vi.mocked(repo.findOpenWindows).mockResolvedValue([row({ startsAt: new Date(Date.now() + 50), endsAt: null })]);
    expect(await blocked(request("GET", "/sellers"))).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(await blocked(request("GET", "/sellers"))).toBe(true);
    expect(repo.findOpenWindows).toHaveBeenCalledTimes(1);
  });

  describe("whole site", () => {
    beforeEach(() => vi.mocked(repo.findOpenWindows).mockResolvedValue([row({ startsAt: new Date(0), endsAt: null })]));

    it("blocks buyer, seller, public and account endpoints with 503, the admin's message and Retry-After", async () => {
      const result = await gate(request("GET", "/sellers"));
      expect(result.error).toMatchObject({ status: 503, code: "maintenance", message: MESSAGE });
      expect(result.headers["Retry-After"]).toBeDefined();
      expect(result.headers["Cache-Control"]).toBe("no-store");
      for (const req of [
        request("GET", "/seller/products"),
        request("POST", "/auth/login", { role: "buyer" }),
        request("POST", "/auth/login", { role: "seller" }),
        request("POST", "/auth/refresh", { role: "seller" }),
        request("POST", "/auth/register", { role: "buyer" }),
        request("POST", "/auth/forgot-password", { email: "a@b.om" }),
        request("GET", "/catalog/categories"),
        request("POST", "/uploads"),
        request("GET", "/no-such-route"),
      ]) {
        expect(await blocked(req)).toBe(true);
      }
    });

    it("keeps the admin console, the status, logout and the admin login and refresh working", async () => {
      for (const req of [
        request("GET", "/admin/maintenance"),
        request("POST", "/admin/maintenance/x/end"),
        request("GET", "/status"),
        request("POST", "/auth/logout", { role: "buyer" }),
        request("POST", "/auth/login", { role: "admin" }),
        request("POST", "/auth/refresh", { role: "admin" }),
      ]) {
        expect(await blocked(req)).toBe(false);
      }
    });

    it("lets a valid admin token through, but not a buyer, seller or forged one", async () => {
      vi.mocked(auth.tokenRole).mockResolvedValueOnce("admin");
      expect(await blocked(request("GET", "/auth/me", undefined, "Bearer good-admin"))).toBe(false);
      for (const role of ["buyer", "seller", null] as const) {
        vi.mocked(auth.tokenRole).mockResolvedValueOnce(role);
        expect(await blocked(request("GET", "/auth/me", undefined, "Bearer token"))).toBe(true);
      }
    });

    it("cannot be dodged with upper case or a trailing slash", async () => {
      expect(await blocked(request("GET", "/SELLER/products/"))).toBe(true);
      expect(await blocked(request("GET", "/Sellers"))).toBe(true);
      expect(await blocked(request("GET", "/Status"))).toBe(false); // the status itself is public anyway
      expect(await blocked(request("GET", "/administrator"))).toBe(true); // not /admin
    });

    it("a buyer cannot claim the admin side on other endpoints", async () => {
      expect(await blocked(request("POST", "/auth/register", { role: "admin" }))).toBe(true);
      expect(await blocked(request("POST", "/auth/verify-email", { role: "admin" }))).toBe(true);
      expect(await blocked(request("GET", "/sellers", { role: "admin" }))).toBe(true);
    });
  });

  describe("buyer app only", () => {
    beforeEach(() => vi.mocked(repo.findOpenWindows).mockResolvedValue([row({ scope: "buyer", startsAt: new Date(0), endsAt: null })]));

    it("blocks the buyer side", async () => {
      expect(await blocked(request("GET", "/sellers"))).toBe(true);
      expect(await blocked(request("GET", "/sellers/abc"))).toBe(true);
      expect(await blocked(request("POST", "/auth/login", { role: "buyer" }))).toBe(true);
      vi.mocked(auth.tokenRole).mockResolvedValueOnce("buyer");
      expect(await blocked(request("POST", "/uploads", undefined, "Bearer b"))).toBe(true);
    });

    it("keeps the seller side and shared endpoints working", async () => {
      expect(await blocked(request("GET", "/seller/products"))).toBe(false);
      expect(await blocked(request("POST", "/auth/login", { role: "seller" }))).toBe(false);
      expect(await blocked(request("GET", "/catalog/categories"))).toBe(false);
      expect(await blocked(request("POST", "/auth/forgot-password", { email: "a@b.om" }))).toBe(false);
      vi.mocked(auth.tokenRole).mockResolvedValueOnce("seller");
      expect(await blocked(request("POST", "/uploads", undefined, "Bearer s"))).toBe(false);
    });

    it("a seller token does not open the buyer site's public pages", async () => {
      vi.mocked(auth.tokenRole).mockResolvedValueOnce("seller");
      expect(await blocked(request("GET", "/sellers", undefined, "Bearer s"))).toBe(true);
    });
  });

  describe("Seller Centre only", () => {
    beforeEach(() => vi.mocked(repo.findOpenWindows).mockResolvedValue([row({ scope: "seller", startsAt: new Date(0), endsAt: null })]));

    it("blocks the seller side, keeps the buyer side", async () => {
      expect(await blocked(request("PATCH", "/seller/products/1"))).toBe(true);
      expect(await blocked(request("GET", "/seller"))).toBe(true);
      expect(await blocked(request("POST", "/auth/refresh", { role: "seller" }))).toBe(true);
      vi.mocked(auth.tokenRole).mockResolvedValueOnce("seller");
      expect(await blocked(request("GET", "/auth/me", undefined, "Bearer s"))).toBe(true);
      expect(await blocked(request("GET", "/sellers"))).toBe(false);
      expect(await blocked(request("POST", "/auth/login", { role: "buyer" }))).toBe(false);
    });
  });

  it("turning maintenance on takes effect at once (cache cleared)", async () => {
    expect(await blocked(request("GET", "/sellers"))).toBe(false);
    await service.startMaintenance(actor, { scope: "whole_site", message: MESSAGE, password: "pw" }, now);
    vi.mocked(repo.findOpenWindows).mockResolvedValue([row({ startsAt: new Date(0), endsAt: null })]);
    expect(await blocked(request("GET", "/sellers"))).toBe(true);
  });

  it("keeps the last known state if the database cannot be read (stays in maintenance)", async () => {
    vi.mocked(repo.findOpenWindows).mockResolvedValue([row({ startsAt: new Date(0), endsAt: null })]);
    expect(await blocked(request("GET", "/sellers"))).toBe(true);
    const realNow = Date.now;
    Date.now = () => realNow() + 10_000; // past the cache time
    try {
      vi.mocked(repo.findOpenWindows).mockRejectedValue(new Error("db down"));
      expect(await blocked(request("GET", "/sellers"))).toBe(true);
    } finally {
      Date.now = realNow;
    }
  });
});

describe("requestSide", () => {
  it("does not mistake the public /sellers directory for the Seller Centre", () => {
    expect(requestSide("/sellers", undefined, null)).toBe("buyer");
    expect(requestSide("/seller", undefined, null)).toBe("seller");
    expect(requestSide("/sellerx", undefined, null)).toBe("buyer");
  });
});
