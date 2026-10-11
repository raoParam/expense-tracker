import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IInvitation extends Document {
  _id: Types.ObjectId;
  roomId: Types.ObjectId;
  roomName: string;
  inviterId: string;
  inviteCode: string;
  inviteCodeHash?: string;
  expiresAt: Date;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  acceptedBy?: string;
  acceptedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const InvitationSchema = new Schema<IInvitation>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
    roomName: { type: String, required: true },
    inviterId: { type: String, required: true, index: true },
    inviteCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    inviteCodeHash: {
      type: String,
      index: true,
    },
    expiresAt: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'expired', 'revoked'],
      default: 'pending',
      index: true,
    },
    acceptedBy: { type: String },
    acceptedAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

InvitationSchema.pre<IInvitation>('save', function (next) {
  if (this.isModified('inviteCode') && this.inviteCode) {
    const crypto = require('crypto');
    this.inviteCodeHash = crypto
      .createHash('sha256')
      .update(this.inviteCode.trim().toUpperCase())
      .digest('hex');
  }
  next();
});

// Compound index for room invitation queries
InvitationSchema.index({ roomId: 1, status: 1 });

export const Invitation = mongoose.model<IInvitation>('Invitation', InvitationSchema);
