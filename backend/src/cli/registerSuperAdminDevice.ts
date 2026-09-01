import "dotenv/config";

import { randomBytes } from "node:crypto";

import bcrypt from "bcrypt";
import { Role, UserStatus } from "@prisma/client";
import { z } from "zod";

import { writeLog } from "../common/logger/logger.js";
import { createAuthEmailSenderFromEnv } from "../modules/auth/authEmailDelivery.js";
import { prisma } from "../prisma/client.js";

const DEVICE_KEY_SALT_ROUNDS = 12;

type CliArgs = {
  email?: string;
  label?: string;
};

const cliFlagsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  label: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[A-Za-z0-9][A-Za-z0-9 ._-]*$/, "Label contains unsupported characters")
});

async function main() {
  const parsedFlags = cliFlagsSchema.safeParse(parseArgs(process.argv.slice(2)));

  if (!parsedFlags.success) {
    printUsage();
    throw new Error("Provide a valid email and a 2-80 character device label.");
  }

  const flags = parsedFlags.data;

  const user = await prisma.user.findUnique({
    where: { email: flags.email },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      emailVerifiedAt: true,
      twoStepEnabled: true
    }
  });

  if (
    !user ||
    (user.role !== Role.ADMIN && user.role !== Role.SUPER_ADMIN) ||
    user.status !== UserStatus.ACTIVE ||
    !user.emailVerifiedAt ||
    !user.twoStepEnabled
  ) {
    throw new Error("Trusted devices require an active, email-verified admin with mandatory two-step enabled.");
  }

  const deviceKey = randomBytes(32).toString("base64url");
  const keyHash = await bcrypt.hash(deviceKey, DEVICE_KEY_SALT_ROUNDS);

  const binding = await prisma.$transaction(async (tx) => {
    const existing = await tx.superAdminTrustedDevice.findUnique({
      where: {
        userId_label: {
          userId: user.id,
          label: flags.label
        }
      }
    });
    const device = await tx.superAdminTrustedDevice.upsert({
      where: {
        userId_label: {
          userId: user.id,
          label: flags.label
        }
      },
      create: {
        userId: user.id,
        label: flags.label,
        deviceKeyHash: keyHash
      },
      update: {
        deviceKeyHash: keyHash,
        bindingVersion: {
          increment: 1
        },
        active: true,
        lastUsedAt: null
      }
    });
    let action = "ADMIN_TRUSTED_DEVICE_BOUND";

    if (existing) {
      action = existing.active ? "ADMIN_TRUSTED_DEVICE_ROTATED" : "ADMIN_TRUSTED_DEVICE_REACTIVATED";
    }

    if (existing) {
      await tx.superAdminLoginChallenge.updateMany({
        where: {
          userId: user.id,
          deviceId: device.id,
          usedAt: null
        },
        data: { usedAt: new Date() }
      });
    }

    await tx.adminAction.create({
      data: {
        adminUserId: user.id,
        action,
        targetType: "SUPER_ADMIN_TRUSTED_DEVICE",
        targetId: device.id,
        metadata: {
          label: device.label,
          provisioningChannel: "BACKEND_OPERATOR_CLI"
        }
      }
    });

    return { action, device };
  });

  await notifyBinding({
    email: user.email,
    label: binding.device.label,
    action: binding.action
  });

  console.log("LevelUpX admin trusted device registered");
  console.log(`Email: ${user.email}`);
  console.log(`Label: ${flags.label}`);
  console.log(`Device key: ${deviceKey}`);
  console.log("Store this key in a password manager. It is shown once and only a bcrypt hash is saved.");
}

async function notifyBinding(notice: { email: string; label: string; action: string }) {
  const verb = notice.action === "ADMIN_TRUSTED_DEVICE_BOUND" ? "registered" : "rotated";

  try {
    const delivery = await createAuthEmailSenderFromEnv().send({
      to: notice.email,
      subject: `LevelUpX trusted device ${verb}`,
      text: [
        `Trusted device ${verb}: ${notice.label}`,
        `Changed at: ${new Date().toISOString()}`,
        "",
        "If you did not authorize this change, contact the recovery operator immediately."
      ].join("\n")
    });

    if (!delivery.attempted) {
      writeLog({
        level: "warn",
        message: "admin_trusted_device_binding_notification_not_sent",
        action: notice.action
      });
    }
  } catch (error) {
    writeLog({
      level: "error",
      message: "admin_trusted_device_binding_notification_failed",
      action: notice.action,
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
  }
}

function parseArgs(tokens: string[]): CliArgs {
  const parsed: CliArgs = {};

  for (let i = 0; i < tokens.length; i += 1) {
    const arg = tokens[i];

    if (arg === "--email") {
      parsed.email = tokens[i + 1];
      i += 1;
      continue;
    }

    if (arg?.startsWith("--email=")) {
      parsed.email = arg.slice("--email=".length);
      continue;
    }

    if (arg === "--label") {
      parsed.label = tokens[i + 1];
      i += 1;
      continue;
    }

    if (arg?.startsWith("--label=")) {
      parsed.label = arg.slice("--label=".length);
    }
  }

  return parsed;
}

function printUsage() {
  console.error("Usage: npm run auth:admin-device -- --email admin@example.com --label owner-laptop");
}

main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);

    console.error(`Admin trusted device registration failed: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
