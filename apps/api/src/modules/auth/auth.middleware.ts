import type { RequestHandler } from "express";
import type { Role } from "../../schemas";
import { forbidden, unauthorized } from "../../shared/errors";
import { verifyAccessToken, type AccessTokenClaims } from "./tokens";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireAuth. Present on every route that uses it. */
      auth?: AccessTokenClaims;
    }
  }
}

/** Require a valid access token: `Authorization: Bearer <token>`. */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  if (!token) {
    next(unauthorized());
    return;
  }
  const claims = await verifyAccessToken(token);
  if (!claims) {
    next(unauthorized("Session has expired"));
    return;
  }
  req.auth = claims;
  next();
};

/**
 * The side (role) of the request's access token, or null when there is no
 * token or it is expired or forged. The signature is checked, so a made-up
 * token can never claim to be an admin. For gates that run before the
 * routes (maintenance mode); routes still use requireAuth.
 */
export async function tokenRole(authorization: string | undefined): Promise<Role | null> {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : undefined;
  if (!token || token.length > 4096) return null;
  return (await verifyAccessToken(token))?.role ?? null;
}

/** Use after requireAuth, e.g. `router.get("/x", requireAuth, requireRole("admin"), handler)`. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(unauthorized());
      return;
    }
    if (!roles.includes(req.auth.role)) {
      next(forbidden());
      return;
    }
    next();
  };
}
