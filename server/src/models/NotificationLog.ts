import mongoose, { Schema, Document } from 'mongoose';

export interface INotificationLog extends Document {
  dedupKey: string;
  recipientId: string;
  type: string;
  status: 'sent' | 'failed' | 'skipped';
  title?: string;
  body?: string;
  data?: any;
  error?: string;
  ticketId?: string;
  pushToken?: string;
  receiptStatus?: 'pending' | 'ok' | 'error';
  receiptError?: string;
  createdAt: Date;
}

const NotificationLogSchema = new Schema<INotificationLog>(
  {
    dedupKey: { type: String, required: true, unique: true, index: true },
    recipientId: { type: String, required: true, index: true },
    type: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['sent', 'failed', 'skipped'],
      required: true,
      index: true,
    },
    title: { type: String },
    body: { type: String },
    data: { type: Schema.Types.Mixed },
    error: { type: String },
    ticketId: { type: String, index: true, sparse: true },
    pushToken: { type: String },
    receiptStatus: {
      type: String,
      enum: ['pending', 'ok', 'error'],
      index: true,
      sparse: true,
    },
    receiptError: { type: String },
    createdAt: { type: Date, default: Date.now, index: true, expires: '30d' },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

export const NotificationLog = mongoose.model<INotificationLog>('NotificationLog', NotificationLogSchema);
