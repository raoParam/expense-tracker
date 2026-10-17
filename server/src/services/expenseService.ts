import mongoose from 'mongoose';
import { Expense, IExpense, SplitType } from '../models/Expense';
import { Room } from '../models/Room';
import { UserRestriction } from '../models/UserRestriction';
import { AuditEvent } from '../models/AuditEvent';
import { AppError } from '../middleware/errorHandler';
import { calculateShares, SplitInputItem } from './splitCalculator';
import { PushNotificationService } from './pushNotificationService';

export interface CreateExpenseDTO {
  roomId: string;
  title?: string;
  description?: string;
  amountPaise: number;
  splitType: SplitType;
  participants: SplitInputItem[];
  idempotencyKey?: string;
}

export interface ResubmitExpenseDTO {
  title?: string;
  description?: string;
  amountPaise?: number;
  splitType?: SplitType;
  participants?: SplitInputItem[];
  expectedRevision: number;
}

export const ExpenseService = {
  /**
   * Check if a user currently has an active 24-hour room expense creation restriction
   */
  async checkUserRestriction(userId: string): Promise<void> {
    const restriction = await UserRestriction.findOne({
      userId,
      expenseCreationBlockedUntil: { $gt: new Date() },
    }).sort({ expenseCreationBlockedUntil: -1 });

    if (restriction) {
      throw new AppError(
        `Expense creation is temporarily restricted until ${restriction.expenseCreationBlockedUntil.toISOString()} due to unanimous expense rejection.`,
        403,
        'CREATOR_RESTRICTED',
        {
          blockedUntil: restriction.expenseCreationBlockedUntil.toISOString(),
          reason: restriction.reason,
        }
      );
    }
  },

  /**
   * Create a new shared expense
   */
  async createExpense(callerId: string, data: CreateExpenseDTO): Promise<IExpense> {
    // 1. Check for active 24-hour restriction
    await this.checkUserRestriction(callerId);

    // 2. Idempotency check
    if (data.idempotencyKey) {
      const existing = await Expense.findOne({
        idempotencyKey: data.idempotencyKey.trim(),
        payerId: callerId,
      });
      if (existing) {
        return existing;
      }
    }

    // 3. Room validation & membership check
    if (!mongoose.Types.ObjectId.isValid(data.roomId)) {
      throw new AppError('Invalid room ID', 400, 'INVALID_ROOM_ID');
    }

    const room = await Room.findById(data.roomId);
    if (!room) {
      throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    if (room.status !== 'active') {
      throw new AppError('Cannot create expenses in an archived room', 400, 'ROOM_ARCHIVED');
    }

    const callerMember = room.members.find((m) => m.userId === callerId && m.status === 'active');
    if (!callerMember) {
      throw new AppError('You must be an active member of this room to create an expense', 403, 'NOT_ROOM_MEMBER');
    }

    // 4. Validate all participants are active members of the room
    const memberMap = new Map(room.members.map((m) => [m.userId, m]));
    for (const p of data.participants) {
      const member = memberMap.get(p.userId.trim());
      if (!member || member.status !== 'active') {
        throw new AppError(
          `Participant ${p.userId} is not an active member of this room`,
          400,
          'INVALID_PARTICIPANT'
        );
      }
    }

    // 5. Calculate deterministic shares using split engine
    const calculatedShares = calculateShares(
      data.splitType,
      data.amountPaise,
      data.participants,
      callerId
    );

    // 6. Build participants subdocuments
    const participantsSubdocs = calculatedShares.map((share) => {
      const member = memberMap.get(share.userId);
      const isPayer = share.userId === callerId;

      return {
        userId: share.userId,
        displayName: member?.displayName || (isPayer ? callerMember.displayName : undefined),
        email: member?.email,
        sharePaise: share.sharePaise,
        status: isPayer ? ('acknowledged' as const) : ('pending' as const),
        acknowledgedAt: isPayer ? new Date() : undefined,
      };
    });

    // 7. Persist Expense
    const expense = await Expense.create({
      roomId: room._id,
      payerId: callerId,
      title: (data.title || '').trim(),
      description: (data.description || '').trim(),
      amountPaise: data.amountPaise,
      currency: 'INR',
      splitType: data.splitType,
      splitInputs: data.participants,
      participants: participantsSubdocs,
      status: 'pending',
      revision: 1,
      idempotencyKey: data.idempotencyKey ? data.idempotencyKey.trim() : undefined,
    });

    // 8. Log Audit Event
    await AuditEvent.create({
      actorId: callerId,
      roomId: room._id,
      entityType: 'expense',
      action: 'expense_created',
      metadata: {
        expenseId: expense._id,
        amountPaise: expense.amountPaise,
        splitType: expense.splitType,
        participantCount: expense.participants.length,
      },
    });

    // 9. Dispatch push notifications to other participants
    const payerName = callerMember?.displayName || 'A roommate';
    PushNotificationService.notifyExpenseCreated(expense, room.name, payerName).catch((err) => {
      console.error('[ExpenseService] Error triggering push for expense created:', err);
    });

    return expense;
  },

  /**
   * List expenses for a room
   */
  async getRoomExpenses(
    callerId: string,
    roomId: string,
    statusFilter?: string
  ): Promise<IExpense[]> {
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      throw new AppError('Invalid room ID', 400, 'INVALID_ROOM_ID');
    }

    const room = await Room.findById(roomId);
    if (!room) {
      throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    const isMember = room.members.some((m) => m.userId === callerId);
    if (!isMember) {
      throw new AppError('You are not authorized to view expenses for this room', 403, 'NOT_ROOM_MEMBER');
    }

    const query: any = { roomId: room._id };
    if (statusFilter && ['pending', 'confirmed', 'rejected', 'cancelled'].includes(statusFilter)) {
      query.status = statusFilter;
    }

    return Expense.find(query).sort({ createdAt: -1 });
  },

  /**
   * Get single expense details by ID
   */
  async getExpenseById(callerId: string, expenseId: string): Promise<IExpense> {
    if (!mongoose.Types.ObjectId.isValid(expenseId)) {
      throw new AppError('Invalid expense ID', 400, 'INVALID_EXPENSE_ID');
    }

    const expense = await Expense.findById(expenseId);
    if (!expense) {
      throw new AppError('Expense not found', 404, 'EXPENSE_NOT_FOUND');
    }

    const room = await Room.findById(expense.roomId);
    if (!room || !room.members.some((m) => m.userId === callerId)) {
      throw new AppError('You are not authorized to view this expense', 403, 'NOT_ROOM_MEMBER');
    }

    return expense;
  },

  /**
   * Acknowledge an expense share
   */
  async acknowledgeExpense(
    callerId: string,
    expenseId: string,
    expectedRevision: number
  ): Promise<IExpense> {
    if (!mongoose.Types.ObjectId.isValid(expenseId)) {
      throw new AppError('Invalid expense ID', 400, 'INVALID_EXPENSE_ID');
    }

    const expense = await Expense.findById(expenseId);
    if (!expense) {
      throw new AppError('Expense not found', 404, 'EXPENSE_NOT_FOUND');
    }

    if (expense.status !== 'pending') {
      throw new AppError(
        `Cannot acknowledge an expense with status '${expense.status}'`,
        400,
        'INVALID_STATUS_TRANSITION'
      );
    }

    if (expense.revision !== expectedRevision) {
      throw new AppError(
        'This expense has changed. Please refresh and review the updated details before acknowledging.',
        409,
        'EXPENSE_REVISION_CONFLICT'
      );
    }

    const participant = expense.participants.find((p) => p.userId === callerId);
    if (!participant) {
      throw new AppError('You are not a participant in this expense', 403, 'NOT_EXPENSE_PARTICIPANT');
    }

    if (participant.status === 'acknowledged') {
      return expense; // Idempotent success
    }

    // Atomically set participant status while revision and status match
    const updatedExpense = await Expense.findOneAndUpdate(
      {
        _id: expense._id,
        status: 'pending',
        revision: expectedRevision,
        'participants.userId': callerId,
      },
      {
        $set: {
          'participants.$.status': 'acknowledged',
          'participants.$.acknowledgedAt': new Date(),
          'participants.$.rejectionReason': undefined,
          'participants.$.rejectedAt': undefined,
        },
      },
      { new: true }
    );

    if (!updatedExpense) {
      const current = await Expense.findById(expenseId);
      if (!current) throw new AppError('Expense not found', 404, 'EXPENSE_NOT_FOUND');
      if (current.revision !== expectedRevision) {
        throw new AppError(
          'This expense has changed. Please refresh and review the updated details before acknowledging.',
          409,
          'EXPENSE_REVISION_CONFLICT'
        );
      }
      if (current.status !== 'pending') {
        throw new AppError(
          `Cannot acknowledge an expense with status '${current.status}'`,
          400,
          'INVALID_STATUS_TRANSITION'
        );
      }
      return current;
    }

    // Check if all participants have now acknowledged
    const allAcknowledged = updatedExpense.participants.every((p) => p.status === 'acknowledged');
    if (allAcknowledged) {
      const confirmedExpense = await Expense.findOneAndUpdate(
        {
          _id: updatedExpense._id,
          status: 'pending',
          revision: expectedRevision,
        },
        {
          $set: {
            status: 'confirmed',
            confirmedAt: new Date(),
          },
        },
        { new: true }
      );

      if (confirmedExpense) {
        await AuditEvent.create({
          actorId: callerId,
          roomId: confirmedExpense.roomId,
          entityType: 'expense',
          action: 'expense_confirmed',
          metadata: {
            expenseId: confirmedExpense._id,
            revision: confirmedExpense.revision,
            allAcknowledged: true,
          },
        });

        // Trigger push notification to payer that expense confirmed
        Room.findById(confirmedExpense.roomId)
          .then((r) => {
            if (r) {
              return PushNotificationService.notifyExpenseConfirmed(confirmedExpense, r.name);
            }
          })
          .catch((err) => {
            console.error('[ExpenseService] Error triggering push for expense confirmed:', err);
          });

        return confirmedExpense;
      }
    }

    // Log Audit Event for partial acknowledgement
    await AuditEvent.create({
      actorId: callerId,
      roomId: updatedExpense.roomId,
      entityType: 'expense',
      action: 'expense_acknowledged',
      metadata: {
        expenseId: updatedExpense._id,
        revision: updatedExpense.revision,
        allAcknowledged: false,
      },
    });

    return updatedExpense;
  },

  /**
   * Reject an expense share with mandatory reason
   */
  async rejectExpense(
    callerId: string,
    expenseId: string,
    expectedRevision: number,
    reason: string
  ): Promise<IExpense> {
    if (!mongoose.Types.ObjectId.isValid(expenseId)) {
      throw new AppError('Invalid expense ID', 400, 'INVALID_EXPENSE_ID');
    }

    const cleanReason = (reason || '').trim();
    if (!cleanReason || cleanReason.length < 3) {
      throw new AppError(
        'A clear reason (at least 3 characters) is required when rejecting an expense',
        400,
        'REJECTION_REASON_REQUIRED'
      );
    }

    const expense = await Expense.findById(expenseId);
    if (!expense) {
      throw new AppError('Expense not found', 404, 'EXPENSE_NOT_FOUND');
    }

    if (expense.status !== 'pending') {
      throw new AppError(
        `Cannot reject an expense with status '${expense.status}'`,
        400,
        'INVALID_STATUS_TRANSITION'
      );
    }

    if (expense.revision !== expectedRevision) {
      throw new AppError(
        'This expense has changed. Please refresh and review the updated details before rejecting.',
        409,
        'EXPENSE_REVISION_CONFLICT'
      );
    }

    const participant = expense.participants.find((p) => p.userId === callerId);
    if (!participant) {
      throw new AppError('You are not a participant in this expense', 403, 'NOT_EXPENSE_PARTICIPANT');
    }

    if (participant.userId === expense.payerId) {
      throw new AppError('The creator/payer cannot reject their own expense', 400, 'CREATOR_CANNOT_REJECT');
    }

    // Atomically update participant rejection
    const updatedExpense = await Expense.findOneAndUpdate(
      {
        _id: expense._id,
        status: 'pending',
        revision: expectedRevision,
        'participants.userId': callerId,
      },
      {
        $set: {
          'participants.$.status': 'rejected',
          'participants.$.rejectionReason': cleanReason,
          'participants.$.rejectedAt': new Date(),
        },
      },
      { new: true }
    );

    if (!updatedExpense) {
      const current = await Expense.findById(expenseId);
      if (!current) throw new AppError('Expense not found', 404, 'EXPENSE_NOT_FOUND');
      if (current.revision !== expectedRevision) {
        throw new AppError(
          'This expense has changed. Please refresh and review the updated details before rejecting.',
          409,
          'EXPENSE_REVISION_CONFLICT'
        );
      }
      if (current.status !== 'pending') {
        throw new AppError(
          `Cannot reject an expense with status '${current.status}'`,
          400,
          'INVALID_STATUS_TRANSITION'
        );
      }
      return current;
    }

    // Check if ALL OTHER participants have rejected (Unanimous Rejection)
    const otherParticipants = updatedExpense.participants.filter((p) => p.userId !== updatedExpense.payerId);
    const allOthersRejected = otherParticipants.every((p) => p.status === 'rejected');

    if (allOthersRejected) {
      // Unanimous rejection by all peers -> Close expense as rejected and apply 24h restriction
      const unanimouslyRejected = await Expense.findOneAndUpdate(
        {
          _id: updatedExpense._id,
          status: 'pending',
          revision: expectedRevision,
        },
        {
          $set: {
            status: 'rejected',
          },
        },
        { new: true }
      );

      if (unanimouslyRejected) {
        const blockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from server now
        await UserRestriction.create({
          userId: updatedExpense.payerId,
          expenseCreationBlockedUntil: blockedUntil,
          reason: `Unanimous rejection by all participants on expense "${updatedExpense.title || 'Shared Expense'}"`,
          triggeringExpenseId: updatedExpense._id,
        });

        await AuditEvent.create({
          actorId: callerId,
          roomId: updatedExpense.roomId,
          entityType: 'expense',
          action: 'expense_unanimously_rejected',
          metadata: {
            expenseId: updatedExpense._id,
            creatorRestrictedUntil: blockedUntil.toISOString(),
            rejectionReasons: otherParticipants.map((p) => ({ userId: p.userId, reason: p.rejectionReason })),
          },
        });

        // Push notification: Unanimous rejection
        Room.findById(updatedExpense.roomId)
          .then((r) => {
            if (r) {
              const rejector = r.members.find((m) => m.userId === callerId);
              return PushNotificationService.notifyExpenseRejected(
                unanimouslyRejected,
                callerId,
                rejector?.displayName || 'Roommate',
                cleanReason,
                r.name,
                true
              );
            }
          })
          .catch((err) => {
            console.error('[ExpenseService] Error triggering push for unanimous rejection:', err);
          });

        return unanimouslyRejected;
      }
    }

    // Partial rejection -> remains pending/returned to payer for correction
    await AuditEvent.create({
      actorId: callerId,
      roomId: updatedExpense.roomId,
      entityType: 'expense',
      action: 'expense_rejected_by_participant',
      metadata: {
        expenseId: updatedExpense._id,
        participantId: callerId,
        reason: cleanReason,
      },
    });

    // Push notification: Partial rejection
    Room.findById(updatedExpense.roomId)
      .then((r) => {
        if (r) {
          const rejector = r.members.find((m) => m.userId === callerId);
          return PushNotificationService.notifyExpenseRejected(
            updatedExpense,
            callerId,
            rejector?.displayName || 'Roommate',
            cleanReason,
            r.name,
            false
          );
        }
      })
      .catch((err) => {
        console.error('[ExpenseService] Error triggering push for partial rejection:', err);
      });

    return updatedExpense;
  },

  /**
   * Resubmit a rejected/pending expense with corrected inputs (payer only)
   */
  async resubmitExpense(
    callerId: string,
    expenseId: string,
    data: ResubmitExpenseDTO
  ): Promise<IExpense> {
    if (!mongoose.Types.ObjectId.isValid(expenseId)) {
      throw new AppError('Invalid expense ID', 400, 'INVALID_EXPENSE_ID');
    }

    const expense = await Expense.findById(expenseId);
    if (!expense) {
      throw new AppError('Expense not found', 404, 'EXPENSE_NOT_FOUND');
    }

    if (expense.payerId !== callerId) {
      throw new AppError('Only the original payer can resubmit this expense', 403, 'NOT_EXPENSE_PAYER');
    }

    if (expense.status !== 'pending') {
      throw new AppError(
        `Cannot resubmit an expense with status '${expense.status}'. Only pending expenses with rejections can be resubmitted.`,
        400,
        'INVALID_STATUS_TRANSITION'
      );
    }

    if (expense.revision !== data.expectedRevision) {
      throw new AppError(
        'Revision conflict. Please refresh and try resubmitting again.',
        409,
        'EXPENSE_REVISION_CONFLICT'
      );
    }

    const room = await Room.findById(expense.roomId);
    if (!room || room.status !== 'active') {
      throw new AppError('Cannot resubmit expenses in an inactive or archived room', 400, 'ROOM_INACTIVE');
    }

    const amountPaise = data.amountPaise !== undefined ? data.amountPaise : expense.amountPaise;
    const splitType = data.splitType || expense.splitType;
    const participantsInput = data.participants || expense.splitInputs || [];

    // Validate participants
    const memberMap = new Map(room.members.map((m) => [m.userId, m]));
    for (const p of participantsInput) {
      const member = memberMap.get(p.userId.trim());
      if (!member || member.status !== 'active') {
        throw new AppError(
          `Participant ${p.userId} is not an active member of this room`,
          400,
          'INVALID_PARTICIPANT'
        );
      }
    }

    // Recompute shares
    const calculatedShares = calculateShares(
      splitType,
      amountPaise,
      participantsInput,
      callerId
    );

    // Build fresh participants subdocuments (resets other participants to pending)
    const newParticipants = calculatedShares.map((share) => {
      const member = memberMap.get(share.userId);
      const isPayer = share.userId === callerId;

      return {
        userId: share.userId,
        displayName: member?.displayName,
        email: member?.email,
        sharePaise: share.sharePaise,
        status: isPayer ? ('acknowledged' as const) : ('pending' as const),
        acknowledgedAt: isPayer ? new Date() : undefined,
        rejectionReason: undefined,
        rejectedAt: undefined,
      };
    });

    const updated = await Expense.findOneAndUpdate(
      {
        _id: expenseId,
        payerId: callerId,
        status: 'pending',
        revision: data.expectedRevision,
      },
      {
        $set: {
          title: data.title !== undefined ? data.title.trim() : expense.title,
          description: data.description !== undefined ? data.description.trim() : expense.description,
          amountPaise: amountPaise,
          splitType: splitType,
          splitInputs: participantsInput,
          participants: newParticipants as any,
          status: 'pending',
        },
        $inc: { revision: 1 },
      },
      { new: true }
    );

    if (!updated) {
      throw new AppError(
        'Revision conflict or expense status changed. Please refresh and try resubmitting again.',
        409,
        'EXPENSE_REVISION_CONFLICT'
      );
    }

    await AuditEvent.create({
      actorId: callerId,
      roomId: updated.roomId,
      entityType: 'expense',
      action: 'expense_resubmitted',
      metadata: {
        expenseId: updated._id,
        newRevision: updated.revision,
        amountPaise: updated.amountPaise,
      },
    });

    // Push notification: Resubmitted expense requires fresh acknowledgement
    const payerMember = room.members.find((m) => m.userId === callerId);
    PushNotificationService.notifyExpenseResubmitted(
      updated,
      room.name,
      payerMember?.displayName || 'A roommate'
    ).catch((err) => {
      console.error('[ExpenseService] Error triggering push for expense resubmitted:', err);
    });

    return updated;
  },

  /**
   * Cancel a pending expense (payer only)
   */
  async cancelExpense(callerId: string, expenseId: string): Promise<IExpense> {
    if (!mongoose.Types.ObjectId.isValid(expenseId)) {
      throw new AppError('Invalid expense ID', 400, 'INVALID_EXPENSE_ID');
    }

    const expense = await Expense.findById(expenseId);
    if (!expense) {
      throw new AppError('Expense not found', 404, 'EXPENSE_NOT_FOUND');
    }

    if (expense.payerId !== callerId) {
      throw new AppError('Only the original payer can cancel this expense', 403, 'NOT_EXPENSE_PAYER');
    }

    const cancelled = await Expense.findOneAndUpdate(
      {
        _id: expenseId,
        payerId: callerId,
        status: 'pending',
      },
      {
        $set: {
          status: 'cancelled',
          cancelledAt: new Date(),
        },
      },
      { new: true }
    );

    if (!cancelled) {
      const current = await Expense.findById(expenseId);
      if (!current) throw new AppError('Expense not found', 404, 'EXPENSE_NOT_FOUND');
      throw new AppError(
        `Cannot cancel an expense with status '${current.status}'. Only pending expenses can be cancelled.`,
        400,
        'INVALID_STATUS_TRANSITION'
      );
    }

    await AuditEvent.create({
      actorId: callerId,
      roomId: cancelled.roomId,
      entityType: 'expense',
      action: 'expense_cancelled',
      metadata: {
        expenseId: cancelled._id,
      },
    });

    return cancelled;
  },
};
