/**
 * Canonical shared-room accounting.
 *
 * Confirmed expenses and verified settlements are the only inputs. Two views
 * are derived from them:
 *  - net balances (what each member is owed or owes the room), which always sum
 *    to zero, and
 *  - per-pair debts (what one member owes one other member), which are what
 *    Settle Up suggests. A settlement only reduces the debt between its own two
 *    members, so settling one pair never changes anyone else's transfers.
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

/** What `fromUserId` currently owes `toUserId`, after netting both directions. */
export interface AccountingDebt {
  fromUserId: string;
  toUserId: string;
  amountPaise: number;
}

export interface AccountingResult {
  balances: AccountingBalance[];
  debts: AccountingDebt[];
}

export interface SuggestedTransfer {
  fromUserId: string;
  fromDisplayName?: string;
  toUserId: string;
  toDisplayName?: string;
  amountPaise: number;
  currency: 'INR';
}

const addToMap = (map: Map<string, number>, key: string, amountPaise: number): void => {
  map.set(key, (map.get(key) || 0) + amountPaise);
};

/**
 * Calculate the authoritative net balance of every ledger participant.
 *
 * netBalance = confirmed expenses paid - confirmed expense shares
 *              + verified settlements paid - verified settlements received
 *
 * A positive balance is owed money by the room. A negative balance owes money
 * to the room. Callers must pass only confirmed expenses and verified
 * settlements; status filtering is deliberately kept at the repository/API
 * boundary so this pure function cannot accidentally include pending records.
 */
export function calculateRoomAccounting(
  expenses: AccountingExpense[],
  settlements: AccountingSettlement[],
  members: AccountingMember[] = []
): AccountingResult {
  const memberMap = new Map<string, AccountingMember>();
  const paidMap = new Map<string, number>();
  const shareMap = new Map<string, number>();
  // owed[debtor][creditor]: what the debtor owes the creditor before netting the opposite direction.
  const owedMap = new Map<string, number>();
  const pairKey = (debtorId: string, creditorId: string) => `${debtorId}\u0000${creditorId}`;

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
      if (participant.userId !== expense.payerId) {
        addToMap(owedMap, pairKey(participant.userId, expense.payerId), participant.sharePaise);
      }
    }
  }

  for (const settlement of settlements) {
    ensureMember({ userId: settlement.debtorId });
    ensureMember({ userId: settlement.receiverId });

    // A verified payment moves the debtor toward zero and reduces the
    // receiver's credit. This is the only settlement effect on balances.
    addToMap(paidMap, settlement.debtorId, settlement.amountPaise);
    addToMap(shareMap, settlement.receiverId, settlement.amountPaise);
    addToMap(owedMap, pairKey(settlement.debtorId, settlement.receiverId), -settlement.amountPaise);
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

  const debts: AccountingDebt[] = [];
  for (const [key, owedPaise] of owedMap) {
    const [fromUserId, toUserId] = key.split('\u0000');
    const mirrorKey = pairKey(toUserId, fromUserId);
    const netPaise = owedPaise - (owedMap.get(mirrorKey) || 0);
    if (netPaise > 0) debts.push({ fromUserId, toUserId, amountPaise: netPaise });
    // An overpaid pair with no opposite entry (legacy data) flips direction.
    else if (netPaise < 0 && !owedMap.has(mirrorKey)) {
      debts.push({ fromUserId: toUserId, toUserId: fromUserId, amountPaise: -netPaise });
    }
  }
  debts.sort(
    (a, b) =>
      b.amountPaise - a.amountPaise ||
      a.fromUserId.localeCompare(b.fromUserId) ||
      a.toUserId.localeCompare(b.toUserId)
  );

  return { balances, debts };
}

/**
 * Suggested transfers are the outstanding per-pair debts. They are the only
 * transfer projection used by both the UI and settlement authorization, and a
 * pair's transfer changes only when that pair's own expenses or settlements do.
 */
export function calculateSuggestedTransfers(accounting: AccountingResult): SuggestedTransfer[] {
  const names = new Map(accounting.balances.map((balance) => [balance.userId, balance.displayName]));
  return accounting.debts.map((debt) => ({
    fromUserId: debt.fromUserId,
    fromDisplayName: names.get(debt.fromUserId),
    toUserId: debt.toUserId,
    toDisplayName: names.get(debt.toUserId),
    amountPaise: debt.amountPaise,
    currency: 'INR' as const,
  }));
}

export function findSuggestedTransfer(
  accounting: AccountingResult,
  fromUserId: string,
  toUserId: string
): SuggestedTransfer | undefined {
  return calculateSuggestedTransfers(accounting).find(
    (transfer) => transfer.fromUserId === fromUserId && transfer.toUserId === toUserId
  );
}
