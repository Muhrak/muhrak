CREATE TABLE "seller_profile_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_user_id" uuid NOT NULL,
	"company_name" text NOT NULL,
	"country" text NOT NULL,
	"vat_registered" boolean NOT NULL,
	"status" "document_status" DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seller_profile_updates_country" CHECK ("seller_profile_updates"."country" IN ('OM','AE','SA','QA','KW','BH'))
);
--> statement-breakpoint
DROP INDEX "seller_documents_current_idx";--> statement-breakpoint
ALTER TABLE "seller_documents" ADD COLUMN "is_update" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "seller_profiles" ADD COLUMN "update_submitted_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "seller_profile_updates" ADD CONSTRAINT "seller_profile_updates_seller_user_id_users_id_fk" FOREIGN KEY ("seller_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_profile_updates" ADD CONSTRAINT "seller_profile_updates_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "seller_profile_updates_open_idx" ON "seller_profile_updates" USING btree ("seller_user_id") WHERE "seller_profile_updates"."superseded_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "seller_documents_open_update_idx" ON "seller_documents" USING btree ("seller_user_id","type") WHERE "seller_documents"."superseded_at" is null and "seller_documents"."is_update";--> statement-breakpoint
CREATE INDEX "seller_profiles_update_queue_idx" ON "seller_profiles" USING btree ("update_submitted_at","user_id") WHERE "seller_profiles"."update_submitted_at" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "seller_documents_current_idx" ON "seller_documents" USING btree ("seller_user_id","type") WHERE "seller_documents"."superseded_at" is null and not "seller_documents"."is_update";