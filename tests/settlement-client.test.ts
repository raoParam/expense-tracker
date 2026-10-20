import { SettlementClientService } from '../src/services/settlement-client';
import { BalanceClientService } from '../src/services/balance-client';
import * as apiClient from '../src/services/api-client';

jest.mock('../src/services/api-client');

describe('SettlementClientService and canonical balance transfers', () => {
  const mockApiRequest = apiClient.apiRequest as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('SettlementClientService', () => {
    test('createSettlement calls POST /rooms/:roomId/settlements with full debt', async () => {
      const mockCreated = {
        _id: 'settle_123',
        roomId: 'room_456',
        debtorId: 'user_debtor',
        receiverId: 'user_receiver',
        amountPaise: 30000,
        status: 'pending',
      };

      mockApiRequest.mockResolvedValueOnce({ message: 'Success', settlement: mockCreated });

      const payload = {
        receiverId: 'user_receiver',
        amountPaise: 30000,
        idempotencyKey: 'idemp_key_1',
      };

      const result = await SettlementClientService.createSettlement('room_456', payload);

      expect(mockApiRequest).toHaveBeenCalledWith('/rooms/room_456/settlements', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      expect(result).toEqual(mockCreated);
    });

    test('listRoomSettlements calls GET /rooms/:roomId/settlements', async () => {
      const mockList = [{ _id: 'settle_123', amountPaise: 30000, status: 'verified' }];
      mockApiRequest.mockResolvedValueOnce({ count: 1, settlements: mockList });

      const result = await SettlementClientService.listRoomSettlements('room_456');

      expect(mockApiRequest).toHaveBeenCalledWith('/rooms/room_456/settlements', {
        method: 'GET',
      });
      expect(result).toEqual(mockList);
    });

    test('getSettlement calls GET /settlements/:settlementId', async () => {
      const mockSettlement = { _id: 'settle_123', amountPaise: 30000 };
      mockApiRequest.mockResolvedValueOnce({ settlement: mockSettlement });

      const result = await SettlementClientService.getSettlement('settle_123');

      expect(mockApiRequest).toHaveBeenCalledWith('/settlements/settle_123', {
        method: 'GET',
      });
      expect(result).toEqual(mockSettlement);
    });

    test('verifySettlement calls POST /settlements/:settlementId/verify', async () => {
      const mockVerified = { _id: 'settle_123', status: 'verified' };
      mockApiRequest.mockResolvedValueOnce({ message: 'Success', settlement: mockVerified });

      const result = await SettlementClientService.verifySettlement('settle_123');

      expect(mockApiRequest).toHaveBeenCalledWith('/settlements/settle_123/verify', {
        method: 'POST',
      });
      expect(result).toEqual(mockVerified);
    });

    test('rejectSettlement calls POST /settlements/:settlementId/reject with reason', async () => {
      const mockRejected = { _id: 'settle_123', status: 'rejected', rejectionReason: 'Not received' };
      mockApiRequest.mockResolvedValueOnce({ message: 'Success', settlement: mockRejected });

      const result = await SettlementClientService.rejectSettlement('settle_123', 'Not received');

      expect(mockApiRequest).toHaveBeenCalledWith('/settlements/settle_123/reject', {
        method: 'POST',
        body: JSON.stringify({ reason: 'Not received' }),
      });
      expect(result).toEqual(mockRejected);
    });

    test('cancelSettlement calls POST /settlements/:settlementId/cancel', async () => {
      const mockCancelled = { _id: 'settle_123', status: 'cancelled' };
      mockApiRequest.mockResolvedValueOnce({ message: 'Success', settlement: mockCancelled });

      const result = await SettlementClientService.cancelSettlement('settle_123');

      expect(mockApiRequest).toHaveBeenCalledWith('/settlements/settle_123/cancel', {
        method: 'POST',
      });
      expect(result).toEqual(mockCancelled);
    });
  });

});
