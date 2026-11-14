import type { ZodType } from "zod";
import { authedRequest } from "@/features/auth/authed-request";
import type { RequestOptions } from "@/lib/api";

/**
 * A request as the signed-in admin. Always the admin side's own session
 * (`muhrak_rt_admin` cookie, admin access token): a buyer or seller signed
 * in on the same browser is never used, and the API checks the admin role
 * on every call anyway.
 */
export function adminRequest<T>(path: string, schema: ZodType<T>, options: Omit<RequestOptions, "accessToken"> = {}): Promise<T> {
  return authedRequest("admin", path, schema, options);
}
