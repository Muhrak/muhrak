import { Router } from "express";
import { z } from "zod";
import {
  sellerDirectoryQuerySchema,
  sellerProductsQuerySchema,
  type PublicSellerResponse,
  type SellerDirectoryQuery,
  type SellerProductsQuery,
} from "../../schemas";
import { validateParams, validateQuery } from "../../shared/http";
import { limitByIp } from "../../shared/rate-limit";
import * as storefront from "./storefront.service";

/**
 * Public routes (no sign-in): /v1/sellers. Rate limited per IP. Responses
 * may be cached briefly by browsers (nothing personal in them).
 */
export const storefrontRouter = Router();

const MINUTE = 60_000;
const limit = limitByIp({ name: "storefront:ip", max: 300, windowMs: 5 * MINUTE });
const idParams = z.object({ id: z.string().uuid() });
const cache = "public, max-age=60";

storefrontRouter.get("/", limit, validateQuery(sellerDirectoryQuerySchema), async (_req, res) => {
  res.setHeader("Cache-Control", cache);
  res.json(await storefront.getDirectory(res.locals.query as SellerDirectoryQuery));
});

storefrontRouter.get("/:id", limit, validateParams(idParams), async (req, res) => {
  const body: PublicSellerResponse = { seller: await storefront.getSeller((req.params as { id: string }).id) };
  res.setHeader("Cache-Control", cache);
  res.json(body);
});

storefrontRouter.get("/:id/products", limit, validateParams(idParams), validateQuery(sellerProductsQuerySchema), async (req, res) => {
  res.setHeader("Cache-Control", cache);
  res.json(await storefront.getSellerProducts((req.params as { id: string }).id, res.locals.query as SellerProductsQuery));
});
