import type { SuperAdminTrustedDevice } from "@prisma/client";

import { prisma } from "../../prisma/client.js";

export type RevokeAdminTrustedDeviceResult =
  | { status: "REVOKED"; device: SuperAdminTrustedDevice; email: string }
  | { status: "NOT_FOUND" }
  | { status: "CURRENT_DEVICE" }
  | { status: "LAST_ACTIVE_DEVICE" };

export interface IAdminTrustedDeviceRepository {
  findActiveForUser(userId: string): Promise<SuperAdminTrustedDevice[]>;
  revoke(revocation: {
    userId: string;
    deviceId: string;
    currentDeviceId: string;
    revokedAt: Date;
  }): Promise<RevokeAdminTrustedDeviceResult>;
}

export class PrismaAdminTrustedDeviceRepository implements IAdminTrustedDeviceRepository {
  findActiveForUser(userId: string) {
    return prisma.superAdminTrustedDevice.findMany({
      where: { userId, active: true },
      orderBy: [{ lastUsedAt: "desc" }, { createdAt: "asc" }]
    });
  }

  revoke(revocation: { userId: string; deviceId: string; currentDeviceId: string; revokedAt: Date }) {
    return prisma.$transaction(async (tx): Promise<RevokeAdminTrustedDeviceResult> => {
      // Lock the set so concurrent revocations cannot remove every recovery device.
      const active = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "SuperAdminTrustedDevice"
        WHERE "userId" = ${revocation.userId} AND "active" = true
        ORDER BY "id"
        FOR UPDATE
      `;

      if (!active.some((device) => device.id === revocation.deviceId)) {
        return { status: "NOT_FOUND" };
      }

      if (active.length <= 1) {
        return { status: "LAST_ACTIVE_DEVICE" };
      }

      if (revocation.deviceId === revocation.currentDeviceId) {
        return { status: "CURRENT_DEVICE" };
      }

      const [device, user] = await Promise.all([
        tx.superAdminTrustedDevice.update({
          where: { id: revocation.deviceId },
          data: { active: false }
        }),
        tx.user.findUnique({
          where: { id: revocation.userId },
          select: { email: true }
        })
      ]);

      if (!user) {
        throw new Error("Trusted-device owner could not be loaded");
      }

      await tx.superAdminLoginChallenge.updateMany({
        where: {
          userId: revocation.userId,
          deviceId: revocation.deviceId,
          usedAt: null
        },
        data: { usedAt: revocation.revokedAt }
      });
      await tx.adminAction.create({
        data: {
          adminUserId: revocation.userId,
          action: "ADMIN_TRUSTED_DEVICE_REVOKED",
          targetType: "SUPER_ADMIN_TRUSTED_DEVICE",
          targetId: device.id,
          metadata: {
            label: device.label,
            lastUsedAt: device.lastUsedAt?.toISOString() ?? null
          }
        }
      });

      return { status: "REVOKED", device, email: user.email };
    });
  }
}
