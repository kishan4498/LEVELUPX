import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.db.test.ts"],
    passWithNoTests: true,
    fileParallelism: false,
    pool: "forks",
    sequence: {
      concurrent: false
    }
  }
});
