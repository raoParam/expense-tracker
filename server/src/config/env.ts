import dotenv from 'dotenv';
import path from 'path';

// Load .env file from server root or current directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

export interface Config {
  port: number;
  host: string;
  nodeEnv: 'development' | 'production' | 'test';
  mongodbUri?: string;
  firebase: {
    projectId?: string;
    clientEmail?: string;
    privateKey?: string;
    serviceAccountPath?: string;
  };
}

export const config: Config = {
  port: parseInt(process.env.PORT || '5000', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: (process.env.NODE_ENV as any) || 'development',
  mongodbUri: process.env.MONGODB_URI || process.env.MONGO_URI,
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY
      ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      : undefined,
    serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH
      ? path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
      : undefined,
  },
};
