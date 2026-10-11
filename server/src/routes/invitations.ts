import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validateRequest } from '../middleware/validate';
import { RoomService } from '../services/roomService';

const router = Router();

const acceptInvitationSchema = {
  body: z.object({
    inviteCode: z.string().min(4, 'Invalid invite code').max(12),
  }),
};

/**
 * GET /api/v1/invitations/:code — Inspect invitation info
 */
router.get('/:code', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
    const info = await RoomService.getInvitationInfo(code);
    res.status(200).json({
      invitation: info,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/invitations/accept — Accept invitation (authenticated)
 */
router.post(
  '/accept',
  requireAuth,
  validateRequest(acceptInvitationSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const room = await RoomService.acceptInvitation(req.body.inviteCode, req.user!);
      res.status(200).json({
        message: 'Successfully joined room',
        room,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/invitations/:code/accept — Accept invitation via parameter URL
 */
router.post(
  '/:code/accept',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
      const room = await RoomService.acceptInvitation(code, req.user!);
      res.status(200).json({
        message: 'Successfully joined room',
        room,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
