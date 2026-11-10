import { createApp } from "./app";
import { env } from "./config/env";
import { pool } from "./db/client";
import { logger } from "./shared/logger";

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`Muhrak API listening on http://localhost:${env.PORT}`);
});

/** Finish in-flight requests and close the database pool before exiting. */
function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  server.close(() => {
    pool
      .end()
      .catch((err: unknown) => logger.error({ err }, "Error closing database pool"))
      .finally(() => process.exit(0));
  });
  // Do not hang forever if a connection refuses to close.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
