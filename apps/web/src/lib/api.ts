import type { ZodType } from "zod";

/**
 * The one place the web app talks to the Muhrak API.
 * Every response is parsed with a Zod schema from @muhrak/schemas, so a
 * change on the API side shows up as a clear error here, not a broken page.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface ApiFieldError {
  path: string;
  message: string;
}

/** Error returned by the API: `{ error: { code, message, details } }`. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fieldErrors: ApiFieldError[] = [],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  accessToken?: string;
}

function isFieldErrorList(value: unknown): value is ApiFieldError[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as ApiFieldError).path === "string" &&
        typeof (item as ApiFieldError).message === "string",
    )
  );
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, "network_error", "Could not reach the server. Check your connection and try again.");
  }

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const error =
      typeof payload === "object" && payload !== null && "error" in payload
        ? (payload as { error: { code?: unknown; message?: unknown; details?: unknown } }).error
        : undefined;
    throw new ApiError(
      response.status,
      typeof error?.code === "string" ? error.code : "unknown_error",
      typeof error?.message === "string" ? error.message : "Something went wrong",
      isFieldErrorList(error?.details) ? error.details : [],
    );
  }

  return response;
}

/** Call an endpoint that returns JSON and parse it with `schema`. */
export async function apiRequest<T>(path: string, schema: ZodType<T>, options: RequestOptions = {}): Promise<T> {
  const response = await send(path, options);
  return schema.parse(await response.json());
}

/** Call an endpoint that returns no body (204). */
export async function apiRequestNoContent(path: string, options: RequestOptions = {}): Promise<void> {
  await send(path, options);
}
