import type { RequestHandler } from "express";

import type { AuthRequest } from "../../common/types/auth.types.js";
import type { AdminPasskeyService } from "./adminPasskey.service.js";

export class AdminPasskeyController {
  constructor(private readonly service: AdminPasskeyService) {}

  list: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const passkeys = await this.service.list(auth.user!.id, auth.user!.passkeyVerified === true);
      return res.json({ success: true, data: passkeys });
    } catch (error) {
      return next(error);
    }
  };

  beginRegistration: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const registration = await this.service.beginRegistration(
        auth.user!.id,
        auth.user!.passkeyVerified === true,
        auth.user!.adminDeviceId!
      );
      return res.json({ success: true, data: registration });
    } catch (error) {
      return next(error);
    }
  };

  verifyRegistration: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const registration = await this.service.verifyRegistration(
        auth.user!.id,
        auth.user!.passkeyVerified === true,
        auth.user!.adminDeviceId!,
        req.body
      );
      return res.status(201).json({ success: true, data: registration });
    } catch (error) {
      return next(error);
    }
  };

  beginAuthentication: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const authentication = await this.service.beginAuthentication(auth.user!.id);
      return res.json({ success: true, data: authentication });
    } catch (error) {
      return next(error);
    }
  };

  verifyAuthentication: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const session = await this.service.verifyAuthentication(
        auth.user!.id,
        auth.user!.adminDeviceId!,
        req.body
      );
      return res.json({ success: true, data: session });
    } catch (error) {
      return next(error);
    }
  };

  remove: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      await this.service.remove(auth.user!.id, auth.user!.passkeyVerified === true, String(req.params.id));
      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  };
}
