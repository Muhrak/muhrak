import { sql } from "drizzle-orm";
import { Router } from "express";
import { db } from "../../db/client";

export const healthRouter = Router();

/** Liveness: the process is up. */
healthRouter.get("/", (_req, res) => {
  res.json({ status: "ok" });
});

/** Readiness: the process can reach the database. Used by the host's health check. */
healthRouter.get("/ready", async (_req, res) => {
  try {
    await db.execute(sql`select 1`);
    res.json({ status: "ok", database: "ok" });
  } catch {
    res.status(503).json({ status: "unavailable", database: "unreachable" });
  }
});
