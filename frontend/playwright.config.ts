import { defineConfig, devices } from "@playwright/test";

import { e2eFixtures } from "./e2e/fixtures";

const frontendUrl = "http://localhost:3100";
const backendUrl = "http://localhost:4100";
const mailpitSmtpPort = process.env.MAILPIT_SMTP_PORT ?? "1025";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 12_000 },
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  use: {
    baseURL: frontendUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: [
    {
      command: "npm --prefix ../backend run test:e2e:server",
      url: `${backendUrl}/api/health`,
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        LEVELUPX_E2E: "true",
        E2E_USER_PASSWORD: e2eFixtures.userPassword,
        E2E_ADMIN_PASSWORD: e2eFixtures.adminPassword,
        E2E_ADMIN_DEVICE_KEY: e2eFixtures.adminDeviceKey,
        E2E_ADMIN_BACKUP_DEVICE_KEY: e2eFixtures.adminBackupDeviceKey,
        ROOT_SUPER_ADMIN_EMAIL: e2eFixtures.rootActivation.email,
        AUTH_EMAIL_DELIVERY_ENABLED: "true",
        AUTH_EMAIL_PROVIDER: "smtp",
        AUTH_EMAIL_FROM: "no-reply@levelupx.local",
        AUTH_EMAIL_SMTP_HOST: "127.0.0.1",
        AUTH_EMAIL_SMTP_PORT: mailpitSmtpPort,
        AUTH_EMAIL_SMTP_SECURE: "false",
        AUTH_EMAIL_SMTP_USERNAME: "levelupx",
        AUTH_EMAIL_SMTP_PASSWORD: "local-mailpit-only",
        AUTH_EMAIL_PRINT_CODES_TO_CONSOLE: "false",
        AUTH_DEV_DISCLOSE_CODES: "false",
        ...(process.env.E2E_DATABASE_URL ? { E2E_DATABASE_URL: process.env.E2E_DATABASE_URL } : {})
      }
    },
    {
      command: "npm run dev:e2e",
      url: frontendUrl,
      timeout: 240_000,
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_API_URL: `${backendUrl}/api`,
        NEXT_PUBLIC_REALTIME_URL: backendUrl
      }
    }
  ]
});
