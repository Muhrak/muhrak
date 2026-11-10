import { Router } from "express";
import {
  loginSchema,
  refreshSchema,
  registerSchema,
  type LoginInput,
  type RefreshInput,
  type RegisterInput,
} from "@muhrak/schemas";
import { unauthorized } from "../../shared/errors";
import { validateBody } from "../../shared/http";
import { requireAuth } from "./auth.middleware";
import * as authService from "./auth.service";

/**
 * Routes layer: HTTP only. Read the request, call the service, send the
 * response. No business rules and no database access here.
 *
 * Express 5 forwards errors thrown in async handlers to the error handler,
 * so there is no try/catch in these handlers.
 */
export const authRouter = Router();

authRouter.post("/register", validateBody(registerSchema), async (req, res) => {
  const result = await authService.register(req.body as RegisterInput);
  res.status(201).json(result);
});

authRouter.post("/login", validateBody(loginSchema), async (req, res) => {
  const result = await authService.login(req.body as LoginInput);
  res.json(result);
});

authRouter.post("/refresh", validateBody(refreshSchema), async (req, res) => {
  const { refreshToken } = req.body as RefreshInput;
  const result = await authService.refresh(refreshToken);
  res.json(result);
});

authRouter.post("/logout", validateBody(refreshSchema), async (req, res) => {
  const { refreshToken } = req.body as RefreshInput;
  await authService.logout(refreshToken);
  res.status(204).end();
});

authRouter.get("/me", requireAuth, async (req, res) => {
  if (!req.auth) {
    throw unauthorized();
  }
  const user = await authService.getCurrentUser(req.auth.userId);
  res.json({ user });
});
