import type { RequestHandler } from "express";

import { env } from "../../config/env.js";
import { writeLog } from "../logger/logger.js";
import { recordHttpRequest } from "../monitoring/metrics.js";
import { getRequestId } from "./requestId.js";

export const requestLogger: RequestHandler = (req, res, next) => {
  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const statusCode = res.statusCode;
    const level = requestLogLevel(statusCode);

    recordHttpRequest({
      method: req.method,
      path: req.originalUrl,
      statusCode,
      durationMs
    });

    if (env.LOG_LEVEL === "silent") {
      return;
    }

    writeLog(
      {
        level,
        message: "http_request",
        method: req.method,
        path: req.originalUrl,
        requestId: getRequestId(req),
        statusCode,
        durationMs: Math.round(durationMs),
        ip: req.ip
      },
      env.LOG_LEVEL
    );
  });

  return next();
};

function requestLogLevel(statusCode: number) {
  if (statusCode >= 500) return "error";
  if (statusCode >= 400) return "warn";
  return "info";
}
