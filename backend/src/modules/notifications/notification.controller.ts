import type { RequestHandler } from "express";

import type { AuthRequest } from "../../common/types/auth.types.js";
import type { NotificationService } from "./notification.service.js";

export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  list: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const notifications = await this.service.fetchUserInbox(auth.user!.id);

      return res.json({
        success: true,
        data: { notifications }
      });
    } catch (error) {
      return next(error);
    }
  };

  markAsRead: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const notification = await this.service.acknowledgeNotification(auth.user!.id, req.params.id as string);

      return res.json({
        success: true,
        data: { notification }
      });
    } catch (error) {
      return next(error);
    }
  };

  unreadCount: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const count = await this.service.fetchUnreadCount(auth.user!.id);

      return res.json({
        success: true,
        data: count
      });
    } catch (error) {
      return next(error);
    }
  };

  preferences: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const preferences = await this.service.fetchNotificationSettings(auth.user!.id);

      return res.json({
        success: true,
        data: { preferences }
      });
    } catch (error) {
      return next(error);
    }
  };

  updatePreferences: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const preferences = await this.service.tweakNotificationSettings(auth.user!.id, req.body);

      return res.json({
        success: true,
        data: { preferences }
      });
    } catch (error) {
      return next(error);
    }
  };

  savePushSubscription: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const subscription = await this.service.registerDeviceForPush(
        auth.user!.id,
        req.body,
        req.get("user-agent") ?? undefined
      );

      return res.status(201).json({
        success: true,
        data: { subscription }
      });
    } catch (error) {
      return next(error);
    }
  };

  listPushSubscriptions: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const subscriptions = await this.service.fetchRegisteredDevices(auth.user!.id);

      return res.json({
        success: true,
        data: { subscriptions }
      });
    } catch (error) {
      return next(error);
    }
  };

  removePushSubscription: RequestHandler = async (req, res, next) => {
    try {
      const auth = req as AuthRequest;
      const preferences = await this.service.unregisterDeviceForPush(auth.user!.id, req.body);

      return res.json({
        success: true,
        data: { preferences }
      });
    } catch (error) {
      return next(error);
    }
  };
}
