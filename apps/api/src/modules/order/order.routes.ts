import { Router } from "express";
import { z } from "zod";
import {
  orderCreateSchema,
  orderListQuerySchema,
  type LastDeliveryResponse,
  type OrderCreateInput,
  type OrderListQuery,
  type OrderResponse,
} from "../../schemas";
import { validateBody, validateParams, validateQuery } from "../../shared/http";
import { limitByUser } from "../../shared/rate-limit";
import { requireAuth, requireRole } from "../auth";
import * as orderService from "./order.service";

/**
 * Routes layer: HTTP only. The user id always comes from the token.
 * - /v1/buyer/orders:  the signed-in BUYER's orders (confirm, cancel before paying, read).
 * - /v1/seller/orders: orders for the signed-in SELLER (read; fulfilment is Day 14).
 * Paying is in the payment module (POST /v1/buyer/orders/:id/pay).
 */
export const buyerOrderRouter = Router();
export const sellerOrderRouter = Router();

const MINUTE = 60_000;
const idParams = z.object({ id: z.string().uuid() });
const idOf = (params: unknown) => (params as { id: string }).id;

// ---------------------------------------------------------------- buyer

buyerOrderRouter.use(requireAuth, requireRole("buyer"));

const buyerRead = limitByUser({ name: "order-read:buyer", max: 600, windowMs: 15 * MINUTE });
const buyerCreate = limitByUser({ name: "order-create:buyer", max: 30, windowMs: 60 * MINUTE }, "You have confirmed many orders in the last hour. Please wait a little.");
const buyerWrite = limitByUser({ name: "order-write:buyer", max: 120, windowMs: 15 * MINUTE });

buyerOrderRouter.get("/", buyerRead, validateQuery(orderListQuerySchema), async (req, res) => {
  res.json(await orderService.listOrders("buyer", req.auth!.userId, res.locals.query as OrderListQuery));
});

buyerOrderRouter.get("/last-delivery", buyerRead, async (req, res) => {
  const body: LastDeliveryResponse = { delivery: await orderService.getLastDelivery(req.auth!.userId) };
  res.json(body);
});

buyerOrderRouter.post("/", buyerCreate, validateBody(orderCreateSchema), async (req, res) => {
  const { order, created } = await orderService.createOrder(req.auth!.userId, req.body as OrderCreateInput);
  const body: OrderResponse = { order };
  res.status(created ? 201 : 200).json(body);
});

buyerOrderRouter.get("/:id", buyerRead, validateParams(idParams), async (req, res) => {
  const body: OrderResponse = { order: await orderService.getOrder("buyer", req.auth!.userId, idOf(req.params)) };
  res.json(body);
});

buyerOrderRouter.post("/:id/cancel", buyerWrite, validateParams(idParams), async (req, res) => {
  const body: OrderResponse = { order: await orderService.cancelOrder(req.auth!.userId, idOf(req.params)) };
  res.json(body);
});

// ---------------------------------------------------------------- seller

sellerOrderRouter.use(requireAuth, requireRole("seller"));

const sellerRead = limitByUser({ name: "order-read:seller", max: 600, windowMs: 15 * MINUTE });

sellerOrderRouter.get("/", sellerRead, validateQuery(orderListQuerySchema), async (req, res) => {
  res.json(await orderService.listOrders("seller", req.auth!.userId, res.locals.query as OrderListQuery));
});

sellerOrderRouter.get("/:id", sellerRead, validateParams(idParams), async (req, res) => {
  const body: OrderResponse = { order: await orderService.getOrder("seller", req.auth!.userId, idOf(req.params)) };
  res.json(body);
});
