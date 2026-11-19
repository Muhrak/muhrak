import "dotenv/config";
import { z } from "zod";

/**
 * All environment variables are read and validated here, once, at startup.
 * The rest of the code imports `env` and never touches process.env.
 * If a value is missing or wrong, the API refuses to start.
 */
/** "2.50" -> 2_500_000 micro US dollars, without floating point. */
const usdSchema = z
  .string()
  .trim()
  .regex(/^\d{1,6}(\.\d{1,6})?$/, "Enter an amount in US dollars, e.g. 5 or 0.30")
  .transform((value) => {
    const [whole = "0", fraction = ""] = value.split(".");
    return Number(whole) * 1_000_000 + Number(fraction.padEnd(6, "0"));
  });

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
  /** How long an email verification code works. */
  EMAIL_CODE_TTL_MINUTES: z.coerce.number().int().positive().max(60).default(10),
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
  /**
   * AI part identification (Day 6; Google Gemini, developer decision
   * 16 Nov 2026). Off unless AI_ENABLED=true AND a key is set; when off,
   * the AI endpoints answer `ai_unavailable` and the web app shows the
   * manual form.
   */
  AI_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  /**
   * Stream Chat (Day 10, buyer–seller chat). Chat is off without all three;
   * the secret never leaves the server (it signs chat tokens).
   */
  STREAM_APP_ID: z.string().trim().optional().transform((value) => value || undefined),
  STREAM_API_KEY: z.string().trim().optional().transform((value) => value || undefined),
  STREAM_API_SECRET: z
    .string()
    .optional()
    .transform((value) => value?.trim() || undefined)
    .refine((value) => value === undefined || value.length >= 32, "STREAM_API_SECRET looks too short"),
  GEMINI_API_KEY: z
    .string()
    .optional()
    .transform((value) => value?.trim() || undefined)
    .refine((value) => value === undefined || value.length >= 20, "GEMINI_API_KEY looks too short"),
  GEMINI_MODEL: z.string().regex(/^[a-z0-9.-]{3,64}$/, "GEMINI_MODEL must be a model id, e.g. gemini-3.8-flash").default("gemini-3.8-flash"),
  /**
   * "free": Google may use free-tier data to improve its products, so AI
   * then works ONLY for the accounts in AI_TEST_USER_IDS (the developer's
   * own test photos, never real users' photos). "paid" for everyone.
   */
  GEMINI_TIER: z.enum(["free", "paid"]).default("free"),
  AI_TEST_USER_IDS: z
    .string()
    .default("")
    .transform((value) => value.split(",").map((id) => id.trim().toLowerCase()).filter(Boolean))
    .pipe(z.array(z.string().uuid("AI_TEST_USER_IDS must be user ids (uuid), comma separated"))),
  /** Hard monthly cap on AI spend, in US dollars, e.g. "5" or "5.00". When reached, AI is off until next month. */
  AI_MONTHLY_BUDGET_USD: usdSchema.prefault("5"),
  /** The model's prices in US dollars per million tokens (check Google's pricing page when changing GEMINI_MODEL). */
  GEMINI_INPUT_USD_PER_MTOK: usdSchema.prefault("1.50"),
  GEMINI_OUTPUT_USD_PER_MTOK: usdSchema.prefault("7.50"),
  /** Identifications per user per 24 hours. */
  AI_DAILY_LIMIT_PER_USER: z.coerce.number().int().min(1).max(1000).default(30),
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
