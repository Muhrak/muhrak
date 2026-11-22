CREATE TYPE "public"."ledger_account" AS ENUM('gateway', 'platform', 'seller', 'buyer');--> statement-breakpoint
CREATE TYPE "public"."ledger_kind" AS ENUM('payment', 'refund', 'payout');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('awaiting_payment', 'paid', 'packed', 'shipped', 'delivered', 'completed', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'succeeded', 'failed', 'expired', 'refunded', 'partially_refunded');--> statement-breakpoint
ALTER TYPE "public"."quotation_status" ADD VALUE 'accepted';--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"kind" "ledger_kind" NOT NULL,
	"account" "ledger_account" NOT NULL,
	"seller_user_id" uuid,
	"buyer_user_id" uuid,
	"order_id" uuid NOT NULL,
	"payment_id" uuid,
	"currency" text NOT NULL,
	"amount" bigint NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_currency" CHECK ("ledger_entries"."currency" = 'OMR'),
	CONSTRAINT "ledger_seller_account" CHECK (("ledger_entries"."account" = 'seller') = ("ledger_entries"."seller_user_id" IS NOT NULL)),
	CONSTRAINT "ledger_buyer_account" CHECK (("ledger_entries"."account" = 'buyer') = ("ledger_entries"."buyer_user_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" "order_status",
	"to_status" "order_status" NOT NULL,
	"actor" text NOT NULL,
	"actor_user_id" uuid,
	"note" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_events_actor" CHECK ("order_events"."actor" IN ('buyer','seller','admin','system'))
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "orders_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1001 CACHE 1),
	"buyer_user_id" uuid NOT NULL,
	"seller_user_id" uuid NOT NULL,
	"rfq_id" uuid NOT NULL,
	"quotation_id" uuid NOT NULL,
	"order_key" uuid NOT NULL,
	"status" "order_status" DEFAULT 'awaiting_payment' NOT NULL,
	"currency" text NOT NULL,
	"subtotal_amount" bigint NOT NULL,
	"shipping_amount" bigint NOT NULL,
	"vat_rate_bp" integer NOT NULL,
	"vat_amount" bigint NOT NULL,
	"total_amount" bigint NOT NULL,
	"platform_fee_bp" integer NOT NULL,
	"platform_fee_amount" bigint NOT NULL,
	"seller_amount" bigint NOT NULL,
	"delivery_days" integer NOT NULL,
	"seller_company_name" text NOT NULL,
	"buyer_name" text NOT NULL,
	"recipient_name" text NOT NULL,
	"recipient_phone" text NOT NULL,
	"address_line" text NOT NULL,
	"delivery_notes" text,
	"delivery_city" text NOT NULL,
	"delivery_country" text NOT NULL,
	"payment_due_at" timestamp (3) with time zone NOT NULL,
	"paid_at" timestamp (3) with time zone,
	"cancelled_at" timestamp (3) with time zone,
	"cancel_reason" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_currency" CHECK ("orders"."currency" = 'OMR'),
	CONSTRAINT "orders_amounts" CHECK ("orders"."subtotal_amount" > 0 AND "orders"."shipping_amount" >= 0 AND "orders"."vat_amount" >= 0 AND "orders"."total_amount" = "orders"."subtotal_amount" + "orders"."shipping_amount" + "orders"."vat_amount" AND "orders"."total_amount" <= 10000000000),
	CONSTRAINT "orders_split" CHECK ("orders"."platform_fee_amount" >= 0 AND "orders"."platform_fee_amount" <= "orders"."subtotal_amount" AND "orders"."seller_amount" = "orders"."total_amount" - "orders"."platform_fee_amount"),
	CONSTRAINT "orders_fee_bp" CHECK ("orders"."platform_fee_bp" BETWEEN 0 AND 3000),
	CONSTRAINT "orders_vat_rate" CHECK ("orders"."vat_rate_bp" IN (0, 500)),
	CONSTRAINT "orders_country" CHECK ("orders"."delivery_country" IN ('OM','AE','SA','QA','KW','BH')),
	CONSTRAINT "orders_buyer_not_seller" CHECK ("orders"."buyer_user_id" <> "orders"."seller_user_id"),
	CONSTRAINT "orders_paid_at" CHECK ("orders"."status" = 'cancelled' OR ("orders"."status" = 'awaiting_payment') = ("orders"."paid_at" IS NULL)),
	CONSTRAINT "orders_cancelled" CHECK (("orders"."status" = 'cancelled') = ("orders"."cancelled_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"provider_payment_id" text NOT NULL,
	"amount" bigint NOT NULL,
	"currency" text NOT NULL,
	"payment_id" uuid,
	"outcome" text,
	"received_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp (3) with time zone
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"buyer_user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_payment_id" text,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"currency" text NOT NULL,
	"amount" bigint NOT NULL,
	"refund_reason" text,
	"checkout_url" text,
	"checkout_expires_at" timestamp (3) with time zone,
	"succeeded_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_currency" CHECK ("payments"."currency" = 'OMR'),
	CONSTRAINT "payments_amount" CHECK ("payments"."amount" > 0 AND "payments"."amount" <= 10000000000),
	CONSTRAINT "payments_succeeded_at" CHECK (("payments"."status" IN ('pending','failed','expired')) = ("payments"."succeeded_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_seller_user_id_users_id_fk" FOREIGN KEY ("seller_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_buyer_user_id_users_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_user_id_users_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_seller_user_id_users_id_fk" FOREIGN KEY ("seller_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_buyer_user_id_users_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_payment_once_idx" ON "ledger_entries" USING btree ("payment_id","account") WHERE "ledger_entries"."kind" = 'payment';--> statement-breakpoint
CREATE INDEX "ledger_group_idx" ON "ledger_entries" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "ledger_seller_idx" ON "ledger_entries" USING btree ("seller_user_id","created_at");--> statement-breakpoint
CREATE INDEX "ledger_order_idx" ON "ledger_entries" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_events_order_idx" ON "order_events" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_number_idx" ON "orders" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_buyer_key_idx" ON "orders" USING btree ("buyer_user_id","order_key");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_one_live_per_quotation_idx" ON "orders" USING btree ("quotation_id") WHERE "orders"."status" <> 'cancelled';--> statement-breakpoint
CREATE INDEX "orders_buyer_created_idx" ON "orders" USING btree ("buyer_user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "orders_seller_created_idx" ON "orders" USING btree ("seller_user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "orders_awaiting_due_idx" ON "orders" USING btree ("payment_due_at") WHERE "orders"."status" = 'awaiting_payment';--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_provider_event_idx" ON "payment_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE INDEX "payment_events_payment_idx" ON "payment_events" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_id_idx" ON "payments" USING btree ("provider","provider_payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_one_pending_per_order_idx" ON "payments" USING btree ("order_id") WHERE "payments"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "payments_one_success_per_order_idx" ON "payments" USING btree ("order_id") WHERE "payments"."status" IN ('succeeded','refunded','partially_refunded') AND "payments"."refund_reason" IS NULL;--> statement-breakpoint
CREATE INDEX "payments_order_created_idx" ON "payments" USING btree ("order_id","created_at");--> statement-breakpoint
-- Append-only money and order history (payment rules, docs/PLAN.md): the database itself refuses edits and deletes.
CREATE FUNCTION "muhrak_refuse_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % refused', TG_TABLE_NAME, TG_OP;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "ledger_entries_append_only" BEFORE UPDATE OR DELETE ON "ledger_entries" FOR EACH ROW EXECUTE FUNCTION "muhrak_refuse_change"();--> statement-breakpoint
CREATE TRIGGER "ledger_entries_no_truncate" BEFORE TRUNCATE ON "ledger_entries" FOR EACH STATEMENT EXECUTE FUNCTION "muhrak_refuse_change"();--> statement-breakpoint
CREATE TRIGGER "order_events_append_only" BEFORE UPDATE OR DELETE ON "order_events" FOR EACH ROW EXECUTE FUNCTION "muhrak_refuse_change"();--> statement-breakpoint
CREATE TRIGGER "payment_events_no_delete" BEFORE DELETE ON "payment_events" FOR EACH ROW EXECUTE FUNCTION "muhrak_refuse_change"();--> statement-breakpoint
CREATE TRIGGER "payments_no_delete" BEFORE DELETE ON "payments" FOR EACH ROW EXECUTE FUNCTION "muhrak_refuse_change"();--> statement-breakpoint
CREATE TRIGGER "orders_no_delete" BEFORE DELETE ON "orders" FOR EACH ROW EXECUTE FUNCTION "muhrak_refuse_change"();
