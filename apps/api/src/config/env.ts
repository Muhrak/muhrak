import "dotenv/config";
import { z } from "zod";

/**
 * All environment variables are read and validated here, once, at startup.
 * The rest of the code imports `env` and never touches process.env.
 * If a value is missing or wrong, the API refuses to start.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  /** Public URL of the web app, used to build links in emails (no trailing slash). */
  WEB_APP_URL: z
    .string()
    .url()
    .default("http://localhost:3000")
    .transform((value) => value.replace(/\/+$/, "")),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  /** How long an email verification link works. */
  EMAIL_VERIFICATION_TTL_HOURS: z.coerce.number().int().positive().max(72).default(24),
  /**
   * How many proxies sit in front of the API and add to X-Forwarded-For
   * (Express `trust proxy`). Used to find the real client IP for rate
   * limits. 0 locally. Too high a value lets clients fake their IP.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  /**
   * Shared with the web app's /api proxy, which forwards the visitor's IP
   * in x-muhrak-client-ip. The header is trusted only with this secret.
   * Unset locally (the API then uses the connection IP).
   */
  API_PROXY_SECRET: z.string().min(32).optional(),
  /**
   * Path of the refresh-token cookie as the BROWSER sees it. The web app
   * proxies /api/* to this API, so /v1/auth here is /api/v1/auth there.
   */
  AUTH_COOKIE_PATH: z.string().startsWith("/").default("/api/v1/auth"),
  /**
   * Private file storage (Amazon S3). All four are needed for uploads; if
   * any is missing the upload endpoints answer 503 and nothing else breaks.
   * The IAM user should only have s3:PutObject and s3:GetObject on this bucket.
   */
  AWS_REGION: z.string().regex(/^[a-z]{2}(-[a-z]+)+-\d$/, "AWS_REGION must be a region code, e.g. eu-north-1").optional(),
  AWS_ACCESS_KEY_ID: z.string().min(16).optional(),
  AWS_SECRET_ACCESS_KEY: z.string().min(16).optional(),
  S3_BUCKET_PRIVATE: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/).optional(),
  /**
   * Email through Resend, sent by the background worker (src/worker).
   * Unset locally: emails are printed to the terminal instead. Unset in
   * production: emails wait in the queue (never printed) until it is set.
   */
  RESEND_API_KEY: z
    .string()
    .optional()
    .transform((value) => value?.trim() || undefined)
    .refine((value) => value === undefined || value.length >= 10, "RESEND_API_KEY looks too short"),
  EMAIL_FROM: z.string().min(3).default("Muhrak <onboarding@resend.dev>"),
  /** Origins allowed to call the API from a browser (CORS and the auth origin check). Comma separated. */
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((value) => value.split(",").map((origin) => origin.trim()).filter(Boolean)),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
