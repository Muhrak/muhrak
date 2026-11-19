import { Router } from "express";
import { z } from "zod";
import {
  createAiIdentificationSchema,
  type AiIdentificationPhotosResponse,
  type AiIdentificationResponse,
  type AiStatusResponse,
  type CreateAiIdentificationInput,
  type FileLink,
} from "../../schemas";
import { validateBody, validateParams } from "../../shared/http";
import { limitByUser } from "../../shared/rate-limit";
import { requireAuth, requireRole } from "../auth";
import type { AiPhotoPurpose } from "../upload";
import * as aiService from "./ai.service";

/**
 * Routes layer: HTTP only. The user id always comes from the token.
 * /v1/seller/ai: the signed-in SELLER identifies their own product photos
 * (Day 6/7). /v1/buyer/ai: the signed-in BUYER identifies their own private
 * part photo for photo search (Day 8). Each side has its own router, role
 * check and photo kind; the limits and budget are shared.
 */
export const sellerAiRouter = Router();
export const buyerAiRouter = Router();

const MINUTE = 60_000;
const idParams = z.object({ id: z.string().uuid() });

sellerAiRouter.use(requireAuth, requireRole("seller"));
buyerAiRouter.use(requireAuth, requireRole("buyer"));

function identificationRoutes(router: Router, purpose: AiPhotoPurpose): void {
  router.get("/status", limitByUser({ name: "ai-status:user", max: 60, windowMs: MINUTE }), async (req, res) => {
    const body: AiStatusResponse = {
      available: await aiService.isAvailable(req.auth!.userId),
    };
    res.json(body);
  });

  router.post(
    "/identifications",
    limitByUser({ name: "ai-identify:user", max: 20, windowMs: 15 * MINUTE }),
    validateBody(createAiIdentificationSchema),
    async (req, res) => {
      const { uploadId, moreUploadIds } = req.body as CreateAiIdentificationInput;
      const body: AiIdentificationResponse = {
        identification: await aiService.requestIdentification(req.auth!.userId, uploadId, purpose, new Date(), moreUploadIds ?? []),
      };
      res.status(body.identification.status === "pending" ? 202 : 200).json(body);
    },
  );

  /** Polled by the form every couple of seconds until done or failed. */
  router.get(
    "/identifications/:id",
    limitByUser({ name: "ai-poll:user", max: 120, windowMs: MINUTE }),
    validateParams(idParams),
    async (req, res) => {
      const { id } = req.params as z.infer<typeof idParams>;
      const body: AiIdentificationResponse = {
        identification: await aiService.getIdentification(req.auth!.userId, id),
      };
      res.json(body);
    },
  );
}

identificationRoutes(sellerAiRouter, "product_photo");
identificationRoutes(buyerAiRouter, "part_photo");

/** The buyer's own photo, for the result page (a short-lived link; the photo is private). */
buyerAiRouter.get(
  "/identifications/:id/photo",
  limitByUser({ name: "ai-photo:user", max: 60, windowMs: MINUTE }),
  validateParams(idParams),
  async (req, res) => {
    const { id } = req.params as z.infer<typeof idParams>;
    const body: FileLink = await aiService.getIdentificationPhoto(req.auth!.userId, id);
    res.setHeader("Cache-Control", "private, no-store");
    res.json(body);
  },
);

/** All the buyer's own photos of a search (up to 4), for the result page; short-lived links. */
buyerAiRouter.get(
  "/identifications/:id/photos",
  limitByUser({ name: "ai-photo:user", max: 60, windowMs: MINUTE }),
  validateParams(idParams),
  async (req, res) => {
    const { id } = req.params as z.infer<typeof idParams>;
    const body: AiIdentificationPhotosResponse = { photos: await aiService.getIdentificationPhotos(req.auth!.userId, id) };
    res.setHeader("Cache-Control", "private, no-store");
    res.json(body);
  },
);
