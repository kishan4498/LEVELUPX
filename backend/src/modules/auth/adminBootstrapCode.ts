import { randomInt } from "node:crypto";

import bcrypt from "bcrypt";
import { Role, UserStatus, type User } from "@prisma/client";

const SALT_ROUNDS = 12;
const DEFAULT_TTL_MINUTES = 10;

export type AdminBootstrapUser = Pick<User, "id" | "email" | "role" | "status">;

export type AdminBootstrapRepository = {
  findUserByEmail(email: string): Promise<AdminBootstrapUser | null>;
  setTwoStepChallenge(challenge: { userId: string; codeHash: string; expiresAt: Date }): Promise<void>;
};

export type AdminBootstrapCodeResult = {
  email: string;
  role: Role;
  code: string;
  expiresAt: string;
  expiresInMinutes: number;
};

export async function generateAdminBootstrapCode(
  repo: AdminBootstrapRepository,
  request: { email: string; expiresInMinutes?: number; now?: Date }
): Promise<AdminBootstrapCodeResult> {
  const email = request.email.trim().toLowerCase();
  const minutes = normalizeMinutes(request.expiresInMinutes);
  const user = await repo.findUserByEmail(email);

  if (!user) {
    throw new Error("ADMIN_BOOTSTRAP_USER_NOT_FOUND");
  }

  if (user.status !== UserStatus.ACTIVE) {
    throw new Error("ADMIN_BOOTSTRAP_USER_NOT_ACTIVE");
  }

  if (user.role !== Role.ADMIN && user.role !== Role.SUPER_ADMIN) {
    throw new Error("ADMIN_BOOTSTRAP_PRIVILEGED_ROLE_REQUIRED");
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const codeHash = await bcrypt.hash(code, SALT_ROUNDS);
  const expiresAt = new Date(request.now ?? new Date());
  expiresAt.setUTCMinutes(expiresAt.getUTCMinutes() + minutes);

  await repo.setTwoStepChallenge({
    userId: user.id,
    codeHash,
    expiresAt
  });

  return {
    email: user.email,
    role: user.role,
    code,
    expiresAt: expiresAt.toISOString(),
    expiresInMinutes: minutes
  };
}

function normalizeMinutes(minutes: number | undefined) {
  if (!minutes || !Number.isFinite(minutes)) {
    return DEFAULT_TTL_MINUTES;
  }

  return Math.max(1, Math.min(60, Math.round(minutes)));
}
