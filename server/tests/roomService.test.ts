import admin from 'firebase-admin';
import { RoomService } from '../src/services/roomService';
import { Room } from '../src/models/Room';
import { Invitation } from '../src/models/Invitation';
import { AuditEvent } from '../src/models/AuditEvent';

// Mock Firebase Admin
jest.mock('firebase-admin', () => {
  const getUserMock = jest.fn();
  return {
    apps: [{}],
    initializeApp: jest.fn(),
    credential: { cert: jest.fn() },
    auth: () => ({
      getUser: getUserMock,
    }),
    __mockGetUser: getUserMock,
  };
});

// Mock Mongoose models
jest.mock('../src/models/Room');
jest.mock('../src/models/Invitation');
jest.mock('../src/models/AuditEvent');

describe('RoomService Display Name & Member Repair Regression Tests', () => {
  const mockAdmin = admin as any;

  beforeEach(() => {
    jest.clearAllMocks();
    (AuditEvent.create as jest.Mock).mockResolvedValue({});
  });

  describe('createRoom', () => {
    test('saves creator actual display name instead of Admin', async () => {
      let savedRoomDoc: any = null;
      (Room as any).mockImplementation((data: any) => {
        savedRoomDoc = {
          ...data,
          _id: '507f1f77bcf86cd799439011',
          save: jest.fn().mockResolvedValue(true),
        };
        return savedRoomDoc;
      });

      const creator = {
        uid: 'user_admin_1',
        email: 'aarav@hostel.edu',
        displayName: 'Aarav Patel',
      };

      const room = await RoomService.createRoom(creator, {
        name: 'Room 302',
        description: 'Hostel 4B',
      });

      expect(room.members).toHaveLength(1);
      expect(room.members[0].displayName).toBe('Aarav Patel');
      expect(room.members[0].role).toBe('admin');
      expect(room.members[0].userId).toBe('user_admin_1');
      expect(room.save).toHaveBeenCalled();
    });

    test('retrieves creator display name from Firebase Admin if missing from token', async () => {
      let savedRoomDoc: any = null;
      (Room as any).mockImplementation((data: any) => {
        savedRoomDoc = {
          ...data,
          _id: '507f1f77bcf86cd799439011',
          save: jest.fn().mockResolvedValue(true),
        };
        return savedRoomDoc;
      });

      mockAdmin.__mockGetUser.mockResolvedValueOnce({
        uid: 'user_admin_1',
        displayName: 'Verified Admin Name',
      });

      const creatorWithoutName = {
        uid: 'user_admin_1',
        email: 'aarav@hostel.edu',
        // displayName undefined from stale token
      };

      const room = await RoomService.createRoom(creatorWithoutName, {
        name: 'Room 302',
      });

      expect(mockAdmin.__mockGetUser).toHaveBeenCalledWith('user_admin_1');
      expect(room.members[0].displayName).toBe('Verified Admin Name');
    });
  });

  describe('acceptInvitation', () => {
    test('saves joining member actual display name instead of Member', async () => {
      const mockInvitation = {
        _id: 'inv_123',
        roomId: '507f1f77bcf86cd799439011',
        inviteCode: 'JOIN99',
        status: 'pending',
        expiresAt: new Date(Date.now() + 86400000),
        save: jest.fn().mockResolvedValue(true),
      };

      (Invitation.findOne as jest.Mock).mockResolvedValueOnce(mockInvitation);

      const mockRoom: any = {
        _id: '507f1f77bcf86cd799439011',
        name: 'Room 302',
        status: 'active',
        members: [
          {
            userId: 'user_admin_1',
            displayName: 'Aarav Patel',
            role: 'admin',
            status: 'active',
          },
        ],
        save: jest.fn().mockResolvedValue(true),
      };

      (Room.findById as jest.Mock).mockResolvedValueOnce(mockRoom);

      const joiningUser = {
        uid: 'user_member_2',
        email: 'rohan@hostel.edu',
        displayName: 'Rohan Sharma',
      };

      const result = await RoomService.acceptInvitation('JOIN99', joiningUser);

      expect(result.members).toHaveLength(2);
      const newMember = result.members.find((m: any) => m.userId === 'user_member_2');
      expect(newMember).toBeDefined();
      expect(newMember?.displayName).toBe('Rohan Sharma');
      expect(newMember?.role).toBe('member');
      expect(newMember?.status).toBe('active');
    });

    test('retrieves joining member display name from Firebase Admin if token is stale', async () => {
      const mockInvitation = {
        _id: 'inv_123',
        roomId: '507f1f77bcf86cd799439011',
        inviteCode: 'JOIN99',
        status: 'pending',
        expiresAt: new Date(Date.now() + 86400000),
        save: jest.fn().mockResolvedValue(true),
      };

      (Invitation.findOne as jest.Mock).mockResolvedValueOnce(mockInvitation);

      const mockRoom: any = {
        _id: '507f1f77bcf86cd799439011',
        name: 'Room 302',
        status: 'active',
        members: [
          {
            userId: 'user_admin_1',
            displayName: 'Aarav Patel',
            role: 'admin',
            status: 'active',
          },
        ],
        save: jest.fn().mockResolvedValue(true),
      };

      (Room.findById as jest.Mock).mockResolvedValueOnce(mockRoom);

      mockAdmin.__mockGetUser.mockResolvedValueOnce({
        uid: 'user_member_2',
        displayName: 'Rohan Sharma',
      });

      const joiningUserWithoutName = {
        uid: 'user_member_2',
        email: 'rohan@hostel.edu',
        // displayName undefined
      };

      const result = await RoomService.acceptInvitation('JOIN99', joiningUserWithoutName);

      expect(mockAdmin.__mockGetUser).toHaveBeenCalledWith('user_member_2');
      const newMember = result.members.find((m: any) => m.userId === 'user_member_2');
      expect(newMember?.displayName).toBe('Rohan Sharma');
    });
  });

  describe('repairMemberDisplayNames', () => {
    test('repairs literal Member and Admin placeholders while preserving legitimate custom names', async () => {
      const mockRoom: any = {
        _id: '507f1f77bcf86cd799439011',
        members: [
          {
            userId: 'user_1',
            displayName: 'Admin', // placeholder admin
            email: 'admin@hostel.edu',
            role: 'admin',
            joinedAt: new Date('2026-01-01'),
            status: 'active',
          },
          {
            userId: 'user_2',
            displayName: 'Member', // placeholder member
            email: 'rohan@hostel.edu',
            role: 'member',
            joinedAt: new Date('2026-01-02'),
            status: 'active',
          },
          {
            userId: 'user_3',
            displayName: 'Custom Nickname', // legitimate custom name: DO NOT OVERWRITE
            email: 'custom@hostel.edu',
            role: 'member',
            joinedAt: new Date('2026-01-03'),
            status: 'active',
          },
        ],
        save: jest.fn().mockResolvedValue(true),
      };

      mockAdmin.__mockGetUser.mockImplementation((uid: string) => {
        if (uid === 'user_1') {
          return Promise.resolve({ uid: 'user_1', displayName: 'Aarav Patel' });
        }
        if (uid === 'user_2') {
          return Promise.resolve({ uid: 'user_2', displayName: 'Rohan Sharma' });
        }
        if (uid === 'user_3') {
          return Promise.resolve({ uid: 'user_3', displayName: 'Firebase Real Name' });
        }
        return Promise.reject(new Error('User not found'));
      });

      const repaired = await RoomService.repairMemberDisplayNames(mockRoom);

      expect(repaired).toBe(true);
      expect(mockRoom.save).toHaveBeenCalled();

      // user_1 placeholder repaired
      expect(mockRoom.members[0].displayName).toBe('Aarav Patel');
      expect(mockRoom.members[0].role).toBe('admin');
      expect(mockRoom.members[0].userId).toBe('user_1');

      // user_2 placeholder repaired
      expect(mockRoom.members[1].displayName).toBe('Rohan Sharma');
      expect(mockRoom.members[1].role).toBe('member');
      expect(mockRoom.members[1].userId).toBe('user_2');

      // user_3 legitimate custom name preserved (not overwritten)
      expect(mockRoom.members[2].displayName).toBe('Custom Nickname');

      // Preserved attributes
      expect(mockRoom.members[0].status).toBe('active');
      expect(mockRoom.members[1].status).toBe('active');
      expect(mockRoom.members[2].status).toBe('active');
    });

    test('uses authenticated caller displayName to repair without extra network call', async () => {
      const mockRoom: any = {
        _id: '507f1f77bcf86cd799439011',
        members: [
          {
            userId: 'caller_123',
            displayName: 'Member',
            role: 'member',
            status: 'active',
          },
        ],
        save: jest.fn().mockResolvedValue(true),
      };

      const caller = {
        uid: 'caller_123',
        displayName: 'Caller Full Name',
      };

      const repaired = await RoomService.repairMemberDisplayNames(mockRoom, caller);

      expect(repaired).toBe(true);
      expect(mockRoom.members[0].displayName).toBe('Caller Full Name');
      expect(mockAdmin.__mockGetUser).not.toHaveBeenCalled();
    });

    test('does not modify room if no placeholder members are present', async () => {
      const mockRoom: any = {
        _id: '507f1f77bcf86cd799439011',
        members: [
          {
            userId: 'user_1',
            displayName: 'Rohan Sharma',
            role: 'member',
            status: 'active',
          },
        ],
        save: jest.fn().mockResolvedValue(true),
      };

      const repaired = await RoomService.repairMemberDisplayNames(mockRoom);

      expect(repaired).toBe(false);
      expect(mockRoom.save).not.toHaveBeenCalled();
      expect(mockRoom.members[0].displayName).toBe('Rohan Sharma');
    });
  });
});
