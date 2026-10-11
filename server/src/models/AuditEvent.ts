import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IAuditEvent extends Document {
  _id: Types.ObjectId;
  actorId: string;
  roomId?: Types.ObjectId;
  entityType: 'room' | 'membership' | 'invitation' | 'expense' | 'settlement';
  action: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

const AuditEventSchema = new Schema<IAuditEvent>(
  {
    actorId: { type: String, required: true, index: true },
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', index: true },
    entityType: {
      type: String,
      enum: ['room', 'membership', 'invitation', 'expense', 'settlement'],
      required: true,
      index: true,
    },
    action: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

export const AuditEvent = mongoose.model<IAuditEvent>('AuditEvent', AuditEventSchema);
