import { Router } from "express";
import { z } from "zod";
import { createUploadSchema, type CompleteUploadResponse, type CreateUploadInput } from "../../schemas";
import { validateBody, validateParams } from "../../shared/http";
import { limitByUser } from "../../shared/rate-limit";
import { requireAuth } from "../auth";
import * as uploadService from "./upload.service";

/** Routes layer: HTTP only. */
export const uploadRouter = Router();

const MINUTE = 60_000;
const idParams = z.object({ id: z.string().uuid() });

uploadRouter.use(requireAuth);

uploadRouter.post(
  "/",
  limitByUser({ name: "uploads:user", max: 60, windowMs: 15 * MINUTE }),
  validateBody(createUploadSchema),
  async (req, res) => {
    const auth = req.auth!;
    res.status(201).json(await uploadService.createUpload(auth, req.body as CreateUploadInput));
  },
);

uploadRouter.post(
  "/:id/complete",
  limitByUser({ name: "upload-complete:user", max: 60, windowMs: 15 * MINUTE }),
  validateParams(idParams),
  async (req, res) => {
    const { id } = req.params as z.infer<typeof idParams>;
    const body: CompleteUploadResponse = { upload: await uploadService.completeUpload(req.auth!.userId, id) };
    res.json(body);
  },
);
