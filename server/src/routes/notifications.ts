import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validateRequest } from '../middleware/validate';
import { PushNotificationService } from '../services/pushNotificationService';

const router = Router();

const registerTokenSchema = {
  body: z.object({
    token: z.string().min(1, 'Token is required'),
    platform: z.enum(['android', 'ios', 'web', 'unknown']).optional(),
    deviceId: z.string().optional(),
  }),
};

const unregisterTokenSchema = {
  body: z.object({
    token: z.string().min(1, 'Token is required'),
  }),
};

/**
 * POST /api/v1/notifications/device-token
 * Register or update an Expo push token for the authenticated user
 */
router.post(
  '/device-token',
  requireAuth,
  validateRequest(registerTokenSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await PushNotificationService.registerDeviceToken(
        req.user!.uid,
        req.body.token,
        req.body.platform,
        req.body.deviceId
      );

      res.status(200).json({
        success: true,
        message: 'Device push token registered successfully',
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/v1/notifications/device-token
 * Unregister/deactivate a push token on logout
 */
router.delete(
  '/device-token',
  requireAuth,
  validateRequest(unregisterTokenSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await PushNotificationService.unregisterDeviceToken(req.user!.uid, req.body.token);

      res.status(200).json({
        success: true,
        message: 'Device push token unregistered successfully',
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/notifications/device-token/remove
 * Alternative unregister endpoint for environments where DELETE with body is restricted
 */
router.post(
  '/device-token/remove',
  requireAuth,
  validateRequest(unregisterTokenSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await PushNotificationService.unregisterDeviceToken(req.user!.uid, req.body.token);

      res.status(200).json({
        success: true,
        message: 'Device push token unregistered successfully',
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
