/**
 * Errors the API returns on purpose. Services throw these; the error handler
 * in shared/http.ts turns them into JSON responses. Anything else that is
 * thrown is treated as a bug and returned as a generic 500.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, "bad_request", message, details);

export const unauthorized = (message = "Not signed in") => new AppError(401, "unauthorized", message);

export const forbidden = (message = "Not allowed") => new AppError(403, "forbidden", message);

export const notFound = (message = "Not found") => new AppError(404, "not_found", message);

export const conflict = (message: string) => new AppError(409, "conflict", message);
