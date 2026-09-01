import bcrypt from "bcrypt";
import { PrismaClient, Role, UserStatus } from "@prisma/client";

const TEST_SCHEMA = "levelupx_e2e";
const PASSWORD_SALT_ROUNDS = 12;

export const browserTestFixtures = {
  onboarding: { email: "e2e-onboarding@levelupx.test" },
  rootActivation: { email: "e2e-root-activation@levelupx.test", name: "E2E Root Owner" },
  otp: { email: "e2e-otp@levelupx.test", name: "OTP Player" },
  recovery: { email: "e2e-recovery@levelupx.test", name: "Recovery Player" },
  offline: { email: "e2e-offline@levelupx.test", name: "Offline Player" },
  account: { email: "e2e-account@levelupx.test", name: "Account Player" },
  admin: { email: "e2e-admin@levelupx.test", name: "E2E Root Admin" }
} as const;

export async function seedBrowserTestFixtures() {
  assertSafeEnv();

  const password = requiredSecret("E2E_USER_PASSWORD");
  const adminPassword = requiredSecret("E2E_ADMIN_PASSWORD");
  const deviceKey = requiredSecret("E2E_ADMIN_DEVICE_KEY");
  const backupKey = requiredSecret("E2E_ADMIN_BACKUP_DEVICE_KEY");
  const [passwordHash, adminHash, deviceHash, backupHash] = await Promise.all([
    bcrypt.hash(password, PASSWORD_SALT_ROUNDS),
    bcrypt.hash(adminPassword, PASSWORD_SALT_ROUNDS),
    bcrypt.hash(deviceKey, PASSWORD_SALT_ROUNDS),
    bcrypt.hash(backupKey, PASSWORD_SALT_ROUNDS)
  ]);
  const prisma = new PrismaClient();

  try {
    const emails = Object.values(browserTestFixtures).map((fixture) => fixture.email);

    // The schema guard above keeps fixture cleanup away from normal databases.
    await prisma.user.deleteMany({ where: { email: { in: emails } } });

    await Promise.all([
      createPlayer(prisma, browserTestFixtures.otp, passwordHash, true),
      createPlayer(prisma, browserTestFixtures.recovery, passwordHash),
      createPlayer(prisma, browserTestFixtures.offline, passwordHash),
      createPlayer(prisma, browserTestFixtures.account, passwordHash),
      prisma.user.create({
        data: {
          email: browserTestFixtures.admin.email,
          name: browserTestFixtures.admin.name,
          passwordHash: adminHash,
          role: Role.SUPER_ADMIN,
          status: UserStatus.ACTIVE,
          emailVerifiedAt: new Date(),
          twoStepEnabled: true,
          profile: { create: { onboardingCompletedAt: new Date() } },
          superAdminTrustedDevices: {
            create: [
              { label: "Playwright virtual device", deviceKeyHash: deviceHash },
              { label: "Playwright backup device", deviceKeyHash: backupHash }
            ]
          }
        }
      })
    ]);
  } finally {
    await prisma.$disconnect();
  }
}

function createPlayer(
  prisma: PrismaClient,
  fixture: { email: string; name: string },
  passwordHash: string,
  twoStepEnabled = false
) {
  return prisma.user.create({
    data: {
      email: fixture.email,
      name: fixture.name,
      passwordHash,
      role: Role.USER,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      twoStepEnabled,
      profile: { create: { onboardingCompletedAt: new Date() } }
    }
  });
}

function assertSafeEnv() {
  if (process.env.NODE_ENV !== "test" || process.env.LEVELUPX_E2E !== "true") {
    throw new Error("Browser fixtures require NODE_ENV=test and LEVELUPX_E2E=true");
  }

  const url = process.env.DATABASE_URL;

  if (!url || new URL(url).searchParams.get("schema") !== TEST_SCHEMA) {
    throw new Error(`Browser fixtures may only use the ${TEST_SCHEMA} PostgreSQL schema`);
  }
}

function requiredSecret(
  name:
    | "E2E_USER_PASSWORD"
    | "E2E_ADMIN_PASSWORD"
    | "E2E_ADMIN_DEVICE_KEY"
    | "E2E_ADMIN_BACKUP_DEVICE_KEY"
) {
  const secret = process.env[name];

  if (!secret || secret.length < 16) {
    throw new Error(`${name} must be at least 16 characters for browser tests`);
  }

  return secret;
}
