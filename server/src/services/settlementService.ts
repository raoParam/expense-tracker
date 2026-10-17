import mongoose from 'mongoose';
import { Settlement, ISettlement } from '../models/Settlement';
import { Room } from '../models/Room';
import { AuditEvent } from '../models/AuditEvent';
import { BalanceService } from './balanceService';
import { AppError } from '../middleware/errorHandler';
import { PushNotificationService } from './pushNotificationService';

export interface CreateSettlementInput {
  receiverId: string;
  amountPaise: number;
  idempotencyKey?: string;
}

export const SettlementService = {
  /**
   * Create a repayment settlement request by the debtor
   */
  async createSettlement(
    callerId: string,
    roomId: string,
    input: CreateSettlementInput
  ): Promise<ISettlement> {
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      throw new AppError('Invalid room ID', 400, 'INVALID_ROOM_ID');
    }

    const room = await Room.findById(roomId);
    if (!room) {
      throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    const isMember = room.members.some((m) => m.userId === callerId && m.status === 'active');
    if (!isMember) {
      throw new AppError('You are not authorized to create settlements in this room', 403, 'NOT_ROOM_MEMBER');
    }

    if (!input.receiverId || input.receiverId === callerId) {
      throw new AppError('Receiver must be a different member in the room', 400, 'INVALID_RECEIVER');
    }

    const isReceiverMember = room.members.some(
      (m) => m.userId === input.receiverId && m.status === 'active'
    );
    if (!isReceiverMember) {
      throw new AppError('Receiver is not an active member of this room', 400, 'RECEIVER_NOT_MEMBER');
    }

    if (
      !Number.isInteger(input.amountPaise) ||
      input.amountPaise <= 0 ||
      input.amountPaise > 9999999999
    ) {
      throw new AppError(
        'Settlement amount must be an integer between 1 paisa and ₹99,999,999.99',
        400,
        'INVALID_AMOUNT'
      );
    }

    // Idempotency check
    if (input.idempotencyKey) {
      const existing = await Settlement.findOne({
        idempotencyKey: input.idempotencyKey,
        debtorId: callerId,
      });
      if (existing) {
        return existing;
      }
    }

    // Check for existing pending settlement between these two members
    const activePending = await Settlement.findOne({
      roomId: room._id,
      status: 'pending',
      $or: [
        { debtorId: callerId, receiverId: input.receiverId },
        { debtorId: input.receiverId, receiverId: callerId },
      ],
    });

    if (activePending) {
      throw new AppError(
        'A pending settlement request between these members already exists. Please wait for verification or cancel the existing request.',
        409,
        'PENDING_SETTLEMENT_EXISTS'
      );
    }

    // Compute exact full outstanding bilateral debt
    const fullBilateralDebt = await BalanceService.computeBilateralDebt(
      room._id,
      callerId,
      input.receiverId
    );

    if (fullBilateralDebt <= 0) {
      throw new AppError(
        'You do not have any outstanding bilateral debt with this member',
        400,
        'NO_OUTSTANDING_DEBT'
      );
    }

    if (input.amountPaise !== fullBilateralDebt) {
      throw new AppError(
        `Settlement must be for the exact full outstanding bilateral debt of ₹${(
          fullBilateralDebt / 100
        ).toFixed(2)} (${fullBilateralDebt} paise)`,
        400,
        'INVALID_SETTLEMENT_AMOUNT'
      );
    }

    const settlement = new Settlement({
      roomId: room._id,
      debtorId: callerId,
      receiverId: input.receiverId,
      amountPaise: input.amountPaise,
      currency: 'INR',
      status: 'pending',
      idempotencyKey: input.idempotencyKey,
    });

    await settlement.save();

    await AuditEvent.create({
      actorId: callerId,
      roomId: room._id,
      entityType: 'settlement',
      action: 'settlement_requested',
      metadata: {
        settlementId: settlement._id.toString(),
        debtorId: callerId,
        receiverId: input.receiverId,
        amountPaise: input.amountPaise,
      },
    });

    // Push notification: Repayment verification requested
    const debtorMember = room.members.find((m) => m.userId === callerId);
    PushNotificationService.notifySettlementRequested(
      settlement,
      room.name,
      debtorMember?.displayName || 'A member'
    ).catch((err) => {
      console.error('[SettlementService] Error triggering push for settlement requested:', err);
    });

    return settlement;
  },

  /**
   * Get all settlements for a room
   */
  async getRoomSettlements(callerId: string, roomId: string): Promise<ISettlement[]> {
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      throw new AppError('Invalid room ID', 400, 'INVALID_ROOM_ID');
    }

    const room = await Room.findById(roomId);
    if (!room) {
      throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    const isMember = room.members.some((m) => m.userId === callerId);
    if (!isMember) {
      throw new AppError('You are not authorized to view settlements for this room', 403, 'NOT_ROOM_MEMBER');
    }

    return Settlement.find({ roomId: room._id }).sort({ createdAt: -1 });
  },

  /**
   * Get single settlement by ID
   */
  async getSettlementById(callerId: string, settlementId: string): Promise<ISettlement> {
    if (!mongoose.Types.ObjectId.isValid(settlementId)) {
      throw new AppError('Invalid settlement ID', 400, 'INVALID_SETTLEMENT_ID');
    }

    const settlement = await Settlement.findById(settlementId);
    if (!settlement) {
      throw new AppError('Settlement not found', 404, 'SETTLEMENT_NOT_FOUND');
    }

    const room = await Room.findById(settlement.roomId);
    if (!room) {
      throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    const isMember = room.members.some((m) => m.userId === callerId);
    if (!isMember) {
      throw new AppError('You are not authorized to view this settlement', 403, 'NOT_ROOM_MEMBER');
    }

    return settlement;
  },

  /**
   * Recipient verifies repayment request, atomically updating balances
   */
  async verifySettlement(callerId: string, settlementId: string): Promise<ISettlement> {
    if (!mongoose.Types.ObjectId.isValid(settlementId)) {
      throw new AppError('Invalid settlement ID', 400, 'INVALID_SETTLEMENT_ID');
    }

    const settlement = await Settlement.findById(settlementId);
    if (!settlement) {
      throw new AppError('Settlement not found', 404, 'SETTLEMENT_NOT_FOUND');
    }

    if (settlement.status !== 'pending') {
      throw new AppError(
        `Cannot verify settlement in '${settlement.status}' status`,
        400,
        'SETTLEMENT_NOT_PENDING'
      );
    }

    if (settlement.receiverId !== callerId) {
      throw new AppError('Only the recipient can verify this settlement', 403, 'FORBIDDEN');
    }

    // Concurrency / Debt limit safety: Check that the debt is still at least this amount
    const currentDebt = await BalanceService.computeBilateralDebt(
      settlement.roomId,
      settlement.debtorId,
      settlement.receiverId
    );

    if (currentDebt < settlement.amountPaise) {
      throw new AppError(
        'The outstanding debt has changed or been settled already',
        409,
        'INVALID_SETTLEMENT_STATE'
      );
    }

    const updatedSettlement = await Settlement.findOneAndUpdate(
      {
        _id: settlement._id,
        status: 'pending',
        receiverId: callerId,
      },
      {
        $set: {
          status: 'verified',
          verifiedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!updatedSettlement) {
      throw new AppError(
        'Settlement is no longer pending or was verified by another concurrent request',
        409,
        'INVALID_SETTLEMENT_STATE'
      );
    }

    await AuditEvent.create({
      actorId: callerId,
      roomId: updatedSettlement.roomId,
      entityType: 'settlement',
      action: 'settlement_verified',
      metadata: {
        settlementId: updatedSettlement._id.toString(),
        debtorId: updatedSettlement.debtorId,
        receiverId: updatedSettlement.receiverId,
        amountPaise: updatedSettlement.amountPaise,
      },
    });

    // Push notification: Repayment verified
    Room.findById(updatedSettlement.roomId)
      .then((r) => {
        if (r) {
          const receiver = r.members.find((m) => m.userId === callerId);
          return PushNotificationService.notifySettlementVerified(
            updatedSettlement,
            r.name,
            receiver?.displayName || 'The recipient'
          );
        }
      })
      .catch((err) => {
        console.error('[SettlementService] Error triggering push for settlement verified:', err);
      });

    return updatedSettlement;
  },

  /**
   * Recipient rejects repayment request with mandatory reason
   */
  async rejectSettlement(
    callerId: string,
    settlementId: string,
    reason: string
  ): Promise<ISettlement> {
    if (!mongoose.Types.ObjectId.isValid(settlementId)) {
      throw new AppError('Invalid settlement ID', 400, 'INVALID_SETTLEMENT_ID');
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      throw new AppError('A valid rejection reason is required', 400, 'VALIDATION_ERROR');
    }

    if (reason.trim().length > 300) {
      throw new AppError('Rejection reason cannot exceed 300 characters', 400, 'VALIDATION_ERROR');
    }

    const settlement = await Settlement.findById(settlementId);
    if (!settlement) {
      throw new AppError('Settlement not found', 404, 'SETTLEMENT_NOT_FOUND');
    }

    if (settlement.status !== 'pending') {
      throw new AppError(
        `Cannot reject settlement in '${settlement.status}' status`,
        400,
        'SETTLEMENT_NOT_PENDING'
      );
    }

    if (settlement.receiverId !== callerId) {
      throw new AppError('Only the recipient can reject this settlement', 403, 'FORBIDDEN');
    }

    const updatedSettlement = await Settlement.findOneAndUpdate(
      {
        _id: settlementId,
        status: 'pending',
        receiverId: callerId,
      },
      {
        $set: {
          status: 'rejected',
          rejectionReason: reason.trim(),
          rejectedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!updatedSettlement) {
      throw new AppError(
        'Settlement is no longer pending or has already been resolved',
        409,
        'SETTLEMENT_NOT_PENDING'
      );
    }

    await AuditEvent.create({
      actorId: callerId,
      roomId: updatedSettlement.roomId,
      entityType: 'settlement',
      action: 'settlement_rejected',
      metadata: {
        settlementId: updatedSettlement._id.toString(),
        debtorId: updatedSettlement.debtorId,
        receiverId: updatedSettlement.receiverId,
        amountPaise: updatedSettlement.amountPaise,
        reason: updatedSettlement.rejectionReason,
      },
    });

    // Push notification: Repayment rejected
    Room.findById(updatedSettlement.roomId)
      .then((r) => {
        if (r) {
          const receiver = r.members.find((m) => m.userId === callerId);
          return PushNotificationService.notifySettlementRejected(
            updatedSettlement,
            r.name,
            receiver?.displayName || 'The recipient',
            updatedSettlement.rejectionReason
          );
        }
      })
      .catch((err) => {
        console.error('[SettlementService] Error triggering push for settlement rejected:', err);
      });

    return updatedSettlement;
  },

  /**
   * Debtor cancels their pending repayment request
   */
  async cancelSettlement(callerId: string, settlementId: string): Promise<ISettlement> {
    if (!mongoose.Types.ObjectId.isValid(settlementId)) {
      throw new AppError('Invalid settlement ID', 400, 'INVALID_SETTLEMENT_ID');
    }

    const settlement = await Settlement.findById(settlementId);
    if (!settlement) {
      throw new AppError('Settlement not found', 404, 'SETTLEMENT_NOT_FOUND');
    }

    if (settlement.status !== 'pending') {
      throw new AppError(
        `Cannot cancel settlement in '${settlement.status}' status`,
        400,
        'SETTLEMENT_NOT_PENDING'
      );
    }

    if (settlement.debtorId !== callerId) {
      throw new AppError('Only the debtor can cancel their settlement request', 403, 'FORBIDDEN');
    }

    const updatedSettlement = await Settlement.findOneAndUpdate(
      {
        _id: settlementId,
        status: 'pending',
        debtorId: callerId,
      },
      {
        $set: {
          status: 'cancelled',
          cancelledAt: new Date(),
        },
      },
      { new: true }
    );

    if (!updatedSettlement) {
      throw new AppError(
        'Settlement is no longer pending or has already been resolved',
        409,
        'SETTLEMENT_NOT_PENDING'
      );
    }

    await AuditEvent.create({
      actorId: callerId,
      roomId: updatedSettlement.roomId,
      entityType: 'settlement',
      action: 'settlement_cancelled',
      metadata: {
        settlementId: updatedSettlement._id.toString(),
        debtorId: updatedSettlement.debtorId,
        receiverId: updatedSettlement.receiverId,
        amountPaise: updatedSettlement.amountPaise,
      },
    });

    // Push notification: Repayment cancelled
    Room.findById(updatedSettlement.roomId)
      .then((r) => {
        if (r) {
          const debtor = r.members.find((m) => m.userId === callerId);
          return PushNotificationService.notifySettlementCancelled(
            updatedSettlement,
            r.name,
            debtor?.displayName || 'The debtor'
          );
        }
      })
      .catch((err) => {
        console.error('[SettlementService] Error triggering push for settlement cancelled:', err);
      });

    return updatedSettlement;
  },
};
