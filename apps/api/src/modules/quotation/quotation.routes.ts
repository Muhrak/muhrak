import { Router, type Response } from "express";
import { z } from "zod";
import {
  quoteCreateSchema,
  quoteListQuerySchema,
  type QuoteCreateInput,
  type QuoteListQuery,
  type QuoteResponse,
} from "../../schemas";
import { validateBody, validateParams, validateQuery } from "../../shared/http";
import { limitByUser } from "../../shared/rate-limit";
import { requireAuth, requireRole } from "../auth";
import * as quoteService from "./quotation.service";

/**
 * Routes layer: HTTP only. The user id always comes from the token.
 * - /v1/seller/quotes: quotations the signed-in SELLER sends (send, withdraw, read, PDF).
 * - /v1/buyer/quotes:  quotations on the signed-in BUYER's own requests (read, PDF).
 */
export const sellerQuoteRouter = Router();
export const buyerQuoteRouter = Router();

const MINUTE = 60_000;
const idParams = z.object({ id: z.string().uuid() });
const idOf = (params: unknown) => (params as { id: string }).id;

function sendPdf(res: Response, file: { filename: string; pdf: Buffer }) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(file.pdf);
}

// ---------------------------------------------------------------- seller

sellerQuoteRouter.use(requireAuth, requireRole("seller"));

const sellerRead = limitByUser({ name: "quote-read:seller", max: 600, windowMs: 15 * MINUTE });
// Each quotation emails the buyer: 30 an hour, 200 a day per seller.
const sendHourly = limitByUser({ name: "quote-send:hour", max: 30, windowMs: 60 * MINUTE }, "You have sent many quotations in the last hour. Please wait a little.");
const sendDaily = limitByUser({ name: "quote-send:day", max: 200, windowMs: 24 * 60 * MINUTE }, "You have reached today's limit of quotations.");
const sellerWrite = limitByUser({ name: "quote-write:seller", max: 120, windowMs: 15 * MINUTE });
// Making a PDF costs CPU: 60 per 15 minutes per user.
const sellerPdf = limitByUser({ name: "quote-pdf:seller", max: 60, windowMs: 15 * MINUTE }, "Too many downloads. Please wait a little.");

sellerQuoteRouter.get("/", sellerRead, validateQuery(quoteListQuerySchema), async (req, res) => {
  res.json(await quoteService.listQuotes("seller", req.auth!.userId, res.locals.query as QuoteListQuery));
});

sellerQuoteRouter.post("/", sendHourly, sendDaily, validateBody(quoteCreateSchema), async (req, res) => {
  const { quote, created } = await quoteService.createQuote(req.auth!.userId, req.body as QuoteCreateInput);
  const body: QuoteResponse = { quote };
  res.status(created ? 201 : 200).json(body);
});

sellerQuoteRouter.get("/:id", sellerRead, validateParams(idParams), async (req, res) => {
  const body: QuoteResponse = { quote: await quoteService.getQuote("seller", req.auth!.userId, idOf(req.params)) };
  res.json(body);
});

sellerQuoteRouter.get("/:id/pdf", sellerPdf, validateParams(idParams), async (req, res) => {
  sendPdf(res, await quoteService.getQuotePdf("seller", req.auth!.userId, idOf(req.params)));
});

sellerQuoteRouter.post("/:id/withdraw", sellerWrite, validateParams(idParams), async (req, res) => {
  const body: QuoteResponse = { quote: await quoteService.withdrawQuote(req.auth!.userId, idOf(req.params)) };
  res.json(body);
});

// ---------------------------------------------------------------- buyer

buyerQuoteRouter.use(requireAuth, requireRole("buyer"));

const buyerRead = limitByUser({ name: "quote-read:buyer", max: 600, windowMs: 15 * MINUTE });
const buyerPdf = limitByUser({ name: "quote-pdf:buyer", max: 60, windowMs: 15 * MINUTE }, "Too many downloads. Please wait a little.");

buyerQuoteRouter.get("/", buyerRead, validateQuery(quoteListQuerySchema), async (req, res) => {
  res.json(await quoteService.listQuotes("buyer", req.auth!.userId, res.locals.query as QuoteListQuery));
});

buyerQuoteRouter.get("/:id", buyerRead, validateParams(idParams), async (req, res) => {
  const body: QuoteResponse = { quote: await quoteService.getQuote("buyer", req.auth!.userId, idOf(req.params)) };
  res.json(body);
});

buyerQuoteRouter.get("/:id/pdf", buyerPdf, validateParams(idParams), async (req, res) => {
  sendPdf(res, await quoteService.getQuotePdf("buyer", req.auth!.userId, idOf(req.params)));
});
