import { afterEach, describe, expect, it, vi } from "vitest";

import { assertSafeTestDatabase, isTestDatabaseConfigured } from "./testDatabase.js";

describe("test database safety", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts a local database with a test-specific name", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "postgresql://postgres:secret@localhost:5432/levelupx_test?schema=public");

    expect(isTestDatabaseConfigured()).toBe(true);
    expect(() => assertSafeTestDatabase()).not.toThrow();
  });

  it("accepts an explicitly allowlisted Docker database host", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "postgresql://postgres:secret@postgres:5432/levelupx_test?schema=public");
    vi.stubEnv("TEST_DATABASE_ALLOWED_HOSTS", "postgres");

    expect(isTestDatabaseConfigured()).toBe(true);
  });

  it("rejects a non-test database even when its host is allowed", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "postgresql://postgres:secret@localhost:5432/levelupx?schema=public");

    expect(isTestDatabaseConfigured()).toBe(false);
    expect(() => assertSafeTestDatabase()).toThrow("Refusing to reset");
  });

  it("rejects reset attempts outside the test environment", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://postgres:secret@localhost:5432/levelupx_test?schema=public");

    expect(() => assertSafeTestDatabase()).toThrow("NODE_ENV=test");
  });
});
