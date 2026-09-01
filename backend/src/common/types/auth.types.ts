import type { Role } from "@prisma/client";
import type { Request } from "express";

export type AuthUser = {
  id: string;
  email: string;
  role: Role;
  adminVerified?: boolean;
  passkeyVerified?: boolean;
  adminDeviceId?: string;
  adminDeviceVersion?: number;
  tokenIssuedAt?: number;
};

export type AuthRequest = Request & {
  user?: AuthUser;
};
