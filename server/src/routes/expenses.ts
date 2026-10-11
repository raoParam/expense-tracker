import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validateRequest } from '../middleware/validate';
import { ExpenseService } from '../services/expenseService';

const router = Router();

// Protect all expense endpoints
router.use(requireAuth);

const acknowledgeSchema = {
  body: z.object({
    expectedRevision: z.number().int().min(1, 'expectedRevision must be a positive integer'),
  }),
};

const rejectSchema = {
  body: z.object({
    expectedRevision: z.number().int().min(1, 'expectedRevision must be a positive integer'),
    reason: z.string().min(3, 'Rejection reason must be at least 3 characters').max(300, 'Rejection reason cannot exceed 300 characters'),
  }),
};

const resubmitSchema = {
  body: z.object({
    expectedRevision: z.number().int().min(1, 'expectedRevision is required'),
    title: z.string().max(100).optional(),
    description: z.string().max(500).optional(),
    amountPaise: z.number().int().min(1).max(9999999999).optional(),
    splitType: z.enum(['equal', 'custom', 'percentage', 'quantity']).optional(),
    participants: z.array(
      z.object({
        userId: z.string().min(1, 'userId is required'),
        sharePaise: z.number().int().min(0).max(9999999999).optional(),
        amountPaise: z.number().int().min(0).max(9999999999).optional(),
        percentage: z.number().min(0).max(100).optional(),
        quantity: z.number().int().min(1).optional(),
        unitPricePaise: z.number().int().min(0).max(9999999999).optional(),
      })
    ).min(2, 'Shared expenses require at least two distinct participants').optional(),
  }),
};

/**
 * GET /api/v1/expenses/:expenseId — Fetch single expense details
 */
router.get('/:expenseId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const expenseId = Array.isArray(req.params.expenseId) ? req.params.expenseId[0] : req.params.expenseId;
    const expense = await ExpenseService.getExpenseById(req.user!.uid, expenseId);
    res.status(200).json({ expense });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/expenses/:expenseId/acknowledge — Acknowledge an expense
 */
router.post(
  '/:expenseId/acknowledge',
  validateRequest(acknowledgeSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const expenseId = Array.isArray(req.params.expenseId) ? req.params.expenseId[0] : req.params.expenseId;
      const expense = await ExpenseService.acknowledgeExpense(
        req.user!.uid,
        expenseId,
        req.body.expectedRevision
      );
      res.status(200).json({
        message: 'Expense acknowledged successfully',
        expense,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/expenses/:expenseId/reject — Reject an expense
 */
router.post(
  '/:expenseId/reject',
  validateRequest(rejectSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const expenseId = Array.isArray(req.params.expenseId) ? req.params.expenseId[0] : req.params.expenseId;
      const expense = await ExpenseService.rejectExpense(
        req.user!.uid,
        expenseId,
        req.body.expectedRevision,
        req.body.reason
      );
      res.status(200).json({
        message: 'Expense rejected',
        expense,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/expenses/:expenseId/resubmit — Resubmit an expense (payer only)
 */
router.post(
  '/:expenseId/resubmit',
  validateRequest(resubmitSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const expenseId = Array.isArray(req.params.expenseId) ? req.params.expenseId[0] : req.params.expenseId;
      const expense = await ExpenseService.resubmitExpense(
        req.user!.uid,
        expenseId,
        req.body
      );
      res.status(200).json({
        message: 'Expense resubmitted successfully',
        expense,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/expenses/:expenseId/cancel — Cancel an expense (payer only)
 */
router.post(
  '/:expenseId/cancel',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const expenseId = Array.isArray(req.params.expenseId) ? req.params.expenseId[0] : req.params.expenseId;
      const expense = await ExpenseService.cancelExpense(req.user!.uid, expenseId);
      res.status(200).json({
        message: 'Expense cancelled successfully',
        expense,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
