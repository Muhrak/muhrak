import { Router } from "express";
import { z } from "zod";
import {
  rfqCreateSchema,
  rfqDeclineSchema,
  rfqListQuerySchema,
  type BuyerRfqResponse,
  type RfqCreateInput,
  type RfqDeclineInput,
  type RfqListQuery,
  type SellerRfqResponse,
} from "../../schemas";
import { validateBody, validateParams, validateQuery } from "../../shared/http";
import { limitByUser } from "../../shared/rate-limit";
import { requireAuth, requireRole } from "../auth";
import * as rfqService from "./rfq.service";

/**
 * Routes layer: HTTP only. The user id always comes from the token.
 * - /v1/buyer/rfqs:  the signed-in BUYER's own requests.
 * - /v1/seller/rfqs: requests sent to the signed-in SELLER.
 */
export const buyerRfqRouter = Router();
export const sellerRfqRouter = Router();

const MINUTE = 60_000;
const idParams = z.object({ id: z.string().uuid() });
const idOf = (params: unknown) => (params as { id: string }).id;

// ---------------------------------------------------------------- buyer

buyerRfqRouter.use(requireAuth, requireRole("buyer"));

const buyerRead = limitByUser({ name: "rfq-read:buyer", max: 600, windowMs: 15 * MINUTE });
const buyerWrite = limitByUser({ name: "rfq-write:buyer", max: 60, windowMs: 15 * MINUTE });
// Sending requests: 20 an hour and 60 a day per buyer (sellers get an email for each).
const sendHourly = limitByUser({ name: "rfq-send:hour", max: 20, windowMs: 60 * MINUTE }, "You have sent many requests in the last hour. Please wait a little.");
const sendDaily = limitByUser({ name: "rfq-send:day", max: 60, windowMs: 24 * 60 * MINUTE }, "You have reached today's limit of quote requests.");

buyerRfqRouter.get("/", buyerRead, validateQuery(rfqListQuerySchema), async (req, res) => {
  res.json(await rfqService.listBuyerRfqs(req.auth!.userId, res.locals.query as RfqListQuery));
});

buyerRfqRouter.post("/", sendHourly, sendDaily, validateBody(rfqCreateSchema), async (req, res) => {
  const { rfq, created } = await rfqService.createRfq(req.auth!.userId, req.body as RfqCreateInput);
  const body: BuyerRfqResponse = { rfq };
  res.status(created ? 201 : 200).json(body);
});

buyerRfqRouter.get("/:id", buyerRead, validateParams(idParams), async (req, res) => {
  const body: BuyerRfqResponse = { rfq: await rfqService.getBuyerRfq(req.auth!.userId, idOf(req.params)) };
  res.json(body);
});

buyerRfqRouter.post("/:id/cancel", buyerWrite, validateParams(idParams), async (req, res) => {
  const body: BuyerRfqResponse = { rfq: await rfqService.cancelRfq(req.auth!.userId, idOf(req.params)) };
  res.json(body);
});

// ---------------------------------------------------------------- seller

sellerRfqRouter.use(requireAuth, requireRole("seller"));

const sellerRead = limitByUser({ name: "rfq-read:seller", max: 600, windowMs: 15 * MINUTE });
const sellerWrite = limitByUser({ name: "rfq-write:seller", max: 120, windowMs: 15 * MINUTE });

sellerRfqRouter.get("/", sellerRead, validateQuery(rfqListQuerySchema), async (req, res) => {
  res.json(await rfqService.listSellerRfqs(req.auth!.userId, res.locals.query as RfqListQuery));
});

sellerRfqRouter.get("/:id", sellerRead, validateParams(idParams), async (req, res) => {
  const body: SellerRfqResponse = { rfq: await rfqService.getSellerRfq(req.auth!.userId, idOf(req.params)) };
  res.json(body);
});

sellerRfqRouter.post("/:id/decline", sellerWrite, validateParams(idParams), validateBody(rfqDeclineSchema), async (req, res) => {
  const { reason } = req.body as RfqDeclineInput;
  const body: SellerRfqResponse = { rfq: await rfqService.declineRfq(req.auth!.userId, idOf(req.params), reason) };
  res.json(body);
});
