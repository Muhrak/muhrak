import { Router } from "express";
import { z } from "zod";
import { chatPhotoSendSchema, type ChatPhotoSendInput, type ChatTokenResponse, type FileLink, type Role } from "../../schemas";
import { validateBody, validateParams } from "../../shared/http";
import { limitByUser } from "../../shared/rate-limit";
import { requireAuth, requireRole } from "../auth";
import * as chatService from "./chat.service";

/**
 * Routes layer: HTTP only. The user id always comes from the token.
 * /v1/buyer/chat and /v1/seller/chat: each side has its own router and role
 * check (buyer and seller never share a chat session).
 */
export const buyerChatRouter = Router();
export const sellerChatRouter = Router();

const MINUTE = 60_000;
const rfqParams = z.object({ rfqId: z.string().uuid() });
const photoParams = z.object({ rfqId: z.string().uuid(), uploadId: z.string().uuid() });

function chatRoutes(router: Router, role: Role): void {
  router.use(requireAuth, requireRole(role));

  router.get("/token", limitByUser({ name: `chat-token:${role}`, max: 30, windowMs: MINUTE }), async (req, res) => {
    const body: ChatTokenResponse = await chatService.issueChatToken({ userId: req.auth!.userId, role });
    res.setHeader("Cache-Control", "no-store");
    res.json(body);
  });

  // Messaging limit (CLAUDE.md: rate-limit messaging): photos are the part that goes through the API.
  router.post(
    "/:rfqId/photos",
    limitByUser({ name: `chat-photo:${role}`, max: 30, windowMs: 15 * MINUTE }, "You have sent many photos. Please wait a little."),
    validateParams(rfqParams),
    validateBody(chatPhotoSendSchema),
    async (req, res) => {
      const { rfqId } = req.params as z.infer<typeof rfqParams>;
      await chatService.sendPhoto(req.auth!.userId, rfqId, (req.body as ChatPhotoSendInput).uploadId);
      res.status(204).end();
    },
  );

  router.get("/:rfqId/photos/:uploadId", limitByUser({ name: `chat-photo-link:${role}`, max: 300, windowMs: 15 * MINUTE }), validateParams(photoParams), async (req, res) => {
    const { rfqId, uploadId } = req.params as z.infer<typeof photoParams>;
    const body: FileLink = await chatService.getPhotoLink(req.auth!.userId, rfqId, uploadId);
    res.setHeader("Cache-Control", "private, no-store");
    res.json(body);
  });
}

chatRoutes(buyerChatRouter, "buyer");
chatRoutes(sellerChatRouter, "seller");
