/**
 * Public surface of the auth module.
 *
 * Other modules may import ONLY from this file, never from the files beside
 * it. If another module needs something that is not exported here, add an
 * export on purpose rather than reaching inside.
 */
export { authRouter } from "./auth.routes";
export { requireAuth, requireRole, tokenRole } from "./auth.middleware";
export {
  changeAdminEmail,
  confirmAdminTwoFactorSetup,
  confirmPassword,
  getCurrentUser,
  getUsersByIds,
  startAdminTwoFactorSetup,
  upsertAdminAccount,
} from "./auth.service";
export { refuseOtherOrigins } from "./auth.cookies";
