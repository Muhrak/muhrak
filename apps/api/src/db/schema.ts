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
 * 12 Nov 2026). "part_photo" (Day 8) is a buyer's private photo for
 * Muhrak AI photo search. "seller_cover" stays in the database enum because removing an enum
 * value means rebuilding the type; nothing can create one any more.
 */
export const uploadPurpose = pgEnum("upload_purpose", ["seller_logo", "seller_cover", "seller_document", "product_photo", "part_photo"]);
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

// ---------------------------------------------------------------- maintenance

/** What a maintenance window takes offline. The admin console never goes offline. */
export const maintenanceScope = pgEnum("maintenance_scope", ["whole_site", "buyer", "seller"]);

/**
 * Maintenance windows: "turn on now" (starts_at = the moment it was
 * turned on) or scheduled ahead. A window is in effect from starts_at
 * until ends_at (null = until an admin ends it), unless ended or
 * cancelled earlier. At most one window is open (running or upcoming) at
 * a time; the service enforces it under a lock. Rows are never deleted:
 * they are the history shown in the console ("Past windows").
 */
export const maintenanceWindows = pgTable(
  "maintenance_windows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: maintenanceScope("scope").notNull(),
    /** Shown to users on the maintenance page and the warning banner. Plain text. */
    message: text("message").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Turned off by an admin before ends_at (or with no ends_at). */
    endedAt: timestamp("ended_at", { withTimezone: true }),
    endedBy: uuid("ended_by").references(() => users.id),
    /** Cancelled before it started. */
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: uuid("cancelled_by").references(() => users.id),
  },
  (table) => [
    // History, newest first (keyset cursor on starts_at, id).
    index("maintenance_windows_starts_idx").on(table.startsAt, table.id),
    // The gate's lookup: windows not ended or cancelled.
    index("maintenance_windows_open_idx")
      .on(table.startsAt)
      .where(sql`${table.endedAt} is null and ${table.cancelledAt} is null`),
    check("maintenance_windows_ends_after_start", sql`${table.endsAt} IS NULL OR ${table.endsAt} > ${table.startsAt}`),
    check("maintenance_windows_message_length", sql`char_length(${table.message}) BETWEEN 1 AND 300`),
    check("maintenance_windows_ended_pair", sql`(${table.endedAt} IS NULL) = (${table.endedBy} IS NULL)`),
    check("maintenance_windows_cancelled_pair", sql`(${table.cancelledAt} IS NULL) = (${table.cancelledBy} IS NULL)`),
    check("maintenance_windows_one_close", sql`${table.endedAt} IS NULL OR ${table.cancelledAt} IS NULL`),
  ],
);

export type MaintenanceWindowRow = typeof maintenanceWindows.$inferSelect;

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
    // Public part search: live products, newest first.
    index("products_status_published_idx").on(table.status, table.publishedAt),
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

// ---------------------------------------------------------------- rfq

export const rfqStatus = pgEnum("rfq_status", ["open", "quoted", "declined", "cancelled", "expired"]);
export const rfqNeededBy = pgEnum("rfq_needed_by", ["asap", "one_week", "two_weeks", "one_month", "flexible"]);

/**
 * Quote requests: one buyer asks one seller about one of the seller's
 * products (developer decision, 15 Nov 2026). Never deleted (business
 * record); closed requests keep their final status. Status changes only
 * through RFQ_TRANSITIONS in rfq.service.ts, as conditional updates.
 *
 * - (buyer, request_key) is unique: a double submit returns the first request.
 * - A buyer has at most one OPEN request per product.
 * - The seller and unit come from the product at the time of the request.
 */
export const rfqs = pgTable(
  "rfqs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Human reference "RQ-<number>". */
    number: integer("number").notNull().generatedAlwaysAsIdentity({ startWith: 1001 }),
    buyerUserId: uuid("buyer_user_id")
      .notNull()
      .references(() => users.id),
    sellerUserId: uuid("seller_user_id")
      .notNull()
      .references(() => users.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    requestKey: uuid("request_key").notNull(),
    partName: text("part_name").notNull(),
    partNumber: text("part_number"),
    fitment: text("fitment"),
    quantity: integer("quantity").notNull(),
    unit: productUnit("unit").notNull(),
    neededBy: rfqNeededBy("needed_by").notNull(),
    deliveryCountry: text("delivery_country").notNull(),
    deliveryCity: text("delivery_city").notNull(),
    note: text("note"),
    /**
     * The buyer's own photo from Muhrak AI (Day 9 follow-up, 19 Nov 2026): a
     * cleaned, PRIVATE part_photo, attached only when the buyer asked from a
     * photo search and kept sharing on. Only this request's buyer and seller
     * can view it, through a short-lived link.
     */
    buyerPhotoUploadId: uuid("buyer_photo_upload_id").references(() => uploads.id),
    status: rfqStatus("status").notNull().default("open"),
    sellerSeenAt: timestamp("seller_seen_at", { withTimezone: true }),
    declineReason: text("decline_reason"),
    expiresAt: timestamp("expires_at", { withTimezone: true, precision: 3 }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    // Millisecond precision (like JavaScript dates) so list cursors are exact.
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("rfqs_number_idx").on(table.number),
    uniqueIndex("rfqs_buyer_request_key_idx").on(table.buyerUserId, table.requestKey),
    uniqueIndex("rfqs_one_open_per_product_idx")
      .on(table.buyerUserId, table.productId)
      .where(sql`${table.status} = 'open'`),
    // Lists, newest first (keyset cursor on created_at, id).
    index("rfqs_buyer_created_idx").on(table.buyerUserId, table.createdAt, table.id),
    index("rfqs_seller_created_idx").on(table.sellerUserId, table.createdAt, table.id),
    index("rfqs_seller_status_created_idx").on(table.sellerUserId, table.status, table.createdAt, table.id),
    // The expiry sweep: open requests by expiry time.
    index("rfqs_open_expires_idx")
      .on(table.expiresAt)
      .where(sql`${table.status} = 'open'`),
    check("rfqs_quantity", sql`${table.quantity} BETWEEN 1 AND 100000`),
    check("rfqs_country", sql`${table.deliveryCountry} IN ('OM','AE','SA','QA','KW','BH')`),
    check("rfqs_buyer_not_seller", sql`${table.buyerUserId} <> ${table.sellerUserId}`),
    check("rfqs_closed_at", sql`(${table.status} IN ('open','quoted')) = (${table.closedAt} IS NULL)`),
    check("rfqs_decline_reason", sql`${table.declineReason} IS NULL OR ${table.status} = 'declined'`),
  ],
);

export type RfqRow = typeof rfqs.$inferSelect;

// ---------------------------------------------------------------- ai

export const aiIdentificationStatus = pgEnum("ai_identification_status", ["pending", "running", "done", "failed"]);

/**
 * Every AI part identification (Day 6). Also the AI log and the budget
 * ledger: tokens and cost of every model call are stored here, and the
 * monthly cap is checked against their sum. One identification per photo
 * (upload_id unique), so a double submit never pays twice. Never deleted.
 *
 * Cost is in micro US dollars (1 USD = 1,000,000), an integer: the
 * provider bills in USD, and this is our own spend, not a user's money.
 */
export const aiIdentifications = pgTable(
  "ai_identifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    uploadId: uuid("upload_id")
      .notNull()
      .unique()
      .references(() => uploads.id),
    status: aiIdentificationStatus("status").notNull().default("pending"),
    /** Validated suggestion (aiModelOutputSchema), set when done. */
    result: jsonb("result"),
    /** Why it failed. Server-side only; the user just sees the manual form. */
    error: text("error"),
    provider: text("provider"),
    model: text("model"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costMicroUsd: bigint("cost_micro_usd", { mode: "number" }).notNull().default(0),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    // Daily limit per user.
    index("ai_identifications_user_created_idx").on(table.userId, table.createdAt),
    // Monthly budget: spend since the start of the month.
    index("ai_identifications_created_idx").on(table.createdAt),
    check("ai_identifications_cost", sql`${table.costMicroUsd} >= 0`),
    check("ai_identifications_finished", sql`(${table.status} IN ('done','failed')) = (${table.finishedAt} IS NOT NULL)`),
  ],
);

export type AiIdentificationRow = typeof aiIdentifications.$inferSelect;

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
