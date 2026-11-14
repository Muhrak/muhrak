/**
 * Public surface of the auth module.
 *
 * Other modules may import ONLY from this file, never from the files beside
 * it. If another module needs something that is not exported here, add an
 * export on purpose rather than reaching inside.
 */
export { authRouter } from "./auth.routes";
export { requireAuth, requireRole } from "./auth.middleware";
export { changeAdminEmail, getCurrentUser, getUsersByIds, upsertAdminAccount } from "./auth.service";
