import { afterEach, describe, expect, it, vi } from "vitest";

import { shouldLog, writeLog } from "./logger.js";

describe("logger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("checks log level priority", () => {
    expect(shouldLog("info", "debug")).toBe(false);
    expect(shouldLog("info", "warn")).toBe(true);
    expect(shouldLog("silent", "error")).toBe(false);
  });

  it("writes structured JSON logs", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    writeLog(
      {
        level: "info",
        message: "test_message",
        timestamp: "2026-01-01T00:00:00.000Z",
        statusCode: 200
      },
      "debug"
    );

    expect(spy).toHaveBeenCalledWith(
      JSON.stringify({
        timestamp: "2026-01-01T00:00:00.000Z",
        level: "info",
        message: "test_message",
        statusCode: 200
      })
    );
  });

  it("does not write when below the configured level", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    writeLog(
      {
        level: "info",
        message: "hidden"
      },
      "error"
    );

    expect(spy).not.toHaveBeenCalled();
  });
});
