import type { RequestHandler } from "express";

import type { AuthRequest } from "../../common/types/auth.types.js";
import type { AdminTrustedDeviceService } from "./adminTrustedDevice.service.js";

export class AdminTrustedDeviceController {
  constructor(private readonly service: AdminTrustedDeviceService) {}

  list: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const devices = await this.service.list(auth.user!.id, auth.user!.adminDeviceId!);
      return res.json({ success: true, data: devices });
    } catch (error) {
      return next(error);
    }
  };

  revoke: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      await this.service.revoke(auth.user!.id, auth.user!.adminDeviceId!, String(req.params.id));
      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  };
}
