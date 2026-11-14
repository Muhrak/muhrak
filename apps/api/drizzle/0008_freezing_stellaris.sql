CREATE TYPE "public"."product_availability" AS ENUM('in_stock', 'on_order');--> statement-breakpoint
CREATE TYPE "public"."product_condition" AS ENUM('new', 'used', 'refurbished');--> statement-breakpoint
CREATE TYPE "public"."product_part_source" AS ENUM('genuine', 'aftermarket');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."product_unit" AS ENUM('piece', 'pair', 'set', 'kit', 'box', 'carton', 'metre', 'litre');--> statement-breakpoint
ALTER TYPE "public"."upload_purpose" ADD VALUE 'product_photo';--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "product_fitments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"normalized" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_part_numbers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"value" text NOT NULL,
	"normalized" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "product_photos_upload_id_unique" UNIQUE("upload_id")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_user_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"part_source" "product_part_source",
	"condition" "product_condition" DEFAULT 'new' NOT NULL,
	"price_amount" bigint,
	"price_currency" text,
	"unit" "product_unit" DEFAULT 'piece' NOT NULL,
	"stock_quantity" integer,
	"availability" "product_availability" DEFAULT 'in_stock' NOT NULL,
	"lead_time_days" integer,
	"description" text,
	"status" "product_status" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_price_pair" CHECK (("products"."price_amount" IS NULL) = ("products"."price_currency" IS NULL)),
	CONSTRAINT "products_price_positive" CHECK ("products"."price_amount" IS NULL OR "products"."price_amount" > 0),
	CONSTRAINT "products_price_currency" CHECK ("products"."price_currency" IS NULL OR "products"."price_currency" IN ('OMR','KWD','BHD','SAR','AED','QAR')),
	CONSTRAINT "products_stock" CHECK ("products"."stock_quantity" IS NULL OR "products"."stock_quantity" >= 0),
	CONSTRAINT "products_lead_time" CHECK ("products"."lead_time_days" IS NULL OR "products"."lead_time_days" BETWEEN 1 AND 365)
);
--> statement-breakpoint
ALTER TABLE "product_fitments" ADD CONSTRAINT "product_fitments_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_part_numbers" ADD CONSTRAINT "product_part_numbers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_photos" ADD CONSTRAINT "product_photos_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_photos" ADD CONSTRAINT "product_photos_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_seller_user_id_users_id_fk" FOREIGN KEY ("seller_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_fitments_normalized_idx" ON "product_fitments" USING btree ("normalized");--> statement-breakpoint
CREATE INDEX "product_fitments_product_idx" ON "product_fitments" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_part_numbers_normalized_idx" ON "product_part_numbers" USING btree ("normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "product_part_numbers_product_value_idx" ON "product_part_numbers" USING btree ("product_id","normalized");--> statement-breakpoint
CREATE INDEX "product_photos_product_idx" ON "product_photos" USING btree ("product_id","position");--> statement-breakpoint
CREATE INDEX "products_seller_status_updated_idx" ON "products" USING btree ("seller_user_id","status","updated_at","id");--> statement-breakpoint
CREATE INDEX "products_category_status_idx" ON "products" USING btree ("category_id","status");
--> statement-breakpoint
-- Starting categories (14 Nov 2026), from real buyer requests (developer's WhatsApp examples).
INSERT INTO "categories" ("slug", "name", "sort_order") VALUES
  ('engine', 'Engine', 10),
  ('electrical', 'Electrical', 20),
  ('hydraulics', 'Hydraulics', 30),
  ('cooling-ac', 'Cooling & AC', 40),
  ('bearings-bushings', 'Bearings & Bushings', 50),
  ('belts-hoses-couplings', 'Belts, Hoses & Couplings', 60),
  ('seals-gaskets-kits', 'Seals, Gaskets & Repair Kits', 70),
  ('filters', 'Filters', 80),
  ('transmission-drivetrain', 'Transmission & Drivetrain', 90),
  ('undercarriage-get', 'Undercarriage & Ground Engaging Tools', 100),
  ('brakes-steering-suspension', 'Brakes, Steering & Suspension', 110),
  ('cabin-body', 'Cabin & Body', 120),
  ('attachments', 'Attachments', 130),
  ('fasteners-hardware', 'Fasteners & Hardware', 140),
  ('welding-cutting', 'Welding & Cutting', 150),
  ('workshop-tools-safety', 'Workshop Tools & Safety', 160),
  ('other', 'Other', 170)
ON CONFLICT ("slug") DO NOTHING;
