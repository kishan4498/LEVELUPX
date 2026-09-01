import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { e2eFixtures } from "./fixtures";
import {
  submitPasswordLogin as loginWithPassword,
  waitForFormHydration as waitForHydration
} from "./helpers";
import {
  latestMailText,
  readAdminCodes,
  readVerificationCode,
  readResetToken,
  readSingleCode,
  waitForNewMail
} from "./mailpit";

test("a new player can verify their email and finish onboarding", async ({ page, request }) => {
  const firstQuest = "Finish the Playwright onboarding run";
  const previous = await latestMailText(request, e2eFixtures.onboarding.email);

  await page.goto("/register");
  await waitForHydration(page);
  await page.getByLabel("Name").fill(e2eFixtures.onboarding.name);
  await page.getByLabel("Email").fill(e2eFixtures.onboarding.email);
  await page.getByLabel("Password").fill(e2eFixtures.userPassword);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
  const message = await waitForNewMail(request, e2eFixtures.onboarding.email, previous);
  await page.getByLabel("Email verification code").fill(readVerificationCode(message));
  await page.getByRole("button", { name: "Verify email" }).click();

  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByRole("button", { name: /^Work/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Make the plan fit real life" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("First quest").fill(firstQuest);
  await page.getByRole("button", { name: "Start first run" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: firstQuest, exact: true })).toBeVisible();
});

test("the configured root activates only after email ownership verification", async ({ page, request }) => {
  const previous = await latestMailText(request, e2eFixtures.rootActivation.email);

  await page.goto("/register");
  await waitForHydration(page);
  await page.getByLabel("Name").fill(e2eFixtures.rootActivation.name);
  await page.getByLabel("Email").fill(e2eFixtures.rootActivation.email);
  await page.getByLabel("Password").fill(e2eFixtures.adminPassword);
  await page.getByRole("button", { name: "Create account" }).click();

  const message = await waitForNewMail(request, e2eFixtures.rootActivation.email, previous);
  await page.getByLabel("Email verification code").fill(readVerificationCode(message));
  await page.getByRole("button", { name: "Verify email" }).click();

  await expect(page.getByRole("heading", { name: "Root identity verified" })).toBeVisible();
  await expect(page.getByText("Privileged access remains signed out")).toBeVisible();
  await page.getByRole("link", { name: "Go to login" }).click();
  await loginWithPassword(page, e2eFixtures.rootActivation.email, e2eFixtures.adminPassword);
  await expect(page.getByLabel("Trusted device key")).toBeVisible();
});

test("a regular player completes email OTP login", async ({ page, request }) => {
  const previous = await latestMailText(request, e2eFixtures.otp.email);
  await loginWithPassword(page, e2eFixtures.otp.email, e2eFixtures.userPassword);

  await expect(page.getByText(/Development code:/)).toHaveCount(0);
  const message = await waitForNewMail(request, e2eFixtures.otp.email, previous);
  const code = readSingleCode(message);

  await page.getByLabel("Verification code").fill(code);
  await page.getByRole("button", { name: "Verify and log in" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByLabel("Quick capture")).toBeVisible();
});

test("a player can request a reset token and replace the password", async ({ page, request }) => {
  const newPassword = "E2e-recovered-password-2026!";
  const previous = await latestMailText(request, e2eFixtures.recovery.email);

  await page.goto("/forgot-password");
  await waitForHydration(page);
  await page.getByLabel("Email").fill(e2eFixtures.recovery.email);
  await page.getByRole("button", { name: "Request reset" }).click();

  await expect(page.getByText("If the email exists, password reset instructions are available.")).toBeVisible();
  await expect(page.getByText(/Development token:/)).toHaveCount(0);
  const message = await waitForNewMail(request, e2eFixtures.recovery.email, previous);
  const token = readResetToken(message);

  await page.goto("/reset-password");
  await waitForHydration(page);
  await page.getByLabel("Email").fill(e2eFixtures.recovery.email);
  await page.getByLabel("Reset token").fill(token);
  await page.getByLabel("New password").fill(newPassword);
  await page.getByRole("button", { name: "Reset password" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByLabel("Quick capture")).toBeVisible();
});

test("an offline quick capture replays once the connection returns", async ({ context: browserContext, page }) => {
  const questTitle = "Replay this offline quest once";

  await loginWithPassword(page, e2eFixtures.offline.email, e2eFixtures.userPassword);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByLabel("Quick capture")).toBeVisible();

  await browserContext.setOffline(true);
  await page.getByLabel("Quick capture").fill(questTitle);
  await page.getByRole("button", { name: "Add quest" }).click();

  await expect(page.getByText("Quest saved on this device. It will sync when the connection returns.")).toBeVisible();
  await expect(page.getByRole("link", { name: "1 queued" })).toBeVisible();

  await browserContext.setOffline(false);
  await expect(page.getByRole("link", { name: "1 queued" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: questTitle, exact: true })).toBeVisible();
});

test("a player can export data and permanently delete the account", async ({ page }) => {
  await loginWithPassword(page, e2eFixtures.account.email, e2eFixtures.userPassword);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Account controls" })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export my data" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^levelupx-export-\d{4}-\d{2}-\d{2}\.json$/);
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const exported = JSON.parse(await readFile(downloadPath!, "utf8")) as {
    formatVersion: number;
    account: { email: string };
  };
  expect(exported).toMatchObject({
    formatVersion: 1,
    account: { email: e2eFixtures.account.email }
  });

  await page.locator('input[name="deleteAccountPassword"]').fill(e2eFixtures.userPassword);
  await page.getByLabel("Confirmation").fill("DELETE");
  await page.getByRole("button", { name: "Permanently delete account" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Email").fill(e2eFixtures.account.email);
  await page.getByLabel("Password").fill(e2eFixtures.userPassword);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("Invalid email or password")).toBeVisible();
});

test("a super admin completes device, three-code, and passkey verification", async ({ context: browserContext, page, request }) => {
  test.slow();
  // Playwright's context authenticator behaves like a platform passkey without
  // weakening the production WebAuthn ceremony or adding a test-only API route.
  await browserContext.credentials.install();
  await loginWithPassword(page, e2eFixtures.admin.email, e2eFixtures.adminPassword);

  await expect(page.getByLabel("Trusted device key")).toBeVisible();
  await page.getByLabel("Trusted device key").fill(e2eFixtures.adminDeviceKey);
  const previous = await latestMailText(request, e2eFixtures.admin.email);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText(/Development codes:/)).toHaveCount(0);
  const message = await waitForNewMail(request, e2eFixtures.admin.email, previous);
  const codes = readAdminCodes(message);
  await page.getByLabel("Code A").fill(codes.codeA);
  await page.getByLabel("Code B").fill(codes.codeB);
  await page.getByLabel("Code C").fill(codes.codeC);
  await page.getByRole("button", { name: "Verify and log in" }).click();

  await expect(page).toHaveURL(/\/admin\/security$/);
  await page.getByRole("button", { name: "Enroll passkey" }).click();
  await expect(page.getByRole("heading", { name: "Passkey verified" })).toBeVisible();
  expect(await browserContext.credentials.get({ rpId: "localhost" })).toHaveLength(1);

  await expect(page.getByText("Playwright virtual device", { exact: true })).toBeVisible();
  await expect(page.getByText("Playwright backup device", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Revoke Playwright virtual device" })).toHaveCount(0);

  const beforeRevocation = await latestMailText(request, e2eFixtures.admin.email);
  await page.getByRole("button", { name: "Revoke Playwright backup device" }).click();
  await expect(page.getByText("Playwright backup device", { exact: true })).toHaveCount(0);
  const revocationMail = await waitForNewMail(request, e2eFixtures.admin.email, beforeRevocation);
  expect(revocationMail).toContain("Trusted device revoked: Playwright backup device");

  const rejected = await request.post("http://localhost:4100/api/auth/login", {
    data: {
      email: e2eFixtures.admin.email,
      password: e2eFixtures.adminPassword,
      adminDeviceKey: e2eFixtures.adminBackupDeviceKey
    }
  });
  expect(rejected.status()).toBe(401);
  await expect(rejected.json()).resolves.toMatchObject({
    error: { code: "ADMIN_DEVICE_NOT_TRUSTED" }
  });

  await page.getByRole("link", { name: "Open admin console" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Admin control room" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "System health" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Historical telemetry" })).toBeVisible();
  await expect(page.getByText("Active alerts", { exact: true })).toBeVisible();
  await expect(page.getByText("Recent API requests", { exact: true })).toBeVisible();
  const desktop = page.viewportSize();
  await page.setViewportSize({ height: 844, width: 390 });
  await expect(page.getByRole("heading", { name: "Historical telemetry" })).toBeVisible();
  const pageWidth = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth
  }));
  expect(pageWidth.scroll, "the admin console should fit a 390px viewport").toBeLessThanOrEqual(
    pageWidth.client + 1
  );
  await page.setViewportSize(desktop ?? { height: 720, width: 1280 });

  // Privileged access tokens live only in memory and intentionally cannot
  // refresh, so follow the app link instead of starting a new document.
  await page.locator('a[href="/profile"]:visible').click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByText("Required for privileged access", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Disable two-step" })).toHaveCount(0);
});
