import { Router } from "express";

import { authMiddleware } from "../../common/middlewares/authMiddleware.js";
import { createRateLimiter } from "../../common/middlewares/rateLimit.js";
import { validateRequest } from "../../common/middlewares/validateRequest.js";
import { env } from "../../config/env.js";
import { AuthController } from "./auth.controller.js";
import {
  requireBaseVerifiedAdminSession,
  requireFreshAdminToken,
  requireVerifiedAdminSession
} from "../../common/middlewares/adminSecurityMiddleware.js";
import { AdminTrustedDeviceController } from "./adminTrustedDevice.controller.js";
import { PrismaAdminTrustedDeviceRepository } from "./adminTrustedDevice.repository.js";
import { AdminTrustedDeviceService } from "./adminTrustedDevice.service.js";
import { adminTrustedDeviceParamsSchema } from "./adminTrustedDevice.validation.js";
import { AdminPasskeyController } from "./adminPasskey.controller.js";
import { PrismaAdminPasskeyRepository } from "./adminPasskey.repository.js";
import { AdminPasskeyService } from "./adminPasskey.service.js";
import {
  adminPasskeyParamsSchema,
  verifyAdminPasskeyAuthenticationSchema,
  verifyAdminPasskeyRegistrationSchema
} from "./adminPasskey.validation.js";
import { PrismaAuthRepository } from "./auth.repository.js";
import { AuthService } from "./auth.service.js";
import { PrismaAuthSessionRepository } from "./authSession.repository.js";
import { AuthSessionService } from "./authSession.service.js";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  requestEmailVerificationSchema,
  resetPasswordSchema,
  sessionIdParamsSchema,
  twoStepPreferenceSchema,
  verifyEmailSchema
} from "./auth.validation.js";

const repo = new PrismaAuthRepository();
const service = new AuthService(repo);
const sessionRepo = new PrismaAuthSessionRepository();
const sessions = new AuthSessionService(sessionRepo);
const controller = new AuthController(service, sessions);
const passkeys = new AdminPasskeyService(
  new PrismaAdminPasskeyRepository(),
  (userId, adminDeviceId, passkeyVerified) =>
    service.issueDeviceBoundAdminToken(userId, adminDeviceId, passkeyVerified)
);
const passkeyController = new AdminPasskeyController(passkeys);
const deviceController = new AdminTrustedDeviceController(
  new AdminTrustedDeviceService(new PrismaAdminTrustedDeviceRepository())
);
const limiter = createRateLimiter({
  windowMs: env.AUTH_RATE_LIMIT_WINDOW_MS,
  maxRequests: env.AUTH_RATE_LIMIT_MAX_REQUESTS,
  message: "Too many authentication attempts"
});

export const authRouter = Router();

authRouter.post("/register", limiter, validateRequest({ body: registerSchema }), controller.register);
authRouter.post("/login", limiter, validateRequest({ body: loginSchema }), controller.login);
authRouter.post(
  "/email-verification/request",
  limiter,
  validateRequest({ body: requestEmailVerificationSchema }),
  controller.requestEmailVerification
);
authRouter.post(
  "/email-verification/verify",
  limiter,
  validateRequest({ body: verifyEmailSchema }),
  controller.verifyEmail
);
authRouter.post("/forgot-password", limiter, validateRequest({ body: forgotPasswordSchema }), controller.forgotPassword);
authRouter.post("/reset-password", limiter, validateRequest({ body: resetPasswordSchema }), controller.resetPassword);
authRouter.post("/refresh", limiter, controller.refresh);
authRouter.post("/logout", controller.logout);
authRouter.get("/me", authMiddleware, controller.me);
authRouter.get("/sessions", authMiddleware, controller.sessions);
authRouter.delete(
  "/sessions/:id",
  authMiddleware,
  validateRequest({ params: sessionIdParamsSchema }),
  controller.revokeSession
);
authRouter.post("/sessions/revoke-all", authMiddleware, controller.revokeAllSessions);
authRouter.get(
  "/admin-passkeys",
  authMiddleware,
  requireBaseVerifiedAdminSession,
  passkeyController.list
);
authRouter.post(
  "/admin-passkeys/registration/options",
  authMiddleware,
  limiter,
  requireBaseVerifiedAdminSession,
  passkeyController.beginRegistration
);
authRouter.post(
  "/admin-passkeys/registration/verify",
  authMiddleware,
  limiter,
  requireBaseVerifiedAdminSession,
  validateRequest({ body: verifyAdminPasskeyRegistrationSchema }),
  passkeyController.verifyRegistration
);
authRouter.post(
  "/admin-passkeys/authentication/options",
  authMiddleware,
  limiter,
  requireBaseVerifiedAdminSession,
  passkeyController.beginAuthentication
);
authRouter.post(
  "/admin-passkeys/authentication/verify",
  authMiddleware,
  limiter,
  requireBaseVerifiedAdminSession,
  validateRequest({ body: verifyAdminPasskeyAuthenticationSchema }),
  passkeyController.verifyAuthentication
);
authRouter.delete(
  "/admin-passkeys/:id",
  authMiddleware,
  requireBaseVerifiedAdminSession,
  validateRequest({ params: adminPasskeyParamsSchema }),
  passkeyController.remove
);
authRouter.get(
  "/admin-devices",
  authMiddleware,
  requireVerifiedAdminSession,
  deviceController.list
);
authRouter.delete(
  "/admin-devices/:id",
  authMiddleware,
  requireVerifiedAdminSession,
  requireFreshAdminToken,
  validateRequest({ params: adminTrustedDeviceParamsSchema }),
  deviceController.revoke
);
authRouter.post("/two-step/enable", authMiddleware, limiter, validateRequest({ body: twoStepPreferenceSchema }), controller.enableTwoStep);
authRouter.post("/two-step/disable", authMiddleware, limiter, validateRequest({ body: twoStepPreferenceSchema }), controller.disableTwoStep);
