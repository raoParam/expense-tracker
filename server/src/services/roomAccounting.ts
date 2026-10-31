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
 * Create transfers from the canonical net balances.
 *
 * The search below is the standard minimum-transaction debt-settlement DFS.
 * It is exponential in the number of non-zero members, so it is intended for
 * room-sized groups rather than unbounded financial ledgers. For a given set
 * of integer balances it finds a global minimum transfer count. Candidate
 * ordering and the final comparison use stable user IDs, making ties
 * deterministic. All amounts remain integer paise.
 */
export function calculateSuggestedTransfers(accounting: AccountingResult): SuggestedTransfer[] {
  const participants = accounting.balances
    .filter((balance) => balance.netBalancePaise !== 0)
    .map((balance) => ({
      userId: balance.userId,
      displayName: balance.displayName,
      amountPaise: balance.netBalancePaise,
    }))
    .sort((a, b) => b.amountPaise - a.amountPaise || a.userId.localeCompare(b.userId));

  const working = participants.map((participant) => participant.amountPaise);
  let best: SuggestedTransfer[] | undefined;

  const compareTransfers = (left: SuggestedTransfer[], right: SuggestedTransfer[]): number => {
    const leftKey = left.map((t) => `${t.fromUserId}\u0000${t.toUserId}\u0000${t.amountPaise}`).join('\u0001');
    const rightKey = right.map((t) => `${t.fromUserId}\u0000${t.toUserId}\u0000${t.amountPaise}`).join('\u0001');
    return leftKey.localeCompare(rightKey);
  };

  const search = (startIndex: number, transfers: SuggestedTransfer[]): void => {
    while (startIndex < working.length && working[startIndex] === 0) startIndex += 1;
    if (startIndex === working.length) {
      if (!best || transfers.length < best.length ||
          (transfers.length === best.length && compareTransfers(transfers, best) < 0)) {
        best = transfers.map((transfer) => ({ ...transfer }));
      }
      return;
    }

    // Explore equal-depth branches as well so the stable user-ID tie-breaker
    // selects the same minimum solution regardless of candidate discovery
    // order.
    if (best && transfers.length > best.length) return;

    const current = working[startIndex];
    const candidates = participants
      .map((participant, index) => ({ participant, index, amount: working[index] }))
      .filter(({ index, amount }) => index > startIndex && amount !== 0 &&
        ((current < 0 && amount > 0) || (current > 0 && amount < 0)))
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount) ||
        a.participant.userId.localeCompare(b.participant.userId));

    for (const candidate of candidates) {
      const transferAmount = Math.min(Math.abs(current), Math.abs(candidate.amount));
      const fromUserId = current < 0 ? participants[startIndex].userId : candidate.participant.userId;
      const toUserId = current < 0 ? candidate.participant.userId : participants[startIndex].userId;
      const fromDisplayName = current < 0 ? participants[startIndex].displayName : candidate.participant.displayName;
      const toDisplayName = current < 0 ? candidate.participant.displayName : participants[startIndex].displayName;

      working[startIndex] += current < 0 ? transferAmount : -transferAmount;
      working[candidate.index] += candidate.amount < 0 ? transferAmount : -transferAmount;
      search(working[startIndex] === 0 ? startIndex + 1 : startIndex, [...transfers, {
        fromUserId,
        fromDisplayName,
        toUserId,
        toDisplayName,
        amountPaise: transferAmount,
        currency: 'INR',
      }]);
      working[startIndex] = current;
      working[candidate.index] = candidate.amount;
    }
  };

  search(0, []);
  return best || [];
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
