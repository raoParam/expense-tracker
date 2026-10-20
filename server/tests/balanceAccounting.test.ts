import mongoose from 'mongoose';
import { BalanceService } from '../src/services/balanceService';
import { Expense } from '../src/models/Expense';
import { Settlement } from '../src/models/Settlement';
import { Room } from '../src/models/Room';
import { calculateRoomAccounting } from '../src/services/roomAccounting';

jest.mock('../src/models/Expense');
jest.mock('../src/models/Settlement');
jest.mock('../src/models/Room');

describe('shared-room accounting and settlement directions', () => {
  const roomId = '507f1f77bcf86cd799439011';
  const roomObjectId = new mongoose.Types.ObjectId(roomId);
  const members = [
    ['dev', 'Dev'],
    ['het', 'Het'],
    ['kirtan', 'Kirtan'],
    ['zeno', 'ZENO'],
    ['prince', 'Prince'],
    ['param', 'Param Rao'],
    ['you', 'You'],
  ].map(([userId, displayName]) => ({
    userId,
    displayName,
    role: userId === 'prince' ? ('admin' as const) : ('member' as const),
    joinedAt: new Date(),
    status: 'active' as const,
  }));

  // This fixture models the verified screenshot outputs without treating
  // simplified transfers as persisted records.
  const confirmedExpenses = [
    { payerId: 'prince', amountPaise: 5400, participants: [{ userId: 'prince', sharePaise: 0 }, { userId: 'het', sharePaise: 5400 }] },
    { payerId: 'prince', amountPaise: 5250, participants: [{ userId: 'prince', sharePaise: 0 }, { userId: 'kirtan', sharePaise: 5250 }] },
    { payerId: 'prince', amountPaise: 4700, participants: [{ userId: 'prince', sharePaise: 0 }, { userId: 'zeno', sharePaise: 4700 }] },
    { payerId: 'prince', amountPaise: 1200, participants: [{ userId: 'prince', sharePaise: 0 }, { userId: 'dev', sharePaise: 1200 }] },
    { payerId: 'param', amountPaise: 3600, participants: [{ userId: 'param', sharePaise: 1800 }, { userId: 'dev', sharePaise: 1800 }] },
    { payerId: 'you', amountPaise: 13000, participants: [{ userId: 'you', sharePaise: 6500 }, { userId: 'prince', sharePaise: 6500 }] },
  ];

  const pendingSettlement = {
    roomId: roomObjectId,
    debtorId: 'het',
    receiverId: 'prince',
    amountPaise: 5400,
    status: 'pending',
  };
  const verifiedSettlement = {
    roomId: roomObjectId,
    debtorId: 'prince',
    receiverId: 'you',
    amountPaise: 6500,
    status: 'verified',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (Room.findById as jest.Mock).mockResolvedValue({
      _id: roomObjectId,
      members,
      status: 'active',
    });
    (Expense.find as jest.Mock).mockImplementation((query: { status?: string }) =>
      Promise.resolve(
        query.status === 'confirmed'
          ? confirmedExpenses
          : confirmedExpenses.map((expense) => ({ ...expense, status: 'confirmed' })).concat([
              { payerId: 'ignored', amountPaise: 99900, participants: [], status: 'pending' },
            ])
      )
    );
    (Settlement.find as jest.Mock).mockImplementation((query: { status?: string }) =>
      Promise.resolve(
        query.status === 'verified'
          ? [verifiedSettlement]
          : [pendingSettlement, verifiedSettlement]
      )
    );
  });

  test('keeps direct bilateral debts distinct from the simplified transfers', async () => {
    const directDebts = await BalanceService.getRoomBilateralDebts('dev', roomId);

    expect(directDebts).toEqual(expect.arrayContaining([
      expect.objectContaining({ debtorId: 'dev', receiverId: 'param', amountPaise: 1800 }),
      expect.objectContaining({ debtorId: 'dev', receiverId: 'prince', amountPaise: 1200 }),
      expect.objectContaining({ debtorId: 'het', receiverId: 'prince', amountPaise: 5400 }),
    ]));
    expect(directDebts).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ debtorId: 'prince', receiverId: 'you', amountPaise: 6500 }),
    ]));

    const suggested = await BalanceService.getSuggestedSettlements('dev', roomId);
    expect(suggested.suggestedTransfers).toEqual([
      expect.objectContaining({ fromUserId: 'het', toUserId: 'prince', amountPaise: 5400 }),
      expect.objectContaining({ fromUserId: 'kirtan', toUserId: 'prince', amountPaise: 5250 }),
      expect.objectContaining({ fromUserId: 'zeno', toUserId: 'prince', amountPaise: 4700 }),
      expect.objectContaining({ fromUserId: 'dev', toUserId: 'prince', amountPaise: 1200 }),
      expect.objectContaining({ fromUserId: 'dev', toUserId: 'param', amountPaise: 1800 }),
    ]);
  });

  test('uses verified settlement direction and ignores pending settlements in balances', async () => {
    const balances = await BalanceService.getRoomBalances('dev', roomId);
    const byUser = new Map(balances.balances.map((balance) => [balance.userId, balance.netBalancePaise]));

    expect(byUser.get('dev')).toBe(-3000);
    expect(byUser.get('param')).toBe(1800);
    expect(byUser.get('prince')).toBe(16550);
    expect(byUser.get('you')).toBe(0);
    expect(balances.verifiedSettlementsCount).toBe(1);
    expect(Array.from(byUser.values()).reduce((sum, value) => sum + value, 0)).toBe(0);
  });

  test('authenticated debtor direction is signed correctly for settlement authorization', async () => {
    expect(await BalanceService.computeBilateralDebt(roomObjectId, 'dev', 'param')).toBe(1800);
    expect(await BalanceService.computeBilateralDebt(roomObjectId, 'param', 'dev')).toBe(-1800);
    expect(await BalanceService.computeBilateralDebt(roomObjectId, 'het', 'prince')).toBe(5400);
    expect(await BalanceService.computeBilateralDebt(roomObjectId, 'prince', 'het')).toBe(-5400);
  });

  test('reduces the matching debt for a partial verified payment across multiple expenses', () => {
    const accounting = calculateRoomAccounting(
      [
        {
          payerId: 'param',
          amountPaise: 1200,
          participants: [{ userId: 'dev', sharePaise: 1200 }],
        },
        {
          payerId: 'param',
          amountPaise: 1800,
          participants: [{ userId: 'dev', sharePaise: 1800 }],
        },
      ],
      [{ debtorId: 'dev', receiverId: 'param', amountPaise: 1000 }]
    );

    expect(accounting.bilateralDebts.get('dev\u0000param')).toBe(2000);
    expect(accounting.bilateralDebts.get('param\u0000dev')).toBeUndefined();
  });

  test('pending, rejected, and cancelled settlements do not reduce debt', async () => {
    const expenses = [
      {
        payerId: 'param',
        amountPaise: 1800,
        participants: [{ userId: 'dev', sharePaise: 1800 }],
      },
    ];

    const results: number[] = [];
    for (const status of ['pending', 'rejected', 'cancelled', 'verified']) {
      (Expense.find as jest.Mock).mockResolvedValueOnce(expenses);
      (Settlement.find as jest.Mock).mockResolvedValueOnce(
        status === 'verified'
          ? [{ debtorId: 'dev', receiverId: 'param', amountPaise: 1800 }]
          : []
      );
      results.push(await BalanceService.computeBilateralDebt(roomObjectId, 'dev', 'param'));
    }

    expect(results).toEqual([1800, 1800, 1800, 0]);
  });

  test('a verified payment without an underlying liability cannot fabricate a reverse debt', () => {
    const accounting = calculateRoomAccounting(
      [],
      [{ debtorId: 'prince', receiverId: 'param', amountPaise: 6500 }]
    );

    expect(accounting.bilateralDebts.get('prince\u0000param')).toBeUndefined();
    expect(accounting.bilateralDebts.get('param\u0000prince')).toBeUndefined();
  });

  test('applies the Prince to Param verified ₹65 payment in its recorded direction', () => {
    const accounting = calculateRoomAccounting(
      [
        {
          payerId: 'param',
          amountPaise: 10000,
          participants: [{ userId: 'prince', sharePaise: 10000 }],
        },
      ],
      [{ debtorId: 'prince', receiverId: 'param', amountPaise: 6500 }]
    );

    expect(accounting.bilateralDebts.get('prince\u0000param')).toBe(3500);
    expect(accounting.bilateralDebts.get('param\u0000prince')).toBeUndefined();
  });
});
