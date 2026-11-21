import { Router } from "express";
import { z } from "zod";
import {
  adminSellerListQuerySchema,
  closeMaintenanceSchema,
  maintenanceHistoryQuerySchema,
  reviewSellerSchema,
  reviewSellerUpdateSchema,
  scheduleMaintenanceSchema,
  startMaintenanceSchema,
  type AdminSellerListQuery,
  type CloseMaintenanceInput,
  type MaintenanceHistoryQuery,
  type ReviewSellerData,
  type ReviewSellerUpdateData,
  type ScheduleMaintenanceInput,
  type StartMaintenanceInput,
} from "../../schemas";
import { validateBody, validateParams, validateQuery } from "../../shared/http";
import { clientIp, limitByUser } from "../../shared/rate-limit";
import { requireAuth, requireRole } from "../auth";
import {
  cancelMaintenance,
  endMaintenance,
  getAdminMaintenance,
  listMaintenanceHistory,
  scheduleMaintenance,
  startMaintenance,
} from "../maintenance";
import {
  getDocumentLinkForAdmin,
  getSellerForAdmin,
  getSellerStatsForAdmin,
  listSellersForAdmin,
  reviewSeller,
  reviewSellerUpdate,
} from "../seller";

/**
 * Admin console endpoints. Routes layer only: every route needs a valid
 * ADMIN session; the business rules (and the audit log) live in the
 * owning modules' services.
 */
export const adminRouter = Router();

const MINUTE = 60_000;
const readLimit = limitByUser({ name: "admin-read:user", max: 600, windowMs: 15 * MINUTE });

adminRouter.use(requireAuth, requireRole("admin"));

adminRouter.get("/sellers/stats", readLimit, async (_req, res) => {
  res.json(await getSellerStatsForAdmin());
});

adminRouter.get("/sellers", readLimit, validateQuery(adminSellerListQuerySchema), async (_req, res) => {
  res.json(await listSellersForAdmin(res.locals.query as AdminSellerListQuery));
});

const sellerParams = z.object({ userId: z.string().uuid() });
adminRouter.get("/sellers/:userId", readLimit, validateParams(sellerParams), async (req, res) => {
  const { userId } = sellerParams.parse(req.params);
  res.json(await getSellerForAdmin(userId));
});

const documentParams = z.object({ userId: z.string().uuid(), documentId: z.string().uuid() });
adminRouter.get(
  "/sellers/:userId/documents/:documentId/file",
  limitByUser({ name: "admin-doc-link:user", max: 300, windowMs: 15 * MINUTE }),
  validateParams(documentParams),
  async (req, res) => {
    const { userId, documentId } = documentParams.parse(req.params);
    res.json(await getDocumentLinkForAdmin({ userId: req.auth!.userId, ip: clientIp(req) }, userId, documentId));
  },
);

adminRouter.post(
  "/sellers/:userId/review",
  limitByUser({ name: "admin-review:user", max: 120, windowMs: 15 * MINUTE }),
  validateParams(sellerParams),
  validateBody(reviewSellerSchema),
  async (req, res) => {
    const { userId } = sellerParams.parse(req.params);
    res.json(await reviewSeller({ userId: req.auth!.userId, ip: clientIp(req) }, userId, req.body as ReviewSellerData));
  },
);

/** Decide on a verified seller's updates (replaced documents, new company details). */
adminRouter.post(
  "/sellers/:userId/review-update",
  limitByUser({ name: "admin-review:user", max: 120, windowMs: 15 * MINUTE }),
  validateParams(sellerParams),
  validateBody(reviewSellerUpdateSchema),
  async (req, res) => {
    const { userId } = sellerParams.parse(req.params);
    res.json(await reviewSellerUpdate({ userId: req.auth!.userId, ip: clientIp(req) }, userId, req.body as ReviewSellerUpdateData));
  },
);

// ---------------------------------------------------------------- maintenance mode

/**
 * Every change asks for the admin's password again (checked in the
 * service, with its own lock-out after repeated wrong passwords) and is
 * audit logged. Writes are limited per admin on top of that.
 */
const maintenanceWriteLimit = limitByUser({ name: "admin-maintenance:user", max: 30, windowMs: 15 * MINUTE });
const windowParams = z.object({ id: z.string().uuid() });

adminRouter.get("/maintenance", readLimit, async (_req, res) => {
  res.json(await getAdminMaintenance());
});

adminRouter.get("/maintenance/history", readLimit, validateQuery(maintenanceHistoryQuerySchema), async (_req, res) => {
  res.json(await listMaintenanceHistory(res.locals.query as MaintenanceHistoryQuery));
});

adminRouter.post("/maintenance/start", maintenanceWriteLimit, validateBody(startMaintenanceSchema), async (req, res) => {
  res.json(await startMaintenance({ userId: req.auth!.userId, ip: clientIp(req) }, req.body as StartMaintenanceInput));
});

adminRouter.post("/maintenance/schedule", maintenanceWriteLimit, validateBody(scheduleMaintenanceSchema), async (req, res) => {
  res.json(await scheduleMaintenance({ userId: req.auth!.userId, ip: clientIp(req) }, req.body as ScheduleMaintenanceInput));
});

adminRouter.post(
  "/maintenance/:id/end",
  maintenanceWriteLimit,
  validateParams(windowParams),
  validateBody(closeMaintenanceSchema),
  async (req, res) => {
    const { id } = windowParams.parse(req.params);
    res.json(await endMaintenance({ userId: req.auth!.userId, ip: clientIp(req) }, id, req.body as CloseMaintenanceInput));
  },
);

adminRouter.post(
  "/maintenance/:id/cancel",
  maintenanceWriteLimit,
  validateParams(windowParams),
  validateBody(closeMaintenanceSchema),
  async (req, res) => {
    const { id } = windowParams.parse(req.params);
    res.json(await cancelMaintenance({ userId: req.auth!.userId, ip: clientIp(req) }, id, req.body as CloseMaintenanceInput));
  },
);
