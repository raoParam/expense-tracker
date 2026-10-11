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

// Firebase Client configuration for mobile app
export const firebaseClientConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyDummyKeyForDevelopmentAndTesting',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'spendly.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'spendly',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'spendly.firebasestorage.app',
  messagingSenderId:
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ||
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGIN_SENDER_ID ||
    '123456789012',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:123456789012:web:abcdef123456',
};

// Initialize or reuse Firebase App
export const firebaseApp =
  getApps().length === 0 ? initializeApp(firebaseClientConfig) : getApp();

// Initialize or reuse Auth instance with persistent AsyncStorage on React Native
function getOrInitAuth(): Auth {
  try {
    if (Platform.OS === 'web') {
      return initializeAuth(firebaseApp, {
        persistence: browserLocalPersistence,
      });
    }
    return initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (err: any) {
    // Return existing Auth instance if already initialized (fast-refresh / re-eval / tests)
    return getAuth(firebaseApp);
  }
}

// Export singleton Auth instance
export const auth: Auth = getOrInitAuth();
