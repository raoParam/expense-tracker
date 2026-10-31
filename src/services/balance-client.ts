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
  edgeId?: string;
  fromUserId: string;
  fromDisplayName?: string;
  toUserId: string;
  toDisplayName?: string;
  amountPaise: number;
  currency: 'INR';
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

};
