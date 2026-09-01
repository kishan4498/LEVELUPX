import { Router } from "express";

import { authMiddleware } from "../../common/middlewares/authMiddleware.js";
import { validateRequest } from "../../common/middlewares/validateRequest.js";
import { NotificationController } from "./notification.controller.js";
import { PrismaNotificationRepository } from "./notification.repository.js";
import { NotificationService } from "./notification.service.js";
import { createPushNotificationProviderFromEnv } from "./push.provider.js";
import {
  notificationIdParamsSchema,
  pushSubscriptionSchema,
  removePushSubscriptionSchema,
  updateNotificationPreferencesSchema
} from "./notification.validation.js";

const repo = new PrismaNotificationRepository();
export const notificationService = new NotificationService(repo, createPushNotificationProviderFromEnv());
const controller = new NotificationController(notificationService);

export const notificationRouter = Router();

notificationRouter.use(authMiddleware);

notificationRouter.get("/", controller.list);
notificationRouter.get("/unread-count", controller.unreadCount);
notificationRouter.get("/preferences", controller.preferences);
notificationRouter.patch(
  "/preferences",
  validateRequest({ body: updateNotificationPreferencesSchema }),
  controller.updatePreferences
);
notificationRouter.post(
  "/push-subscriptions",
  validateRequest({ body: pushSubscriptionSchema }),
  controller.savePushSubscription
);
notificationRouter.get("/push-subscriptions", controller.listPushSubscriptions);
notificationRouter.delete(
  "/push-subscriptions",
  validateRequest({ body: removePushSubscriptionSchema }),
  controller.removePushSubscription
);
notificationRouter.patch(
  "/:id/read",
  validateRequest({ params: notificationIdParamsSchema }),
  controller.markAsRead
);
