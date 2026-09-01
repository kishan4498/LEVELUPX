import bcrypt from "bcrypt";
import { Role } from "@prisma/client";

import { AppError } from "../../common/errors/AppError.js";
import { writeLog } from "../../common/logger/logger.js";
import type { IAccountRepository } from "./account.repository.js";

export class AccountService {
  constructor(
    private readonly repo: IAccountRepository,
    private readonly now: () => Date = () => new Date()
  ) {}

  async exportData(userId: string) {
    writeLog({ level: "info", userId, message: "User requested an account data export" });
    const account = await this.repo.findExportData(userId);

    if (!account) {
      writeLog({ level: "warn", userId, message: "Account export failed: account not found" });
      throw new AppError("Account not found", 404, "ACCOUNT_NOT_FOUND");
    }

    return {
      formatVersion: 1,
      exportedAt: this.now().toISOString(),
      account
    };
  }

  async deleteAccount(userId: string, currentPassword: string): Promise<void> {
    writeLog({ level: "info", userId, message: "Account deletion requested" });
    const credentials = await this.repo.loadAuthData(userId);

    if (!credentials) {
      writeLog({ level: "warn", userId, message: "Account deletion failed: account not found" });
      throw new AppError("Account not found", 404, "ACCOUNT_NOT_FOUND");
    }

    // Privileged accounts must go through the protected recovery process.
    if (credentials.role !== Role.USER) {
      writeLog({ level: "error", userId, role: credentials.role, message: "Blocked privileged account deletion attempt" });
      throw new AppError("Admin accounts cannot be deleted from the application", 403, "PRIVILEGED_ACCOUNT_DELETE_FORBIDDEN");
    }

    if (!(await bcrypt.compare(currentPassword, credentials.passwordHash))) {
      writeLog({ level: "warn", userId, message: "Account deletion failed: incorrect password" });
      throw new AppError("Current password is incorrect", 401, "CURRENT_PASSWORD_INVALID");
    }

    await this.repo.deleteUserAndTransferGuilds(userId);
    writeLog({ level: "info", userId, message: "Account deleted" });
  }
}
