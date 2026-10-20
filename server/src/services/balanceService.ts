import mongoose from 'mongoose';
import { Expense } from '../models/Expense';
import { Settlement } from '../models/Settlement';
import { Room } from '../models/Room';
import { AppError } from '../middleware/errorHandler';
import { calculateRoomAccounting, getSignedBilateralDebt } from './roomAccounting';

export interface MemberBalance {
  userId: string;
  displayName?: string;
  email?: string;
  netBalancePaise: number;
  totalPaidPaise: number;
  totalSharePaise: number;
}

export interface SuggestedTransfer {
  fromUserId: string;
  fromDisplayName?: string;
  toUserId: string;
  toDisplayName?: string;
  amountPaise: number;
  currency: 'INR';
}

export interface BilateralDebtInfo {
  debtorId: string;
  receiverId: string;
  debtorDisplayName?: string;
  receiverDisplayName?: string;
  amountPaise: number;
}

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

export const BalanceService = {
  /**
   * Compute authoritative net balances for all members of a room
   * Formula: balance[u] = sum(Paid[u, e]) - sum(Share[u, e]) + sum(SettlementPaid[u, s]) - sum(SettlementReceived[u, s])
   */
  async getRoomBalances(callerId: string, roomId: string): Promise<RoomBalancesResult> {
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      throw new AppError('Invalid room ID', 400, 'INVALID_ROOM_ID');
    }

    const room = await Room.findById(roomId);
    if (!room) {
      throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    const isMember = room.members.some((m) => m.userId === callerId);
    if (!isMember) {
      throw new AppError('You are not authorized to view balances for this room', 403, 'NOT_ROOM_MEMBER');
    }

    // Fetch all expenses and settlements for this room
    const [allExpenses, allSettlements] = await Promise.all([
      Expense.find({ roomId: room._id }),
      Settlement.find({ roomId: room._id }),
    ]);

    const confirmedExpenses = allExpenses.filter((e) => e.status === 'confirmed');
    const verifiedSettlements = allSettlements.filter((s) => s.status === 'verified');

    // Build map for all room members (including left members who might have historical balances)
    const memberMap = new Map<string, { displayName?: string; email?: string }>();
    for (const m of room.members) {
      memberMap.set(m.userId, { displayName: m.displayName, email: m.email });
    }

    // Include participant IDs from confirmed expenses
    for (const exp of confirmedExpenses) {
      if (!memberMap.has(exp.payerId)) {
        memberMap.set(exp.payerId, { displayName: undefined, email: undefined });
      }
      for (const p of exp.participants) {
        if (!memberMap.has(p.userId)) {
          memberMap.set(p.userId, { displayName: p.displayName, email: p.email });
        }
      }
    }

    // Include IDs from verified settlements
    for (const st of verifiedSettlements) {
      if (!memberMap.has(st.debtorId)) {
        memberMap.set(st.debtorId, { displayName: undefined, email: undefined });
      }
      if (!memberMap.has(st.receiverId)) {
        memberMap.set(st.receiverId, { displayName: undefined, email: undefined });
      }
    }

    const accounting = calculateRoomAccounting(
      confirmedExpenses,
      verifiedSettlements,
      Array.from(memberMap.entries()).map(([userId, meta]) => ({ userId, ...meta }))
    );
    const balances: MemberBalance[] = accounting.balances;
    const sumNetBalances = balances.reduce((sum, balance) => sum + balance.netBalancePaise, 0);

    // Invariant: Conservation of money (sum of all net balances must equal 0)
    if (sumNetBalances !== 0) {
      console.error(`Balance invariant violation in room ${roomId}: sum of net balances is ${sumNetBalances}`);
    }

    return {
      roomId: room._id.toString(),
      balances,
      totalExpensesCount: allExpenses.length,
      confirmedExpensesCount: confirmedExpenses.length,
      verifiedSettlementsCount: verifiedSettlements.length,
      currency: 'INR',
    };
  },

  /**
   * Compute exact bilateral debt from debtor to receiver in a given room.
   * Confirmed expense shares create directed liabilities. Verified settlements
   * reduce only the same directed liability; remaining liabilities in the two
   * directions are then netted for this pair. Suggested group transfers never
   * participate in this calculation.
   * Returns a positive integer if debtor owes receiver, 0 or negative otherwise.
   */
  async computeBilateralDebt(
    roomId: string | mongoose.Types.ObjectId,
    debtorId: string,
    receiverId: string
  ): Promise<number> {
    const [confirmedExpenses, verifiedSettlements] = await Promise.all([
      Expense.find({ roomId, status: 'confirmed' }),
      Settlement.find({ roomId, status: 'verified' }),
    ]);

    return getSignedBilateralDebt(
      calculateRoomAccounting(confirmedExpenses, verifiedSettlements),
      debtorId,
      receiverId
    );
  },

  /**
   * Compute all bilateral debts for all active member pairs in a room
   */
  async getRoomBilateralDebts(callerId: string, roomId: string): Promise<BilateralDebtInfo[]> {
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      throw new AppError('Invalid room ID', 400, 'INVALID_ROOM_ID');
    }

    const room = await Room.findById(roomId);
    if (!room) {
      throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    const isMember = room.members.some((m) => m.userId === callerId);
    if (!isMember) {
      throw new AppError('You are not authorized to view balances for this room', 403, 'NOT_ROOM_MEMBER');
    }

    const [confirmedExpenses, verifiedSettlements] = await Promise.all([
      Expense.find({ roomId: room._id, status: 'confirmed' }),
      Settlement.find({ roomId: room._id, status: 'verified' }),
    ]);

    const activeMembers = room.members.filter((m) => m.status === 'active');
    const memberNameMap = new Map<string, string | undefined>();
    for (const m of activeMembers) {
      memberNameMap.set(m.userId, m.displayName);
    }

    const accounting = calculateRoomAccounting(confirmedExpenses, verifiedSettlements, activeMembers);
    const debts: BilateralDebtInfo[] = [];

    for (let i = 0; i < activeMembers.length; i++) {
      for (let j = i + 1; j < activeMembers.length; j++) {
        const userA = activeMembers[i].userId;
        const userB = activeMembers[j].userId;

        const netAtoB = getSignedBilateralDebt(accounting, userA, userB);
        if (netAtoB > 0) {
          debts.push({
            debtorId: userA,
            debtorDisplayName: memberNameMap.get(userA),
            receiverId: userB,
            receiverDisplayName: memberNameMap.get(userB),
            amountPaise: netAtoB,
          });
        } else if (netAtoB < 0) {
          debts.push({
            debtorId: userB,
            debtorDisplayName: memberNameMap.get(userB),
            receiverId: userA,
            receiverDisplayName: memberNameMap.get(userA),
            amountPaise: -netAtoB,
          });
        }
      }
    }

    return debts;
  },

  /**
   * Compute suggested debt simplification transfers
   */
  async getSuggestedSettlements(callerId: string, roomId: string): Promise<SuggestedSettlementsResult> {
    const { balances } = await this.getRoomBalances(callerId, roomId);

    interface ParticipantNode {
      userId: string;
      displayName?: string;
      amountPaise: number;
    }

    const creditors: ParticipantNode[] = [];
    const debtors: ParticipantNode[] = [];

    for (const b of balances) {
      if (b.netBalancePaise > 0) {
        creditors.push({
          userId: b.userId,
          displayName: b.displayName,
          amountPaise: b.netBalancePaise,
        });
      } else if (b.netBalancePaise < 0) {
        debtors.push({
          userId: b.userId,
          displayName: b.displayName,
          amountPaise: -b.netBalancePaise,
        });
      }
    }

    // Sort descending by amount for greedy matching
    creditors.sort((a, b) => b.amountPaise - a.amountPaise);
    debtors.sort((a, b) => b.amountPaise - a.amountPaise);

    const suggestedTransfers: SuggestedTransfer[] = [];

    let cIdx = 0;
    let dIdx = 0;

    while (cIdx < creditors.length && dIdx < debtors.length) {
      const creditor = creditors[cIdx];
      const debtor = debtors[dIdx];

      const settleAmount = Math.min(creditor.amountPaise, debtor.amountPaise);

      if (settleAmount > 0) {
        suggestedTransfers.push({
          fromUserId: debtor.userId,
          fromDisplayName: debtor.displayName,
          toUserId: creditor.userId,
          toDisplayName: creditor.displayName,
          amountPaise: settleAmount,
          currency: 'INR',
        });
      }

      creditor.amountPaise -= settleAmount;
      debtor.amountPaise -= settleAmount;

      if (creditor.amountPaise === 0) {
        cIdx++;
      }
      if (debtor.amountPaise === 0) {
        dIdx++;
      }
    }

    return {
      roomId,
      suggestedTransfers,
    };
  },
};
