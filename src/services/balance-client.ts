import { apiRequest } from './api-client';

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
  verifiedSettlementsCount?: number;
  currency: 'INR';
}

export interface SuggestedSettlementsResult {
  roomId: string;
  suggestedTransfers: SuggestedTransfer[];
}

export const BalanceClientService = {
  /**
   * Fetch authoritative room balances
   */
  async getRoomBalances(roomId: string): Promise<RoomBalancesResult> {
    return apiRequest<RoomBalancesResult>(`/rooms/${roomId}/balances`, {
      method: 'GET',
    });
  },

  /**
   * Fetch suggested debt simplification transfers
   */
  async getSuggestedSettlements(roomId: string): Promise<SuggestedSettlementsResult> {
    return apiRequest<SuggestedSettlementsResult>(`/rooms/${roomId}/suggested-settlements`, {
      method: 'GET',
    });
  },

  /**
   * Fetch bilateral debts for room members
   */
  async getRoomBilateralDebts(roomId: string): Promise<BilateralDebtInfo[]> {
    const res = await apiRequest<{ debts: BilateralDebtInfo[] }>(
      `/rooms/${roomId}/bilateral-debts`,
      {
        method: 'GET',
      }
    );
    return res.debts;
  },
};
