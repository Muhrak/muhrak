ALTER TABLE "refresh_tokens" ADD COLUMN "session_started_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "totp_secret" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "totp_last_step" bigint;--> statement-breakpoint
-- Two-factor login (22 Nov 2026): sign every admin out once, so the next admin login needs the authenticator code.
UPDATE "refresh_tokens" SET "revoked_at" = now() WHERE "revoked_at" IS NULL AND "user_id" IN (SELECT "id" FROM "users" WHERE "role" = 'admin');
