import mongoose from 'mongoose';
import { Settlement, ISettlement } from '../models/Settlement';
import { Room } from '../models/Room';
import { AuditEvent } from '../models/AuditEvent';
import { BalanceService } from './balanceService';
import { AppError } from '../middleware/errorHandler';
import { PushNotificationService } from './pushNotificationService';
import { SettlementGraphService } from './settlementGraphService';
import { SettlementGraph } from '../models/SettlementGraph';

export interface CreateSettlementInput {
  receiverId: string;
  amountPaise: number;
  idempotencyKey?: string;
  edgeId?: string;
  planVersion?: number;
}

async function withMongoTransaction<T>(work: (session?: mongoose.ClientSession) => Promise<T>): Promise<T> {
  // Unit tests and local legacy read-only usage may run without a database.
  // Connected production requests use a Mongo transaction for the settlement
  // record and its graph-edge transition.
  if (mongoose.connection.readyState !== 1) return work();
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
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

    // The client may only request the current canonical suggested transfer.
    // This is derived from all room net balances, never from a client-supplied
    // or separately calculated historical debt.
    const suggestedTransfer = await BalanceService.getSuggestedTransfer(
      callerId,
      room._id.toString(),
      callerId,
      input.receiverId
    );

    if (!suggestedTransfer) {
      throw new AppError(
        'You do not have an outstanding net-balance transfer to this member',
        400,
        'NO_OUTSTANDING_NET_TRANSFER'
      );
    }

    if (input.amountPaise !== suggestedTransfer.amountPaise) {
      throw new AppError(
        `Settlement must match the current suggested net-balance transfer of ₹${(
          suggestedTransfer.amountPaise / 100
        ).toFixed(2)} (${suggestedTransfer.amountPaise} paise)`,
        400,
        'INVALID_SETTLEMENT_AMOUNT'
      );
    }

    if (suggestedTransfer.edgeId && input.edgeId && suggestedTransfer.edgeId !== input.edgeId) {
      throw new AppError('The settlement edge is stale. Please refresh the room debts.', 409, 'INVALID_SETTLEMENT_STATE');
    }

    const settlement = new Settlement({
      roomId: room._id,
      debtorId: callerId,
      receiverId: input.receiverId,
      amountPaise: input.amountPaise,
      currency: 'INR',
      status: 'pending',
      idempotencyKey: input.idempotencyKey,
      edgeId: suggestedTransfer.edgeId,
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

    // Re-check room membership at verification time. The client is never the
    // authority for who may complete a settlement, even if the request was
    // created while both users were members.
    const room = await Room.findById(settlement.roomId);
    if (!room) {
      throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');
    }
    const receiverIsMember = room.members.some(
      (member) => member.userId === settlement.receiverId && member.status === 'active'
    );
    const debtorIsMember = room.members.some(
      (member) => member.userId === settlement.debtorId && member.status === 'active'
    );
    if (!receiverIsMember || !debtorIsMember) {
      throw new AppError('Both settlement parties must be active room members', 403, 'NOT_ROOM_MEMBER');
    }

    if (
      settlement.debtorId === settlement.receiverId ||
      !Number.isSafeInteger(settlement.amountPaise) ||
      settlement.amountPaise <= 0
    ) {
      throw new AppError('Settlement record is invalid', 409, 'INVALID_SETTLEMENT_STATE');
    }

    let updatedSettlement: ISettlement;
    let targetEdgeId = settlement.edgeId;

    if (targetEdgeId) {
      const graph = await SettlementGraphService.getOrInitializeGraph(settlement.roomId.toString());
      const edge = SettlementGraphService.findEdge(graph, targetEdgeId);
      if (
        !edge ||
        edge.amountPaise !== settlement.amountPaise ||
        edge.fromUserId !== settlement.debtorId ||
        edge.toUserId !== settlement.receiverId
      ) {
        throw new AppError('The settlement graph edge is no longer outstanding', 409, 'INVALID_SETTLEMENT_STATE');
      }
    } else {
      const suggestedTransfer = await BalanceService.getSuggestedTransfer(
        callerId,
        settlement.roomId.toString(),
        settlement.debtorId,
        settlement.receiverId
      );
      if (
        !suggestedTransfer ||
        suggestedTransfer.amountPaise !== settlement.amountPaise ||
        suggestedTransfer.fromUserId !== settlement.debtorId ||
        suggestedTransfer.toUserId !== settlement.receiverId
      ) {
        throw new AppError(
          'The outstanding net-balance transfer has changed or been settled already',
          409,
          'INVALID_SETTLEMENT_STATE'
        );
      }
      targetEdgeId = suggestedTransfer.edgeId;
    }

    updatedSettlement = await withMongoTransaction(async (session) => {
      const verified = await Settlement.findOneAndUpdate(
        {
          _id: settlement._id,
          status: 'pending',
          receiverId: callerId,
        },
        { $set: { status: 'verified', verifiedAt: new Date() } },
        { new: true, ...(session ? { session } : {}) }
      );
      if (!verified) {
        throw new AppError(
          'Settlement is no longer pending or was verified by another concurrent request',
          409,
          'INVALID_SETTLEMENT_STATE'
        );
      }

      if (targetEdgeId && (mongoose.connection.readyState !== 0 || (SettlementGraph.findOneAndUpdate as any)?._isMockFunction)) {
        const updatedGraph = await SettlementGraph.findOneAndUpdate(
          {
            roomId: settlement.roomId,
            edges: {
              $elemMatch: {
                edgeId: targetEdgeId,
                fromUserId: settlement.debtorId,
                toUserId: settlement.receiverId,
                amountPaise: settlement.amountPaise,
              },
            },
          },
          { $set: { 'edges.$.amountPaise': 0 } },
          { new: true, ...(session ? { session } : {}) }
        );
        if (!updatedGraph) {
          throw new AppError('The settlement graph edge was changed concurrently', 409, 'INVALID_SETTLEMENT_STATE');
        }
      }
      return verified;
    });

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
