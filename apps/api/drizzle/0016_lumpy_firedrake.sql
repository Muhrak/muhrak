CREATE TABLE "ai_identification_photos" (
	"identification_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_identification_photos_identification_id_position_pk" PRIMARY KEY("identification_id","position"),
	CONSTRAINT "ai_identification_photos_upload_id_unique" UNIQUE("upload_id"),
	CONSTRAINT "ai_identification_photos_position" CHECK ("ai_identification_photos"."position" BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE TABLE "rfq_buyer_photos" (
	"rfq_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rfq_buyer_photos_rfq_id_position_pk" PRIMARY KEY("rfq_id","position"),
	CONSTRAINT "rfq_buyer_photos_position" CHECK ("rfq_buyer_photos"."position" BETWEEN 1 AND 3)
);
--> statement-breakpoint
ALTER TABLE "ai_identification_photos" ADD CONSTRAINT "ai_identification_photos_identification_id_ai_identifications_id_fk" FOREIGN KEY ("identification_id") REFERENCES "public"."ai_identifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_identification_photos" ADD CONSTRAINT "ai_identification_photos_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_buyer_photos" ADD CONSTRAINT "rfq_buyer_photos_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_buyer_photos" ADD CONSTRAINT "rfq_buyer_photos_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE no action ON UPDATE no action;