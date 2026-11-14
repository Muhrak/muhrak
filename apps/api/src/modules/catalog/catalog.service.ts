import {
  normalizeFitment,
  normalizePartNumber,
  PRODUCT_LIMITS,
  toMinor,
  type Category,
  type Product,
  type ProductInput,
  type ProductListQuery,
  type ProductListResponse,
  type ProductStatus,
  type ProductStatusAction,
  type ProductSummary,
  type PublicProductCard,
} from "../../schemas";
import type { CategoryRow, ProductRow } from "../../db/schema";
import { badRequest, conflict, forbidden, notFound } from "../../shared/errors";
import { isSellerVerified } from "../seller";
import { attachUpload, getProductPhotoUrls } from "../upload";
import * as repo from "./catalog.repository";

/**
 * Catalog module: categories and the seller's products (Day 5).
 *
 * Rules:
 * - A seller sees and changes only their own products (a product of
 *   another seller looks exactly like one that does not exist).
 * - Products start as drafts. Only a VERIFIED seller can publish, and a
 *   published product needs at least one photo.
 * - Status changes follow STATUS_TRANSITIONS only.
 * - Products are never deleted: archived instead.
 * - Prices are typed as text and converted to integer baisa here (OMR only
 *   for the MVP); the client never sends an amount in minor units.
 * - An edit names the version it started from; a stale edit is refused.
 */

/** OMR only for the market test (developer decision, 14 Nov 2026). */
export const PRODUCT_CURRENCY = "OMR" as const;

/** Products per seller, archived ones included (abuse cap; raise when a real seller needs more). */
export const MAX_PRODUCTS_PER_SELLER = 5_000;

/** The one place that says which status changes are allowed. */
export const STATUS_TRANSITIONS: Record<ProductStatusAction, { from: ProductStatus[]; to: ProductStatus }> = {
  publish: { from: ["draft"], to: "published" },
  unpublish: { from: ["published"], to: "draft" },
  archive: { from: ["draft", "published"], to: "archived" },
  restore: { from: ["archived"], to: "draft" },
};

const NOT_FOUND = "Product not found";

// ---------------------------------------------------------------- categories

const toCategory = (row: CategoryRow): Category => ({ id: row.id, slug: row.slug, name: row.name });

export async function listCategories(): Promise<Category[]> {
  return (await repo.listCategories()).map(toCategory);
}

// ---------------------------------------------------------------- mapping

async function toProducts(rows: ProductRow[]): Promise<Product[]> {
  const ids = rows.map((row) => row.id);
  const [children, categoryRows] = await Promise.all([repo.findChildren(ids), repo.findCategories([...new Set(rows.map((r) => r.categoryId))])]);
  const photoUrls = await getProductPhotoUrls(children.photos.map((photo) => photo.uploadId));
  const categoryById = new Map(categoryRows.map((row) => [row.id, toCategory(row)]));
  return rows.map((row) => {
    const category = categoryById.get(row.categoryId);
    if (!category) throw new Error(`Category ${row.categoryId} missing`);
    return {
      id: row.id,
      status: row.status,
      name: row.name,
      category,
      partNumbers: children.partNumbers.filter((p) => p.productId === row.id).map((p) => p.value),
      brand: row.brand,
      partSource: row.partSource,
      condition: row.condition,
      price: row.priceAmount !== null && row.priceCurrency ? { amountMinor: row.priceAmount, currency: PRODUCT_CURRENCY } : null,
      unit: row.unit,
      stockQuantity: row.stockQuantity,
      availability: row.availability,
      leadTimeDays: row.leadTimeDays,
      description: row.description,
      fitments: children.fitments.filter((f) => f.productId === row.id).map((f) => ({ make: f.make, model: f.model })),
      photos: children.photos
        .filter((photo) => photo.productId === row.id)
        .flatMap((photo) => {
          const urls = photoUrls.get(photo.uploadId);
          return urls ? [{ uploadId: photo.uploadId, ...urls }] : [];
        }),
      version: row.version,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      publishedAt: row.publishedAt?.toISOString() ?? null,
    };
  });
}

async function toProduct(row: ProductRow): Promise<Product> {
  const [product] = await toProducts([row]);
  if (!product) throw new Error("Product mapping failed");
  return product;
}

/** The seller's own product, or 404 (also for another seller's product: no hint that it exists). */
async function ownProduct(sellerUserId: string, productId: string): Promise<ProductRow> {
  const row = await repo.findProduct(productId);
  if (!row || row.sellerUserId !== sellerUserId) throw notFound(NOT_FOUND);
  return row;
}

// ---------------------------------------------------------------- input

/** Validated input -> database fields. Server-side price conversion; OMR only. */
function toFields(input: ProductInput): repo.ProductFields {
  let priceAmount: number | null = null;
  if (input.price !== null) {
    try {
      priceAmount = toMinor(input.price, PRODUCT_CURRENCY);
    } catch {
      throw badRequest("Enter a price such as 120.000 (OMR, up to 3 decimals)", [{ path: "price", message: "Not a valid OMR amount" }]);
    }
    if (priceAmount <= 0) throw badRequest("The price must be more than zero", [{ path: "price", message: "Must be more than zero" }]);
    if (priceAmount > PRODUCT_LIMITS.maxPriceMinor) throw badRequest("The price is too high", [{ path: "price", message: "Too high" }]);
  }
  return {
    name: input.name,
    categoryId: input.categoryId,
    brand: input.brand,
    partSource: input.partSource,
    condition: input.condition,
    priceAmount,
    priceCurrency: priceAmount === null ? null : PRODUCT_CURRENCY,
    unit: input.unit,
    stockQuantity: input.stockQuantity,
    availability: input.availability,
    leadTimeDays: input.availability === "on_order" ? input.leadTimeDays : null,
    description: input.description,
  };
}

function toChildren(input: ProductInput): repo.ProductChildren {
  return {
    partNumbers: input.partNumbers.map((value) => ({ value, normalized: normalizePartNumber(value) })),
    fitments: input.fitments.map((fit) => ({ make: fit.make, model: fit.model, normalized: normalizeFitment(fit.make, fit.model) })),
    photoUploadIds: input.photoUploadIds,
  };
}

async function requireCategory(categoryId: string): Promise<void> {
  if (!(await repo.findCategory(categoryId))) {
    throw badRequest("Choose a category from the list", [{ path: "categoryId", message: "Choose a category from the list" }]);
  }
}

/**
 * Photos must be the seller's own ready product photos. New ones are
 * attached here (owner, purpose and "only once" are checked by the upload
 * module); ones already on THIS product are kept; one used by another
 * product is refused.
 */
async function preparePhotos(sellerUserId: string, productId: string | null, uploadIds: string[], current: string[]): Promise<void> {
  const elsewhere = await repo.findPhotosUsedElsewhere(uploadIds, productId);
  if (elsewhere.length > 0) throw badRequest("A photo belongs to another product. Upload it again for this one.");
  for (const uploadId of uploadIds) {
    if (current.includes(uploadId)) continue;
    await attachUpload(sellerUserId, uploadId, "product_photo");
  }
}

// ---------------------------------------------------------------- seller actions

export async function createProduct(sellerUserId: string, input: ProductInput, now = new Date()): Promise<Product> {
  const counts = await repo.countSellerProducts(sellerUserId);
  if (counts.all + counts.archived >= MAX_PRODUCTS_PER_SELLER) {
    throw forbidden(`You have reached the limit of ${MAX_PRODUCTS_PER_SELLER} products. Contact Muhrak support to raise it.`);
  }
  await requireCategory(input.categoryId);
  const fields = toFields(input);
  await preparePhotos(sellerUserId, null, input.photoUploadIds, []);
  const row = await repo.inTransaction(async (tx) => {
    const created = await repo.insertProduct(tx, { ...fields, sellerUserId, at: now });
    await repo.replaceChildren(tx, created.id, toChildren(input));
    return created;
  });
  return toProduct(row);
}

export async function getProduct(sellerUserId: string, productId: string): Promise<Product> {
  return toProduct(await ownProduct(sellerUserId, productId));
}

export async function updateProduct(
  sellerUserId: string,
  productId: string,
  update: { version: number; product: ProductInput },
  now = new Date(),
): Promise<Product> {
  const current = await ownProduct(sellerUserId, productId);
  if (current.status === "archived") throw conflict("Restore this product before editing it.");
  if (current.version !== update.version) throw staleEdit();
  if (current.status === "published" && update.product.photoUploadIds.length === 0) {
    throw badRequest("A live product needs at least one photo. Add a photo, or unpublish it first.");
  }
  await requireCategory(update.product.categoryId);
  const fields = toFields(update.product);
  const existingPhotos = (await repo.findChildren([productId])).photos.map((photo) => photo.uploadId);
  await preparePhotos(sellerUserId, productId, update.product.photoUploadIds, existingPhotos);

  const row = await repo.inTransaction(async (tx) => {
    const saved = await repo.updateProductFields(tx, { id: productId, sellerUserId, version: update.version, fields, at: now });
    if (!saved) throw staleEdit();
    await repo.replaceChildren(tx, productId, toChildren(update.product));
    return saved;
  });
  return toProduct(row);
}

function staleEdit() {
  return conflict("This product was changed in another window. Reload it to see the latest version, then make your change again.");
}

export async function changeProductStatus(
  sellerUserId: string,
  productId: string,
  action: ProductStatusAction,
  now = new Date(),
): Promise<Product> {
  const current = await ownProduct(sellerUserId, productId);
  const transition = STATUS_TRANSITIONS[action];
  if (!transition.from.includes(current.status)) {
    throw conflict(`This product is ${current.status === "published" ? "live" : current.status}; it cannot be ${PAST[action]} now.`);
  }
  if (action === "publish") {
    if (!(await isSellerVerified(sellerUserId))) {
      throw forbidden("Only verified sellers can publish products. Finish verification first; you can keep this product as a draft.");
    }
    if ((await repo.findChildren([productId])).photos.length === 0) {
      throw badRequest("Add at least one photo before publishing.");
    }
  }
  const row = await repo.changeStatus({ id: productId, sellerUserId, from: transition.from, to: transition.to, at: now });
  // Another request changed it in between (double click, second tab).
  if (!row) throw conflict("This product was just changed. Reload to see its current state.");
  return toProduct(row);
}

const PAST: Record<ProductStatusAction, string> = {
  publish: "published",
  unpublish: "unpublished",
  archive: "archived",
  restore: "restored",
};

// ---------------------------------------------------------------- list

function encodeCursor(row: ProductRow): string {
  return Buffer.from(JSON.stringify([row.updatedAt.toISOString(), row.id])).toString("base64url");
}

function decodeCursor(cursor: string | undefined): repo.ListCursor | null {
  if (!cursor) return null;
  try {
    const [at, id] = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as [unknown, unknown];
    const date = typeof at === "string" ? new Date(at) : null;
    if (!date || Number.isNaN(date.getTime()) || typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("bad");
    return { at: date, id };
  } catch {
    throw badRequest("This page link is not valid. Go back to the first page.");
  }
}

export async function listProducts(sellerUserId: string, query: ProductListQuery): Promise<ProductListResponse> {
  const text = query.q?.trim() ?? "";
  const rows = await repo.listSellerProducts({
    sellerUserId,
    filter: query.filter,
    q: text ? { text, partNumber: normalizePartNumber(text) } : null,
    cursor: decodeCursor(query.cursor),
    limit: query.limit + 1,
  });
  const page = rows.slice(0, query.limit);
  const [products, counts] = await Promise.all([toProducts(page), repo.countSellerProducts(sellerUserId)]);
  const items: ProductSummary[] = products.map((product) => ({
    id: product.id,
    status: product.status,
    name: product.name,
    partNumber: product.partNumbers[0] ?? null,
    categoryName: product.category.name,
    price: product.price,
    unit: product.unit,
    stockQuantity: product.stockQuantity,
    coverThumbUrl: product.photos[0]?.thumbUrl ?? null,
    updatedAt: product.updatedAt,
  }));
  const last = page.at(-1);
  return { items, nextCursor: rows.length > query.limit && last ? encodeCursor(last) : null, counts };
}

// ---------------------------------------------------------------- public storefront (for the storefront module)
// Callers pass only VERIFIED seller ids; everything here is published products only.

export interface SellerCatalogStats {
  productCount: number;
  mainCategory: string | null;
  coverPhotoUrl: string | null;
  /** Live products per category. */
  categories: { id: string; name: string; count: number }[];
}

export async function getSellerCatalogStats(sellerIds: string[]): Promise<Map<string, SellerCatalogStats>> {
  const [counts, newest] = await Promise.all([repo.countPublishedBySellerAndCategory(sellerIds), repo.findNewestPublishedPerSeller(sellerIds)]);
  const categoryRows = await repo.findCategories([...new Set(counts.map((row) => row.categoryId))]);
  const categoryName = new Map(categoryRows.map((row) => [row.id, row.name]));
  const covers = await repo.findChildren(newest.map((row) => row.productId));
  const coverUpload = new Map(newest.map((row) => [row.sellerUserId, covers.photos.find((photo) => photo.productId === row.productId)?.uploadId]));
  const urls = await getProductPhotoUrls([...coverUpload.values()].filter((id): id is string => Boolean(id)));

  const result = new Map<string, SellerCatalogStats>();
  for (const sellerId of sellerIds) {
    const rows = counts.filter((row) => row.sellerUserId === sellerId).sort((a, b) => b.count - a.count);
    const cover = coverUpload.get(sellerId);
    result.set(sellerId, {
      productCount: rows.reduce((sum, row) => sum + row.count, 0),
      mainCategory: rows[0] ? (categoryName.get(rows[0].categoryId) ?? null) : null,
      coverPhotoUrl: cover ? (urls.get(cover)?.url ?? null) : null,
      categories: rows.map((row) => ({ id: row.categoryId, name: categoryName.get(row.categoryId) ?? "", count: row.count })),
    });
  }
  return result;
}

/** Directory tabs: for each category, how many of these sellers have live products in it. */
export async function countSellersPerCategory(sellerIds: string[]): Promise<{ id: string; name: string; count: number }[]> {
  const counts = await repo.countPublishedBySellerAndCategory(sellerIds);
  const sellersPerCategory = new Map<string, Set<string>>();
  for (const row of counts) {
    const set = sellersPerCategory.get(row.categoryId) ?? new Set<string>();
    set.add(row.sellerUserId);
    sellersPerCategory.set(row.categoryId, set);
  }
  const categories = await repo.listCategories();
  return categories.flatMap((category) => {
    const count = sellersPerCategory.get(category.id)?.size ?? 0;
    return count > 0 ? [{ id: category.id, name: category.name, count }] : [];
  });
}

export function sellersPublishingInCategory(categoryId: string, sellerIds: string[]): Promise<string[]> {
  return repo.findSellersPublishingInCategory(categoryId, sellerIds);
}

/** Sellers whose live products match a search by part number, machine (make/model) or part brand. */
export function sellersMatchingProductText(text: string, sellerIds: string[]): Promise<string[]> {
  const brandPattern = `%${text.replace(/[\%_]/g, (char) => `\${char}`)}%`;
  return repo.findSellersByProductText(
    { partNumber: normalizePartNumber(text), fitment: text.toLowerCase().replace(/[^a-z0-9]/g, ""), brandPattern },
    sellerIds,
  );
}

const NEW_PRODUCT_DAYS = 30;

/** One page of a (verified) seller's live products, for their public profile. */
export async function listPublishedProducts(input: {
  sellerUserId: string;
  categoryId: string | null;
  page: number;
  pageSize: number;
  now?: Date;
}): Promise<{ items: PublicProductCard[]; total: number }> {
  const { rows, total } = await repo.listPublishedForSeller({
    sellerUserId: input.sellerUserId,
    categoryId: input.categoryId,
    offset: (input.page - 1) * input.pageSize,
    limit: input.pageSize,
  });
  const products = await toProducts(rows);
  const now = (input.now ?? new Date()).getTime();
  return {
    total,
    items: products.map((product) => ({
      id: product.id,
      name: product.name,
      partNumber: product.partNumbers[0] ?? null,
      categoryName: product.category.name,
      condition: product.condition,
      price: product.price,
      unit: product.unit,
      photoUrl: product.photos[0]?.url ?? null,
      isNew: product.publishedAt !== null && now - new Date(product.publishedAt).getTime() < NEW_PRODUCT_DAYS * 86_400_000,
    })),
  };
}
