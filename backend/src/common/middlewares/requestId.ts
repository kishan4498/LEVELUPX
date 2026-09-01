import { randomUUID } from "node:crypto";
import type { Request, RequestHandler } from "express";

const REQUEST_ID_HEADER = "x-request-id";
const REQUEST_ID_PATTERN = /^[a-zA-Z0-9._:-]{8,128}$/;

export type RequestWithId = Request & {
  requestId?: string;
};

export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  const requestId = readIncomingRequestId(req.headers[REQUEST_ID_HEADER]) ?? randomUUID();

  (req as RequestWithId).requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  return next();
};

export function getRequestId(req: Request) {
  return (req as RequestWithId).requestId;
}

function readIncomingRequestId(header: string | string[] | undefined) {
  const requestId = Array.isArray(header) ? header[0] : header;

  if (!requestId) {
    return null;
  }

  const trimmed = requestId.trim();
  return REQUEST_ID_PATTERN.test(trimmed) ? trimmed : null;
}
