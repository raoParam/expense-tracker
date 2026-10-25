/**
 * Canonical shared-room accounting.
 *
 * The ledger is intentionally net-balance based. Confirmed expenses and
 * verified settlements are the only inputs. A settlement is an actual payment
 * and changes the debtor's and recipient's net balances; it is never treated
 * as a bilateral expense edge.
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
    }
  }

  for (const settlement of settlements) {
    ensureMember({ userId: settlement.debtorId });
    ensureMember({ userId: settlement.receiverId });

    // A verified payment moves the debtor toward zero and reduces the
    // receiver's credit. This is the only settlement effect on balances.
    addToMap(paidMap, settlement.debtorId, settlement.amountPaise);
    addToMap(shareMap, settlement.receiverId, settlement.amountPaise);
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

  return { balances };
}

/**
 * Create informational/actionable transfers from the canonical net balances.
 * This greedy matching is deterministic and is the only transfer projection
 * used by both the UI and settlement authorization.
 */
export function calculateSuggestedTransfers(accounting: AccountingResult): SuggestedTransfer[] {
  const creditors = accounting.balances
    .filter((balance) => balance.netBalancePaise > 0)
    .map((balance) => ({
      userId: balance.userId,
      displayName: balance.displayName,
      amountPaise: balance.netBalancePaise,
    }))
    .sort((a, b) => b.amountPaise - a.amountPaise || a.userId.localeCompare(b.userId));

  const debtors = accounting.balances
    .filter((balance) => balance.netBalancePaise < 0)
    .map((balance) => ({
      userId: balance.userId,
      displayName: balance.displayName,
      amountPaise: -balance.netBalancePaise,
    }))
    .sort((a, b) => b.amountPaise - a.amountPaise || a.userId.localeCompare(b.userId));

  const suggestedTransfers: SuggestedTransfer[] = [];
  let creditorIndex = 0;
  let debtorIndex = 0;

  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amountPaise = Math.min(creditor.amountPaise, debtor.amountPaise);

    if (amountPaise > 0) {
      suggestedTransfers.push({
        fromUserId: debtor.userId,
        fromDisplayName: debtor.displayName,
        toUserId: creditor.userId,
        toDisplayName: creditor.displayName,
        amountPaise,
        currency: 'INR',
      });
    }

    creditor.amountPaise -= amountPaise;
    debtor.amountPaise -= amountPaise;

    if (creditor.amountPaise === 0) creditorIndex += 1;
    if (debtor.amountPaise === 0) debtorIndex += 1;
  }

  return suggestedTransfers;
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
