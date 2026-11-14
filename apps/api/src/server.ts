import { createApp } from "./app";
import { env } from "./config/env";
import { pool } from "./db/client";
import { logger } from "./shared/logger";
import { closeWorkers, startWorkers } from "./worker";

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`Muhrak API listening on http://localhost:${env.PORT}`);
  startWorkers();
});

/** Finish in-flight requests and running jobs, then close the database pool. */
function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  server.close(() => {
    closeWorkers()
      .then(() => pool.end())
      .catch((err: unknown) => logger.error({ err }, "Error closing database pool or queues"))
      .finally(() => process.exit(0));
  });
  // Do not hang forever if a connection refuses to close.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
