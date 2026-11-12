import { Router } from "express";
import { z } from "zod";
import {
  adminSellerListQuerySchema,
  reviewSellerSchema,
  type AdminSellerListQuery,
  type ReviewSellerData,
} from "@muhrak/schemas";
import { validateBody, validateParams, validateQuery } from "../../shared/http";
import { clientIp, limitByUser } from "../../shared/rate-limit";
import { requireAuth, requireRole } from "../auth";
import {
  getDocumentLinkForAdmin,
  getSellerForAdmin,
  getSellerStatsForAdmin,
  listSellersForAdmin,
  reviewSeller,
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
