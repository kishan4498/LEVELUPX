import { execFileSync } from "node:child_process";
import path from "node:path";

import { config as loadEnv } from "dotenv";

const root = process.cwd();
loadEnv({ path: path.resolve(root, "../.env"), quiet: true });

process.env.NODE_ENV = "test";

if (process.env.LEVELUPX_E2E !== "true") {
  throw new Error("Set LEVELUPX_E2E=true explicitly before starting the browser test server");
}

process.env.PORT = "4100";
process.env.CORS_ALLOWED_ORIGINS = "http://localhost:3100";
process.env.WEBAUTHN_RP_ID = "localhost";
process.env.WEBAUTHN_ORIGIN = "http://localhost:3100";
process.env.JWT_ACCESS_SECRET ??= "levelupx-e2e-access-secret-with-at-least-32-characters";
process.env.JWT_REFRESH_SECRET ??= "levelupx-e2e-refresh-secret-with-at-least-32-characters";
process.env.AUTH_RATE_LIMIT_MAX_REQUESTS = "200";
process.env.AUTH_EMAIL_PRINT_CODES_TO_CONSOLE = "false";
process.env.AUTH_DEV_DISCLOSE_CODES = "false";
process.env.REDIS_ENABLED = "false";
process.env.DATABASE_URL = testDatabaseUrl(process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL);

const npmCli = process.env.npm_execpath;

if (!npmCli) {
  throw new Error("The browser test server must be started through an npm script");
}

// Use one setup path so local and CI browser runs start from the same database.
execFileSync(process.execPath, [npmCli, "run", "prisma:deploy"], { cwd: root, env: process.env, stdio: "inherit" });
execFileSync(process.execPath, [npmCli, "run", "prisma:seed"], { cwd: root, env: process.env, stdio: "inherit" });

const { seedBrowserTestFixtures } = await import("./browserTestFixtures.js");
await seedBrowserTestFixtures();
await import("../server.js");

function testDatabaseUrl(rawUrl: string | undefined) {
  if (!rawUrl) {
    throw new Error("DATABASE_URL or E2E_DATABASE_URL is required for browser tests");
  }

  const url = new URL(rawUrl);

  // Playwright runs on the host, so route Docker's database name through its published port.
  if (url.hostname === "postgres") {
    url.hostname = "localhost";
    url.port = process.env.POSTGRES_PORT || "5433";
  }

  url.searchParams.set("schema", "levelupx_e2e");
  return url.toString();
}
