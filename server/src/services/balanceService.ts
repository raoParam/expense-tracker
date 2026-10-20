import mongoose from 'mongoose';
import { Expense } from '../models/Expense';
import { Settlement } from '../models/Settlement';
import { Room } from '../models/Room';
import { AppError } from '../middleware/errorHandler';
import {
  AccountingBalance,
  AccountingResult,
  calculateRoomAccounting,
  calculateSuggestedTransfers,
  findSuggestedTransfer,
  SuggestedTransfer as AccountingSuggestedTransfer,
} from './roomAccounting';

export type MemberBalance = AccountingBalance;
export type SuggestedTransfer = AccountingSuggestedTransfer;

export interface RoomBalancesResult {
  roomId: string;
  balances: MemberBalance[];
  totalExpensesCount: number;
  confirmedExpensesCount: number;
  verifiedSettlementsCount: number;
  currency: 'INR';
}

export interface SuggestedSettlementsResult {
  roomId: string;
  suggestedTransfers: SuggestedTransfer[];
}

interface LoadedRoomAccounting {
  room: mongoose.HydratedDocument<any>;
  allExpenses: any[];
  confirmedExpenses: any[];
  verifiedSettlements: any[];
  accounting: AccountingResult;
}

async function loadCanonicalAccounting(callerId: string, roomId: string): Promise<LoadedRoomAccounting> {
  if (!mongoose.Types.ObjectId.isValid(roomId)) {
    throw new AppError('Invalid room ID', 400, 'INVALID_ROOM_ID');
  }

  const room = await Room.findById(roomId);
  if (!room) {
    throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');
  }

  if (!room.members.some((member) => member.userId === callerId)) {
    throw new AppError('You are not authorized to view balances for this room', 403, 'NOT_ROOM_MEMBER');
  }

  const [allExpenses, allSettlements] = await Promise.all([
    Expense.find({ roomId: room._id }),
    Settlement.find({ roomId: room._id }),
  ]);
  const confirmedExpenses = allExpenses.filter((expense) => expense.status === 'confirmed');
  const verifiedSettlements = allSettlements.filter((settlement) => settlement.status === 'verified');

  const memberMap = new Map<string, { displayName?: string; email?: string }>();
  for (const member of room.members) {
    memberMap.set(member.userId, { displayName: member.displayName, email: member.email });
  }
  for (const expense of confirmedExpenses) {
    memberMap.set(expense.payerId, memberMap.get(expense.payerId) || {});
    for (const participant of expense.participants) {
      memberMap.set(participant.userId, memberMap.get(participant.userId) || {
        displayName: participant.displayName,
        email: participant.email,
      });
    }
  }
  for (const settlement of verifiedSettlements) {
    memberMap.set(settlement.debtorId, memberMap.get(settlement.debtorId) || {});
    memberMap.set(settlement.receiverId, memberMap.get(settlement.receiverId) || {});
  }

  const accounting = calculateRoomAccounting(
    confirmedExpenses,
    verifiedSettlements,
    Array.from(memberMap.entries()).map(([userId, metadata]) => ({ userId, ...metadata }))
  );
  const totalNetPaise = accounting.balances.reduce(
    (sum, balance) => sum + balance.netBalancePaise,
    0
  );
  if (totalNetPaise !== 0) {
    throw new AppError(
      'The room ledger is inconsistent: net balances do not sum to zero',
      409,
      'LEDGER_INVARIANT_VIOLATION'
    );
  }

  return { room, allExpenses, confirmedExpenses, verifiedSettlements, accounting };
}

export const BalanceService = {
  /** Return fresh net balances calculated from persisted ledger records. */
  async getRoomBalances(callerId: string, roomId: string): Promise<RoomBalancesResult> {
    const loaded = await loadCanonicalAccounting(callerId, roomId);
    return {
      roomId: loaded.room._id.toString(),
      balances: loaded.accounting.balances,
      totalExpensesCount: loaded.allExpenses.length,
      confirmedExpensesCount: loaded.confirmedExpenses.length,
      verifiedSettlementsCount: loaded.verifiedSettlements.length,
      currency: 'INR',
    };
  },

  /**
   * Return the one transfer projection used by the UI and settlement writes.
   * It is recalculated from the database on every call.
   */
  async getSuggestedSettlements(callerId: string, roomId: string): Promise<SuggestedSettlementsResult> {
    const loaded = await loadCanonicalAccounting(callerId, roomId);
    return {
      roomId: loaded.room._id.toString(),
      suggestedTransfers: calculateSuggestedTransfers(loaded.accounting),
    };
  },

  async getSuggestedTransfer(
    callerId: string,
    roomId: string,
    fromUserId: string,
    toUserId: string
  ): Promise<SuggestedTransfer | undefined> {
    const loaded = await loadCanonicalAccounting(callerId, roomId);
    return findSuggestedTransfer(loaded.accounting, fromUserId, toUserId);
  },
};
