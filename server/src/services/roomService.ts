import crypto from 'crypto';
import mongoose from 'mongoose';
import admin from 'firebase-admin';
import { Room, IRoom } from '../models/Room';
import { Invitation, IInvitation } from '../models/Invitation';
import { Expense } from '../models/Expense';
import { Settlement } from '../models/Settlement';
import { AuditEvent } from '../models/AuditEvent';
import { AuthenticatedUser } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

// Generate a human-friendly 6-character uppercase alphanumeric code
export function generateInviteCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

export class RoomService {
  /**
   * Repairs room members whose displayName is literally 'Member' or 'Admin' (or empty)
   * if a verified real display name exists for their Firebase user.
   * Preserves all other member attributes, expense records, roles, acknowledgements, and balances.
   * Does not overwrite legitimate custom names.
   */
  static async repairMemberDisplayNames(
    room: IRoom,
    currentUser?: AuthenticatedUser
  ): Promise<boolean> {
    let modified = false;

    for (const member of room.members) {
      const isPlaceholder =
        !member.displayName ||
        member.displayName.trim() === '' ||
        member.displayName === 'Member' ||
        member.displayName === 'Admin';

      if (!isPlaceholder) {
        continue;
      }

      // 1. If this member is the authenticated caller and has a real name:
      if (currentUser && currentUser.uid === member.userId && currentUser.displayName && currentUser.displayName.trim() !== '') {
        member.displayName = currentUser.displayName.trim();
        modified = true;
        continue;
      }

      // 2. Look up user record from Firebase Admin
      try {
        const userRecord = await admin.auth().getUser(member.userId);
        if (userRecord && userRecord.displayName && userRecord.displayName.trim() !== '') {
          member.displayName = userRecord.displayName.trim();
          modified = true;
        }
      } catch (err: any) {
        // Non-fatal: if lookup fails (e.g. mock in tests or offline), preserve existing
      }
    }

    if (modified) {
      await room.save();
    }

    return modified;
  }

  /**
   * Create a new room with the authenticated user as admin and first active member.
   */
  static async createRoom(
    creator: AuthenticatedUser,
    data: { name: string; description?: string }
  ): Promise<IRoom> {
    const trimmedName = data.name.trim();
    if (!trimmedName || trimmedName.length > 50) {
      throw new AppError('Room name must be between 1 and 50 characters', 400, 'INVALID_NAME');
    }

    let creatorDisplayName = creator.displayName;
    if (!creatorDisplayName || creatorDisplayName.trim() === '' || creatorDisplayName === 'Admin') {
      try {
        const userRecord = await admin.auth().getUser(creator.uid);
        if (userRecord && userRecord.displayName && userRecord.displayName.trim() !== '') {
          creatorDisplayName = userRecord.displayName.trim();
        }
      } catch (e) {
        // fallback to creator.displayName or 'Admin'
      }
    }

    const room = new Room({
      name: trimmedName,
      description: data.description?.trim(),
      adminId: creator.uid,
      members: [
        {
          userId: creator.uid,
          displayName: creatorDisplayName || 'Admin',
          email: creator.email,
          role: 'admin',
          joinedAt: new Date(),
          status: 'active',
        },
      ],
      status: 'active',
    });

    await room.save();

    // Record audit event
    await AuditEvent.create({
      actorId: creator.uid,
      roomId: room._id,
      entityType: 'room',
      action: 'ROOM_CREATED',
      metadata: { name: room.name },
    });

    return room;
  }

  /**
   * List all active/authorized rooms for a given user.
   */
  static async listUserRooms(userId: string, currentUser?: AuthenticatedUser): Promise<IRoom[]> {
    const rooms = await Room.find({
      'members.userId': userId,
      'members.status': 'active',
    }).sort({ updatedAt: -1 });

    for (const room of rooms) {
      await RoomService.repairMemberDisplayNames(room, currentUser);
    }

    return rooms;
  }

  /**
   * Fetch a room by ID if the user is an active member or admin.
   */
  static async getRoomById(roomId: string, userId: string, currentUser?: AuthenticatedUser): Promise<IRoom> {
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      throw new AppError('Invalid room ID format', 400, 'INVALID_ID');
    }

    const room = await Room.findById(roomId);
    if (!room) {
      throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    const isMember = room.members.some(
      (m) => m.userId === userId && m.status === 'active'
    );

    if (!isMember) {
      throw new AppError('You are not authorized to access this room', 403, 'FORBIDDEN');
    }

    // Repair placeholder display names if real names can be verified
    await RoomService.repairMemberDisplayNames(room, currentUser);

    return room;
  }

  /**
   * Update permitted room metadata (name, description) — Admin only.
   */
  static async updateRoom(
    roomId: string,
    userId: string,
    data: { name?: string; description?: string }
  ): Promise<IRoom> {
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      throw new AppError('Invalid room ID format', 400, 'INVALID_ID');
    }

    const room = await Room.findById(roomId);
    if (!room) {
      throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    if (room.adminId !== userId) {
      throw new AppError('Only the room admin can update room details', 403, 'FORBIDDEN');
    }

    if (room.status === 'archived') {
      throw new AppError('Cannot modify an archived room', 400, 'ROOM_ARCHIVED');
    }

    if (data.name !== undefined) {
      const trimmed = data.name.trim();
      if (!trimmed || trimmed.length > 50) {
        throw new AppError('Room name must be between 1 and 50 characters', 400, 'INVALID_NAME');
      }
      room.name = trimmed;
    }

    if (data.description !== undefined) {
      room.description = data.description.trim();
    }

    await room.save();

    await AuditEvent.create({
      actorId: userId,
      roomId: room._id,
      entityType: 'room',
      action: 'ROOM_UPDATED',
      metadata: { name: room.name, description: room.description },
    });

    return room;
  }

  /**
   * Create an invitation for a room — Admin only.
   */
  static async createInvitation(
    roomId: string,
    userId: string,
    expiresInDays = 7
  ): Promise<IInvitation> {
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      throw new AppError('Invalid room ID format', 400, 'INVALID_ID');
    }

    const room = await Room.findById(roomId);
    if (!room) {
      throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    if (room.adminId !== userId) {
      throw new AppError('Only the room admin can invite new members', 403, 'FORBIDDEN');
    }

    if (room.status === 'archived') {
      throw new AppError('Cannot invite members to an archived room', 400, 'ROOM_ARCHIVED');
    }

    // Try up to 3 times in case of code collision
    let inviteCode = generateInviteCode();
    let collision = await Invitation.findOne({ inviteCode, status: 'pending' });
    let attempts = 0;
    while (collision && attempts < 3) {
      inviteCode = generateInviteCode();
      collision = await Invitation.findOne({ inviteCode, status: 'pending' });
      attempts++;
    }

    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

    const invitation = new Invitation({
      roomId: room._id,
      roomName: room.name,
      inviterId: userId,
      inviteCode,
      expiresAt,
      status: 'pending',
    });

    await invitation.save();

    await AuditEvent.create({
      actorId: userId,
      roomId: room._id,
      entityType: 'invitation',
      action: 'INVITATION_CREATED',
      metadata: { inviteCode, expiresAt },
    });

    return invitation;
  }

  /**
   * Look up invitation info by code.
   */
  static async getInvitationInfo(inviteCode: string): Promise<{
    inviteCode: string;
    roomId: string;
    roomName: string;
    inviterId: string;
    expiresAt: Date;
    status: string;
  }> {
    const cleanCode = inviteCode.trim().toUpperCase();
    const invitation = await Invitation.findOne({ inviteCode: cleanCode });

    if (!invitation || invitation.status !== 'pending') {
      throw new AppError('Invalid or expired invitation code', 404, 'INVITATION_NOT_FOUND');
    }

    if (new Date() > invitation.expiresAt) {
      invitation.status = 'expired';
      await invitation.save();
      throw new AppError('This invitation has expired', 400, 'INVITATION_EXPIRED');
    }

    return {
      inviteCode: invitation.inviteCode,
      roomId: invitation.roomId.toString(),
      roomName: invitation.roomName,
      inviterId: invitation.inviterId,
      expiresAt: invitation.expiresAt,
      status: invitation.status,
    };
  }

  /**
   * Accept an invitation and join the room.
   */
  static async acceptInvitation(
    inviteCode: string,
    user: AuthenticatedUser
  ): Promise<IRoom> {
    const cleanCode = inviteCode.trim().toUpperCase();
    const invitation = await Invitation.findOne({ inviteCode: cleanCode });

    if (!invitation || invitation.status !== 'pending') {
      throw new AppError('Invalid or expired invitation code', 404, 'INVITATION_NOT_FOUND');
    }

    if (new Date() > invitation.expiresAt) {
      invitation.status = 'expired';
      await invitation.save();
      throw new AppError('This invitation has expired', 400, 'INVITATION_EXPIRED');
    }

    const room = await Room.findById(invitation.roomId);
    if (!room) {
      throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    if (room.status === 'archived') {
      throw new AppError('Cannot join an archived room', 400, 'ROOM_ARCHIVED');
    }

    let userDisplayName = user.displayName;
    if (!userDisplayName || userDisplayName.trim() === '' || userDisplayName === 'Member') {
      try {
        const userRecord = await admin.auth().getUser(user.uid);
        if (userRecord && userRecord.displayName && userRecord.displayName.trim() !== '') {
          userDisplayName = userRecord.displayName.trim();
        }
      } catch (e) {
        // fallback to user.displayName or 'Member'
      }
    }

    const existingMember = room.members.find((m) => m.userId === user.uid);

    if (existingMember) {
      if (existingMember.status === 'active') {
        // Already active member: repair display name if placeholder
        if (
          (!existingMember.displayName ||
            existingMember.displayName === 'Member' ||
            existingMember.displayName === 'Admin') &&
          userDisplayName
        ) {
          existingMember.displayName = userDisplayName;
          await room.save();
        }
        await RoomService.repairMemberDisplayNames(room, user);
        return room;
      }
      // Re-activating previously removed member
      existingMember.status = 'active';
      existingMember.joinedAt = new Date();
      if (userDisplayName) {
        existingMember.displayName = userDisplayName;
      }
    } else {
      // Adding new member
      room.members.push({
        userId: user.uid,
        displayName: userDisplayName || 'Member',
        email: user.email,
        role: 'member',
        joinedAt: new Date(),
        status: 'active',
      });
    }

    await RoomService.repairMemberDisplayNames(room, user);
    await room.save();

    // Mark invitation as accepted
    invitation.status = 'accepted';
    invitation.acceptedBy = user.uid;
    invitation.acceptedAt = new Date();
    await invitation.save();

    await AuditEvent.create({
      actorId: user.uid,
      roomId: room._id,
      entityType: 'membership',
      action: 'MEMBER_JOINED',
      metadata: { inviteCode, userId: user.uid },
    });

    return room;
  }

  /**
   * Remove a member from a room — Admin only.
   */
  static async removeMember(
    roomId: string,
    adminId: string,
    memberUserIdToRemove: string,
    reason?: string
  ): Promise<IRoom> {
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      throw new AppError('Invalid room ID format', 400, 'INVALID_ID');
    }

    const room = await Room.findById(roomId);
    if (!room) {
      throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    if (room.adminId !== adminId) {
      throw new AppError('Only the room admin can remove members', 403, 'FORBIDDEN');
    }

    if (memberUserIdToRemove === adminId) {
      throw new AppError(
        'The room admin cannot be removed. Transfer the admin role before leaving.',
        400,
        'ADMIN_CANNOT_LEAVE'
      );
    }

    const member = room.members.find(
      (m) => m.userId === memberUserIdToRemove && m.status === 'active'
    );

    if (!member) {
      throw new AppError('Member not found in this room', 404, 'MEMBER_NOT_FOUND');
    }

    // Enforce business rule: Member cannot be removed with unresolved pending expenses
    const pendingExpense = await Expense.findOne({
      roomId: room._id,
      status: 'pending',
      $or: [
        { payerId: memberUserIdToRemove },
        { 'participants.userId': memberUserIdToRemove },
      ],
    });

    if (pendingExpense) {
      throw new AppError(
        'Cannot remove member with unresolved pending expenses. The pending expenses must be resolved or cancelled first.',
        400,
        'UNRESOLVED_PENDING_EXPENSES'
      );
    }

    // Enforce business rule: Member cannot be removed with unresolved pending settlements
    const pendingSettlement = await Settlement.findOne({
      roomId: room._id,
      status: 'pending',
      $or: [
        { debtorId: memberUserIdToRemove },
        { receiverId: memberUserIdToRemove },
      ],
    });

    if (pendingSettlement) {
      throw new AppError(
        'Cannot remove member with unresolved pending settlements. The pending settlements must be verified or cancelled first.',
        400,
        'UNRESOLVED_PENDING_SETTLEMENTS'
      );
    }

    // Mark as removed while preserving historical record for ledger integrity
    member.status = 'removed';
    await room.save();

    await AuditEvent.create({
      actorId: adminId,
      roomId: room._id,
      entityType: 'membership',
      action: 'MEMBER_REMOVED',
      metadata: { removedUserId: memberUserIdToRemove, reason },
    });

    return room;
  }

  /**
   * Archive a room — Admin only.
   */
  static async archiveRoom(roomId: string, adminId: string): Promise<IRoom> {
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      throw new AppError('Invalid room ID format', 400, 'INVALID_ID');
    }

    const room = await Room.findById(roomId);
    if (!room) {
      throw new AppError('Room not found', 404, 'ROOM_NOT_FOUND');
    }

    if (room.adminId !== adminId) {
      throw new AppError('Only the room admin can archive this room', 403, 'FORBIDDEN');
    }

    room.status = 'archived';
    await room.save();

    await AuditEvent.create({
      actorId: adminId,
      roomId: room._id,
      entityType: 'room',
      action: 'ROOM_ARCHIVED',
    });

    return room;
  }
}
