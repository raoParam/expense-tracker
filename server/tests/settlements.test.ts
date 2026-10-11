import express from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { SettlementService } from '../src/services/settlementService';
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
jest.mock('../src/services/settlementService');
jest.mock('../src/services/balanceService');

describe('Settlement API Endpoints', () => {
  let app: express.Express;
  const mockAdmin = admin as any;

  const mockUser = {
    uid: 'user_debtor_1',
    email: 'debtor@hostel.edu',
    name: 'Debtor User',
  };

  beforeEach(() => {
    app = createApp();
    jest.clearAllMocks();
    mockAdmin.__mockVerifyIdToken.mockResolvedValue(mockUser);
  });

  describe('POST /api/v1/rooms/:roomId/settlements', () => {
    test('creates settlement verification request for exact full bilateral debt', async () => {
      const mockSettlement = {
        _id: '707f1f77bcf86cd799439099',
        roomId: '507f1f77bcf86cd799439011',
        debtorId: 'user_debtor_1',
        receiverId: 'user_receiver_2',
        amountPaise: 25000,
        currency: 'INR',
        status: 'pending',
      };

      (SettlementService.createSettlement as jest.Mock).mockResolvedValueOnce(mockSettlement);

      const res = await request(app)
        .post('/api/v1/rooms/507f1f77bcf86cd799439011/settlements')
        .set('Authorization', 'Bearer valid-token')
        .send({
          receiverId: 'user_receiver_2',
          amountPaise: 25000,
          idempotencyKey: 'idemp_settle_123',
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Settlement request created successfully');
      expect(res.body.settlement.amountPaise).toBe(25000);
      expect(SettlementService.createSettlement).toHaveBeenCalledWith(
        'user_debtor_1',
        '507f1f77bcf86cd799439011',
        {
          receiverId: 'user_receiver_2',
          amountPaise: 25000,
          idempotencyKey: 'idemp_settle_123',
        }
      );
    });

    test('accepts settlement with long realistic idempotencyKey (over 100 chars)', async () => {
      const mockSettlement = {
        _id: '707f1f77bcf86cd799439099',
        roomId: '507f1f77bcf86cd799439011',
        debtorId: 'user_debtor_1',
        receiverId: 'user_receiver_2',
        amountPaise: 25000,
        status: 'pending',
      };

      (SettlementService.createSettlement as jest.Mock).mockResolvedValueOnce(mockSettlement);

      const longKey = 'settle_507f1f77bcf86cd799439011_user_debtor_1_user_receiver_2_1773123456789_abcdef';
      const res = await request(app)
        .post('/api/v1/rooms/507f1f77bcf86cd799439011/settlements')
        .set('Authorization', 'Bearer valid-token')
        .send({
          receiverId: 'user_receiver_2',
          amountPaise: 25000,
          idempotencyKey: longKey,
        });

      expect(res.status).toBe(201);
      expect(res.body.settlement.amountPaise).toBe(25000);
    });

    test('accepts settlement with recipientId and amount aliases', async () => {
      const mockSettlement = {
        _id: '707f1f77bcf86cd799439099',
        roomId: '507f1f77bcf86cd799439011',
        debtorId: 'user_debtor_1',
        receiverId: 'user_receiver_2',
        amountPaise: 25000,
        status: 'pending',
      };

      (SettlementService.createSettlement as jest.Mock).mockResolvedValueOnce(mockSettlement);

      const res = await request(app)
        .post('/api/v1/rooms/507f1f77bcf86cd799439011/settlements')
        .set('Authorization', 'Bearer valid-token')
        .send({
          recipientId: 'user_receiver_2',
          amount: 25000,
        });

      expect(res.status).toBe(201);
      expect(SettlementService.createSettlement).toHaveBeenCalledWith(
        'user_debtor_1',
        '507f1f77bcf86cd799439011',
        expect.objectContaining({
          receiverId: 'user_receiver_2',
          amountPaise: 25000,
        })
      );
    });

    test('rejects settlement with invalid amount (zero or negative)', async () => {
      const res = await request(app)
        .post('/api/v1/rooms/507f1f77bcf86cd799439011/settlements')
        .set('Authorization', 'Bearer valid-token')
        .send({
          receiverId: 'user_receiver_2',
          amountPaise: -500,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toMatch(/at least 1 paisa/i);
    });

    test('rejects settlement with non-integer amount', async () => {
      const res = await request(app)
        .post('/api/v1/rooms/507f1f77bcf86cd799439011/settlements')
        .set('Authorization', 'Bearer valid-token')
        .send({
          receiverId: 'user_receiver_2',
          amountPaise: 250.5,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toMatch(/integer/i);
    });

    test('rejects settlement exceeding maximum ₹99,999,999.99', async () => {
      const res = await request(app)
        .post('/api/v1/rooms/507f1f77bcf86cd799439011/settlements')
        .set('Authorization', 'Bearer valid-token')
        .send({
          receiverId: 'user_receiver_2',
          amountPaise: 10000000000,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toMatch(/maximum limit/i);
    });

    test('rejects settlement without receiverId and provides detailed error message', async () => {
      const res = await request(app)
        .post('/api/v1/rooms/507f1f77bcf86cd799439011/settlements')
        .set('Authorization', 'Bearer valid-token')
        .send({
          amountPaise: 25000,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toMatch(/Receiver ID is required/i);
    });

    test('rejects settlement when idempotencyKey exceeds 255 characters', async () => {
      const res = await request(app)
        .post('/api/v1/rooms/507f1f77bcf86cd799439011/settlements')
        .set('Authorization', 'Bearer valid-token')
        .send({
          receiverId: 'user_receiver_2',
          amountPaise: 25000,
          idempotencyKey: 'x'.repeat(256),
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toMatch(/cannot exceed 255 characters/i);
    });
  });

  describe('GET /api/v1/rooms/:roomId/settlements', () => {
    test('lists settlements in room', async () => {
      const mockList = [
        {
          _id: '707f1f77bcf86cd799439099',
          debtorId: 'user_debtor_1',
          receiverId: 'user_receiver_2',
          amountPaise: 25000,
          status: 'pending',
        },
      ];

      (SettlementService.getRoomSettlements as jest.Mock).mockResolvedValueOnce(mockList);

      const res = await request(app)
        .get('/api/v1/rooms/507f1f77bcf86cd799439011/settlements')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.settlements[0]._id).toBe('707f1f77bcf86cd799439099');
    });
  });

  describe('GET /api/v1/rooms/:roomId/bilateral-debts', () => {
    test('fetches bilateral debts', async () => {
      const mockDebts = [
        {
          debtorId: 'user_debtor_1',
          receiverId: 'user_receiver_2',
          amountPaise: 25000,
        },
      ];

      (BalanceService.getRoomBilateralDebts as jest.Mock).mockResolvedValueOnce(mockDebts);

      const res = await request(app)
        .get('/api/v1/rooms/507f1f77bcf86cd799439011/bilateral-debts')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.debts.length).toBe(1);
      expect(res.body.debts[0].amountPaise).toBe(25000);
    });
  });

  describe('POST /api/v1/settlements/:settlementId/verify', () => {
    test('receiver verifies settlement successfully', async () => {
      const mockVerified = {
        _id: '707f1f77bcf86cd799439099',
        status: 'verified',
        verifiedAt: new Date(),
      };

      (SettlementService.verifySettlement as jest.Mock).mockResolvedValueOnce(mockVerified);

      const res = await request(app)
        .post('/api/v1/settlements/707f1f77bcf86cd799439099/verify')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Settlement verified successfully');
      expect(res.body.settlement.status).toBe('verified');
      expect(SettlementService.verifySettlement).toHaveBeenCalledWith(
        'user_debtor_1',
        '707f1f77bcf86cd799439099'
      );
    });
  });

  describe('POST /api/v1/settlements/:settlementId/reject', () => {
    test('receiver rejects settlement with reason', async () => {
      const mockRejected = {
        _id: '707f1f77bcf86cd799439099',
        status: 'rejected',
        rejectionReason: 'Payment not received in UPI',
      };

      (SettlementService.rejectSettlement as jest.Mock).mockResolvedValueOnce(mockRejected);

      const res = await request(app)
        .post('/api/v1/settlements/707f1f77bcf86cd799439099/reject')
        .set('Authorization', 'Bearer valid-token')
        .send({
          reason: 'Payment not received in UPI',
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Settlement rejected');
      expect(res.body.settlement.status).toBe('rejected');
      expect(SettlementService.rejectSettlement).toHaveBeenCalledWith(
        'user_debtor_1',
        '707f1f77bcf86cd799439099',
        'Payment not received in UPI'
      );
    });

    test('fails rejection without reason', async () => {
      const res = await request(app)
        .post('/api/v1/settlements/707f1f77bcf86cd799439099/reject')
        .set('Authorization', 'Bearer valid-token')
        .send({
          reason: '',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('POST /api/v1/settlements/:settlementId/cancel', () => {
    test('debtor cancels pending settlement request', async () => {
      const mockCancelled = {
        _id: '707f1f77bcf86cd799439099',
        status: 'cancelled',
      };

      (SettlementService.cancelSettlement as jest.Mock).mockResolvedValueOnce(mockCancelled);

      const res = await request(app)
        .post('/api/v1/settlements/707f1f77bcf86cd799439099/cancel')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Settlement request cancelled successfully');
      expect(res.body.settlement.status).toBe('cancelled');
      expect(SettlementService.cancelSettlement).toHaveBeenCalledWith(
        'user_debtor_1',
        '707f1f77bcf86cd799439099'
      );
    });
  });
});
