import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  getReactNativePersistence,
  browserLocalPersistence,
  Auth,
} from 'firebase/auth';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const rawApiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
const isTestEnv = process.env.NODE_ENV === 'test';
const apiKey = rawApiKey || (isTestEnv ? 'mock-api-key-for-tests' : '');

export const isFirebaseConfigured = Boolean(apiKey);
export const firebaseConfigError: string | null = isFirebaseConfigured
  ? null
  : 'Firebase API key is missing. Please ensure EXPO_PUBLIC_FIREBASE_API_KEY is configured in your EAS build environment.';

// Firebase Client configuration for mobile app
export const firebaseClientConfig = {
  apiKey,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'spendly-70334.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'spendly-70334',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'spendly-70334.firebasestorage.app',
  messagingSenderId:
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ||
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGIN_SENDER_ID ||
    '611512645832',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '',
};

// Initialize or reuse Firebase App safely
export const firebaseApp = isFirebaseConfigured
  ? getApps().length === 0
    ? initializeApp(firebaseClientConfig)
    : getApp()
  : null;

// Initialize or reuse Auth instance with persistent AsyncStorage on React Native
function getOrInitAuth(app: ReturnType<typeof getApp>): Auth {
  try {
    if (Platform.OS === 'web') {
      return initializeAuth(app, {
        persistence: browserLocalPersistence,
      });
    }
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (err: any) {
    // Return existing Auth instance if already initialized (fast-refresh / re-eval / tests)
    return getAuth(app);
  }
}

// Export singleton Auth instance (null if configuration is missing)
export const auth: Auth | null = firebaseApp ? getOrInitAuth(firebaseApp) : null;
