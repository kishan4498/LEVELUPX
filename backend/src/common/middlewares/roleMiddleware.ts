import type { Role } from "@prisma/client";
import type { RequestHandler } from "express";

import { AppError } from "../errors/AppError.js";
import type { AuthRequest } from "../types/auth.types.js";

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    const auth = req as AuthRequest;

    if (!auth.user) {
      return next(new AppError("Authentication required", 401, "AUTH_REQUIRED"));
    }

    if (!roles.includes(auth.user.role)) {
      return next(new AppError("You do not have permission to access this resource", 403, "FORBIDDEN"));
    }

    return next();
  };
}
