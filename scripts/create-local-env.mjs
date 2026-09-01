import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE_FILE = resolve(ROOT, ".env.docker.example");
const ENV_FILE = resolve(ROOT, ".env");
const METRICS_FILE = resolve(ROOT, "ops", "monitoring", "secrets", "metrics-token.local");
const force = process.argv.includes("--force");
const existing = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : null;

if (existsSync(ENV_FILE) && !force) {
  console.error(".env already exists. Use --force only when you intend to rotate local credentials.");
  process.exit(1);
}

const access = randomBytes(48).toString("base64url");
const refresh = randomBytes(48).toString("base64url");
const metrics = randomBytes(48).toString("base64url");
// Preserve the database password during JWT rotation so the existing volume stays reachable.
const oldDbPassword = existing?.match(/^POSTGRES_PASSWORD=(.+)$/m)?.[1];
const dbPassword =
  force && oldDbPassword && !/replace-this|change-me/i.test(oldDbPassword)
    ? oldDbPassword
    : randomBytes(36).toString("base64url");
// Grafana persists its initial password, so keep it stable during credential rotation.
const oldGrafanaPassword = existing?.match(/^GRAFANA_ADMIN_PASSWORD=(.+)$/m)?.[1];
const grafanaPassword =
  force && oldGrafanaPassword && !/replace-this|change-me/i.test(oldGrafanaPassword)
    ? oldGrafanaPassword
    : randomBytes(36).toString("base64url");
const template = readFileSync(TEMPLATE_FILE, "utf8");
const content = template
  .replace(/^POSTGRES_PASSWORD=.*$/m, `POSTGRES_PASSWORD=${dbPassword}`)
  .replace(
    /^DATABASE_URL=.*$/m,
    `DATABASE_URL=postgresql://postgres:${encodeURIComponent(dbPassword)}@postgres:5432/levelupx?schema=public`
  )
  .replace(/^JWT_ACCESS_SECRET=.*$/m, `JWT_ACCESS_SECRET=${access}`)
  .replace(/^JWT_REFRESH_SECRET=.*$/m, `JWT_REFRESH_SECRET=${refresh}`)
  .replace(/^GRAFANA_ADMIN_PASSWORD=.*$/m, `GRAFANA_ADMIN_PASSWORD=${grafanaPassword}`);

writeFileSync(ENV_FILE, content, { encoding: "utf8", mode: 0o600 });
mkdirSync(dirname(METRICS_FILE), { recursive: true });
writeFileSync(METRICS_FILE, `${metrics}\n`, { encoding: "utf8", mode: 0o600 });
console.log("Created ignored local Docker environment, Grafana login, and Prometheus scrape secret.");
