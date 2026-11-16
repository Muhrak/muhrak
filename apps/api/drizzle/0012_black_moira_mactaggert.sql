CREATE TYPE "public"."ai_identification_status" AS ENUM('pending', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "ai_identifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	"status" "ai_identification_status" DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"error" text,
	"provider" text,
	"model" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_micro_usd" bigint DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "ai_identifications_upload_id_unique" UNIQUE("upload_id"),
	CONSTRAINT "ai_identifications_cost" CHECK ("ai_identifications"."cost_micro_usd" >= 0),
	CONSTRAINT "ai_identifications_finished" CHECK (("ai_identifications"."status" IN ('done','failed')) = ("ai_identifications"."finished_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "ai_identifications" ADD CONSTRAINT "ai_identifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_identifications" ADD CONSTRAINT "ai_identifications_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_identifications_user_created_idx" ON "ai_identifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_identifications_created_idx" ON "ai_identifications" USING btree ("created_at");