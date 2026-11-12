import cors from "cors";
import express, { Router } from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { authRouter } from "./modules/auth";
import { healthRouter } from "./modules/health/health.routes";
import { errorHandler, notFoundHandler } from "./shared/http";
import { limitByIp } from "./shared/rate-limit";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  // Proxies in front of the API (Railway, the web app's /api proxy). Needed
  // for the real client IP in rate limits; see TRUST_PROXY_HOPS in env.ts.
  app.set("trust proxy", env.TRUST_PROXY_HOPS);
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: false }));
  app.use(express.json({ limit: "100kb" }));

  app.use("/health", healthRouter);

  // Every business endpoint lives under /v1. Old mobile app versions stay in
  // use for months, so a breaking change means adding /v2, never editing /v1.
  const v1 = Router();
  // Ceiling for any single IP across the whole API; endpoints add tighter limits.
  v1.use(limitByIp({ name: "api:ip", max: 600, windowMs: 60_000 }));
  v1.use("/auth", authRouter);
  app.use("/v1", v1);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
