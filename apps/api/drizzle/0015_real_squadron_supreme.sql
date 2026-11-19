ALTER TYPE "public"."upload_purpose" ADD VALUE 'chat_photo';--> statement-breakpoint
CREATE TABLE "chat_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rfq_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	"sender_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_photos_upload_id_unique" UNIQUE("upload_id")
);
--> statement-breakpoint
ALTER TABLE "rfqs" ADD COLUMN "chat_opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chat_photos" ADD CONSTRAINT "chat_photos_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_photos" ADD CONSTRAINT "chat_photos_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_photos" ADD CONSTRAINT "chat_photos_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_photos_rfq_idx" ON "chat_photos" USING btree ("rfq_id","created_at");