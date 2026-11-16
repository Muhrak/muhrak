import { Router } from "express";
import { z } from "zod";
import {
  createAiIdentificationSchema,
  type AiIdentificationResponse,
  type AiStatusResponse,
  type CreateAiIdentificationInput,
} from "../../schemas";
import { validateBody, validateParams } from "../../shared/http";
import { limitByUser } from "../../shared/rate-limit";
import { requireAuth, requireRole } from "../auth";
import * as aiService from "./ai.service";

/**
 * Routes layer: HTTP only. The user id always comes from the token.
 * /v1/seller/ai: the signed-in SELLER identifies their own product photos
 * (Day 6/7). The buyer side gets its own router on Day 8.
 */
export const sellerAiRouter = Router();

const MINUTE = 60_000;
const idParams = z.object({ id: z.string().uuid() });

sellerAiRouter.use(requireAuth, requireRole("seller"));

sellerAiRouter.get("/status", limitByUser({ name: "ai-status:user", max: 60, windowMs: MINUTE }), async (req, res) => {
  const body: AiStatusResponse = { available: await aiService.isAvailable(req.auth!.userId) };
  res.json(body);
});

sellerAiRouter.post(
  "/identifications",
  limitByUser({ name: "ai-identify:user", max: 20, windowMs: 15 * MINUTE }),
  validateBody(createAiIdentificationSchema),
  async (req, res) => {
    const { uploadId } = req.body as CreateAiIdentificationInput;
    const body: AiIdentificationResponse = { identification: await aiService.requestIdentification(req.auth!.userId, uploadId) };
    res.status(body.identification.status === "pending" ? 202 : 200).json(body);
  },
);

/** Polled by the form every couple of seconds until done or failed. */
sellerAiRouter.get(
  "/identifications/:id",
  limitByUser({ name: "ai-poll:user", max: 120, windowMs: MINUTE }),
  validateParams(idParams),
  async (req, res) => {
    const { id } = req.params as z.infer<typeof idParams>;
    const body: AiIdentificationResponse = { identification: await aiService.getIdentification(req.auth!.userId, id) };
    res.json(body);
  },
);
