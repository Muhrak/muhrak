import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError, type ZodType } from "zod";
import { AppError } from "./errors";
import { logger } from "./logger";

/**
 * Validate req.body against a Zod schema and replace it with the parsed
 * value. Route handlers can then trust the shape of the body.
 */
export function validateBody<T>(schema: ZodType<T>): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(result.error);
      return;
    }
    req.body = result.data;
    next();
  };
}

/**
 * Validate route params (e.g. `:id` must be a UUID). A bad param is a 404,
 * not a 400: it cannot name anything that exists.
 */
export function validateParams<T>(schema: ZodType<T>): RequestHandler {
  return (req, _res, next) => {
    if (!schema.safeParse(req.params).success) {
      next(new AppError(404, "not_found", "Not found"));
      return;
    }
    next();
  };
}

/**
 * Parse req.query with a Zod schema. Express 5 makes req.query read-only,
 * so the parsed value is stored on res.locals.query for the handler.
 */
export function validateQuery<T>(schema: ZodType<T>): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(result.error);
      return;
    }
    res.locals.query = result.data;
    next();
  };
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: { code: "not_found", message: `No route for ${req.method} ${req.path}` },
  });
};

/** The single place where errors become HTTP responses. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "validation_error",
        message: "Request is not valid",
        details: err.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    });
    return;
  }

  if (err instanceof AppError) {
    const retryAfter = (err.details as { retryAfterSeconds?: unknown } | undefined)?.retryAfterSeconds;
    if (err.status === 429 && typeof retryAfter === "number") res.setHeader("Retry-After", String(retryAfter));
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  // Malformed JSON body from express.json()
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ error: { code: "bad_request", message: "Body is not valid JSON" } });
    return;
  }

  // Other request-parsing errors (body too large, wrong charset, ...) carry a 4xx status.
  const status = (err as { status?: unknown; statusCode?: unknown } | null)?.status ?? (err as { statusCode?: unknown } | null)?.statusCode;
  if (typeof status === "number" && status >= 400 && status < 500) {
    const code = status === 413 ? "payload_too_large" : "bad_request";
    const message = status === 413 ? "Request body is too large" : "Request is not valid";
    res.status(status).json({ error: { code, message } });
    return;
  }

  logger.error({ err, method: req.method, path: req.path }, "Unhandled error");
  res.status(500).json({
    error: { code: "internal_error", message: "Something went wrong" },
  });
};
