CREATE TYPE "public"."rfq_needed_by" AS ENUM('asap', 'one_week', 'two_weeks', 'one_month', 'flexible');--> statement-breakpoint
CREATE TYPE "public"."rfq_status" AS ENUM('open', 'quoted', 'declined', 'cancelled', 'expired');--> statement-breakpoint
CREATE TABLE "rfqs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "rfqs_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1001 CACHE 1),
	"buyer_user_id" uuid NOT NULL,
	"seller_user_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"request_key" uuid NOT NULL,
	"part_name" text NOT NULL,
	"part_number" text,
	"fitment" text,
	"quantity" integer NOT NULL,
	"unit" "product_unit" NOT NULL,
	"needed_by" "rfq_needed_by" NOT NULL,
	"delivery_country" text NOT NULL,
	"delivery_city" text NOT NULL,
	"note" text,
	"status" "rfq_status" DEFAULT 'open' NOT NULL,
	"seller_seen_at" timestamp with time zone,
	"decline_reason" text,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rfqs_quantity" CHECK ("rfqs"."quantity" BETWEEN 1 AND 100000),
	CONSTRAINT "rfqs_country" CHECK ("rfqs"."delivery_country" IN ('OM','AE','SA','QA','KW','BH')),
	CONSTRAINT "rfqs_buyer_not_seller" CHECK ("rfqs"."buyer_user_id" <> "rfqs"."seller_user_id"),
	CONSTRAINT "rfqs_closed_at" CHECK (("rfqs"."status" IN ('open','quoted')) = ("rfqs"."closed_at" IS NULL)),
	CONSTRAINT "rfqs_decline_reason" CHECK ("rfqs"."decline_reason" IS NULL OR "rfqs"."status" = 'declined')
);
--> statement-breakpoint
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_buyer_user_id_users_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_seller_user_id_users_id_fk" FOREIGN KEY ("seller_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rfqs_number_idx" ON "rfqs" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "rfqs_buyer_request_key_idx" ON "rfqs" USING btree ("buyer_user_id","request_key");--> statement-breakpoint
CREATE UNIQUE INDEX "rfqs_one_open_per_product_idx" ON "rfqs" USING btree ("buyer_user_id","product_id") WHERE "rfqs"."status" = 'open';--> statement-breakpoint
CREATE INDEX "rfqs_buyer_created_idx" ON "rfqs" USING btree ("buyer_user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "rfqs_seller_created_idx" ON "rfqs" USING btree ("seller_user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "rfqs_seller_status_created_idx" ON "rfqs" USING btree ("seller_user_id","status","created_at","id");--> statement-breakpoint
CREATE INDEX "rfqs_open_expires_idx" ON "rfqs" USING btree ("expires_at") WHERE "rfqs"."status" = 'open';--> statement-breakpoint
CREATE INDEX "products_status_published_idx" ON "products" USING btree ("status","published_at");