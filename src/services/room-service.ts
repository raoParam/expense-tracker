import { apiRequest } from './api-client';

export interface RoomMember {
  userId: string;
  displayName?: string;
  email?: string;
  role: 'admin' | 'member';
  joinedAt: string;
  status: 'active' | 'removed';
}

export interface Room {
  _id: string;
  name: string;
  description?: string;
  adminId: string;
  members: RoomMember[];
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface InvitationInfo {
  inviteCode: string;
  roomId: string;
  roomName: string;
  inviterId: string;
  expiresAt: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
}

export const RoomClientService = {
  /**
   * Create a new room
   */
  async createRoom(name: string, description?: string): Promise<Room> {
    const res = await apiRequest<{ room: Room }>('/rooms', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    });
    return res.room;
  },

  /**
   * List all rooms for current authenticated user
   */
  async listRooms(): Promise<Room[]> {
    const res = await apiRequest<{ count: number; rooms: Room[] }>('/rooms', {
      method: 'GET',
    });
    return res.rooms;
  },

  /**
   * Get room details by ID
   */
  async getRoomById(roomId: string): Promise<Room> {
    const res = await apiRequest<{ room: Room }>(`/rooms/${roomId}`, {
      method: 'GET',
    });
    return res.room;
  },

  /**
   * Update room metadata (admin only)
   */
  async updateRoom(roomId: string, name?: string, description?: string): Promise<Room> {
    const res = await apiRequest<{ room: Room }>(`/rooms/${roomId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name, description }),
    });
    return res.room;
  },

  /**
   * Create invitation code for room (admin only)
   */
  async createInvitation(roomId: string, expiresInDays = 7): Promise<InvitationInfo> {
    const res = await apiRequest<{ invitation: InvitationInfo }>(
      `/rooms/${roomId}/invitations`,
      {
        method: 'POST',
        body: JSON.stringify({ expiresInDays }),
      }
    );
    return res.invitation;
  },

  /**
   * Lookup invitation info by code
   */
  async getInvitationInfo(inviteCode: string): Promise<InvitationInfo> {
    const res = await apiRequest<{ invitation: InvitationInfo }>(
      `/invitations/${encodeURIComponent(inviteCode.trim().toUpperCase())}`,
      {
        method: 'GET',
      }
    );
    return res.invitation;
  },

  /**
   * Accept an invitation to join a room
   */
  async acceptInvitation(inviteCode: string): Promise<Room> {
    const res = await apiRequest<{ room: Room }>('/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ inviteCode: inviteCode.trim().toUpperCase() }),
    });
    return res.room;
  },

  /**
   * Remove a member from a room (admin only)
   */
  async removeMember(roomId: string, userId: string, reason?: string): Promise<Room> {
    const res = await apiRequest<{ room: Room }>(
      `/rooms/${roomId}/members/${userId}/removal`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }
    );
    return res.room;
  },

  /**
   * Archive a room (admin only)
   */
  async archiveRoom(roomId: string): Promise<Room> {
    const res = await apiRequest<{ room: Room }>(`/rooms/${roomId}/archive`, {
      method: 'POST',
    });
    return res.room;
  },
};
