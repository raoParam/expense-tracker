import request from 'supertest';
import { createApp } from '../src/app';
import { DeviceToken } from '../src/models/DeviceToken';
import { NotificationLog } from '../src/models/NotificationLog';
import {
  PushNotificationService,
  isExpoPushToken,
} from '../src/services/pushNotificationService';
import admin from 'firebase-admin';

// Mock Firebase Admin
const verifyIdTokenMock = jest.fn();
jest.mock('firebase-admin', () => {
  return {
    apps: [{}],
    initializeApp: jest.fn(),
    credential: { cert: jest.fn() },
    auth: () => ({
      verifyIdToken: verifyIdTokenMock,
      getUser: jest.fn(async (uid: string) => ({
        uid,
        displayName: uid === 'user_1' ? 'User One' : 'User Two',
      })),
    }),
  };
});

// Mock Mongoose models
jest.mock('../src/models/DeviceToken');
jest.mock('../src/models/NotificationLog');

describe('Push Notifications Backend Tests', () => {
  let app: any;

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    app = createApp();
  });

  describe('Expo Push Token Validation', () => {
    it('should validate legitimate Expo push tokens', () => {
      expect(isExpoPushToken('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]')).toBe(true);
      expect(isExpoPushToken('ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx]')).toBe(true);
      expect(isExpoPushToken('12345678-1234-1234-1234-123456789abc')).toBe(true);
    });

    it('should reject invalid push tokens', () => {
      expect(isExpoPushToken('')).toBe(false);
      expect(isExpoPushToken('invalid-token')).toBe(false);
      expect(isExpoPushToken(null)).toBe(false);
      expect(isExpoPushToken(undefined)).toBe(false);
      expect(isExpoPushToken('ExponentPushToken[]')).toBe(false);
    });
  });

  describe('Device Token Registration & Lifecycle', () => {
    it('should register a new valid device token for a user', async () => {
      const validToken = 'ExponentPushToken[dev_token_1234567890]';
      (DeviceToken.findOneAndUpdate as jest.Mock).mockResolvedValue({
        userId: 'user_1',
        pushToken: validToken,
        isActive: true,
      });

      await PushNotificationService.registerDeviceToken('user_1', validToken, 'android', 'device_1');

      expect(DeviceToken.findOneAndUpdate).toHaveBeenCalledWith(
        { pushToken: validToken },
        expect.objectContaining({
          userId: 'user_1',
          pushToken: validToken,
          platform: 'android',
          deviceId: 'device_1',
          isActive: true,
        }),
        { upsert: true, new: true }
      );
    });

    it('should reject invalid token registration with an AppError', async () => {
      await expect(
        PushNotificationService.registerDeviceToken('user_1', 'not-a-token', 'android')
      ).rejects.toThrow('Invalid Expo push token format');
      expect(DeviceToken.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('should deactivate token on unregister (logout)', async () => {
      const token = 'ExponentPushToken[logout_token_test]';
      (DeviceToken.findOneAndUpdate as jest.Mock).mockResolvedValue({
        userId: 'user_1',
        pushToken: token,
        isActive: false,
      });

      await PushNotificationService.unregisterDeviceToken('user_1', token);

      expect(DeviceToken.findOneAndUpdate).toHaveBeenCalledWith(
        { pushToken: token, userId: 'user_1' },
        expect.objectContaining({
          $set: expect.objectContaining({ isActive: false }),
        })
      );
    });

    it('should batch deactivate invalid tokens reported by Expo', async () => {
      const tokens = ['ExponentPushToken[invalid_1]', 'ExponentPushToken[invalid_2]'];
      (DeviceToken.updateMany as jest.Mock).mockResolvedValue({ modifiedCount: 2 });

      await PushNotificationService.deactivateTokens(tokens);

      expect(DeviceToken.updateMany).toHaveBeenCalledWith(
        { pushToken: { $in: tokens } },
        expect.objectContaining({
          $set: expect.objectContaining({ isActive: false }),
        })
      );
    });

    it('should reassign existing push token to new user on account switch / device transfer', async () => {
      const token = 'ExponentPushToken[shared_hardware_device]';
      (DeviceToken.findOneAndUpdate as jest.Mock).mockResolvedValue({
        userId: 'user_2',
        pushToken: token,
        isActive: true,
      });

      await PushNotificationService.registerDeviceToken('user_2', token, 'android', 'device_alpha');

      expect(DeviceToken.findOneAndUpdate).toHaveBeenCalledWith(
        { pushToken: token },
        expect.objectContaining({
          userId: 'user_2',
          pushToken: token,
          isActive: true,
        }),
        { upsert: true, new: true }
      );
    });
  });

  describe('Payer Exclusion and Expense Notification Recipients', () => {
    it('should exclude the payer and only notify pending participants on expense creation', async () => {
      const sendSpy = jest.spyOn(PushNotificationService, 'sendNotification').mockResolvedValue();

      const mockExpense: any = {
        _id: 'exp_001',
        roomId: 'room_001',
        payerId: 'user_1',
        title: 'Dinner Party',
        amountPaise: 150000,
        revision: 1,
        participants: [
          { userId: 'user_1', sharePaise: 50000, status: 'acknowledged' },
          { userId: 'user_2', sharePaise: 50000, status: 'pending' },
          { userId: 'user_3', sharePaise: 50000, status: 'pending' },
        ],
      };

      await PushNotificationService.notifyExpenseCreated(mockExpense, 'Room Alpha', 'User One');

      expect(sendSpy).toHaveBeenCalledTimes(1);
      const callArgs = sendSpy.mock.calls[0][0];
      expect(callArgs.recipientIds).toEqual(['user_2', 'user_3']);
      expect(callArgs.recipientIds).not.toContain('user_1');
      expect(callArgs.title).toBe('Room Alpha');
      expect(callArgs.body).toContain('shared expense');
      expect(callArgs.body).not.toContain('1500.00');
      expect(callArgs.categoryId).toBe('expense_acknowledgement');
      expect(callArgs.data).toEqual(
        expect.objectContaining({
          type: 'EXPENSE_NEEDS_ACKNOWLEDGEMENT',
          expenseId: 'exp_001',
          revision: 1,
        })
      );
    });

    it('should notify participants again on expense resubmission with updated revision', async () => {
      const sendSpy = jest.spyOn(PushNotificationService, 'sendNotification').mockResolvedValue();

      const mockExpense: any = {
        _id: 'exp_001',
        roomId: 'room_001',
        payerId: 'user_1',
        title: 'Corrected Groceries',
        amountPaise: 200000,
        revision: 2,
        participants: [
          { userId: 'user_1', sharePaise: 100000, status: 'acknowledged' },
          { userId: 'user_2', sharePaise: 100000, status: 'pending' },
        ],
      };

      await PushNotificationService.notifyExpenseResubmitted(mockExpense, 'Hostel Room', 'User One');

      expect(sendSpy).toHaveBeenCalledTimes(1);
      const callArgs = sendSpy.mock.calls[0][0];
      expect(callArgs.recipientIds).toEqual(['user_2']);
      expect(callArgs.data.revision).toBe(2);
      expect(callArgs.dedupKeyPrefix).toContain(':2');
      expect(callArgs.categoryId).toBe('expense_acknowledgement');
    });

    it('should notify the payer when an expense is rejected by a participant', async () => {
      const sendSpy = jest.spyOn(PushNotificationService, 'sendNotification').mockResolvedValue();

      const mockExpense: any = {
        _id: 'exp_001',
        roomId: 'room_001',
        payerId: 'user_1',
        title: 'Snacks',
        revision: 1,
      };

      await PushNotificationService.notifyExpenseRejected(
        mockExpense,
        'user_2',
        'User Two',
        'I was not there',
        'Room Alpha',
        false
      );

      expect(sendSpy).toHaveBeenCalledTimes(1);
      const callArgs = sendSpy.mock.calls[0][0];
      expect(callArgs.recipientIds).toEqual(['user_1']);
      expect(callArgs.body).toContain('User Two rejected');
      expect(callArgs.body).toContain('I was not there');
    });

    it('should notify the payer on unanimous rejection with restriction notice', async () => {
      const sendSpy = jest.spyOn(PushNotificationService, 'sendNotification').mockResolvedValue();

      const mockExpense: any = {
        _id: 'exp_001',
        roomId: 'room_001',
        payerId: 'user_1',
        title: 'Fake Bill',
        revision: 1,
      };

      await PushNotificationService.notifyExpenseRejected(
        mockExpense,
        'user_2',
        'User Two',
        'Fraudulent entry',
        'Room Alpha',
        true
      );

      expect(sendSpy).toHaveBeenCalledTimes(1);
      const callArgs = sendSpy.mock.calls[0][0];
      expect(callArgs.recipientIds).toEqual(['user_1']);
      expect(callArgs.body).toContain('unanimously rejected');
      expect(callArgs.body).toContain('24-hour creation restriction');
    });

    it('should notify the payer when an expense is confirmed', async () => {
      const sendSpy = jest.spyOn(PushNotificationService, 'sendNotification').mockResolvedValue();

      const mockExpense: any = {
        _id: 'exp_001',
        roomId: 'room_001',
        payerId: 'user_1',
        title: 'Electricity Bill',
        amountPaise: 45000,
      };

      await PushNotificationService.notifyExpenseConfirmed(mockExpense, 'Room Alpha');

      expect(sendSpy).toHaveBeenCalledTimes(1);
      const callArgs = sendSpy.mock.calls[0][0];
      expect(callArgs.recipientIds).toEqual(['user_1']);
      expect(callArgs.body).toContain('acknowledged');
      expect(callArgs.body).toContain('confirmed');
    });
  });

  describe('Settlement and Room Event Notification Recipients', () => {
    it('should notify the receiver when a settlement is requested', async () => {
      const sendSpy = jest.spyOn(PushNotificationService, 'sendNotification').mockResolvedValue();

      const mockSettlement: any = {
        _id: 'settle_001',
        roomId: 'room_001',
        debtorId: 'user_1',
        receiverId: 'user_2',
        amountPaise: 50000,
      };

      await PushNotificationService.notifySettlementRequested(
        mockSettlement,
        'Flat 101',
        'User One'
      );

      expect(sendSpy).toHaveBeenCalledTimes(1);
      const callArgs = sendSpy.mock.calls[0][0];
      expect(callArgs.recipientIds).toEqual(['user_2']);
      expect(callArgs.recipientIds).not.toContain('user_1');
      expect(callArgs.body).toContain('500.00');
    });

    it('should notify the debtor when a settlement is verified', async () => {
      const sendSpy = jest.spyOn(PushNotificationService, 'sendNotification').mockResolvedValue();

      const mockSettlement: any = {
        _id: 'settle_001',
        roomId: 'room_001',
        debtorId: 'user_1',
        receiverId: 'user_2',
        amountPaise: 50000,
      };

      await PushNotificationService.notifySettlementVerified(mockSettlement, 'Flat 101', 'User Two');

      expect(sendSpy).toHaveBeenCalledTimes(1);
      const callArgs = sendSpy.mock.calls[0][0];
      expect(callArgs.recipientIds).toEqual(['user_1']);
      expect(callArgs.body).toContain('verified your payment');
    });

    it('should notify the debtor when a settlement is rejected with reason', async () => {
      const sendSpy = jest.spyOn(PushNotificationService, 'sendNotification').mockResolvedValue();

      const mockSettlement: any = {
        _id: 'settle_001',
        roomId: 'room_001',
        debtorId: 'user_1',
        receiverId: 'user_2',
        amountPaise: 50000,
      };

      await PushNotificationService.notifySettlementRejected(
        mockSettlement,
        'Flat 101',
        'User Two',
        'Payment not received in UPI'
      );

      expect(sendSpy).toHaveBeenCalledTimes(1);
      const callArgs = sendSpy.mock.calls[0][0];
      expect(callArgs.recipientIds).toEqual(['user_1']);
      expect(callArgs.body).toContain('Payment not received in UPI');
    });

    it('should notify the receiver when a settlement is cancelled by debtor', async () => {
      const sendSpy = jest.spyOn(PushNotificationService, 'sendNotification').mockResolvedValue();

      const mockSettlement: any = {
        _id: 'settle_001',
        roomId: 'room_001',
        debtorId: 'user_1',
        receiverId: 'user_2',
        amountPaise: 50000,
      };

      await PushNotificationService.notifySettlementCancelled(mockSettlement, 'Flat 101', 'User One');

      expect(sendSpy).toHaveBeenCalledTimes(1);
      const callArgs = sendSpy.mock.calls[0][0];
      expect(callArgs.recipientIds).toEqual(['user_2']);
      expect(callArgs.body).toContain('cancelled');
    });

    it('should notify room admin when a new member joins via invite', async () => {
      const sendSpy = jest.spyOn(PushNotificationService, 'sendNotification').mockResolvedValue();

      await PushNotificationService.notifyMemberJoined(
        'room_001',
        'Hostel 404',
        'admin_1',
        'New Roomie',
        'user_2'
      );

      expect(sendSpy).toHaveBeenCalledTimes(1);
      const callArgs = sendSpy.mock.calls[0][0];
      expect(callArgs.recipientIds).toEqual(['admin_1']);
      expect(callArgs.body).toContain('New Roomie accepted your invitation');
    });

    it('should notify removed member when they are removed by admin', async () => {
      const sendSpy = jest.spyOn(PushNotificationService, 'sendNotification').mockResolvedValue();

      await PushNotificationService.notifyMemberRemoved('room_001', 'Hostel 404', 'user_2');

      expect(sendSpy).toHaveBeenCalledTimes(1);
      const callArgs = sendSpy.mock.calls[0][0];
      expect(callArgs.recipientIds).toEqual(['user_2']);
      expect(callArgs.body).toContain('You were removed from Hostel 404');
    });
  });

  describe('Deduplication & Error Handling in sendNotification', () => {
    it('should skip sending if deduplication log exists', async () => {
      (NotificationLog.findOne as jest.Mock).mockResolvedValue({ dedupKey: 'test:123:user_2' });
      const sendMessagesSpy = jest.spyOn(PushNotificationService, 'sendMessagesToExpo');

      await PushNotificationService.sendNotification({
        recipientIds: ['user_2'],
        dedupKeyPrefix: 'test:123',
        type: 'TEST',
        title: 'Title',
        body: 'Body',
        data: {},
      });

      expect(sendMessagesSpy).not.toHaveBeenCalled();
      expect(DeviceToken.find).not.toHaveBeenCalled();
    });

    it('should record skipped log when recipient has no active device tokens', async () => {
      (NotificationLog.findOne as jest.Mock).mockResolvedValue(null);
      (DeviceToken.find as jest.Mock).mockResolvedValue([]);
      (NotificationLog.create as jest.Mock).mockResolvedValue({});

      await PushNotificationService.sendNotification({
        recipientIds: ['user_2'],
        dedupKeyPrefix: 'test:no-device',
        type: 'TEST',
        title: 'Title',
        body: 'Body',
        data: {},
      });

      expect(NotificationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'user_2',
          status: 'skipped',
        })
      );
    });

    it('should deactivate invalid tokens when Expo returns DeviceNotRegistered error ticket', async () => {
      (NotificationLog.findOne as jest.Mock).mockResolvedValue(null);
      (DeviceToken.find as jest.Mock).mockResolvedValue([
        { userId: 'user_2', pushToken: 'ExponentPushToken[stale_token]' },
      ]);
      (NotificationLog.findOneAndUpdate as jest.Mock).mockResolvedValue({});
      (DeviceToken.updateMany as jest.Mock).mockResolvedValue({});

      jest.spyOn(PushNotificationService, 'sendMessagesToExpo').mockResolvedValue([
        {
          status: 'error',
          message: 'The device is no longer registered',
          details: { error: 'DeviceNotRegistered' },
        },
      ]);

      await PushNotificationService.sendNotification({
        recipientIds: ['user_2'],
        dedupKeyPrefix: 'test:stale',
        type: 'TEST',
        title: 'Title',
        body: 'Body',
        data: {},
      });

      expect(DeviceToken.updateMany).toHaveBeenCalledWith(
        { pushToken: { $in: ['ExponentPushToken[stale_token]'] } },
        expect.objectContaining({
          $set: expect.objectContaining({ isActive: false }),
        })
      );
    });

    it('should never crash when sendMessagesToExpo throws network error', async () => {
      (NotificationLog.findOne as jest.Mock).mockResolvedValue(null);
      (DeviceToken.find as jest.Mock).mockResolvedValue([
        { userId: 'user_2', pushToken: 'ExponentPushToken[net_token]' },
      ]);

      jest.spyOn(PushNotificationService, 'sendMessagesToExpo').mockRejectedValue(
        new Error('Network timeout')
      );

      await expect(
        PushNotificationService.sendNotification({
          recipientIds: ['user_2'],
          dedupKeyPrefix: 'test:network-error',
          type: 'TEST',
          title: 'Title',
          body: 'Body',
          data: {},
        })
      ).resolves.not.toThrow();
    });
  });

  describe('Device Token HTTP Endpoints', () => {
    it('should reject unauthenticated request to register device token with 401', async () => {
      const res = await request(app)
        .post('/api/v1/notifications/device-token')
        .send({ token: 'ExponentPushToken[test_token]' });

      expect(res.status).toBe(401);
    });

    it('should register device token when authenticated', async () => {
      verifyIdTokenMock.mockResolvedValue({
        uid: 'user_1',
        email: 'user1@example.com',
      });
      (DeviceToken.findOneAndUpdate as jest.Mock).mockResolvedValue({
        userId: 'user_1',
        pushToken: 'ExponentPushToken[api_token_123]',
        isActive: true,
      });

      const res = await request(app)
        .post('/api/v1/notifications/device-token')
        .set('Authorization', 'Bearer valid-id-token')
        .send({
          token: 'ExponentPushToken[api_token_123]',
          platform: 'android',
          deviceId: 'device-xyz',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('registered successfully');
    });

    it('should unregister device token when authenticated via DELETE', async () => {
      verifyIdTokenMock.mockResolvedValue({
        uid: 'user_1',
        email: 'user1@example.com',
      });
      (DeviceToken.findOneAndUpdate as jest.Mock).mockResolvedValue({
        userId: 'user_1',
        pushToken: 'ExponentPushToken[del_token_123]',
        isActive: false,
      });

      const res = await request(app)
        .delete('/api/v1/notifications/device-token')
        .set('Authorization', 'Bearer valid-id-token')
        .send({
          token: 'ExponentPushToken[del_token_123]',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('unregistered successfully');
    });
  });

  describe('Expo Push Receipts Verification & Processing', () => {
    it('should successfully verify delivery receipt and update NotificationLog with receiptStatus ok', async () => {
      (NotificationLog.updateMany as jest.Mock).mockResolvedValue({ modifiedCount: 1 });
      jest.spyOn(PushNotificationService, 'getReceiptsFromExpo').mockResolvedValue({
        'ticket_valid_001': { status: 'ok' },
      });

      const result = await PushNotificationService.checkTicketReceipts([
        { ticketId: 'ticket_valid_001', token: 'ExponentPushToken[ok_token]', dedupKey: 'dedup_001' },
      ]);

      expect(result.checkedCount).toBe(1);
      expect(result.errorsCount).toBe(0);
      expect(NotificationLog.updateMany).toHaveBeenCalledWith(
        { ticketId: 'ticket_valid_001' },
        { $set: { receiptStatus: 'ok' } }
      );
    });

    it('should process DeviceNotRegistered error receipt, update log status to failed, and deactivate token', async () => {
      (NotificationLog.updateMany as jest.Mock).mockResolvedValue({ modifiedCount: 1 });
      (DeviceToken.updateMany as jest.Mock).mockResolvedValue({ modifiedCount: 1 });

      jest.spyOn(PushNotificationService, 'getReceiptsFromExpo').mockResolvedValue({
        'ticket_err_002': {
          status: 'error',
          message: '"ExponentPushToken[stale_token]" is not registered',
          details: { error: 'DeviceNotRegistered' },
        },
      });

      const result = await PushNotificationService.checkTicketReceipts([
        { ticketId: 'ticket_err_002', token: 'ExponentPushToken[stale_token]', dedupKey: 'dedup_002' },
      ]);

      expect(result.checkedCount).toBe(1);
      expect(result.errorsCount).toBe(1);

      expect(NotificationLog.updateMany).toHaveBeenCalledWith(
        { ticketId: 'ticket_err_002' },
        {
          $set: expect.objectContaining({
            status: 'failed',
            receiptStatus: 'error',
            receiptError: '"ExponentPushToken[stale_token]" is not registered',
          }),
        }
      );

      expect(DeviceToken.updateMany).toHaveBeenCalledWith(
        { pushToken: { $in: ['ExponentPushToken[stale_token]'] } },
        expect.objectContaining({
          $set: expect.objectContaining({ isActive: false }),
        })
      );
    });

    it('should handle receipt lookup network/HTTP errors safely and schedule bounded retry', async () => {
      jest.spyOn(PushNotificationService, 'getReceiptsFromExpo').mockRejectedValue(
        new Error('Expo receipt service timeout 504')
      );
      const scheduleSpy = jest.spyOn(PushNotificationService, 'scheduleReceiptCheck').mockImplementation();

      const result = await PushNotificationService.checkTicketReceipts(
        [{ ticketId: 'ticket_net_fail', token: 'ExponentPushToken[some_token]' }],
        0
      );

      expect(result.checkedCount).toBe(0);
      expect(result.errorsCount).toBe(0);
      expect(scheduleSpy).toHaveBeenCalledWith(
        [{ ticketId: 'ticket_net_fail', token: 'ExponentPushToken[some_token]' }],
        30000,
        1
      );
    });

    it('should log other delivery errors (e.g. MessageRateExceeded) without deactivating the device token', async () => {
      (NotificationLog.updateMany as jest.Mock).mockResolvedValue({ modifiedCount: 1 });
      const deactivateSpy = jest.spyOn(PushNotificationService, 'deactivateTokens');

      jest.spyOn(PushNotificationService, 'getReceiptsFromExpo').mockResolvedValue({
        ticket_rate_exceeded: {
          status: 'error',
          message: 'Rate limit exceeded for message delivery',
          details: { error: 'MessageRateExceeded' },
        },
      });

      const result = await PushNotificationService.checkTicketReceipts([
        { ticketId: 'ticket_rate_exceeded', token: 'ExponentPushToken[rate_limited_token]' },
      ]);

      expect(result.checkedCount).toBe(1);
      expect(result.errorsCount).toBe(1);

      expect(NotificationLog.updateMany).toHaveBeenCalledWith(
        { ticketId: 'ticket_rate_exceeded' },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: 'failed',
            receiptStatus: 'error',
            receiptError: 'Rate limit exceeded for message delivery',
          }),
        })
      );

      // Crucial: Rate limit is temporary, token must NOT be deactivated
      expect(deactivateSpy).not.toHaveBeenCalled();
    });

    it('should schedule bounded retry for pending tickets not yet generated by Expo', async () => {
      // Receipts response is empty (ticket still in flight)
      jest.spyOn(PushNotificationService, 'getReceiptsFromExpo').mockResolvedValue({});
      const scheduleSpy = jest.spyOn(PushNotificationService, 'scheduleReceiptCheck').mockImplementation();

      const result = await PushNotificationService.checkTicketReceipts(
        [{ ticketId: 'ticket_in_flight', token: 'ExponentPushToken[pending_token]' }],
        0
      );

      expect(result.checkedCount).toBe(0);
      expect(scheduleSpy).toHaveBeenCalledWith(
        [{ ticketId: 'ticket_in_flight', token: 'ExponentPushToken[pending_token]' }],
        30000,
        1
      );
    });

    it('should record ticketId, pushToken, and pending receiptStatus in sendNotification and schedule receipt check', async () => {
      (NotificationLog.findOne as jest.Mock).mockResolvedValue(null);
      (DeviceToken.find as jest.Mock).mockResolvedValue([
        { userId: 'user_2', pushToken: 'ExponentPushToken[accepted_token]' },
      ]);
      (NotificationLog.findOneAndUpdate as jest.Mock).mockResolvedValue({});

      jest.spyOn(PushNotificationService, 'sendMessagesToExpo').mockResolvedValue([
        { status: 'ok', id: 'ticket_abc_123' },
      ]);
      const scheduleSpy = jest.spyOn(PushNotificationService, 'scheduleReceiptCheck').mockImplementation();

      await PushNotificationService.sendNotification({
        recipientIds: ['user_2'],
        dedupKeyPrefix: 'test:receipt-flow',
        type: 'TEST',
        title: 'Title',
        body: 'Body',
        data: {},
      });

      expect(NotificationLog.findOneAndUpdate).toHaveBeenCalledWith(
        { dedupKey: 'test:receipt-flow:user_2' },
        expect.objectContaining({
          ticketId: 'ticket_abc_123',
          pushToken: 'ExponentPushToken[accepted_token]',
          receiptStatus: 'pending',
          status: 'sent',
        }),
        { upsert: true }
      );

      expect(scheduleSpy).toHaveBeenCalledWith([
        expect.objectContaining({
          ticketId: 'ticket_abc_123',
          token: 'ExponentPushToken[accepted_token]',
        }),
      ]);
    });

    it('should process pending receipts from MongoDB for recent notifications', async () => {
      (NotificationLog.find as jest.Mock).mockReturnValue({
        limit: jest.fn().mockResolvedValue([
          {
            ticketId: 'ticket_mongo_001',
            pushToken: 'ExponentPushToken[mongo_token]',
            dedupKey: 'dedup_mongo_001',
          },
        ]),
      });

      const checkSpy = jest
        .spyOn(PushNotificationService, 'checkTicketReceipts')
        .mockResolvedValue({ checkedCount: 1, errorsCount: 0 });

      const count = await PushNotificationService.processPendingReceipts(25);

      expect(count).toBe(1);
      expect(checkSpy).toHaveBeenCalledWith([
        {
          ticketId: 'ticket_mongo_001',
          token: 'ExponentPushToken[mongo_token]',
          dedupKey: 'dedup_mongo_001',
        },
      ]);
    });
  });
});
