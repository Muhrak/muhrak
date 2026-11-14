import { Router, type Response } from "express";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  sessionSideSchema,
  verifyEmailCodeSchema,
  type AuthResponse,
  type ForgotPasswordInput,
  type LoginInput,
  type RegisterInput,
  type ResendVerificationInput,
  type ResetPasswordInput,
  type SessionSideInput,
  type VerifyEmailCodeInput,
} from "../../schemas";
import { unauthorized } from "../../shared/errors";
import { validateBody } from "../../shared/http";
import { logger } from "../../shared/logger";
import { clientIp, limitByIp, type Limit } from "../../shared/rate-limit";
import { clearRefreshCookie, readRefreshCookie, requireTrustedOrigin, setRefreshCookie } from "./auth.cookies";
import { requireAuth } from "./auth.middleware";
import * as authService from "./auth.service";

/**
 * Routes layer: HTTP only. Read the request, call the service, send the
 * response. No business rules and no database access here.
 *
 * Express 5 forwards errors thrown in async handlers to the error handler,
 * so there is no try/catch in these handlers.
 *
 * Security: every endpoint is rate limited per IP; endpoints that set or use
 * the session cookie require one of our own origins (CSRF); the refresh
 * token is only ever in an httpOnly cookie, never in a body.
 */
export const authRouter = Router();

const MINUTE = 60_000;
const LIMITS = {
  login: { name: "login:ip", max: 20, windowMs: 15 * MINUTE },
  register: { name: "register:ip", max: 10, windowMs: 60 * MINUTE },
  refresh: { name: "refresh:ip", max: 120, windowMs: 15 * MINUTE },
  logout: { name: "logout:ip", max: 60, windowMs: 15 * MINUTE },
  forgotPassword: { name: "forgot:ip", max: 5, windowMs: 15 * MINUTE },
  resetPassword: { name: "reset:ip", max: 10, windowMs: 15 * MINUTE },
  verifyEmail: { name: "verify:ip", max: 20, windowMs: 15 * MINUTE },
  resendVerification: { name: "resend-verify:ip", max: 5, windowMs: 15 * MINUTE },
  me: { name: "me:ip", max: 300, windowMs: 15 * MINUTE },
} satisfies Record<string, Limit>;

/** Put the refresh token in its cookie and send the rest. */
function sendSession(res: Response, session: authService.IssuedSession, status = 200) {
  setRefreshCookie(res, session.user.role, session.refreshToken, session.refreshExpiresAt);
  const body: AuthResponse = { user: session.user, accessToken: session.accessToken };
  res.status(status).json(body);
}

authRouter.post(
  "/register",
  limitByIp(LIMITS.register),
  requireTrustedOrigin,
  validateBody(registerSchema),
  async (req, res) => {
    // 202 with no body, the same for a new or an existing email; answered
    // before the work so the response time reveals nothing either. The new
    // account cannot sign in until its email is verified.
    res.status(202).end();
    authService.register(req.body as RegisterInput).catch((err: unknown) => logger.error({ err }, "Sign-up failed"));
  },
);

/**
 * Enter the 6-digit code from the verification email. A right code verifies
 * the email and signs in (sets the session cookie, so: our origins only).
 */
authRouter.post(
  "/verify-email",
  limitByIp(LIMITS.verifyEmail),
  requireTrustedOrigin,
  validateBody(verifyEmailCodeSchema),
  async (req, res) => {
    sendSession(res, await authService.verifyEmailCode(req.body as VerifyEmailCodeInput));
  },
);

/** Always 202 with no body: the response must not reveal whether the email has an account. */
authRouter.post(
  "/resend-verification",
  limitByIp(LIMITS.resendVerification),
  validateBody(resendVerificationSchema),
  async (req, res) => {
    res.status(202).end();
    authService
      .resendVerificationEmail((req.body as ResendVerificationInput).email)
      .catch((err: unknown) => logger.error({ err }, "Resend verification failed"));
  },
);

authRouter.post("/login", limitByIp(LIMITS.login), requireTrustedOrigin, validateBody(loginSchema), async (req, res) => {
  try {
    sendSession(res, await authService.login(req.body as LoginInput, clientIp(req)));
  } catch (error) {
    // Security log: who failed, from where (the full proxy chain, to spot spoofed IPs).
    logger.info(
      { ip: clientIp(req), forwardedFor: req.headers["x-forwarded-for"], status: (error as { status?: number }).status },
      "Login refused",
    );
    throw error;
  }
});

authRouter.post(
  "/refresh",
  limitByIp(LIMITS.refresh),
  requireTrustedOrigin,
  validateBody(sessionSideSchema),
  async (req, res) => {
    const { role } = req.body as SessionSideInput;
    const token = readRefreshCookie(req, role);
    if (!token) throw unauthorized("Not signed in");
    try {
      sendSession(res, await authService.refresh(token, role));
    } catch (error) {
      clearRefreshCookie(res, role);
      throw error;
    }
  },
);

authRouter.post(
  "/logout",
  limitByIp(LIMITS.logout),
  requireTrustedOrigin,
  validateBody(sessionSideSchema),
  async (req, res) => {
    const { role } = req.body as SessionSideInput;
    const token = readRefreshCookie(req, role);
    if (token) await authService.logout(token);
    clearRefreshCookie(res, role);
    res.status(204).end();
  },
);

/** Always 202 with no body: the response must not reveal whether the email has an account. */
authRouter.post(
  "/forgot-password",
  limitByIp(LIMITS.forgotPassword),
  validateBody(forgotPasswordSchema),
  async (req, res) => {
    const { email } = req.body as ForgotPasswordInput;
    // Answer first, then do the work: the response time must not reveal
    // whether the email has an account.
    res.status(202).end();
    authService.requestPasswordReset(email).catch((err: unknown) => logger.error({ err }, "Password reset request failed"));
  },
);

authRouter.post(
  "/reset-password",
  limitByIp(LIMITS.resetPassword),
  validateBody(resetPasswordSchema),
  async (req, res) => {
    await authService.resetPassword(req.body as ResetPasswordInput);
    res.status(204).end();
  },
);

authRouter.get("/me", limitByIp(LIMITS.me), requireAuth, async (req, res) => {
  if (!req.auth) {
    throw unauthorized();
  }
  const user = await authService.getCurrentUser(req.auth.userId);
  res.json({ user });
});
