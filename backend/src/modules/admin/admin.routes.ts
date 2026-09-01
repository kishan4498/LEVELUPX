import { Role } from "@prisma/client";
import { Router } from "express";

import { authMiddleware } from "../../common/middlewares/authMiddleware.js";
import { requireFreshAdminToken, requireVerifiedAdminSession } from "../../common/middlewares/adminSecurityMiddleware.js";
import { requireRole } from "../../common/middlewares/roleMiddleware.js";
import { validateRequest } from "../../common/middlewares/validateRequest.js";
import { AdminController } from "./admin.controller.js";
import { PrismaAdminRepository } from "./admin.repository.js";
import { AdminService } from "./admin.service.js";
import {
  abuseReportIdParamsSchema,
  adminReportIdParamsSchema,
  adminUserIdParamsSchema,
  analyticsExportQuerySchema,
  marketplaceListingIdParamsSchema,
  marketplaceTradeExportQuerySchema,
  updateAbuseReportSchema,
  updateEconomySettingsSchema,
  updateUserRoleSchema,
  updateUserStatusSchema
} from "./admin.validation.js";

const repo = new PrismaAdminRepository();
const service = new AdminService(repo);
const controller = new AdminController(service);

export const adminRouter = Router();

adminRouter.use(authMiddleware);
adminRouter.use(requireRole(Role.ADMIN, Role.SUPER_ADMIN));
adminRouter.use(requireVerifiedAdminSession);

adminRouter.get("/dashboard", controller.dashboard);
adminRouter.get("/system-health", requireRole(Role.SUPER_ADMIN), controller.systemHealth);
adminRouter.get("/audit-actions", controller.auditActions);
adminRouter.get("/reports", controller.reports);
adminRouter.get(
  "/reports/:id/download",
  validateRequest({ params: adminReportIdParamsSchema }),
  controller.downloadReport
);
adminRouter.get("/analytics", controller.analytics);
adminRouter.get(
  "/analytics/export",
  validateRequest({ query: analyticsExportQuerySchema }),
  controller.exportAnalytics
);
adminRouter.get("/economy", controller.economy);
adminRouter.patch(
  "/economy/settings",
  validateRequest({ body: updateEconomySettingsSchema }),
  controller.updateEconomySettings
);
adminRouter.get("/users", controller.users);
adminRouter.patch(
  "/users/:id/status",
  requireFreshAdminToken,
  validateRequest({ params: adminUserIdParamsSchema, body: updateUserStatusSchema }),
  controller.updateUserStatus
);
adminRouter.patch(
  "/users/:id/role",
  requireRole(Role.SUPER_ADMIN),
  requireFreshAdminToken,
  validateRequest({ params: adminUserIdParamsSchema, body: updateUserRoleSchema }),
  controller.updateUserRole
);
adminRouter.get("/abuse-reports", controller.abuseReports);
adminRouter.get("/marketplace/listings", controller.marketplaceListings);
adminRouter.get(
  "/marketplace/trade-history/export",
  validateRequest({ query: marketplaceTradeExportQuerySchema }),
  controller.exportMarketplaceTradeHistory
);
adminRouter.patch(
  "/marketplace/listings/:id/cancel",
  validateRequest({ params: marketplaceListingIdParamsSchema }),
  controller.cancelMarketplaceListing
);
adminRouter.patch(
  "/abuse-reports/:id/action",
  validateRequest({ params: abuseReportIdParamsSchema, body: updateAbuseReportSchema }),
  controller.updateAbuseReport
);
