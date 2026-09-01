import { AppError } from "../../common/errors/AppError.js";
import { writeLog } from "../../common/logger/logger.js";
import { createAuthEmailSenderFromEnv, type IAuthEmailSender } from "./authEmailDelivery.js";
import type { IAdminTrustedDeviceRepository } from "./adminTrustedDevice.repository.js";
import type { AdminTrustedDeviceDto, AdminTrustedDeviceListDto } from "./adminTrustedDevice.types.js";

export class AdminTrustedDeviceService {
  constructor(
    private readonly repo: IAdminTrustedDeviceRepository,
    private readonly mailer: IAuthEmailSender = createAuthEmailSenderFromEnv(),
    private readonly now: () => Date = () => new Date()
  ) {}

  async list(userId: string, currentDeviceId: string): Promise<AdminTrustedDeviceListDto> {
    this.requireDevice(currentDeviceId);
    const devices = await this.repo.findActiveForUser(userId);

    return {
      devices: devices.map((device) => this.toDto(device, currentDeviceId))
    };
  }

  async revoke(userId: string, currentDeviceId: string, deviceId: string): Promise<void> {
    this.requireDevice(currentDeviceId);
    const revokedAt = this.now();
    const outcome = await this.repo.revoke({ userId, currentDeviceId, deviceId, revokedAt });

    if (outcome.status === "NOT_FOUND") {
      throw new AppError("Trusted device not found", 404, "ADMIN_TRUSTED_DEVICE_NOT_FOUND");
    }

    if (outcome.status === "CURRENT_DEVICE") {
      throw new AppError(
        "Sign in from another trusted device before revoking this one",
        409,
        "ADMIN_CURRENT_DEVICE_PROTECTED"
      );
    }

    if (outcome.status === "LAST_ACTIVE_DEVICE") {
      throw new AppError(
        "The final trusted device can only be changed through backend recovery",
        409,
        "ADMIN_LAST_TRUSTED_DEVICE_PROTECTED"
      );
    }

    try {
      const delivery = await this.mailer.send({
        to: outcome.email,
        subject: "LevelUpX trusted device revoked",
        text: [
          `Trusted device revoked: ${outcome.device.label}`,
          `Revoked at: ${revokedAt.toISOString()}`,
          "",
          "If you did not make this change, reset your password and contact the recovery operator immediately."
        ].join("\n")
      });

      if (!delivery.attempted) {
        writeLog({
          level: "warn",
          message: "admin_trusted_device_revocation_notification_not_sent",
          userId,
          deviceId
        });
      }
    } catch (error) {
      writeLog({
        level: "error",
        message: "admin_trusted_device_revocation_notification_failed",
        userId,
        deviceId,
        errorName: getErrorName(error)
      });
    }
  }

  private requireDevice(deviceId: string) {
    if (!deviceId) {
      throw new AppError("Admin session is not bound to a trusted device", 401, "ADMIN_DEVICE_SESSION_INVALID");
    }
  }

  private toDto(
    device: Awaited<ReturnType<IAdminTrustedDeviceRepository["findActiveForUser"]>>[number],
    currentDeviceId: string
  ): AdminTrustedDeviceDto {
    return {
      id: device.id,
      label: device.label,
      current: device.id === currentDeviceId,
      lastUsedAt: device.lastUsedAt?.toISOString() ?? null,
      createdAt: device.createdAt.toISOString()
    };
  }
}

function getErrorName(error: unknown) {
  return error instanceof Error ? error.name : "UnknownError";
}
