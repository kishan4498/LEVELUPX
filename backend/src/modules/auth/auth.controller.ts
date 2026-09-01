import type { RequestHandler } from "express";

import type { AuthRequest } from "../../common/types/auth.types.js";
import type { AuthService } from "./auth.service.js";
import type {
  AuthResp,
  LoginResp,
  ResetPwdResp,
  VerifyEmailResp
} from "./auth.types.js";
import type { AuthSessionService, SessionContext } from "./authSession.service.js";

const REFRESH_COOKIE_NAME = "levelupx_refresh";
const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export class AuthController {
  constructor(
    private readonly service: AuthService,
    private readonly sessionService: AuthSessionService
  ) {}

  register: RequestHandler = async (req, res, next) => {
    try {
      const registration = await this.service.register(req.body);
      await this.sessionService.revokeToken(readCookie(req.headers.cookie, REFRESH_COOKIE_NAME));
      clearRefreshCookie(res);
      return res.status(201).json({ success: true, data: registration });
    } catch (error) {
      return next(error);
    }
  };

  requestEmailVerification: RequestHandler = async (req, res, next) => {
    try {
      const verification = await this.service.requestEmailVerification(req.body);
      return res.json({ success: true, data: verification });
    } catch (error) {
      return next(error);
    }
  };

  verifyEmail: RequestHandler = async (req, res, next) => {
    try {
      const verification = await this.service.verifyEmail(req.body);

      if ("rootActivationComplete" in verification) {
        await this.sessionService.revokeAllSessions(verification.user.id);
        clearRefreshCookie(res);
      } else {
        await this.attachSession(req, res, verification);
      }

      return res.json({ success: true, data: verification });
    } catch (error) {
      return next(error);
    }
  };

  login: RequestHandler = async (req, res, next) => {
    try {
      const auth = await this.service.login(req.body);
      await this.attachSession(req, res, auth);
      return res.json({ success: true, data: auth });
    } catch (error) {
      return next(error);
    }
  };

  me: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const user = await this.service.getMe(auth.user!.id);
      return res.json({ success: true, data: { user } });
    } catch (error) {
      return next(error);
    }
  };

  forgotPassword: RequestHandler = async (req, res, next) => {
    try {
      const reset = await this.service.requestPasswordReset(req.body);
      return res.json({ success: true, data: reset });
    } catch (error) {
      return next(error);
    }
  };

  resetPassword: RequestHandler = async (req, res, next) => {
    try {
      const reset = await this.service.resetPassword(req.body);
      await this.sessionService.revokeAllSessions(reset.user.id);

      if ("signInRequired" in reset) {
        clearRefreshCookie(res);
      } else {
        await this.attachSession(req, res, reset);
      }
      return res.json({ success: true, data: reset });
    } catch (error) {
      return next(error);
    }
  };

  enableTwoStep: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const user = await this.service.enableTwoStep(auth.user!.id, req.body);
      return res.json({ success: true, data: { user } });
    } catch (error) {
      return next(error);
    }
  };

  disableTwoStep: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const user = await this.service.disableTwoStep(auth.user!.id, req.body);
      return res.json({ success: true, data: { user } });
    } catch (error) {
      return next(error);
    }
  };

  refresh: RequestHandler = async (req, res, next) => {
    try {
      const token = readCookie(req.headers.cookie, REFRESH_COOKIE_NAME);

      if (!token) {
        return res.status(401).json({
          success: false,
          error: {
            code: "REFRESH_SESSION_REQUIRED",
            message: "A refresh session is required"
          }
        });
      }

      const rotated = await this.sessionService.rollSessionToken(token, requestContext(req));
      const auth = await this.service.refreshStandardUser(rotated.userId);
      setRefreshCookie(res, rotated.token);

      return res.json({ success: true, data: auth });
    } catch (error) {
      clearRefreshCookie(res);
      return next(error);
    }
  };

  logout: RequestHandler = async (req, res, next) => {
    try {
      await this.sessionService.revokeToken(readCookie(req.headers.cookie, REFRESH_COOKIE_NAME));
      clearRefreshCookie(res);
      return res.json({ success: true, data: { message: "Signed out" } });
    } catch (error) {
      return next(error);
    }
  };

  sessions: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const sessions = await this.sessionService.listForUser(
        auth.user!.id,
        readCookie(req.headers.cookie, REFRESH_COOKIE_NAME)
      );

      return res.json({ success: true, data: { sessions } });
    } catch (error) {
      return next(error);
    }
  };

  revokeSession: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      await this.sessionService.revokeSession(auth.user!.id, String(req.params.id));

      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  };

  revokeAllSessions: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      await this.sessionService.revokeAllSessions(auth.user!.id);
      clearRefreshCookie(res);

      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  };

  private async attachSession(
    req: Parameters<RequestHandler>[0],
    res: Parameters<RequestHandler>[1],
    auth: AuthResp | LoginResp | VerifyEmailResp | ResetPwdResp
  ) {
    if (!("accessToken" in auth) || auth.user.role !== "USER") {
      return;
    }

    await this.sessionService.revokeToken(readCookie(req.headers.cookie, REFRESH_COOKIE_NAME));
    const session = await this.sessionService.create(auth.user.id, requestContext(req));
    setRefreshCookie(res, session.token);
  }
}

function requestContext(req: Parameters<RequestHandler>[0]): SessionContext {
  return {
    userAgent: req.get("user-agent")?.slice(0, 500),
    ipAddress: req.ip?.slice(0, 100)
  };
}

function readCookie(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) {
    return undefined;
  }

  for (const part of cookieHeader.split(";")) {
    const [cookieName, ...valueParts] = part.trim().split("=");

    if (cookieName === name) {
      return decodeURIComponent(valueParts.join("="));
    }
  }

  return undefined;
}

function setRefreshCookie(res: Parameters<RequestHandler>[1], token: string) {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: REFRESH_COOKIE_MAX_AGE_MS
  });
}

function clearRefreshCookie(res: Parameters<RequestHandler>[1]) {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth"
  });
}
