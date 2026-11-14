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
