import { ExpenseClientService } from '../src/services/expense-client';
import { BalanceClientService } from '../src/services/balance-client';
import * as apiClient from '../src/services/api-client';

jest.mock('../src/services/api-client');

describe('ExpenseClientService & BalanceClientService', () => {
  const mockApiRequest = apiClient.apiRequest as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ExpenseClientService', () => {
    test('createExpense calls POST /rooms/:roomId/expenses', async () => {
      const mockCreated = {
        _id: 'exp_123',
        roomId: 'room_456',
        amountPaise: 50000,
        status: 'pending',
      };

      mockApiRequest.mockResolvedValueOnce({ expense: mockCreated });

      const payload = {
        title: 'Dinner',
        amountPaise: 50000,
        splitType: 'equal' as const,
        participants: [{ userId: 'user_1' }, { userId: 'user_2' }],
      };

      const result = await ExpenseClientService.createExpense('room_456', payload);

      expect(mockApiRequest).toHaveBeenCalledWith('/rooms/room_456/expenses', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      expect(result).toEqual(mockCreated);
    });

    test('listRoomExpenses calls GET /rooms/:roomId/expenses', async () => {
      const mockList = [{ _id: 'exp_123', amountPaise: 50000 }];
      mockApiRequest.mockResolvedValueOnce({ count: 1, expenses: mockList });

      const result = await ExpenseClientService.listRoomExpenses('room_456');

      expect(mockApiRequest).toHaveBeenCalledWith('/rooms/room_456/expenses', {
        method: 'GET',
      });
      expect(result).toEqual(mockList);
    });

    test('acknowledgeExpense calls POST /expenses/:expenseId/acknowledge', async () => {
      const mockUpdated = { _id: 'exp_123', status: 'confirmed' };
      mockApiRequest.mockResolvedValueOnce({ expense: mockUpdated });

      const result = await ExpenseClientService.acknowledgeExpense('exp_123', 1);

      expect(mockApiRequest).toHaveBeenCalledWith('/expenses/exp_123/acknowledge', {
        method: 'POST',
        body: JSON.stringify({ expectedRevision: 1 }),
      });
      expect(result).toEqual(mockUpdated);
    });

    test('rejectExpense calls POST /expenses/:expenseId/reject', async () => {
      const mockUpdated = { _id: 'exp_123', status: 'pending' };
      mockApiRequest.mockResolvedValueOnce({ expense: mockUpdated });

      const result = await ExpenseClientService.rejectExpense('exp_123', 1, 'Wrong amount');

      expect(mockApiRequest).toHaveBeenCalledWith('/expenses/exp_123/reject', {
        method: 'POST',
        body: JSON.stringify({ expectedRevision: 1, reason: 'Wrong amount' }),
      });
      expect(result).toEqual(mockUpdated);
    });

    test('cancelExpense calls POST /expenses/:expenseId/cancel', async () => {
      const mockCancelled = { _id: 'exp_123', status: 'cancelled' };
      mockApiRequest.mockResolvedValueOnce({ expense: mockCancelled });

      const result = await ExpenseClientService.cancelExpense('exp_123');

      expect(mockApiRequest).toHaveBeenCalledWith('/expenses/exp_123/cancel', {
        method: 'POST',
      });
      expect(result).toEqual(mockCancelled);
    });

    test('resubmitExpense calls POST /expenses/:expenseId/resubmit with corrected split and revision', async () => {
      const mockResubmitted = { _id: 'exp_123', revision: 2, status: 'pending', amountPaise: 55000 };
      mockApiRequest.mockResolvedValueOnce({ expense: mockResubmitted });

      const payload = {
        expectedRevision: 1,
        title: 'Dinner Updated',
        amountPaise: 55000,
        splitType: 'custom' as const,
        participants: [
          { userId: 'user_1', sharePaise: 30000 },
          { userId: 'user_2', sharePaise: 25000 },
        ],
      };

      const result = await ExpenseClientService.resubmitExpense('exp_123', payload);

      expect(mockApiRequest).toHaveBeenCalledWith('/expenses/exp_123/resubmit', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      expect(result).toEqual(mockResubmitted);
    });
  });

  describe('BalanceClientService', () => {
    test('getRoomBalances calls GET /rooms/:roomId/balances', async () => {
      const mockBalances = {
        roomId: 'room_456',
        balances: [{ userId: 'user_1', netBalancePaise: 25000 }],
      };
      mockApiRequest.mockResolvedValueOnce(mockBalances);

      const result = await BalanceClientService.getRoomBalances('room_456');

      expect(mockApiRequest).toHaveBeenCalledWith('/rooms/room_456/balances', {
        method: 'GET',
      });
      expect(result).toEqual(mockBalances);
    });

    test('getSuggestedSettlements calls GET /rooms/:roomId/suggested-settlements', async () => {
      const mockSettlements = {
        roomId: 'room_456',
        suggestedTransfers: [{ fromUserId: 'u2', toUserId: 'u1', amountPaise: 25000 }],
      };
      mockApiRequest.mockResolvedValueOnce(mockSettlements);

      const result = await BalanceClientService.getSuggestedSettlements('room_456');

      expect(mockApiRequest).toHaveBeenCalledWith('/rooms/room_456/suggested-settlements', {
        method: 'GET',
      });
      expect(result).toEqual(mockSettlements);
    });
  });
});
