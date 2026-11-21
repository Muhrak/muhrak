CREATE TYPE "public"."quotation_status" AS ENUM('active', 'withdrawn', 'superseded', 'expired');--> statement-breakpoint
CREATE TABLE "quotation_items" (
	"quotation_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"part_number" text,
	"description" text NOT NULL,
	"details" text,
	"quantity" integer NOT NULL,
	"unit_price_amount" bigint NOT NULL,
	"amount" bigint NOT NULL,
	CONSTRAINT "quotation_items_quotation_id_position_pk" PRIMARY KEY("quotation_id","position"),
	CONSTRAINT "quotation_items_position" CHECK ("quotation_items"."position" BETWEEN 1 AND 50),
	CONSTRAINT "quotation_items_quantity" CHECK ("quotation_items"."quantity" BETWEEN 1 AND 100000),
	CONSTRAINT "quotation_items_amount" CHECK ("quotation_items"."unit_price_amount" > 0 AND "quotation_items"."amount" = "quotation_items"."unit_price_amount" * "quotation_items"."quantity")
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "quotations_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1001 CACHE 1),
	"rfq_id" uuid NOT NULL,
	"seller_user_id" uuid NOT NULL,
	"buyer_user_id" uuid NOT NULL,
	"quote_key" uuid NOT NULL,
	"status" "quotation_status" DEFAULT 'active' NOT NULL,
	"currency" text NOT NULL,
	"subtotal_amount" bigint NOT NULL,
	"shipping_amount" bigint NOT NULL,
	"vat_rate_bp" integer NOT NULL,
	"vat_amount" bigint NOT NULL,
	"total_amount" bigint NOT NULL,
	"delivery_days" integer NOT NULL,
	"valid_days" integer NOT NULL,
	"valid_until" timestamp (3) with time zone NOT NULL,
	"terms" text,
	"notes" text,
	"seller_company_name" text NOT NULL,
	"seller_city" text NOT NULL,
	"seller_country" text NOT NULL,
	"buyer_name" text NOT NULL,
	"delivery_city" text NOT NULL,
	"delivery_country" text NOT NULL,
	"closed_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotations_currency" CHECK ("quotations"."currency" = 'OMR'),
	CONSTRAINT "quotations_amounts" CHECK ("quotations"."subtotal_amount" > 0 AND "quotations"."shipping_amount" >= 0 AND "quotations"."vat_amount" >= 0 AND "quotations"."total_amount" = "quotations"."subtotal_amount" + "quotations"."shipping_amount" + "quotations"."vat_amount" AND "quotations"."total_amount" <= 10000000000),
	CONSTRAINT "quotations_vat_rate" CHECK ("quotations"."vat_rate_bp" IN (0, 500)),
	CONSTRAINT "quotations_delivery_days" CHECK ("quotations"."delivery_days" BETWEEN 1 AND 365),
	CONSTRAINT "quotations_valid_days" CHECK ("quotations"."valid_days" BETWEEN 1 AND 30),
	CONSTRAINT "quotations_closed_at" CHECK (("quotations"."status" = 'active') = ("quotations"."closed_at" IS NULL)),
	CONSTRAINT "quotations_buyer_not_seller" CHECK ("quotations"."buyer_user_id" <> "quotations"."seller_user_id")
);
--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_seller_user_id_users_id_fk" FOREIGN KEY ("seller_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_buyer_user_id_users_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quotations_number_idx" ON "quotations" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "quotations_seller_key_idx" ON "quotations" USING btree ("seller_user_id","quote_key");--> statement-breakpoint
CREATE UNIQUE INDEX "quotations_one_active_per_rfq_idx" ON "quotations" USING btree ("rfq_id") WHERE "quotations"."status" = 'active';--> statement-breakpoint
CREATE INDEX "quotations_rfq_created_idx" ON "quotations" USING btree ("rfq_id","created_at","id");--> statement-breakpoint
CREATE INDEX "quotations_active_valid_idx" ON "quotations" USING btree ("valid_until") WHERE "quotations"."status" = 'active';