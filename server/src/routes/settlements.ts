import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { SettlementService } from '../services/settlementService';
import { requireAuth } from '../middleware/auth';
import { validateRequest } from '../middleware/validate';

const router = Router();
router.use(requireAuth);

const rejectSettlementSchema = {
  body: z.object({
    reason: z
      .string({ required_error: 'Rejection reason is required' })
      .trim()
      .min(1, 'Rejection reason cannot be empty')
      .max(300, 'Rejection reason cannot exceed 300 characters'),
  }),
};

/**
 * GET /api/v1/settlements/:settlementId — Fetch single settlement
 */
router.get('/:settlementId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settlementId = Array.isArray(req.params.settlementId)
      ? req.params.settlementId[0]
      : req.params.settlementId;
    const settlement = await SettlementService.getSettlementById(req.user!.uid, settlementId);
    res.status(200).json({ settlement });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/settlements/:settlementId/verify — Receiver verifies settlement
 */
router.post('/:settlementId/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settlementId = Array.isArray(req.params.settlementId)
      ? req.params.settlementId[0]
      : req.params.settlementId;
    const settlement = await SettlementService.verifySettlement(req.user!.uid, settlementId);
    res.status(200).json({
      message: 'Settlement verified successfully',
      settlement,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/settlements/:settlementId/reject — Receiver rejects settlement with reason
 */
router.post(
  '/:settlementId/reject',
  validateRequest(rejectSettlementSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const settlementId = Array.isArray(req.params.settlementId)
        ? req.params.settlementId[0]
        : req.params.settlementId;
      const { reason } = req.body;
      const settlement = await SettlementService.rejectSettlement(
        req.user!.uid,
        settlementId,
        reason
      );
      res.status(200).json({
        message: 'Settlement rejected',
        settlement,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/settlements/:settlementId/cancel — Debtor cancels pending settlement request
 */
router.post('/:settlementId/cancel', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settlementId = Array.isArray(req.params.settlementId)
      ? req.params.settlementId[0]
      : req.params.settlementId;
    const settlement = await SettlementService.cancelSettlement(req.user!.uid, settlementId);
    res.status(200).json({
      message: 'Settlement request cancelled successfully',
      settlement,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
