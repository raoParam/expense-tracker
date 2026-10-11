import express from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { ExpenseService } from '../src/services/expenseService';
import { BalanceService } from '../src/services/balanceService';
import admin from 'firebase-admin';

// Mock Firebase Admin
jest.mock('firebase-admin', () => {
  const verifyIdTokenMock = jest.fn();
  return {
    apps: [{}],
    initializeApp: jest.fn(),
    credential: {
      cert: jest.fn(),
    },
    auth: () => ({
      verifyIdToken: verifyIdTokenMock,
    }),
    __mockVerifyIdToken: verifyIdTokenMock,
  };
});

// Mock services
jest.mock('../src/services/expenseService');
jest.mock('../src/services/balanceService');

describe('Expense & Balance API Endpoints', () => {
  let app: express.Express;
  const mockAdmin = admin as any;

  const mockUser = {
    uid: 'user_payer_1',
    email: 'payer@hostel.edu',
    name: 'Payer User',
  };

  beforeEach(() => {
    app = createApp();
    jest.clearAllMocks();
    mockAdmin.__mockVerifyIdToken.mockResolvedValue(mockUser);
  });

  describe('POST /api/v1/rooms/:roomId/expenses', () => {
    test('creates shared expense with valid payload', async () => {
      const mockExpense = {
        _id: '607f1f77bcf86cd799439099',
        roomId: '507f1f77bcf86cd799439011',
        payerId: 'user_payer_1',
        title: 'Dinner at Mess',
        amountPaise: 40000,
        splitType: 'equal',
        status: 'pending',
        revision: 1,
        participants: [
          { userId: 'user_payer_1', sharePaise: 20000, status: 'acknowledged' },
          { userId: 'user_peer_2', sharePaise: 20000, status: 'pending' },
        ],
      };

      (ExpenseService.createExpense as jest.Mock).mockResolvedValueOnce(mockExpense);

      const res = await request(app)
        .post('/api/v1/rooms/507f1f77bcf86cd799439011/expenses')
        .set('Authorization', 'Bearer valid-token')
        .send({
          title: 'Dinner at Mess',
          amountPaise: 40000,
          splitType: 'equal',
          participants: [
            { userId: 'user_payer_1' },
            { userId: 'user_peer_2' },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Shared expense created successfully');
      expect(res.body.expense.title).toBe('Dinner at Mess');
      expect(res.body.expense.amountPaise).toBe(40000);
    });

    test('rejects expense creation with amount exceeding maximum ₹99,999,999.99', async () => {
      const res = await request(app)
        .post('/api/v1/rooms/507f1f77bcf86cd799439011/expenses')
        .set('Authorization', 'Bearer valid-token')
        .send({
          title: 'Massive Expense',
          amountPaise: 10000000000, // Exceeds 9,999,999,999
          splitType: 'equal',
          participants: [
            { userId: 'user_payer_1' },
            { userId: 'user_peer_2' },
          ],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('rejects expense creation with fewer than 2 participants', async () => {
      const res = await request(app)
        .post('/api/v1/rooms/507f1f77bcf86cd799439011/expenses')
        .set('Authorization', 'Bearer valid-token')
        .send({
          title: 'Solo Expense',
          amountPaise: 2000,
          splitType: 'equal',
          participants: [{ userId: 'user_payer_1' }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/rooms/:roomId/expenses', () => {
    test('returns expense list for room', async () => {
      const mockExpenses = [
        {
          _id: '607f1f77bcf86cd799439099',
          roomId: '507f1f77bcf86cd799439011',
          payerId: 'user_payer_1',
          title: 'Dinner at Mess',
          amountPaise: 40000,
          splitType: 'equal',
          status: 'pending',
        },
      ];

      (ExpenseService.getRoomExpenses as jest.Mock).mockResolvedValueOnce(mockExpenses);

      const res = await request(app)
        .get('/api/v1/rooms/507f1f77bcf86cd799439011/expenses')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.expenses[0].title).toBe('Dinner at Mess');
    });
  });

  describe('POST /api/v1/expenses/:expenseId/acknowledge', () => {
    test('acknowledges expense successfully', async () => {
      const mockUpdated = {
        _id: '607f1f77bcf86cd799439099',
        status: 'confirmed',
        revision: 1,
        participants: [
          { userId: 'user_payer_1', status: 'acknowledged' },
          { userId: 'user_peer_2', status: 'acknowledged' },
        ],
      };

      (ExpenseService.acknowledgeExpense as jest.Mock).mockResolvedValueOnce(mockUpdated);

      const res = await request(app)
        .post('/api/v1/expenses/607f1f77bcf86cd799439099/acknowledge')
        .set('Authorization', 'Bearer valid-token')
        .send({
          expectedRevision: 1,
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Expense acknowledged successfully');
      expect(res.body.expense.status).toBe('confirmed');
    });

    test('fails without expectedRevision', async () => {
      const res = await request(app)
        .post('/api/v1/expenses/607f1f77bcf86cd799439099/acknowledge')
        .set('Authorization', 'Bearer valid-token')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/expenses/:expenseId/reject', () => {
    test('rejects expense with reason', async () => {
      const mockRejected = {
        _id: '607f1f77bcf86cd799439099',
        status: 'pending',
        revision: 1,
        participants: [
          { userId: 'user_payer_1', status: 'acknowledged' },
          { userId: 'user_peer_2', status: 'rejected', rejectionReason: 'I did not eat this' },
        ],
      };

      (ExpenseService.rejectExpense as jest.Mock).mockResolvedValueOnce(mockRejected);

      const res = await request(app)
        .post('/api/v1/expenses/607f1f77bcf86cd799439099/reject')
        .set('Authorization', 'Bearer valid-token')
        .send({
          expectedRevision: 1,
          reason: 'I did not eat this',
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Expense rejected');
      expect(ExpenseService.rejectExpense).toHaveBeenCalledWith(
        'user_payer_1',
        '607f1f77bcf86cd799439099',
        1,
        'I did not eat this'
      );
    });

    test('fails rejection without mandatory reason', async () => {
      const res = await request(app)
        .post('/api/v1/expenses/607f1f77bcf86cd799439099/reject')
        .set('Authorization', 'Bearer valid-token')
        .send({
          expectedRevision: 1,
          reason: '',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/expenses/:expenseId/resubmit', () => {
    test('resubmits expense with new amount and revision', async () => {
      const mockResubmitted = {
        _id: '607f1f77bcf86cd799439099',
        status: 'pending',
        revision: 2,
        amountPaise: 30000,
      };

      (ExpenseService.resubmitExpense as jest.Mock).mockResolvedValueOnce(mockResubmitted);

      const res = await request(app)
        .post('/api/v1/expenses/607f1f77bcf86cd799439099/resubmit')
        .set('Authorization', 'Bearer valid-token')
        .send({
          expectedRevision: 1,
          amountPaise: 30000,
          splitType: 'equal',
          participants: [
            { userId: 'user_payer_1' },
            { userId: 'user_peer_2' },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Expense resubmitted successfully');
      expect(res.body.expense.revision).toBe(2);
    });
  });

  describe('POST /api/v1/expenses/:expenseId/cancel', () => {
    test('cancels pending expense', async () => {
      const mockCancelled = {
        _id: '607f1f77bcf86cd799439099',
        status: 'cancelled',
      };

      (ExpenseService.cancelExpense as jest.Mock).mockResolvedValueOnce(mockCancelled);

      const res = await request(app)
        .post('/api/v1/expenses/607f1f77bcf86cd799439099/cancel')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Expense cancelled successfully');
      expect(res.body.expense.status).toBe('cancelled');
    });
  });

  describe('GET /api/v1/rooms/:roomId/balances', () => {
    test('returns room balances and verification stats', async () => {
      const mockBalances = {
        roomId: '507f1f77bcf86cd799439011',
        balances: [
          {
            userId: 'user_payer_1',
            displayName: 'Payer User',
            netBalancePaise: 20000,
            totalPaidPaise: 40000,
            totalSharePaise: 20000,
          },
          {
            userId: 'user_peer_2',
            displayName: 'Peer User',
            netBalancePaise: -20000,
            totalPaidPaise: 0,
            totalSharePaise: 20000,
          },
        ],
        totalExpensesCount: 1,
        confirmedExpensesCount: 1,
        currency: 'INR',
      };

      (BalanceService.getRoomBalances as jest.Mock).mockResolvedValueOnce(mockBalances);

      const res = await request(app)
        .get('/api/v1/rooms/507f1f77bcf86cd799439011/balances')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.balances.length).toBe(2);
      expect(res.body.balances[0].netBalancePaise).toBe(20000);
      expect(res.body.balances[1].netBalancePaise).toBe(-20000);
    });
  });

  describe('GET /api/v1/rooms/:roomId/suggested-settlements', () => {
    test('returns suggested simplified debt transfers', async () => {
      const mockTransfers = {
        roomId: '507f1f77bcf86cd799439011',
        suggestedTransfers: [
          {
            fromUserId: 'user_peer_2',
            fromDisplayName: 'Peer User',
            toUserId: 'user_payer_1',
            toDisplayName: 'Payer User',
            amountPaise: 20000,
            currency: 'INR',
          },
        ],
      };

      (BalanceService.getSuggestedSettlements as jest.Mock).mockResolvedValueOnce(mockTransfers);

      const res = await request(app)
        .get('/api/v1/rooms/507f1f77bcf86cd799439011/suggested-settlements')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.suggestedTransfers.length).toBe(1);
      expect(res.body.suggestedTransfers[0].amountPaise).toBe(20000);
    });
  });
});
