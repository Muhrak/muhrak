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
  REDIS_URL: z.string().min(1),
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
  /**
   * How many proxies sit in front of the API and add to X-Forwarded-For
   * (Express `trust proxy`). Used to find the real client IP for rate
   * limits. 0 locally. Too high a value lets clients fake their IP.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  /**
   * Path of the refresh-token cookie as the BROWSER sees it. The web app
   * proxies /api/* to this API, so /v1/auth here is /api/v1/auth there.
   */
  AUTH_COOKIE_PATH: z.string().startsWith("/").default("/api/v1/auth"),
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
