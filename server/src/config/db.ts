import mongoose from 'mongoose';
import { config } from './env';

export async function connectDatabase(): Promise<boolean> {
  if (!config.mongodbUri) {
    console.log('[Database] MONGODB_URI not provided. Skipping database connection.');
    return false;
  }

  try {
    await mongoose.connect(config.mongodbUri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log('[Database] MongoDB connected successfully.');
    return true;
  } catch (error) {
    console.error('[Database] MongoDB connection error:', error);
    return false;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log('[Database] MongoDB disconnected.');
  }
}

export function getDatabaseStatus(): 'connected' | 'connecting' | 'disconnected' | 'unconfigured' {
  if (!config.mongodbUri) return 'unconfigured';
  switch (mongoose.connection.readyState) {
    case 1:
      return 'connected';
    case 2:
      return 'connecting';
    default:
      return 'disconnected';
  }
}
