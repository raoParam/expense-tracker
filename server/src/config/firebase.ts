import admin from 'firebase-admin';
import fs from 'fs';
import { config } from './env';

let firebaseInitialized = false;

export function initFirebase(): typeof admin | null {
  if (firebaseInitialized || admin.apps.length > 0) {
    firebaseInitialized = true;
    return admin;
  }

  try {
    // 1. Service Account JSON file path
    if (config.firebase.serviceAccountPath && fs.existsSync(config.firebase.serviceAccountPath)) {
      const serviceAccount = JSON.parse(
        fs.readFileSync(config.firebase.serviceAccountPath, 'utf8')
      );
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      firebaseInitialized = true;
      console.log('[Firebase] Initialized with service account JSON file.');
      return admin;
    }

    // 2. Environment credentials
    if (
      config.firebase.projectId &&
      config.firebase.clientEmail &&
      config.firebase.privateKey
    ) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: config.firebase.projectId,
          clientEmail: config.firebase.clientEmail,
          privateKey: config.firebase.privateKey,
        }),
      });
      firebaseInitialized = true;
      console.log('[Firebase] Initialized with environment credentials.');
      return admin;
    }

    // 3. Fallback for testing / development without credentials
    if (config.nodeEnv === 'test') {
      console.log('[Firebase] Running in test mode without live credentials.');
      return admin;
    }

    console.warn(
      '[Firebase] No credentials found. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY or FIREBASE_SERVICE_ACCOUNT_PATH in .env'
    );
    return null;
  } catch (err) {
    console.error('[Firebase] Failed to initialize Firebase Admin SDK:', err);
    return null;
  }
}

export function isFirebaseInitialized(): boolean {
  return firebaseInitialized || admin.apps.length > 0;
}
