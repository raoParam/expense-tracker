import { apiRequest } from './api-client';
import { SplitType } from '../domain/split';

export interface SharedExpenseParticipant {
  userId: string;
  displayName?: string;
  email?: string;
  sharePaise: number;
  status: 'pending' | 'acknowledged' | 'rejected';
  acknowledgedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
}

export interface SharedExpense {
  _id: string;
  roomId: string;
  payerId: string;
  title: string;
  description?: string;
  amountPaise: number;
  currency: 'INR';
  splitType: SplitType;
  splitInputs?: any[];
  participants: SharedExpenseParticipant[];
  status: 'pending' | 'confirmed' | 'rejected' | 'cancelled';
  revision: number;
  createdAt: string;
  updatedAt: string;
  confirmedAt?: string;
  cancelledAt?: string;
}

export interface CreateExpensePayload {
  title?: string;
  description?: string;
  amountPaise: number;
  splitType: SplitType;
  participants: {
    userId: string;
    sharePaise?: number;
    percentage?: number;
    quantity?: number;
    unitPricePaise?: number;
  }[];
  idempotencyKey?: string;
}

export interface ResubmitExpensePayload {
  expectedRevision: number;
  title?: string;
  description?: string;
  amountPaise?: number;
  splitType?: SplitType;
  participants?: {
    userId: string;
    sharePaise?: number;
    percentage?: number;
    quantity?: number;
    unitPricePaise?: number;
  }[];
}

export const ExpenseClientService = {
  /**
   * Create a new shared expense in a room
   */
  async createExpense(roomId: string, payload: CreateExpensePayload): Promise<SharedExpense> {
    const res = await apiRequest<{ message: string; expense: SharedExpense }>(
      `/rooms/${roomId}/expenses`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
    return res.expense;
  },

  /**
   * List expenses for a room
   */
  async listRoomExpenses(roomId: string, status?: string): Promise<SharedExpense[]> {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    const res = await apiRequest<{ count: number; expenses: SharedExpense[] }>(
      `/rooms/${roomId}/expenses${query}`,
      {
        method: 'GET',
      }
    );
    return res.expenses;
  },

  /**
   * Get expense details by ID
   */
  async getExpenseById(expenseId: string): Promise<SharedExpense> {
    const res = await apiRequest<{ expense: SharedExpense }>(`/expenses/${expenseId}`, {
      method: 'GET',
    });
    return res.expense;
  },

  /**
   * Acknowledge an expense share
   */
  async acknowledgeExpense(expenseId: string, expectedRevision: number): Promise<SharedExpense> {
    const res = await apiRequest<{ message: string; expense: SharedExpense }>(
      `/expenses/${expenseId}/acknowledge`,
      {
        method: 'POST',
        body: JSON.stringify({ expectedRevision }),
      }
    );
    return res.expense;
  },

  /**
   * Reject an expense share with a reason
   */
  async rejectExpense(
    expenseId: string,
    expectedRevision: number,
    reason: string
  ): Promise<SharedExpense> {
    const res = await apiRequest<{ message: string; expense: SharedExpense }>(
      `/expenses/${expenseId}/reject`,
      {
        method: 'POST',
        body: JSON.stringify({ expectedRevision, reason }),
      }
    );
    return res.expense;
  },

  /**
   * Resubmit a rejected/corrected expense (payer only)
   */
  async resubmitExpense(
    expenseId: string,
    payload: ResubmitExpensePayload
  ): Promise<SharedExpense> {
    const res = await apiRequest<{ message: string; expense: SharedExpense }>(
      `/expenses/${expenseId}/resubmit`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
    return res.expense;
  },

  /**
   * Cancel an expense (payer only)
   */
  async cancelExpense(expenseId: string): Promise<SharedExpense> {
    const res = await apiRequest<{ message: string; expense: SharedExpense }>(
      `/expenses/${expenseId}/cancel`,
      {
        method: 'POST',
      }
    );
    return res.expense;
  },
};
