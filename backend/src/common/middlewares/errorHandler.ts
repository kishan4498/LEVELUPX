import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

import { AppError } from "../errors/AppError.js";
import { type LogLevel, writeLog } from "../logger/logger.js";
import { captureUnhandledError } from "../monitoring/errorTracking.js";
import { recordUnhandledError } from "../monitoring/metrics.js";
import { getRequestId } from "./requestId.js";

const logLevels = new Set<LogLevel>(["debug", "info", "warn", "error", "silent"]);

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: error.flatten()
      }
    });
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message
      }
    });
  }

  const requestId = getRequestId(req);
  const name = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message : "Unknown error";

  recordUnhandledError({
    errorName: name,
    path: req.originalUrl
  });
  captureUnhandledError(error, {
    method: req.method,
    path: req.originalUrl,
    requestId,
    statusCode: 500
  });

  writeLog(
    {
      level: "error",
      message: "unhandled_error",
      method: req.method,
      path: req.originalUrl,
      requestId,
      statusCode: 500,
      errorName: name,
      errorMessage: message,
      stack: process.env.NODE_ENV === "production" || !(error instanceof Error) ? undefined : error.stack
    },
    readLogLevel()
  );

  return res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Something went wrong"
    }
  });
};

function readLogLevel(): LogLevel {
  const level = process.env.LOG_LEVEL;
  return level && logLevels.has(level as LogLevel) ? (level as LogLevel) : "info";
}
