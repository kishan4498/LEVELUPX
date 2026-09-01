import jwt from "jsonwebtoken";
import type { RequestHandler } from "express";

import { AppError } from "../errors/AppError.js";
import type { AuthRequest, AuthUser } from "../types/auth.types.js";
import { env } from "../../config/env.js";

type AccessTokenPayload = AuthUser & {
  type: "access";
  iat?: number;
};

export function verifyAccessToken(token: string): AuthUser {
  const claims = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;

  if (claims.type !== "access") {
    throw new AppError("Invalid access token", 401, "INVALID_TOKEN");
  }

  return {
    id: claims.id,
    email: claims.email,
    role: claims.role,
    adminVerified: claims.adminVerified,
    passkeyVerified: claims.passkeyVerified,
    adminDeviceId: claims.adminDeviceId,
    adminDeviceVersion: claims.adminDeviceVersion,
    tokenIssuedAt: claims.iat
  };
}

export const authMiddleware: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return next(new AppError("Authentication required", 401, "AUTH_REQUIRED"));
  }

  const token = header.slice("Bearer ".length);

  try {
    (req as AuthRequest).user = verifyAccessToken(token);

    return next();
  } catch {
    return next(new AppError("Invalid or expired access token", 401, "INVALID_TOKEN"));
  }
};
