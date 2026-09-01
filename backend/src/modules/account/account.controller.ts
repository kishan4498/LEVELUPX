import type { RequestHandler } from "express";

import type { AuthRequest } from "../../common/types/auth.types.js";
import type { AccountService } from "./account.service.js";

export class AccountController {
  constructor(private readonly service: AccountService) {}

  downloadData: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const archive = await this.service.exportData(auth.user!.id);
      const date = new Date().toISOString().slice(0, 10);

      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="levelupx-export-${date}.json"`);
      return res.send(JSON.stringify(archive, null, 2));
    } catch (error) {
      return next(error);
    }
  };

  deleteAccount: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      await this.service.deleteAccount(auth.user!.id, req.body.currentPassword);

      res.clearCookie("levelupx_refresh", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/api/auth"
      });
      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  };
}
