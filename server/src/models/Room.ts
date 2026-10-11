import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IRoomMember {
  userId: string;
  displayName?: string;
  email?: string;
  role: 'admin' | 'member';
  joinedAt: Date;
  status: 'active' | 'removed';
}

export interface IRoom extends Document {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  adminId: string;
  members: IRoomMember[];
  status: 'active' | 'archived';
  createdAt: Date;
  updatedAt: Date;
}

const RoomMemberSchema = new Schema<IRoomMember>(
  {
    userId: { type: String, required: true, index: true },
    displayName: { type: String, maxlength: 32 },
    email: { type: String },
    role: { type: String, enum: ['admin', 'member'], default: 'member' },
    joinedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['active', 'removed'], default: 'active' },
  },
  { _id: false }
);

const RoomSchema = new Schema<IRoom>(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 50 },
    description: { type: String, trim: true, maxlength: 200 },
    adminId: { type: String, required: true, index: true },
    members: [RoomMemberSchema],
    status: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
  },
  {
    timestamps: true,
  }
);

// Compound index to quickly find all active rooms for a specific user
RoomSchema.index({ 'members.userId': 1, status: 1 });

export const Room = mongoose.model<IRoom>('Room', RoomSchema);
