import mongoose, { Schema, Document, Types } from 'mongoose';

export type SplitType = 'equal' | 'custom' | 'percentage' | 'quantity';
export type ExpenseStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled';
export type ParticipantStatus = 'acknowledged' | 'pending' | 'rejected';

export interface IExpenseParticipant {
  userId: string;
  displayName?: string;
  email?: string;
  sharePaise: number;
  status: ParticipantStatus;
  acknowledgedAt?: Date;
  rejectionReason?: string;
  rejectedAt?: Date;
}

export interface IExpense extends Document {
  _id: Types.ObjectId;
  roomId: Types.ObjectId;
  payerId: string;
  title?: string;
  description?: string;
  amountPaise: number;
  currency: 'INR';
  splitType: SplitType;
  splitInputs?: any;
  participants: IExpenseParticipant[];
  status: ExpenseStatus;
  revision: number;
  idempotencyKey?: string;
  createdAt: Date;
  updatedAt: Date;
  confirmedAt?: Date;
  cancelledAt?: Date;
}

const ExpenseParticipantSchema = new Schema<IExpenseParticipant>(
  {
    userId: { type: String, required: true, index: true },
    displayName: { type: String, maxlength: 32 },
    email: { type: String },
    sharePaise: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['acknowledged', 'pending', 'rejected'],
      default: 'pending',
    },
    acknowledgedAt: { type: Date },
    rejectionReason: { type: String, maxlength: 300 },
    rejectedAt: { type: Date },
  },
  { _id: false }
);

const ExpenseSchema = new Schema<IExpense>(
  {
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
    payerId: { type: String, required: true, index: true },
    title: { type: String, trim: true, maxlength: 30 },
    description: { type: String, trim: true, maxlength: 300, default: '' },
    amountPaise: {
      type: Number,
      required: true,
      min: 1,
      max: 9999999999, // Max ₹99,999,999.99
    },
    currency: { type: String, enum: ['INR'], default: 'INR' },
    splitType: {
      type: String,
      enum: ['equal', 'custom', 'percentage', 'quantity'],
      required: true,
    },
    splitInputs: { type: Schema.Types.Mixed },
    participants: {
      type: [ExpenseParticipantSchema],
      validate: [
        (val: IExpenseParticipant[]) => val.length >= 2,
        'Shared expenses require at least 2 distinct participants including payer',
      ],
    },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'rejected', 'cancelled'],
      default: 'pending',
      index: true,
    },
    revision: { type: Number, default: 1, min: 1 },
    idempotencyKey: { type: String, trim: true, index: true },
    confirmedAt: { type: Date },
    cancelledAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for performant querying
ExpenseSchema.index({ roomId: 1, createdAt: -1 });
ExpenseSchema.index({ roomId: 1, status: 1 });
ExpenseSchema.index({ 'participants.userId': 1, status: 1 });
ExpenseSchema.index({ idempotencyKey: 1, payerId: 1 }, { unique: true, sparse: true });

export const Expense = mongoose.model<IExpense>('Expense', ExpenseSchema);
