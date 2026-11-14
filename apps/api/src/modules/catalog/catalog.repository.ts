import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "../../db/client";
import {
  categories,
  productFitments,
  productPartNumbers,
  productPhotos,
  products,
  type CategoryRow,
  type ProductFitmentRow,
  type ProductPartNumberRow,
  type ProductPhotoRow,
  type ProductRow,
} from "../../db/schema";

/** Repository layer: database queries only. No business rules. */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export function inTransaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(work);
}

// ---------------------------------------------------------------- categories

export async function listCategories(): Promise<CategoryRow[]> {
  return db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.name));
}

export async function findCategory(id: string): Promise<CategoryRow | undefined> {
  const rows = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
  return rows[0];
}

export async function findCategories(ids: string[]): Promise<CategoryRow[]> {
  if (ids.length === 0) return [];
  return db.select().from(categories).where(inArray(categories.id, ids));
}

// ---------------------------------------------------------------- products

export type ProductFields = Omit<
  typeof products.$inferInsert,
  "id" | "sellerUserId" | "status" | "version" | "publishedAt" | "archivedAt" | "createdAt" | "updatedAt"
>;

export interface ProductChildren {
  partNumbers: { value: string; normalized: string }[];
  fitments: { make: string; model: string; normalized: string }[];
  photoUploadIds: string[];
}

export async function insertProduct(tx: Tx, values: ProductFields & { sellerUserId: string; at: Date }): Promise<ProductRow> {
  const { at, ...fields } = values;
  const rows = await tx
    .insert(products)
    .values({ ...fields, status: "draft", createdAt: at, updatedAt: at })
    .returning();
  const row = rows[0];
  if (!row) throw new Error("Insert into products returned no row");
  return row;
}

export async function findProduct(id: string): Promise<ProductRow | undefined> {
  const rows = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return rows[0];
}

/**
 * Save new fields only if the product is still at `version` and still the
 * seller's (one atomic update: two tabs cannot overwrite each other).
 * Returns undefined if another edit came first.
 */
export async function updateProductFields(
  tx: Tx,
  input: { id: string; sellerUserId: string; version: number; fields: ProductFields; at: Date },
): Promise<ProductRow | undefined> {
  const rows = await tx
    .update(products)
    .set({ ...input.fields, version: input.version + 1, updatedAt: input.at })
    .where(and(eq(products.id, input.id), eq(products.sellerUserId, input.sellerUserId), eq(products.version, input.version)))
    .returning();
  return rows[0];
}

/**
 * Move a product between statuses only from an allowed status (conditional
 * update: a double click or two tabs cannot apply a change twice).
 */
export async function changeStatus(input: {
  id: string;
  sellerUserId: string;
  from: ProductRow["status"][];
  to: ProductRow["status"];
  at: Date;
}): Promise<ProductRow | undefined> {
  const rows = await db
    .update(products)
    .set({
      status: input.to,
      version: sql`${products.version} + 1`,
      updatedAt: input.at,
      ...(input.to === "published" ? { publishedAt: input.at } : {}),
      ...(input.to === "archived" ? { archivedAt: input.at } : { archivedAt: null }),
    })
    .where(and(eq(products.id, input.id), eq(products.sellerUserId, input.sellerUserId), inArray(products.status, input.from)))
    .returning();
  return rows[0];
}

/** Replace part numbers, machines and photo order (attributes of the product, not separate records). */
export async function replaceChildren(tx: Tx, productId: string, children: ProductChildren): Promise<void> {
  await tx.delete(productPartNumbers).where(eq(productPartNumbers.productId, productId));
  await tx.delete(productFitments).where(eq(productFitments.productId, productId));
  await tx.delete(productPhotos).where(eq(productPhotos.productId, productId));
  if (children.partNumbers.length > 0) {
    await tx.insert(productPartNumbers).values(children.partNumbers.map((part, position) => ({ productId, ...part, position })));
  }
  if (children.fitments.length > 0) {
    await tx.insert(productFitments).values(children.fitments.map((fit, position) => ({ productId, ...fit, position })));
  }
  if (children.photoUploadIds.length > 0) {
    await tx.insert(productPhotos).values(children.photoUploadIds.map((uploadId, position) => ({ productId, uploadId, position })));
  }
}

export async function findChildren(productIds: string[]): Promise<{
  partNumbers: ProductPartNumberRow[];
  fitments: ProductFitmentRow[];
  photos: ProductPhotoRow[];
}> {
  if (productIds.length === 0) return { partNumbers: [], fitments: [], photos: [] };
  const [partNumbers, fitments, photos] = await Promise.all([
    db.select().from(productPartNumbers).where(inArray(productPartNumbers.productId, productIds)).orderBy(asc(productPartNumbers.position)),
    db.select().from(productFitments).where(inArray(productFitments.productId, productIds)).orderBy(asc(productFitments.position)),
    db.select().from(productPhotos).where(inArray(productPhotos.productId, productIds)).orderBy(asc(productPhotos.position)),
  ]);
  return { partNumbers, fitments, photos };
}

/** Photo upload ids already used by OTHER products (an upload belongs to one product). */
export async function findPhotosUsedElsewhere(uploadIds: string[], productId: string | null): Promise<string[]> {
  if (uploadIds.length === 0) return [];
  const rows = await db
    .select({ uploadId: productPhotos.uploadId })
    .from(productPhotos)
    .where(and(inArray(productPhotos.uploadId, uploadIds), productId ? ne(productPhotos.productId, productId) : undefined));
  return rows.map((row) => row.uploadId);
}

export interface ListCursor {
  at: Date;
  id: string;
}

export type ListFilter = "all" | "published" | "draft" | "out_of_stock" | "archived";

function filterCondition(filter: ListFilter) {
  switch (filter) {
    case "all":
      return ne(products.status, "archived");
    case "published":
      return eq(products.status, "published");
    case "draft":
      return eq(products.status, "draft");
    case "archived":
      return eq(products.status, "archived");
    case "out_of_stock":
      return and(ne(products.status, "archived"), eq(products.stockQuantity, 0));
  }
}

/**
 * One page of a seller's products, most recently changed first (keyset on
 * updated_at, id; backed by products_seller_status_updated_idx). `q`
 * matches the name, or a part number ignoring punctuation.
 */
export async function listSellerProducts(input: {
  sellerUserId: string;
  filter: ListFilter;
  q: { text: string; partNumber: string } | null;
  cursor: ListCursor | null;
  limit: number;
}): Promise<ProductRow[]> {
  const { q, cursor } = input;
  const search = q
    ? or(
        ilike(products.name, `%${q.text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`),
        q.partNumber
          ? sql`exists (select 1 from ${productPartNumbers} where ${productPartNumbers.productId} = ${products.id} and ${productPartNumbers.normalized} like ${`${q.partNumber}%`})`
          : undefined,
      )
    : undefined;
  return db
    .select()
    .from(products)
    .where(
      and(
        eq(products.sellerUserId, input.sellerUserId),
        filterCondition(input.filter),
        search,
        cursor ? sql`(${products.updatedAt}, ${products.id}) < (${cursor.at}, ${cursor.id})` : undefined,
      ),
    )
    .orderBy(desc(products.updatedAt), desc(products.id))
    .limit(input.limit);
}

/** Counts for the list tabs. */
export async function countSellerProducts(sellerUserId: string): Promise<Record<ListFilter, number>> {
  const rows = await db
    .select({
      all: sql<number>`count(*) filter (where ${products.status} <> 'archived')::int`,
      published: sql<number>`count(*) filter (where ${products.status} = 'published')::int`,
      draft: sql<number>`count(*) filter (where ${products.status} = 'draft')::int`,
      archived: sql<number>`count(*) filter (where ${products.status} = 'archived')::int`,
      out_of_stock: sql<number>`count(*) filter (where ${products.status} <> 'archived' and ${products.stockQuantity} = 0)::int`,
    })
    .from(products)
    .where(eq(products.sellerUserId, sellerUserId));
  return rows[0] ?? { all: 0, published: 0, draft: 0, archived: 0, out_of_stock: 0 };
}
