import { apiRequest } from './api-client';

export type SettlementStatus = 'pending' | 'verified' | 'rejected' | 'cancelled';

export interface SettlementModel {
  _id: string;
  roomId: string;
  debtorId: string;
  receiverId: string;
  amountPaise: number;
  currency: 'INR';
  status: SettlementStatus;
  rejectionReason?: string;
  idempotencyKey?: string;
  createdAt: string;
  updatedAt: string;
  verifiedAt?: string;
  rejectedAt?: string;
  cancelledAt?: string;
  edgeId?: string;
}

export interface CreateSettlementPayload {
  receiverId: string;
  amountPaise: number;
  edgeId?: string;
  idempotencyKey?: string;
}

export const SettlementClientService = {
  /**
   * Fetch all settlements for a room
   */
  async listRoomSettlements(roomId: string): Promise<SettlementModel[]> {
    const res = await apiRequest<{ count: number; settlements: SettlementModel[] }>(
      `/rooms/${roomId}/settlements`,
      {
        method: 'GET',
      }
    );
    return res.settlements;
  },

  /**
   * Create a repayment settlement request by the debtor
   */
  async createSettlement(
    roomId: string,
    payload: CreateSettlementPayload
  ): Promise<SettlementModel> {
    const res = await apiRequest<{ message: string; settlement: SettlementModel }>(
      `/rooms/${roomId}/settlements`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
    return res.settlement;
  },

  /**
   * Fetch single settlement by ID
   */
  async getSettlement(settlementId: string): Promise<SettlementModel> {
    const res = await apiRequest<{ settlement: SettlementModel }>(
      `/settlements/${settlementId}`,
      {
        method: 'GET',
      }
    );
    return res.settlement;
  },

  /**
   * Recipient verifies repayment request
   */
  async verifySettlement(settlementId: string): Promise<SettlementModel> {
    const res = await apiRequest<{ message: string; settlement: SettlementModel }>(
      `/settlements/${settlementId}/verify`,
      {
        method: 'POST',
      }
    );
    return res.settlement;
  },

  /**
   * Recipient rejects repayment request with mandatory reason
   */
  async rejectSettlement(settlementId: string, reason: string): Promise<SettlementModel> {
    const res = await apiRequest<{ message: string; settlement: SettlementModel }>(
      `/settlements/${settlementId}/reject`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }
    );
    return res.settlement;
  },

  /**
   * Debtor cancels their pending settlement request
   */
  async cancelSettlement(settlementId: string): Promise<SettlementModel> {
    const res = await apiRequest<{ message: string; settlement: SettlementModel }>(
      `/settlements/${settlementId}/cancel`,
      {
        method: 'POST',
      }
    );
    return res.settlement;
  },
};
