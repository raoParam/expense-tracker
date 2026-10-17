import mongoose, { Schema, Document } from 'mongoose';

export interface IDeviceToken extends Document {
  userId: string;
  pushToken: string;
  platform: 'android' | 'ios' | 'web' | 'unknown';
  deviceId?: string;
  isActive: boolean;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const DeviceTokenSchema = new Schema<IDeviceToken>(
  {
    userId: { type: String, required: true, index: true },
    pushToken: { type: String, required: true, unique: true, index: true },
    platform: {
      type: String,
      enum: ['android', 'ios', 'web', 'unknown'],
      default: 'android',
    },
    deviceId: { type: String, trim: true },
    isActive: { type: Boolean, default: true, index: true },
    lastSeenAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

// Compound index for querying active tokens for a set of users
DeviceTokenSchema.index({ userId: 1, isActive: 1 });

export const DeviceToken = mongoose.model<IDeviceToken>('DeviceToken', DeviceTokenSchema);
