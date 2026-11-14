import { Router } from "express";
import { z } from "zod";
import {
  documentTypeSchema,
  sellerProfileInputSchema,
  submitDocumentSchema,
  type SellerAccount,
  type SellerProfileData,
} from "../../schemas";
import { validateBody, validateParams } from "../../shared/http";
import { limitByUser } from "../../shared/rate-limit";
import { requireAuth, requireRole } from "../auth";
import * as sellerService from "./seller.service";

/**
 * Routes layer: HTTP only. Every route is for the signed-in SELLER and acts
 * on their own account only: the user id always comes from the token, never
 * from the request.
 */
export const sellerRouter = Router();

const MINUTE = 60_000;
const writeLimit = limitByUser({ name: "seller-write:user", max: 60, windowMs: 15 * MINUTE });

sellerRouter.use(requireAuth, requireRole("seller"));

sellerRouter.get("/profile", limitByUser({ name: "seller-read:user", max: 300, windowMs: 15 * MINUTE }), async (req, res) => {
  const body: SellerAccount = await sellerService.getAccount(req.auth!.userId);
  res.json(body);
});

sellerRouter.put("/profile", writeLimit, validateBody(sellerProfileInputSchema), async (req, res) => {
  res.json(await sellerService.saveProfile(req.auth!.userId, req.body as SellerProfileData));
});

const typeParams = z.object({ type: documentTypeSchema });
sellerRouter.put(
  "/documents/:type",
  writeLimit,
  validateParams(typeParams),
  validateBody(submitDocumentSchema),
  async (req, res) => {
    const { type } = typeParams.parse(req.params);
    const input = req.body as z.output<typeof submitDocumentSchema>;
    res.json(await sellerService.submitDocument(req.auth!.userId, type, input));
  },
);

const idParams = z.object({ id: z.string().uuid() });
sellerRouter.get(
  "/documents/:id/file",
  limitByUser({ name: "seller-doc-link:user", max: 120, windowMs: 15 * MINUTE }),
  validateParams(idParams),
  async (req, res) => {
    const { id } = idParams.parse(req.params);
    res.json(await sellerService.getDocumentLink(req.auth!.userId, id));
  },
);

sellerRouter.post(
  "/verification/submit",
  limitByUser({ name: "seller-submit:user", max: 10, windowMs: 60 * MINUTE }),
  async (req, res) => {
    res.json(await sellerService.submitForReview(req.auth!.userId));
  },
);
