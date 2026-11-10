import pino from "pino";
import { env } from "../config/env";

export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  // Never write secrets to logs.
  redact: ["req.headers.authorization", "password", "refreshToken", "accessToken"],
});
