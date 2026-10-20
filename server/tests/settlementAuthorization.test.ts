import mongoose from 'mongoose';
import { SettlementService } from '../src/services/settlementService';
import { Settlement } from '../src/models/Settlement';
import { Room } from '../src/models/Room';
import { BalanceService } from '../src/services/balanceService';

jest.mock('../src/models/Settlement');
jest.mock('../src/models/Room');
jest.mock('../src/models/AuditEvent');
jest.mock('../src/services/balanceService');
jest.mock('../src/services/pushNotificationService', () => ({
  PushNotificationService: {
    notifySettlementRequested: jest.fn().mockResolvedValue(undefined),
    notifySettlementVerified: jest.fn().mockResolvedValue(undefined),
    notifySettlementRejected: jest.fn().mockResolvedValue(undefined),
    notifySettlementCancelled: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('settlement authorization and direction', () => {
  const roomId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439011');
  const members = [
    { userId: 'dev', status: 'active', displayName: 'Dev' },
    { userId: 'param', status: 'active', displayName: 'Param Rao' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (Room.findById as jest.Mock).mockResolvedValue({ _id: roomId, name: 'Room', members });
    (Settlement.findOne as jest.Mock).mockResolvedValue(null);
  });

  test('cannot create a settlement for the reverse direction of Dev’s net debt', async () => {
    // Param is the creditor; Param cannot initiate a transfer to Dev.
    (BalanceService.getSuggestedTransfer as jest.Mock).mockResolvedValue(undefined);

    await expect(
      SettlementService.createSettlement('param', roomId.toString(), {
        receiverId: 'dev',
        amountPaise: 1800,
      })
    ).rejects.toMatchObject({ code: 'NO_OUTSTANDING_NET_TRANSFER' });
  });

  test('rejects a settlement that overpays the current canonical transfer', async () => {
    (BalanceService.getSuggestedTransfer as jest.Mock).mockResolvedValue({
      fromUserId: 'dev',
      toUserId: 'param',
      amountPaise: 1800,
    });

    await expect(
      SettlementService.createSettlement('dev', roomId.toString(), {
        receiverId: 'param',
        amountPaise: 1801,
      })
    ).rejects.toMatchObject({ code: 'INVALID_SETTLEMENT_AMOUNT' });
  });

  test('only the named receiver can verify Het’s pending repayment', async () => {
    (Settlement.findById as jest.Mock).mockResolvedValue({
      _id: new mongoose.Types.ObjectId(),
      roomId,
      debtorId: 'het',
      receiverId: 'prince',
      amountPaise: 5400,
      status: 'pending',
    });

    await expect(
      SettlementService.verifySettlement('dev', '507f1f77bcf86cd799439099')
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(BalanceService.getSuggestedTransfer).not.toHaveBeenCalled();
  });

  test('verification rejects a changed amount instead of partially settling it', async () => {
    const settlement = {
      _id: new mongoose.Types.ObjectId(),
      roomId,
      debtorId: 'dev',
      receiverId: 'param',
      amountPaise: 1800,
      status: 'pending',
    };
    (Settlement.findById as jest.Mock).mockResolvedValue(settlement);
    (BalanceService.getSuggestedTransfer as jest.Mock).mockResolvedValue({
      fromUserId: 'dev',
      toUserId: 'param',
      amountPaise: 3600,
    });

    await expect(
      SettlementService.verifySettlement('param', '507f1f77bcf86cd799439099')
    ).rejects.toMatchObject({ code: 'INVALID_SETTLEMENT_STATE' });
    expect(Settlement.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('does not complete a settlement when the atomic pending-state update loses a race', async () => {
    const settlement = {
      _id: new mongoose.Types.ObjectId(),
      roomId,
      debtorId: 'dev',
      receiverId: 'param',
      amountPaise: 1800,
      status: 'pending',
    };
    (Settlement.findById as jest.Mock).mockResolvedValue(settlement);
    (BalanceService.getSuggestedTransfer as jest.Mock).mockResolvedValue({
      fromUserId: 'dev',
      toUserId: 'param',
      amountPaise: 1800,
    });
    (Settlement.findOneAndUpdate as jest.Mock).mockResolvedValue(null);

    await expect(
      SettlementService.verifySettlement('param', '507f1f77bcf86cd799439099')
    ).rejects.toMatchObject({ code: 'INVALID_SETTLEMENT_STATE' });
  });
});
