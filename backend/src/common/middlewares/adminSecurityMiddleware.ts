import { Role, UserStatus } from "@prisma/client";
import type { RequestHandler } from "express";

import { prisma } from "../../prisma/client.js";
import { AppError } from "../errors/AppError.js";
import type { AuthRequest } from "../types/auth.types.js";

const TOKEN_STALE_SKEW_SECONDS = 2;
const FRESH_ADMIN_TOKEN_SECONDS = 5 * 60;

function isAdminRole(role: Role) {
  return role === Role.ADMIN || role === Role.SUPER_ADMIN;
}

async function verifyAdminBase(req: Parameters<RequestHandler>[0]) {
  const auth = req as AuthRequest;

  if (!auth.user) {
    throw new AppError("Authentication required", 401, "AUTH_REQUIRED");
  }

  if (!isAdminRole(auth.user.role)) {
    throw new AppError("You do not have permission to access this resource", 403, "FORBIDDEN");
  }

  if (!auth.user.adminDeviceId) {
    throw new AppError("Admin session is not bound to a trusted device", 401, "ADMIN_DEVICE_SESSION_INVALID");
  }

  // Re-check mutable security state so bans, demotions, and 2FA changes apply immediately.
  const user = await prisma.user.findUnique({
    where: { id: auth.user.id },
    select: {
      role: true,
      status: true,
      emailVerifiedAt: true,
      twoStepEnabled: true,
      updatedAt: true,
      superAdminTrustedDevices: {
        where: {
          id: auth.user.adminDeviceId,
          active: true
        },
        select: {
          id: true,
          bindingVersion: true
        }
      }
    }
  });

  if (!user || user.status !== UserStatus.ACTIVE) {
    throw new AppError("Admin account is not active", 403, "ADMIN_ACCOUNT_NOT_ACTIVE");
  }

  if (user.role !== auth.user.role || !isAdminRole(user.role)) {
    throw new AppError("Admin token no longer matches account privileges", 401, "ADMIN_TOKEN_STALE");
  }

  if (!user.emailVerifiedAt) {
    throw new AppError("Admin access requires a verified email address", 403, "ADMIN_EMAIL_VERIFICATION_REQUIRED");
  }

  if (!user.twoStepEnabled || auth.user.adminVerified !== true) {
    throw new AppError("Admin access requires a verified two-step session", 403, "ADMIN_TWO_STEP_REQUIRED");
  }

  const device = user.superAdminTrustedDevices[0];

  if (!device) {
    throw new AppError("The trusted device for this admin session is no longer active", 401, "ADMIN_DEVICE_SESSION_INVALID");
  }

  const issuedAt = auth.user.tokenIssuedAt ?? 0;
  const updatedAtSecs = Math.floor(user.updatedAt.getTime() / 1000);

  // Any account security update after issue time invalidates the token.
  if (issuedAt + TOKEN_STALE_SKEW_SECONDS < updatedAtSecs) {
    throw new AppError("Admin token is stale after an account security change", 401, "ADMIN_TOKEN_STALE");
  }

  // The binding version covers same-second rotations that JWT timestamps cannot distinguish.
  if (
    !Number.isSafeInteger(auth.user.adminDeviceVersion) ||
    auth.user.adminDeviceVersion !== device.bindingVersion
  ) {
    throw new AppError("Admin token is stale after a trusted-device change", 401, "ADMIN_DEVICE_SESSION_INVALID");
  }

  return auth;
}

export const requireBaseVerifiedAdminSession: RequestHandler = async (req, _res, next) => {
  try {
    await verifyAdminBase(req);
    return next();
  } catch (error) {
    return next(error);
  }
};

export const requireVerifiedAdminSession: RequestHandler = async (req, _res, next) => {
  try {
    const auth = await verifyAdminBase(req);
    const passkeys = await prisma.adminPasskey.count({
      where: {
        userId: auth.user!.id,
        active: true
      }
    });

    if (passkeys === 0) {
      return next(
        new AppError(
          "Enroll a passkey before accessing admin operations",
          403,
          "ADMIN_PASSKEY_ENROLLMENT_REQUIRED"
        )
      );
    }

    if (auth.user!.passkeyVerified !== true) {
      return next(
        new AppError(
          "Admin access requires passkey verification for this session",
          403,
          "ADMIN_PASSKEY_REQUIRED"
        )
      );
    }

    return next();
  } catch (error) {
    return next(error);
  }
};

export const requireFreshAdminToken: RequestHandler = (req, _res, next) => {
  const auth = req as AuthRequest;
  const issuedAt = auth.user?.tokenIssuedAt ?? 0;
  const ageSecs = Math.floor(Date.now() / 1000) - issuedAt;

  // Sensitive mutations require recent re-authentication.
  if (ageSecs > FRESH_ADMIN_TOKEN_SECONDS) {
    return next(new AppError("Sensitive admin actions require a fresh login token", 401, "ADMIN_FRESH_TOKEN_REQUIRED"));
  }

  return next();
};
