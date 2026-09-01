import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/*.integration.test.ts", "**/*.db.test.ts", "**/node_modules/**", "**/dist/**"],
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/levelupx_test?schema=public",
      JWT_ACCESS_SECRET: "test-access-secret-with-at-least-32-characters",
      JWT_REFRESH_SECRET: "unit-test-refresh-secret-at-least-32-characters",
      AUTH_DEV_DISCLOSE_CODES: "true"
    }
  }
});
