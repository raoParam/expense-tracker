import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validateRequest } from '../middleware/validate';
import { RoomService } from '../services/roomService';
import { ExpenseService } from '../services/expenseService';
import { BalanceService } from '../services/balanceService';
import { SettlementService } from '../services/settlementService';

const router = Router();

// Validation schemas
const createRoomSchema = {
  body: z.object({
    name: z.string().min(1, 'Room name is required').max(50, 'Room name cannot exceed 50 characters'),
    description: z.string().max(200, 'Description cannot exceed 200 characters').optional(),
  }),
};

const updateRoomSchema = {
  body: z.object({
    name: z.string().min(1).max(50).optional(),
    description: z.string().max(200).optional(),
  }),
};

const createInvitationSchema = {
  body: z.object({
    expiresInDays: z.number().int().min(1).max(30).optional(),
  }),
};

const removeMemberSchema = {
  body: z.object({
    reason: z.string().max(200).optional(),
  }),
};

const createExpenseSchema = {
  body: z.object({
    title: z.string().max(100, 'Title cannot exceed 100 characters').optional(),
    description: z.string().max(500, 'Description cannot exceed 500 characters').optional(),
    amountPaise: z.number().int().min(1, 'Amount must be at least 1 paisa').max(9999999999, 'Amount exceeds maximum limit of ₹99,999,999.99'),
    splitType: z.enum(['equal', 'custom', 'percentage', 'quantity']),
    participants: z.array(
      z.object({
        userId: z.string().min(1, 'userId is required'),
        sharePaise: z.number().int().min(0).max(9999999999).optional(),
        amountPaise: z.number().int().min(0).max(9999999999).optional(),
        percentage: z.number().min(0).max(100).optional(),
        quantity: z.number().int().min(1).optional(),
        unitPricePaise: z.number().int().min(0).max(9999999999).optional(),
      })
    ).min(2, 'Shared expenses require at least two distinct participants'),
    idempotencyKey: z.string().max(100).optional(),
  }),
};

const createSettlementSchema = {
  body: z
    .object({
      receiverId: z.string().min(1, 'Receiver ID is required').optional(),
      recipientId: z.string().min(1, 'Receiver ID is required').optional(),
      amountPaise: z
        .number()
        .int('Amount must be an integer in paise')
        .min(1, 'Amount must be at least 1 paisa')
        .max(9999999999, 'Amount exceeds maximum limit of ₹99,999,999.99')
        .optional(),
      amount: z
        .number()
        .int('Amount must be an integer in paise')
        .min(1, 'Amount must be at least 1 paisa')
        .max(9999999999, 'Amount exceeds maximum limit of ₹99,999,999.99')
        .optional(),
      idempotencyKey: z.string().max(255, 'Idempotency key cannot exceed 255 characters').optional(),
    })
    .refine((data) => Boolean(data.receiverId || data.recipientId), {
      message: 'Receiver ID is required',
      path: ['receiverId'],
    })
    .refine((data) => data.amountPaise !== undefined || data.amount !== undefined, {
      message: 'Settlement amount must be provided as an integer in paise',
      path: ['amountPaise'],
    }),
};

// Protect all room endpoints
router.use(requireAuth);

/**
 * POST /api/v1/rooms — Create a room
 */
router.post(
  '/',
  validateRequest(createRoomSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const room = await RoomService.createRoom(req.user!, req.body);
      res.status(201).json({
        message: 'Room created successfully',
        room,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/rooms — List rooms for authenticated user
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rooms = await RoomService.listUserRooms(req.user!.uid, req.user);
    res.status(200).json({
      count: rooms.length,
      rooms,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/rooms/:roomId — Fetch authorized room details
 */
router.get('/:roomId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const roomId = Array.isArray(req.params.roomId) ? req.params.roomId[0] : req.params.roomId;
    const room = await RoomService.getRoomById(roomId, req.user!.uid, req.user);
    res.status(200).json({
      room,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/v1/rooms/:roomId — Update room metadata (admin only)
 */
router.patch(
  '/:roomId',
  validateRequest(updateRoomSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const roomId = Array.isArray(req.params.roomId) ? req.params.roomId[0] : req.params.roomId;
      const room = await RoomService.updateRoom(
        roomId,
        req.user!.uid,
        req.body
      );
      res.status(200).json({
        message: 'Room updated successfully',
        room,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/rooms/:roomId/invitations — Generate invitation code (admin only)
 */
router.post(
  '/:roomId/invitations',
  validateRequest(createInvitationSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const roomId = Array.isArray(req.params.roomId) ? req.params.roomId[0] : req.params.roomId;
      const invitation = await RoomService.createInvitation(
        roomId,
        req.user!.uid,
        req.body?.expiresInDays
      );
      res.status(201).json({
        message: 'Invitation code generated',
        invitation: {
          id: invitation._id,
          inviteCode: invitation.inviteCode,
          roomId: invitation.roomId,
          roomName: invitation.roomName,
          expiresAt: invitation.expiresAt,
          status: invitation.status,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/rooms/:roomId/members/:userId/removal — Remove member (admin only)
 */
router.post(
  '/:roomId/members/:userId/removal',
  validateRequest(removeMemberSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const roomId = Array.isArray(req.params.roomId) ? req.params.roomId[0] : req.params.roomId;
      const memberUserId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
      const room = await RoomService.removeMember(
        roomId,
        req.user!.uid,
        memberUserId,
        req.body?.reason
      );
      res.status(200).json({
        message: 'Member removed successfully',
        room,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/v1/rooms/:roomId/archive — Archive room (admin only)
 */
router.post(
  '/:roomId/archive',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const roomId = Array.isArray(req.params.roomId) ? req.params.roomId[0] : req.params.roomId;
      const room = await RoomService.archiveRoom(roomId, req.user!.uid);
      res.status(200).json({
        message: 'Room archived successfully',
        room,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/rooms/:roomId/expenses — List room expenses
 */
router.get('/:roomId/expenses', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const roomId = Array.isArray(req.params.roomId) ? req.params.roomId[0] : req.params.roomId;
    const status = req.query.status as string | undefined;
    const expenses = await ExpenseService.getRoomExpenses(req.user!.uid, roomId, status);
    res.status(200).json({
      count: expenses.length,
      expenses,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/rooms/:roomId/expenses — Create shared expense in room
 */
router.post(
  '/:roomId/expenses',
  validateRequest(createExpenseSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const roomId = Array.isArray(req.params.roomId) ? req.params.roomId[0] : req.params.roomId;
      const expense = await ExpenseService.createExpense(req.user!.uid, {
        ...req.body,
        roomId,
      });
      res.status(201).json({
        message: 'Shared expense created successfully',
        expense,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/v1/rooms/:roomId/balances — Fetch authoritative room balances
 */
router.get('/:roomId/balances', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const roomId = Array.isArray(req.params.roomId) ? req.params.roomId[0] : req.params.roomId;
    const balances = await BalanceService.getRoomBalances(req.user!.uid, roomId);
    res.status(200).json(balances);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/rooms/:roomId/suggested-settlements — Fetch canonical net-balance transfers
 */
router.get('/:roomId/suggested-settlements', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const roomId = Array.isArray(req.params.roomId) ? req.params.roomId[0] : req.params.roomId;
    const settlements = await BalanceService.getSuggestedSettlements(req.user!.uid, roomId);
    res.status(200).json(settlements);
  } catch (err) {
    next(err);
  }
});

/**
 * Legacy compatibility for already-installed clients. This is not a second
 * accounting path: it aliases the canonical suggested transfers and can be
 * removed after the OTA adoption window.
 */
router.get('/:roomId/bilateral-debts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const roomId = Array.isArray(req.params.roomId) ? req.params.roomId[0] : req.params.roomId;
    const { suggestedTransfers } = await BalanceService.getSuggestedSettlements(req.user!.uid, roomId);
    res.status(200).json({
      debts: suggestedTransfers.map((transfer) => ({
        debtorId: transfer.fromUserId,
        debtorDisplayName: transfer.fromDisplayName,
        receiverId: transfer.toUserId,
        receiverDisplayName: transfer.toDisplayName,
        amountPaise: transfer.amountPaise,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/rooms/:roomId/settlements — List room settlements
 */
router.get('/:roomId/settlements', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const roomId = Array.isArray(req.params.roomId) ? req.params.roomId[0] : req.params.roomId;
    const settlements = await SettlementService.getRoomSettlements(req.user!.uid, roomId);
    res.status(200).json({
      count: settlements.length,
      settlements,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/rooms/:roomId/settlements — Create repayment verification request (debtor only)
 */
router.post(
  '/:roomId/settlements',
  validateRequest(createSettlementSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const roomId = Array.isArray(req.params.roomId) ? req.params.roomId[0] : req.params.roomId;
      const receiverId = req.body.receiverId || req.body.recipientId;
      const amountPaise = req.body.amountPaise !== undefined ? req.body.amountPaise : req.body.amount;
      const settlement = await SettlementService.createSettlement(
        req.user!.uid,
        roomId,
        {
          ...req.body,
          receiverId,
          amountPaise,
        }
      );
      res.status(201).json({
        message: 'Settlement request created successfully',
        settlement,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
