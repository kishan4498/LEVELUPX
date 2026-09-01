export const e2eFixtures = {
  userPassword: process.env.E2E_USER_PASSWORD ?? "E2e-user-password-2026!",
  adminPassword: process.env.E2E_ADMIN_PASSWORD ?? "E2e-admin-password-2026!",
  adminDeviceKey: process.env.E2E_ADMIN_DEVICE_KEY ?? "E2e-admin-device-key-0123456789abcdef",
  adminBackupDeviceKey:
    process.env.E2E_ADMIN_BACKUP_DEVICE_KEY ?? "E2e-admin-backup-device-key-0123456789",
  onboarding: {
    email: "e2e-onboarding@levelupx.test",
    name: "Onboarding Player"
  },
  rootActivation: {
    email: "e2e-root-activation@levelupx.test",
    name: "E2E Root Owner"
  },
  otp: {
    email: "e2e-otp@levelupx.test"
  },
  recovery: {
    email: "e2e-recovery@levelupx.test"
  },
  offline: {
    email: "e2e-offline@levelupx.test"
  },
  account: {
    email: "e2e-account@levelupx.test"
  },
  admin: {
    email: "e2e-admin@levelupx.test"
  }
} as const;
