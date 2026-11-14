import { Router } from "express";
import { z } from "zod";
import {
  productInputSchema,
  productListQuerySchema,
  productStatusActionSchema,
  productUpdateSchema,
  type CategoriesResponse,
  type ProductInput,
  type ProductListQuery,
  type ProductResponse,
  type ProductUpdate,
} from "../../schemas";
import { validateBody, validateParams, validateQuery } from "../../shared/http";
import { limitByIp, limitByUser } from "../../shared/rate-limit";
import { requireAuth, requireRole } from "../auth";
import * as catalogService from "./catalog.service";

/**
 * Routes layer: HTTP only.
 * - /v1/catalog/categories: public (no personal data).
 * - /v1/seller/products: the signed-in SELLER's own products; the seller id
 *   always comes from the token, never from the request.
 */
export const catalogRouter = Router();
export const sellerProductsRouter = Router();

const MINUTE = 60_000;

catalogRouter.get("/categories", limitByIp({ name: "categories:ip", max: 300, windowMs: 15 * MINUTE }), async (_req, res) => {
  const body: CategoriesResponse = { categories: await catalogService.listCategories() };
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json(body);
});

sellerProductsRouter.use(requireAuth, requireRole("seller"));

const readLimit = limitByUser({ name: "products-read:user", max: 600, windowMs: 15 * MINUTE });
const writeLimit = limitByUser({ name: "products-write:user", max: 120, windowMs: 15 * MINUTE });
const idParams = z.object({ id: z.string().uuid() });

sellerProductsRouter.get("/", readLimit, validateQuery(productListQuerySchema), async (req, res) => {
  // validateQuery stores the parsed (defaults applied) query on res.locals (Express 5: req.query is read-only).
  res.json(await catalogService.listProducts(req.auth!.userId, res.locals.query as ProductListQuery));
});

sellerProductsRouter.post("/", writeLimit, validateBody(productInputSchema), async (req, res) => {
  const body: ProductResponse = { product: await catalogService.createProduct(req.auth!.userId, req.body as ProductInput) };
  res.status(201).json(body);
});

sellerProductsRouter.get("/:id", readLimit, validateParams(idParams), async (req, res) => {
  const body: ProductResponse = { product: await catalogService.getProduct(req.auth!.userId, (req.params as { id: string }).id) };
  res.json(body);
});

sellerProductsRouter.put("/:id", writeLimit, validateParams(idParams), validateBody(productUpdateSchema), async (req, res) => {
  const body: ProductResponse = {
    product: await catalogService.updateProduct(req.auth!.userId, (req.params as { id: string }).id, req.body as ProductUpdate),
  };
  res.json(body);
});

sellerProductsRouter.post("/:id/status", writeLimit, validateParams(idParams), validateBody(productStatusActionSchema), async (req, res) => {
  const { action } = req.body as z.infer<typeof productStatusActionSchema>;
  const body: ProductResponse = { product: await catalogService.changeProductStatus(req.auth!.userId, (req.params as { id: string }).id, action) };
  res.json(body);
});
