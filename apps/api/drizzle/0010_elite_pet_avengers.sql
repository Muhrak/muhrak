CREATE TYPE "public"."maintenance_scope" AS ENUM('whole_site', 'buyer', 'seller');--> statement-breakpoint
CREATE TABLE "maintenance_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "maintenance_scope" NOT NULL,
	"message" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"ended_by" uuid,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	CONSTRAINT "maintenance_windows_ends_after_start" CHECK ("maintenance_windows"."ends_at" IS NULL OR "maintenance_windows"."ends_at" > "maintenance_windows"."starts_at"),
	CONSTRAINT "maintenance_windows_message_length" CHECK (char_length("maintenance_windows"."message") BETWEEN 1 AND 300),
	CONSTRAINT "maintenance_windows_ended_pair" CHECK (("maintenance_windows"."ended_at" IS NULL) = ("maintenance_windows"."ended_by" IS NULL)),
	CONSTRAINT "maintenance_windows_cancelled_pair" CHECK (("maintenance_windows"."cancelled_at" IS NULL) = ("maintenance_windows"."cancelled_by" IS NULL)),
	CONSTRAINT "maintenance_windows_one_close" CHECK ("maintenance_windows"."ended_at" IS NULL OR "maintenance_windows"."cancelled_at" IS NULL)
);
--> statement-breakpoint
ALTER TABLE "maintenance_windows" ADD CONSTRAINT "maintenance_windows_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_windows" ADD CONSTRAINT "maintenance_windows_ended_by_users_id_fk" FOREIGN KEY ("ended_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_windows" ADD CONSTRAINT "maintenance_windows_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "maintenance_windows_starts_idx" ON "maintenance_windows" USING btree ("starts_at","id");--> statement-breakpoint
CREATE INDEX "maintenance_windows_open_idx" ON "maintenance_windows" USING btree ("starts_at") WHERE "maintenance_windows"."ended_at" is null and "maintenance_windows"."cancelled_at" is null;