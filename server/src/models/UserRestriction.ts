import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IUserRestriction extends Document {
  _id: Types.ObjectId;
  userId: string;
  expenseCreationBlockedUntil: Date;
  reason: string;
  triggeringExpenseId?: Types.ObjectId;
  createdAt: Date;
}

const UserRestrictionSchema = new Schema<IUserRestriction>(
  {
    userId: { type: String, required: true, index: true },
    expenseCreationBlockedUntil: { type: Date, required: true, index: true },
    reason: { type: String, required: true },
    triggeringExpenseId: { type: Schema.Types.ObjectId, ref: 'Expense' },
    createdAt: { type: Date, default: Date.now },
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

// Compound index to quickly query active restrictions by userId
UserRestrictionSchema.index({ userId: 1, expenseCreationBlockedUntil: -1 });

export const UserRestriction = mongoose.model<IUserRestriction>(
  'UserRestriction',
  UserRestrictionSchema
);
