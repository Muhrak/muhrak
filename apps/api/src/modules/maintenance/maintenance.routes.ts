import { Router } from "express";
import { getSiteStatus } from "./maintenance.service";

/**
 * GET /v1/status: public. Whether maintenance is on (and for which part of
 * the site), and any window starting within 24 hours. The web app polls it
 * to show the maintenance page or the warning banner. Holds nothing
 * private: no admin names, no ids. The admin endpoints are in the admin
 * module's routes.
 */
export const statusRouter = Router();

statusRouter.get("/", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(await getSiteStatus());
});
