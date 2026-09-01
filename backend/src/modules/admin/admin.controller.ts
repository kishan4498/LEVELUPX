import type { RequestHandler } from "express";

import type { AuthRequest } from "../../common/types/auth.types.js";
import type { AdminService } from "./admin.service.js";
import type { AdminAnalyticsExportInput, AdminMarketplaceTradeExportInput } from "./admin.types.js";

export class AdminController {
  constructor(private readonly service: AdminService) {}

  dashboard: RequestHandler = async (_req, res, next) => {
    try {
      const dashboard = await this.service.dashboard();

      return res.json({
        success: true,
        data: { dashboard }
      });
    } catch (error) {
      return next(error);
    }
  };

  users: RequestHandler = async (_req, res, next) => {
    try {
      const users = await this.service.users();

      return res.json({
        success: true,
        data: { users }
      });
    } catch (error) {
      return next(error);
    }
  };

  systemHealth: RequestHandler = async (_req, res, next) => {
    try {
      const health = await this.service.systemHealth();

      return res.json({
        success: true,
        data: { health }
      });
    } catch (error) {
      return next(error);
    }
  };

  updateUserStatus: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const user = await this.service.updateUserStatus(auth.user!.id, req.params.id as string, req.body);

      return res.json({
        success: true,
        data: { user }
      });
    } catch (error) {
      return next(error);
    }
  };

  updateUserRole: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const user = await this.service.updateUserRole(auth.user!.id, req.params.id as string, req.body);

      return res.json({
        success: true,
        data: { user }
      });
    } catch (error) {
      return next(error);
    }
  };

  abuseReports: RequestHandler = async (_req, res, next) => {
    try {
      const reports = await this.service.abuseReports();

      return res.json({
        success: true,
        data: { reports }
      });
    } catch (error) {
      return next(error);
    }
  };

  marketplaceListings: RequestHandler = async (_req, res, next) => {
    try {
      const listings = await this.service.marketplaceListings();

      return res.json({
        success: true,
        data: { listings }
      });
    } catch (error) {
      return next(error);
    }
  };

  cancelMarketplaceListing: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const listing = await this.service.cancelMarketplaceListing(auth.user!.id, req.params.id as string);

      return res.json({
        success: true,
        data: { listing }
      });
    } catch (error) {
      return next(error);
    }
  };

  updateAbuseReport: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const report = await this.service.updateAbuseReport(auth.user!.id, req.params.id as string, req.body);

      return res.json({
        success: true,
        data: { report }
      });
    } catch (error) {
      return next(error);
    }
  };

  economy: RequestHandler = async (_req, res, next) => {
    try {
      const settings = await this.service.economy();

      return res.json({
        success: true,
        data: { settings }
      });
    } catch (error) {
      return next(error);
    }
  };

  updateEconomySettings: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const settings = await this.service.updateEconomySettings(auth.user!.id, req.body);

      return res.json({
        success: true,
        data: { settings }
      });
    } catch (error) {
      return next(error);
    }
  };

  analytics: RequestHandler = async (_req, res, next) => {
    try {
      const analytics = await this.service.analytics();

      return res.json({
        success: true,
        data: { analytics }
      });
    } catch (error) {
      return next(error);
    }
  };

  reports: RequestHandler = async (_req, res, next) => {
    try {
      const reports = await this.service.reports();

      return res.json({
        success: true,
        data: { reports }
      });
    } catch (error) {
      return next(error);
    }
  };

  auditActions: RequestHandler = async (_req, res, next) => {
    try {
      const actions = await this.service.auditActions();

      return res.json({
        success: true,
        data: { actions }
      });
    } catch (error) {
      return next(error);
    }
  };

  downloadReport: RequestHandler = async (req, res, next) => {
    try {
      const report = await this.service.downloadReport(req.params.id as string);

      res.setHeader("Content-Type", report.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${report.filename}"`);

      return res.send(report.body);
    } catch (error) {
      return next(error);
    }
  };

  exportAnalytics: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const report = await this.service.exportAnalytics(
        auth.user!.id,
        req.query as unknown as AdminAnalyticsExportInput
      );

      res.setHeader("Content-Type", report.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${report.filename}"`);

      return res.send(report.body);
    } catch (error) {
      return next(error);
    }
  };

  exportMarketplaceTradeHistory: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const report = await this.service.exportMarketplaceTradeHistory(
        auth.user!.id,
        req.query as unknown as AdminMarketplaceTradeExportInput
      );

      res.setHeader("Content-Type", report.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${report.filename}"`);

      return res.send(report.body);
    } catch (error) {
      return next(error);
    }
  };
}
