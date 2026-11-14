import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * Database tables. Every module's tables are declared in this one file so
 * migrations see the whole schema, but a module only QUERIES its own tables
 * (through its repository). Other modules go through the owning module's
 * public functions.
 */

// ---------------------------------------------------------------- auth

export const userRole = pgEnum("user_role", ["buyer", "seller", "admin"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name").notNull(),
  role: userRole("role").notNull(),
  /**
   * Set when the user opens the link in the verification email (or resets
   * their password, which also proves they own the inbox). Null = cannot
   * sign in yet (developer decision, 14 Nov 2026). Admins are created
   * verified from the command line.
   */
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Refresh tokens are stored as SHA-256 hashes, never in plain text.
 * A token is used once: refreshing revokes it and issues a new one.
 */
export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("refresh_tokens_user_id_idx").on(table.userId)],
);

/**
 * One-time password reset links. Only the SHA-256 hash of the token is
 * stored; the token itself exists only in the email. A token works once and
 * expires after a short time.
 */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("password_reset_tokens_user_id_idx").on(table.userId)],
);

/**
 * Email verification codes (6 digits, sent by email at sign-up). Stored only
 * as an HMAC bound to the user, never in plain text. Single use; only the
 * newest code of a user works (older ones are marked used when a new one is
 * sent); `attempts` counts wrong guesses and the code dies after five.
 * (The table name stays from the first version, which sent links.)
 */
export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** HMAC of "<userId>:<code>". Not unique: a 6-digit code can repeat for one user over time. */
    tokenHash: text("token_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("email_verification_tokens_user_id_idx").on(table.userId)],
);

// ---------------------------------------------------------------- background jobs

/**
 * Background jobs (emails now; AI and RFQ expiry later), kept in PostgreSQL
 * instead of Redis (developer decision, 14 Nov 2026: no Redis for now).
 * Requests only ADD a row; the worker in src/worker claims due rows with
 * FOR UPDATE SKIP LOCKED, so several API copies never run the same job.
 * `dedupeKey` is unique: adding the same job twice is a no-op. `payload` can
 * hold one-time links, so it is cleared once the job is done or has failed.
 */
export const jobStatus = pgEnum("job_status", ["pending", "running", "done", "failed"]);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    queue: text("queue").notNull(),
    name: text("name").notNull(),
    dedupeKey: text("dedupe_key").notNull().unique(),
    payload: jsonb("payload"),
    status: jobStatus("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // The worker's query: due pending jobs, oldest first.
  (table) => [index("jobs_status_run_at_idx").on(table.status, table.runAt)],
);

// ---------------------------------------------------------------- upload

/**
 * "seller_cover" is no longer used (store cover photos were dropped on
 * 12 Nov 2026). It stays in the database enum because removing an enum
 * value means rebuilding the type; nothing can create one any more.
 */
export const uploadPurpose = pgEnum("upload_purpose", ["seller_logo", "seller_cover", "seller_document", "product_photo"]);
export const uploadStatus = pgEnum("upload_status", ["pending", "ready", "rejected"]);

/**
 * Every file a user sends to storage. The browser uploads to `pending/…`
 * with a signed link; only after the API has checked the stored bytes is the
 * file copied to `files/…` and marked ready. A ready upload is attached to
 * exactly one record (attachedAt), by its owner only.
 */
export const uploads = pgTable(
  "uploads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id),
    purpose: uploadPurpose("purpose").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    /** Where the checked file lives (`files/…`); the pending key is derived from the id. */
    storageKey: text("storage_key").notNull().unique(),
    status: uploadStatus("status").notNull().default("pending"),
    /** Why the stored file was refused (wrong type, wrong size). Server-side only. */
    rejectedReason: text("rejected_reason"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    attachedAt: timestamp("attached_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("uploads_owner_created_idx").on(table.ownerUserId, table.createdAt)],
);

// ---------------------------------------------------------------- seller

export const verificationStatus = pgEnum("verification_status", ["draft", "pending", "approved", "rejected"]);
export const documentType = pgEnum("document_type", [
  "commercial_registration",
  "vat_certificate",
  "owner_id",
  "bank_proof",
]);
export const documentStatus = pgEnum("document_status", ["pending", "approved", "rejected"]);

/** One per seller account. Created the first time the seller saves the profile. */
export const sellerProfiles = pgTable(
  "seller_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id),
    companyName: text("company_name").notNull(),
    country: text("country").notNull(),
    city: text("city").notNull(),
    phone: text("phone").notNull(),
    website: text("website"),
    about: text("about").notNull().default(""),
    brands: text("brands").array().notNull().default([]),
    vatRegistered: boolean("vat_registered").notNull(),
    logoUploadId: uuid("logo_upload_id").references(() => uploads.id),
    verificationStatus: verificationStatus("verification_status").notNull().default("draft"),
    rejectionReason: text("rejection_reason"),
    // Millisecond precision (like JavaScript dates) so admin list cursors are exact.
    submittedAt: timestamp("submitted_at", { withTimezone: true, precision: 3 }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  // The admin review queue (Day 4) lists sellers by status, oldest submission first.
  (table) => [
    index("seller_profiles_status_submitted_idx").on(table.verificationStatus, table.submittedAt),
    // Admin lists: one status, most recently changed first; and all sellers, newest first.
    index("seller_profiles_status_updated_idx").on(table.verificationStatus, table.updatedAt),
    index("seller_profiles_created_idx").on(table.createdAt),
    // Public Sellers directory: verified sellers by name.
    index("seller_profiles_status_name_idx").on(table.verificationStatus, table.companyName),
  ],
);

/**
 * Verification documents. Never deleted: uploading a new file for a type
 * marks the old row superseded, so the review history is kept. At most one
 * current (not superseded) document per seller and type.
 */
export const sellerDocuments = pgTable(
  "seller_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sellerUserId: uuid("seller_user_id")
      .notNull()
      .references(() => users.id),
    type: documentType("type").notNull(),
    uploadId: uuid("upload_id")
      .notNull()
      .unique()
      .references(() => uploads.id),
    documentNumber: text("document_number"),
    status: documentStatus("status").notNull().default("pending"),
    rejectionReason: text("rejection_reason"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("seller_documents_current_idx")
      .on(table.sellerUserId, table.type)
      .where(sql`${table.supersededAt} is null`),
    index("seller_documents_seller_idx").on(table.sellerUserId, table.createdAt),
  ],
);

/** Every change of a seller's verification status, who made it and why. Append only. */
export const sellerVerificationEvents = pgTable(
  "seller_verification_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sellerUserId: uuid("seller_user_id")
      .notNull()
      .references(() => users.id),
    fromStatus: verificationStatus("from_status").notNull(),
    toStatus: verificationStatus("to_status").notNull(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("seller_verification_events_seller_idx").on(table.sellerUserId, table.createdAt)],
);

// ---------------------------------------------------------------- audit

/**
 * Every admin action: who, what, on which record, from where. Append only:
 * the code never updates or deletes a row here.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id),
    /** e.g. "seller.approved", "seller.rejected", "seller.document_viewed". */
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    details: jsonb("details").notNull().default({}),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_log_entity_idx").on(table.entityType, table.entityId, table.createdAt),
    index("audit_log_actor_idx").on(table.actorUserId, table.createdAt),
  ],
);

// ---------------------------------------------------------------- catalog

/** Product categories. Starting list in migration 0008; edited by admins later. */
export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const productStatus = pgEnum("product_status", ["draft", "published", "archived"]);
export const productCondition = pgEnum("product_condition", ["new", "used", "refurbished"]);
export const productPartSource = pgEnum("product_part_source", ["genuine", "aftermarket"]);
export const productUnit = pgEnum("product_unit", ["piece", "pair", "set", "kit", "box", "carton", "metre", "litre"]);
export const productAvailability = pgEnum("product_availability", ["in_stock", "on_order"]);

/**
 * A seller's product. Never deleted: archived instead (business record).
 * Price: whole minor units with currency (money rules), or both null for
 * "price on request". Status changes only through the transitions in
 * catalog.service.ts; `version` guards against two tabs overwriting each
 * other (an edit must name the version it started from).
 */
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sellerUserId: uuid("seller_user_id")
      .notNull()
      .references(() => users.id),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    name: text("name").notNull(),
    brand: text("brand"),
    partSource: productPartSource("part_source"),
    condition: productCondition("condition").notNull().default("new"),
    priceAmount: bigint("price_amount", { mode: "number" }),
    priceCurrency: text("price_currency"),
    unit: productUnit("unit").notNull().default("piece"),
    stockQuantity: integer("stock_quantity"),
    availability: productAvailability("availability").notNull().default("in_stock"),
    leadTimeDays: integer("lead_time_days"),
    description: text("description"),
    status: productStatus("status").notNull().default("draft"),
    version: integer("version").notNull().default(1),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The seller's list: their products by status, newest change first (keyset cursor on updated_at, id).
    index("products_seller_status_updated_idx").on(table.sellerUserId, table.status, table.updatedAt, table.id),
    index("products_category_status_idx").on(table.categoryId, table.status),
    check("products_price_pair", sql`(${table.priceAmount} IS NULL) = (${table.priceCurrency} IS NULL)`),
    check("products_price_positive", sql`${table.priceAmount} IS NULL OR ${table.priceAmount} > 0`),
    check("products_price_currency", sql`${table.priceCurrency} IS NULL OR ${table.priceCurrency} IN ('OMR','KWD','BHD','SAR','AED','QAR')`),
    check("products_stock", sql`${table.stockQuantity} IS NULL OR ${table.stockQuantity} >= 0`),
    check("products_lead_time", sql`${table.leadTimeDays} IS NULL OR ${table.leadTimeDays} BETWEEN 1 AND 365`),
  ],
);

/** Part numbers of a product: the main one first, then alternatives / cross references. */
export const productPartNumbers = pgTable(
  "product_part_numbers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    value: text("value").notNull(),
    /** Upper case, letters and digits only ("6020/F4" -> "6020F4"): what search matches on. */
    normalized: text("normalized").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    index("product_part_numbers_normalized_idx").on(table.normalized),
    uniqueIndex("product_part_numbers_product_value_idx").on(table.productId, table.normalized),
  ],
);

/** Machines a product fits, e.g. make "Kobelco", model "SK380". */
export const productFitments = pgTable(
  "product_fitments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    make: text("make").notNull(),
    model: text("model").notNull(),
    /** Lower case make + model, letters and digits only: what search matches on. */
    normalized: text("normalized").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [
    index("product_fitments_normalized_idx").on(table.normalized),
    index("product_fitments_product_idx").on(table.productId),
  ],
);

/** Photos of a product, in order (position 0 is the cover). Each upload belongs to one product. */
export const productPhotos = pgTable(
  "product_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    uploadId: uuid("upload_id")
      .notNull()
      .unique()
      .references(() => uploads.id),
    position: integer("position").notNull(),
  },
  (table) => [index("product_photos_product_idx").on(table.productId, table.position)],
);

export type CategoryRow = typeof categories.$inferSelect;
export type ProductRow = typeof products.$inferSelect;
export type ProductPartNumberRow = typeof productPartNumbers.$inferSelect;
export type ProductFitmentRow = typeof productFitments.$inferSelect;
export type ProductPhotoRow = typeof productPhotos.$inferSelect;

export type UploadRow = typeof uploads.$inferSelect;
export type SellerProfileRow = typeof sellerProfiles.$inferSelect;
export type SellerDocumentRow = typeof sellerDocuments.$inferSelect;

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type RefreshTokenRow = typeof refreshTokens.$inferSelect;
export type PasswordResetTokenRow = typeof passwordResetTokens.$inferSelect;
export type EmailVerificationTokenRow = typeof emailVerificationTokens.$inferSelect;
export type JobRow = typeof jobs.$inferSelect;
