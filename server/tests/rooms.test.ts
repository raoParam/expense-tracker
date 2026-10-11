import express from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import { RoomService } from '../src/services/roomService';
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

// Mock RoomService methods for API route testing
jest.mock('../src/services/roomService');

describe('Rooms & Invitations API Routes (/api/v1/rooms & /api/v1/invitations)', () => {
  let app: express.Express;
  const mockAdmin = admin as any;

  const mockUser = {
    uid: 'user_admin_1',
    email: 'admin@hostel.edu',
    name: 'Admin User',
  };

  beforeEach(() => {
    app = createApp();
    jest.clearAllMocks();

    // Default valid token authentication
    mockAdmin.__mockVerifyIdToken.mockResolvedValue(mockUser);
  });

  describe('POST /api/v1/rooms', () => {
    test('creates room successfully with valid payload', async () => {
      const mockCreatedRoom = {
        _id: '507f1f77bcf86cd799439011',
        name: 'Room 302 - Ganga Hostel',
        description: '3rd Floor Boys Wing',
        adminId: 'user_admin_1',
        members: [
          {
            userId: 'user_admin_1',
            displayName: 'Admin User',
            role: 'admin',
            status: 'active',
          },
        ],
        status: 'active',
      };

      (RoomService.createRoom as jest.Mock).mockResolvedValueOnce(mockCreatedRoom);

      const res = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', 'Bearer valid-token')
        .send({
          name: 'Room 302 - Ganga Hostel',
          description: '3rd Floor Boys Wing',
        });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Room created successfully');
      expect(res.body.room.name).toBe('Room 302 - Ganga Hostel');
      expect(RoomService.createRoom).toHaveBeenCalledWith(
        expect.objectContaining({ uid: 'user_admin_1' }),
        { name: 'Room 302 - Ganga Hostel', description: '3rd Floor Boys Wing' }
      );
    });

    test('rejects room creation with empty name', async () => {
      const res = await request(app)
        .post('/api/v1/rooms')
        .set('Authorization', 'Bearer valid-token')
        .send({
          name: '',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/rooms', () => {
    test('lists active rooms for authenticated user', async () => {
      const mockRooms = [
        {
          _id: '507f1f77bcf86cd799439011',
          name: 'Room 302',
          adminId: 'user_admin_1',
          members: [{ userId: 'user_admin_1', status: 'active' }],
        },
      ];

      (RoomService.listUserRooms as jest.Mock).mockResolvedValueOnce(mockRooms);

      const res = await request(app)
        .get('/api/v1/rooms')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.rooms).toHaveLength(1);
    });
  });

  describe('GET /api/v1/rooms/:roomId', () => {
    test('fetches authorized room details', async () => {
      const mockRoom = {
        _id: '507f1f77bcf86cd799439011',
        name: 'Room 302',
        adminId: 'user_admin_1',
        members: [{ userId: 'user_admin_1', status: 'active' }],
      };

      (RoomService.getRoomById as jest.Mock).mockResolvedValueOnce(mockRoom);

      const res = await request(app)
        .get('/api/v1/rooms/507f1f77bcf86cd799439011')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.room.name).toBe('Room 302');
    });
  });

  describe('POST /api/v1/rooms/:roomId/invitations', () => {
    test('generates invitation code for room admin', async () => {
      const mockInvitation = {
        _id: 'inv_123',
        inviteCode: 'SP-9X2A',
        roomId: '507f1f77bcf86cd799439011',
        roomName: 'Room 302',
        expiresAt: new Date(Date.now() + 7 * 86400000),
        status: 'pending',
      };

      (RoomService.createInvitation as jest.Mock).mockResolvedValueOnce(mockInvitation);

      const res = await request(app)
        .post('/api/v1/rooms/507f1f77bcf86cd799439011/invitations')
        .set('Authorization', 'Bearer valid-token')
        .send({ expiresInDays: 7 });

      expect(res.status).toBe(201);
      expect(res.body.invitation.inviteCode).toBe('SP-9X2A');
    });
  });

  describe('POST /api/v1/invitations/accept', () => {
    test('accepts invitation and joins room', async () => {
      const mockJoinedRoom = {
        _id: '507f1f77bcf86cd799439011',
        name: 'Room 302',
        members: [
          { userId: 'user_admin_1', role: 'admin', status: 'active' },
          { userId: 'user_2', role: 'member', status: 'active' },
        ],
      };

      (RoomService.acceptInvitation as jest.Mock).mockResolvedValueOnce(mockJoinedRoom);

      const res = await request(app)
        .post('/api/v1/invitations/accept')
        .set('Authorization', 'Bearer valid-token')
        .send({ inviteCode: 'SP-9X2A' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Successfully joined room');
      expect(res.body.room.members).toHaveLength(2);
    });
  });

  describe('POST /api/v1/rooms/:roomId/members/:userId/removal', () => {
    test('removes member from room', async () => {
      const mockRoom = {
        _id: '507f1f77bcf86cd799439011',
        name: 'Room 302',
        members: [{ userId: 'user_admin_1', role: 'admin', status: 'active' }],
      };

      (RoomService.removeMember as jest.Mock).mockResolvedValueOnce(mockRoom);

      const res = await request(app)
        .post('/api/v1/rooms/507f1f77bcf86cd799439011/members/user_2/removal')
        .set('Authorization', 'Bearer valid-token')
        .send({ reason: 'Moved out of hostel' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Member removed successfully');
    });

    test('returns 400 when member has unresolved pending expenses', async () => {
      const { AppError } = jest.requireActual('../src/middleware/errorHandler');
      (RoomService.removeMember as jest.Mock).mockRejectedValueOnce(
        new AppError(
          'Cannot remove member with unresolved pending expenses. The pending expenses must be resolved or cancelled first.',
          400,
          'UNRESOLVED_PENDING_EXPENSES'
        )
      );

      const res = await request(app)
        .post('/api/v1/rooms/507f1f77bcf86cd799439011/members/user_2/removal')
        .set('Authorization', 'Bearer valid-token')
        .send({ reason: 'Graduated' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('UNRESOLVED_PENDING_EXPENSES');
    });
  });

  describe('POST /api/v1/rooms/:roomId/archive', () => {
    test('archives room successfully', async () => {
      const mockArchivedRoom = {
        _id: '507f1f77bcf86cd799439011',
        name: 'Room 302',
        status: 'archived',
      };

      (RoomService.archiveRoom as jest.Mock).mockResolvedValueOnce(mockArchivedRoom);

      const res = await request(app)
        .post('/api/v1/rooms/507f1f77bcf86cd799439011/archive')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Room archived successfully');
      expect(res.body.room.status).toBe('archived');
    });
  });
});
