import { RoomClientService } from '../src/services/room-service';
import * as apiClient from '../src/services/api-client';

describe('RoomClientService', () => {
  let apiRequestSpy: jest.SpyInstance;

  beforeEach(() => {
    apiRequestSpy = jest.spyOn(apiClient, 'apiRequest');
  });

  afterEach(() => {
    apiRequestSpy.mockRestore();
  });

  test('createRoom sends POST /rooms with name and description', async () => {
    const mockRoom = {
      _id: 'room-123',
      name: 'Hostel 4B',
      description: 'Room 402 Flatmates',
      adminId: 'user-1',
      members: [
        {
          userId: 'user-1',
          role: 'admin' as const,
          joinedAt: new Date().toISOString(),
          status: 'active' as const,
        },
      ],
      status: 'active' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    apiRequestSpy.mockResolvedValueOnce({ room: mockRoom });

    const result = await RoomClientService.createRoom('Hostel 4B', 'Room 402 Flatmates');

    expect(apiRequestSpy).toHaveBeenCalledWith('/rooms', {
      method: 'POST',
      body: JSON.stringify({ name: 'Hostel 4B', description: 'Room 402 Flatmates' }),
    });
    expect(result).toEqual(mockRoom);
  });

  test('listRooms sends GET /rooms and returns array of rooms', async () => {
    const mockRooms = [
      {
        _id: 'room-1',
        name: 'Flat 101',
        adminId: 'user-1',
        members: [],
        status: 'active' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    apiRequestSpy.mockResolvedValueOnce({ count: 1, rooms: mockRooms });

    const result = await RoomClientService.listRooms();

    expect(apiRequestSpy).toHaveBeenCalledWith('/rooms', { method: 'GET' });
    expect(result).toEqual(mockRooms);
  });

  test('getRoomById sends GET /rooms/:id', async () => {
    const mockRoom = {
      _id: 'room-999',
      name: 'Suite 5',
      adminId: 'user-2',
      members: [],
      status: 'active' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    apiRequestSpy.mockResolvedValueOnce({ room: mockRoom });

    const result = await RoomClientService.getRoomById('room-999');

    expect(apiRequestSpy).toHaveBeenCalledWith('/rooms/room-999', { method: 'GET' });
    expect(result).toEqual(mockRoom);
  });

  test('createInvitation sends POST /rooms/:id/invitations with expiresInDays', async () => {
    const mockInvitation = {
      inviteCode: 'A7B8C9',
      roomId: 'room-999',
      roomName: 'Suite 5',
      inviterId: 'user-2',
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      status: 'pending' as const,
    };

    apiRequestSpy.mockResolvedValueOnce({ invitation: mockInvitation });

    const result = await RoomClientService.createInvitation('room-999', 7);

    expect(apiRequestSpy).toHaveBeenCalledWith('/rooms/room-999/invitations', {
      method: 'POST',
      body: JSON.stringify({ expiresInDays: 7 }),
    });
    expect(result.inviteCode).toBe('A7B8C9');
  });

  test('getInvitationInfo trims and uppercases code', async () => {
    const mockInvitation = {
      inviteCode: 'JOIN99',
      roomId: 'room-999',
      roomName: 'Suite 5',
      inviterId: 'user-2',
      expiresAt: new Date().toISOString(),
      status: 'pending' as const,
    };

    apiRequestSpy.mockResolvedValueOnce({ invitation: mockInvitation });

    const result = await RoomClientService.getInvitationInfo('  join99  ');

    expect(apiRequestSpy).toHaveBeenCalledWith('/invitations/JOIN99', { method: 'GET' });
    expect(result).toEqual(mockInvitation);
  });

  test('acceptInvitation sends POST /invitations/accept with normalized code', async () => {
    const mockRoom = {
      _id: 'room-999',
      name: 'Suite 5',
      adminId: 'user-2',
      members: [],
      status: 'active' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    apiRequestSpy.mockResolvedValueOnce({ room: mockRoom });

    const result = await RoomClientService.acceptInvitation(' xyz123 ');

    expect(apiRequestSpy).toHaveBeenCalledWith('/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ inviteCode: 'XYZ123' }),
    });
    expect(result).toEqual(mockRoom);
  });

  test('removeMember sends POST /rooms/:roomId/members/:userId/removal', async () => {
    const mockRoom = {
      _id: 'room-1',
      name: 'Flat 101',
      adminId: 'user-1',
      members: [],
      status: 'active' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    apiRequestSpy.mockResolvedValueOnce({ room: mockRoom });

    const result = await RoomClientService.removeMember('room-1', 'user-bad', 'No longer in hostel');

    expect(apiRequestSpy).toHaveBeenCalledWith('/rooms/room-1/members/user-bad/removal', {
      method: 'POST',
      body: JSON.stringify({ reason: 'No longer in hostel' }),
    });
    expect(result).toEqual(mockRoom);
  });

  test('archiveRoom sends POST /rooms/:roomId/archive', async () => {
    const mockRoom = {
      _id: 'room-1',
      name: 'Flat 101',
      adminId: 'user-1',
      members: [],
      status: 'archived' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    apiRequestSpy.mockResolvedValueOnce({ room: mockRoom });

    const result = await RoomClientService.archiveRoom('room-1');

    expect(apiRequestSpy).toHaveBeenCalledWith('/rooms/room-1/archive', {
      method: 'POST',
    });
    expect(result.status).toBe('archived');
  });
});
