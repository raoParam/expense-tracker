import mongoose from 'mongoose';
import { Expense } from '../models/Expense';
import { Settlement } from '../models/Settlement';
import { Room } from '../models/Room';
import { AppError } from '../middleware/errorHandler';

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

    // Initialize balance records
    const paidMap = new Map<string, number>();
    const shareMap = new Map<string, number>();

    for (const userId of memberMap.keys()) {
      paidMap.set(userId, 0);
      shareMap.set(userId, 0);
    }

    // Aggregate confirmed expenses
    for (const exp of confirmedExpenses) {
      paidMap.set(exp.payerId, (paidMap.get(exp.payerId) || 0) + exp.amountPaise);
      for (const p of exp.participants) {
        shareMap.set(p.userId, (shareMap.get(p.userId) || 0) + p.sharePaise);
      }
    }

    // Aggregate verified settlements
    // Debtor paid settlement -> increases debtor balance towards zero (adds to total paid)
    // Receiver received settlement -> decreases receiver receivable towards zero (adds to total share)
    for (const st of verifiedSettlements) {
      paidMap.set(st.debtorId, (paidMap.get(st.debtorId) || 0) + st.amountPaise);
      shareMap.set(st.receiverId, (shareMap.get(st.receiverId) || 0) + st.amountPaise);
    }

    // Compute net balance: balance[u] = Paid[u] - Share[u]
    const balances: MemberBalance[] = [];
    let sumNetBalances = 0;

    for (const [userId, meta] of memberMap.entries()) {
      const totalPaid = paidMap.get(userId) || 0;
      const totalShare = shareMap.get(userId) || 0;
      const netBalancePaise = totalPaid - totalShare;
      sumNetBalances += netBalancePaise;

      balances.push({
        userId,
        displayName: meta.displayName,
        email: meta.email,
        netBalancePaise,
        totalPaidPaise: totalPaid,
        totalSharePaise: totalShare,
      });
    }

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
   * BilateralDebt(A -> B) = (Confirmed expense shares A owes B + Verified settlements B paid A)
   *                       - (Confirmed expense shares B owes A + Verified settlements A paid B)
   * Returns positive integer if debtor owes receiver, 0 or negative otherwise.
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

    let aOwesB = 0;
    let bOwesA = 0;

    for (const exp of confirmedExpenses) {
      if (exp.payerId === receiverId) {
        const participantA = exp.participants.find((p) => p.userId === debtorId);
        if (participantA) {
          aOwesB += participantA.sharePaise;
        }
      }
      if (exp.payerId === debtorId) {
        const participantB = exp.participants.find((p) => p.userId === receiverId);
        if (participantB) {
          bOwesA += participantB.sharePaise;
        }
      }
    }

    for (const st of verifiedSettlements) {
      if (st.debtorId === debtorId && st.receiverId === receiverId) {
        // A paid B -> reduces A's debt to B
        aOwesB -= st.amountPaise;
      }
      if (st.debtorId === receiverId && st.receiverId === debtorId) {
        // B paid A -> reduces B's debt to A
        bOwesA -= st.amountPaise;
      }
    }

    const netBilateralDebt = aOwesB - bOwesA;
    return netBilateralDebt;
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

    const debts: BilateralDebtInfo[] = [];

    for (let i = 0; i < activeMembers.length; i++) {
      for (let j = i + 1; j < activeMembers.length; j++) {
        const userA = activeMembers[i].userId;
        const userB = activeMembers[j].userId;

        let aOwesB = 0;
        let bOwesA = 0;

        for (const exp of confirmedExpenses) {
          if (exp.payerId === userB) {
            const pA = exp.participants.find((p) => p.userId === userA);
            if (pA) aOwesB += pA.sharePaise;
          }
          if (exp.payerId === userA) {
            const pB = exp.participants.find((p) => p.userId === userB);
            if (pB) bOwesA += pB.sharePaise;
          }
        }

        for (const st of verifiedSettlements) {
          if (st.debtorId === userA && st.receiverId === userB) {
            aOwesB -= st.amountPaise;
          }
          if (st.debtorId === userB && st.receiverId === userA) {
            bOwesA -= st.amountPaise;
          }
        }

        const netAtoB = aOwesB - bOwesA;
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
