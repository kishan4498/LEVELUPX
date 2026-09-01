import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { LocalReportFileStorage } from "./reportFileStorage.js";

describe("LocalReportFileStorage", () => {
  it("returns null when no root directory is configured", async () => {
    const storage = new LocalReportFileStorage(undefined);

    await expect(storage.store({ filename: "report.csv", body: "hello" })).resolves.toBeNull();
  });

  it("writes report bodies under the configured root directory", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "levelupx-reports-"));
    const storage = new LocalReportFileStorage(root);

    try {
      const file = await storage.store({
        filename: "../weekly report.csv",
        body: "metric,value\nactiveUserCount,4"
      });

      expect(file).not.toBeNull();
      expect(file?.storageKey).toContain("weekly_report.csv");
      expect(file?.sizeBytes).toBeGreaterThan(0);

      const body = await readFile(path.resolve(root, file!.storageKey), "utf8");
      expect(body).toBe("metric,value\nactiveUserCount,4");

      const stored = await storage.read(file!.storageKey);
      expect(stored?.body.toString()).toBe("metric,value\nactiveUserCount,4");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("returns null for missing local report files", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "levelupx-reports-"));
    const storage = new LocalReportFileStorage(root);

    try {
      await expect(storage.read("missing.csv")).resolves.toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
