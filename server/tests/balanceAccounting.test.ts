import mongoose from 'mongoose';
import { BalanceService } from '../src/services/balanceService';
import { Expense } from '../src/models/Expense';
import { Settlement } from '../src/models/Settlement';
import { Room } from '../src/models/Room';
import {
  calculateRoomAccounting,
  calculateSuggestedTransfers,
} from '../src/services/roomAccounting';

jest.mock('../src/models/Expense');
jest.mock('../src/models/Settlement');
jest.mock('../src/models/Room');

describe('canonical shared-room net-balance accounting', () => {
  const roomId = '507f1f77bcf86cd799439011';
  const roomObjectId = new mongoose.Types.ObjectId(roomId);
  const members = [
    { userId: 'zeno', displayName: 'ZENO', role: 'member' as const, joinedAt: new Date(), status: 'active' as const },
    { userId: 'param', displayName: 'Param', role: 'member' as const, joinedAt: new Date(), status: 'active' as const },
    { userId: 'prince', displayName: 'Prince', role: 'admin' as const, joinedAt: new Date(), status: 'active' as const },
  ];

  const exampleExpenses = [
    {
      payerId: 'zeno',
      amountPaise: 10000,
      status: 'confirmed',
      participants: [
        { userId: 'zeno', sharePaise: 5000 },
        { userId: 'param', sharePaise: 5000 },
      ],
    },
    {
      payerId: 'param',
      amountPaise: 22000,
      status: 'confirmed',
      participants: [
        { userId: 'zeno', sharePaise: 5000 },
        { userId: 'param', sharePaise: 10000 },
        { userId: 'prince', sharePaise: 7000 },
      ],
    },
    {
      payerId: 'prince',
      amountPaise: 15000,
      status: 'confirmed',
      participants: [
        { userId: 'zeno', sharePaise: 5000 },
        { userId: 'param', sharePaise: 6000 },
        { userId: 'prince', sharePaise: 4000 },
      ],
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (Room.findById as jest.Mock).mockResolvedValue({
      _id: roomObjectId,
      members,
      status: 'active',
    });
    (Expense.find as jest.Mock).mockResolvedValue(exampleExpenses);
    (Settlement.find as jest.Mock).mockResolvedValue([]);
  });

  test('calculates ZENO -₹50, Param +₹10, and Prince +₹40', async () => {
    const result = await BalanceService.getRoomBalances('zeno', roomId);
    const byUser = new Map(result.balances.map((balance) => [balance.userId, balance.netBalancePaise]));

    expect(byUser).toEqual(new Map([
      ['zeno', -5000],
      ['param', 1000],
      ['prince', 4000],
    ]));
    expect(Array.from(byUser.values()).reduce((sum, amount) => sum + amount, 0)).toBe(0);
  });

  test('generates ZENO → Prince ₹40 and ZENO → Param ₹10 from those balances', async () => {
    const result = await BalanceService.getSuggestedSettlements('zeno', roomId);

    expect(result.suggestedTransfers).toEqual([
      expect.objectContaining({ fromUserId: 'zeno', toUserId: 'prince', amountPaise: 4000 }),
      expect.objectContaining({ fromUserId: 'zeno', toUserId: 'param', amountPaise: 1000 }),
    ]);
  });

  test('uses the same canonical transfer for Settle Up authorization lookup', async () => {
    const transfer = await BalanceService.getSuggestedTransfer('zeno', roomId, 'zeno', 'prince');
    const nonDebtorTransfer = await BalanceService.getSuggestedTransfer('param', roomId, 'param', 'zeno');

    expect(transfer).toEqual(expect.objectContaining({ fromUserId: 'zeno', toUserId: 'prince', amountPaise: 4000 }));
    expect(nonDebtorTransfer).toBeUndefined();
  });

  test('pending, rejected, and cancelled settlements do not change balances', async () => {
    for (const status of ['pending', 'rejected', 'cancelled']) {
      (Settlement.find as jest.Mock).mockResolvedValueOnce([
        { debtorId: 'zeno', receiverId: 'prince', amountPaise: 4000, status },
      ]);
      const result = await BalanceService.getRoomBalances('zeno', roomId);
      const byUser = new Map(result.balances.map((balance) => [balance.userId, balance.netBalancePaise]));
      expect(byUser.get('zeno')).toBe(-5000);
      expect(byUser.get('prince')).toBe(4000);
    }
  });

  test('a verified historical settlement changes balances and suggestions, without rewriting expenses', async () => {
    (Settlement.find as jest.Mock).mockResolvedValue([
      { debtorId: 'zeno', receiverId: 'prince', amountPaise: 4000, status: 'verified' },
    ]);

    const balances = await BalanceService.getRoomBalances('zeno', roomId);
    const byUser = new Map(balances.balances.map((balance) => [balance.userId, balance.netBalancePaise]));
    expect(byUser.get('zeno')).toBe(-1000);
    expect(byUser.get('param')).toBe(1000);
    expect(byUser.get('prince')).toBe(0);

    const suggestions = await BalanceService.getSuggestedSettlements('zeno', roomId);
    expect(suggestions.suggestedTransfers).toEqual([
      expect.objectContaining({ fromUserId: 'zeno', toUserId: 'param', amountPaise: 1000 }),
    ]);
  });

  test('repeated expenses are summed before transfer projection', () => {
    const accounting = calculateRoomAccounting(
      [
        { payerId: 'param', amountPaise: 1200, participants: [{ userId: 'zeno', sharePaise: 1200 }] },
        { payerId: 'param', amountPaise: 1800, participants: [{ userId: 'zeno', sharePaise: 1800 }] },
      ],
      [],
      members
    );

    expect(accounting.balances.find((balance) => balance.userId === 'zeno')?.netBalancePaise).toBe(-3000);
    expect(calculateSuggestedTransfers(accounting)).toEqual([
      expect.objectContaining({ fromUserId: 'zeno', toUserId: 'param', amountPaise: 3000 }),
    ]);
  });
});
