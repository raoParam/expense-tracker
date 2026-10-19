/**
 * Shared room-ledger calculation.
 *
 * Callers must pass only confirmed expenses and verified settlements. Pending,
 * rejected, and cancelled records are deliberately not part of this ledger.
 * The same directed debt graph is used for both bilateral debt display and
 * the net balances consumed by suggested transfers.
 */

export interface AccountingParticipant {
  userId: string;
  sharePaise: number;
}

export interface AccountingExpense {
  payerId: string;
  amountPaise: number;
  participants: AccountingParticipant[];
}

export interface AccountingSettlement {
  debtorId: string;
  receiverId: string;
  amountPaise: number;
}

export interface AccountingMember {
  userId: string;
  displayName?: string;
  email?: string;
}

export interface AccountingBalance {
  userId: string;
  displayName?: string;
  email?: string;
  netBalancePaise: number;
  totalPaidPaise: number;
  totalSharePaise: number;
}

export interface AccountingResult {
  balances: AccountingBalance[];
  /** Net outstanding debt keyed by debtor and receiver. */
  bilateralDebts: Map<string, number>;
}

const pairKey = (debtorId: string, receiverId: string): string =>
  `${debtorId}\u0000${receiverId}`;

const addToMap = (map: Map<string, number>, key: string, amountPaise: number): void => {
  map.set(key, (map.get(key) || 0) + amountPaise);
};

/**
 * Builds the authoritative accounting view for a room.
 *
 * An expense creates edges participant -> payer for each participant's share.
 * A verified settlement removes an edge debtor -> receiver. This is the
 * bilateral meaning of a repayment; it is not a new expense or suggestion.
 */
export function calculateRoomAccounting(
  expenses: AccountingExpense[],
  settlements: AccountingSettlement[],
  members: AccountingMember[] = []
): AccountingResult {
  const memberMap = new Map<string, AccountingMember>();
  const paidMap = new Map<string, number>();
  const shareMap = new Map<string, number>();
  const grossDebts = new Map<string, number>();

  const ensureMember = (member: AccountingMember): void => {
    if (!memberMap.has(member.userId)) {
      memberMap.set(member.userId, member);
      paidMap.set(member.userId, 0);
      shareMap.set(member.userId, 0);
    }
  };

  members.forEach(ensureMember);

  for (const expense of expenses) {
    ensureMember({ userId: expense.payerId });
    addToMap(paidMap, expense.payerId, expense.amountPaise);

    for (const participant of expense.participants) {
      ensureMember({ userId: participant.userId });
      addToMap(shareMap, participant.userId, participant.sharePaise);

      // The payer's own share offsets their payment; it is not a debt to
      // themselves. All other shares are debts to the payer.
      if (participant.userId !== expense.payerId && participant.sharePaise > 0) {
        addToMap(grossDebts, pairKey(participant.userId, expense.payerId), participant.sharePaise);
      }
    }
  }

  for (const settlement of settlements) {
    ensureMember({ userId: settlement.debtorId });
    ensureMember({ userId: settlement.receiverId });

    // These two totals preserve the authoritative balance formula and are
    // intentionally updated only for verified settlements.
    addToMap(paidMap, settlement.debtorId, settlement.amountPaise);
    addToMap(shareMap, settlement.receiverId, settlement.amountPaise);

    // A verified repayment reduces the debtor -> receiver debt.
    addToMap(grossDebts, pairKey(settlement.debtorId, settlement.receiverId), -settlement.amountPaise);
  }

  const bilateralDebts = new Map<string, number>();
  const userIds = Array.from(memberMap.keys());
  for (let i = 0; i < userIds.length; i += 1) {
    for (let j = i + 1; j < userIds.length; j += 1) {
      const userA = userIds[i];
      const userB = userIds[j];
      const aToB = grossDebts.get(pairKey(userA, userB)) || 0;
      const bToA = grossDebts.get(pairKey(userB, userA)) || 0;
      const netAtoB = aToB - bToA;

      if (netAtoB > 0) {
        bilateralDebts.set(pairKey(userA, userB), netAtoB);
      } else if (netAtoB < 0) {
        bilateralDebts.set(pairKey(userB, userA), -netAtoB);
      }
    }
  }

  const balances = Array.from(memberMap.values()).map((member) => {
    const totalPaidPaise = paidMap.get(member.userId) || 0;
    const totalSharePaise = shareMap.get(member.userId) || 0;
    return {
      ...member,
      netBalancePaise: totalPaidPaise - totalSharePaise,
      totalPaidPaise,
      totalSharePaise,
    };
  });

  return { balances, bilateralDebts };
}

export function getSignedBilateralDebt(
  accounting: AccountingResult,
  debtorId: string,
  receiverId: string
): number {
  return (
    (accounting.bilateralDebts.get(pairKey(debtorId, receiverId)) || 0) -
    (accounting.bilateralDebts.get(pairKey(receiverId, debtorId)) || 0)
  );
}
