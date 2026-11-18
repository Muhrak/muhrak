import cors from "cors";
import express, { Router } from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { adminRouter } from "./modules/admin";
import { buyerAiRouter, sellerAiRouter } from "./modules/ai";
import { authRouter } from "./modules/auth";
import { catalogRouter, sellerProductsRouter } from "./modules/catalog";
import { healthRouter } from "./modules/health/health.routes";
import { maintenanceGate, statusRouter } from "./modules/maintenance";
import { buyerRfqRouter, sellerRfqRouter } from "./modules/rfq";
import { sellerRouter } from "./modules/seller";
import { partSearchRouter, storefrontRouter } from "./modules/storefront";
import { uploadRouter } from "./modules/upload";
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
  // Maintenance mode: 503 for the parts of the site an admin has taken
  // offline. Before every router; the admin console is never blocked.
  v1.use(maintenanceGate);
  v1.use("/status", statusRouter);
  v1.use("/auth", authRouter);
  v1.use("/uploads", uploadRouter);
  v1.use("/catalog", catalogRouter);
  // Public: verified sellers and their live products.
  v1.use("/sellers", storefrontRouter);
  v1.use("/parts", partSearchRouter);
  // The signed-in buyer's own data.
  v1.use("/buyer/rfqs", buyerRfqRouter);
  // Before /seller: these sub-routers have their own auth and limits.
  v1.use("/seller/products", sellerProductsRouter);
  v1.use("/seller/rfqs", sellerRfqRouter);
  v1.use("/seller/ai", sellerAiRouter);
  v1.use("/buyer/ai", buyerAiRouter);
  v1.use("/seller", sellerRouter);
  v1.use("/admin", adminRouter);
  app.use("/v1", v1);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
