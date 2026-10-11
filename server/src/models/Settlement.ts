import mongoose, { Schema, Document, Types } from 'mongoose';

export type SettlementStatus = 'pending' | 'verified' | 'rejected' | 'cancelled';

export interface ISettlement extends Document {
  _id: Types.ObjectId;
  roomId: Types.ObjectId;
  debtorId: string;
  receiverId: string;
  amountPaise: number;
  currency: 'INR';
  status: SettlementStatus;
  rejectionReason?: string;
  idempotencyKey?: string;
  createdAt: Date;
  updatedAt: Date;
  verifiedAt?: Date;
  rejectedAt?: Date;
  cancelledAt?: Date;
}

const SettlementSchema = new Schema<ISettlement>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
    debtorId: { type: String, required: true, index: true },
    receiverId: { type: String, required: true, index: true },
    amountPaise: {
      type: Number,
      required: true,
      min: 1,
      max: 9999999999, // Max ₹99,999,999.99
    },
    currency: { type: String, enum: ['INR'], default: 'INR' },
    status: {
      type: String,
      enum: ['pending', 'verified', 'rejected', 'cancelled'],
      default: 'pending',
      index: true,
    },
    rejectionReason: { type: String, trim: true, maxlength: 300 },
    idempotencyKey: { type: String, trim: true, index: true },
    verifiedAt: { type: Date },
    rejectedAt: { type: Date },
    cancelledAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

// Indexes for fast lookup and idempotency
SettlementSchema.index({ roomId: 1, createdAt: -1 });
SettlementSchema.index({ roomId: 1, status: 1 });
SettlementSchema.index({ debtorId: 1, status: 1 });
SettlementSchema.index({ receiverId: 1, status: 1 });
SettlementSchema.index({ idempotencyKey: 1, debtorId: 1 }, { unique: true, sparse: true });

export const Settlement = mongoose.model<ISettlement>('Settlement', SettlementSchema);
