import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import { auth, firebaseConfigError } from './firebase';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
}

export async function registerWithEmail(
  email: string,
  password: string,
  displayName?: string
): Promise<UserProfile> {
  if (!auth) {
    throw new Error(firebaseConfigError || 'Firebase Authentication is not configured.');
  }
  const userCredential = await createUserWithEmailAndPassword(
    auth,
    email.trim(),
    password
  );

  if (displayName && userCredential.user) {
    await updateProfile(userCredential.user, {
      displayName: displayName.trim(),
    });
    // Force refresh token so the newly set displayName is immediately included in the JWT claims
    await userCredential.user.getIdToken(true);
  }

  return {
    uid: userCredential.user.uid,
    email: userCredential.user.email,
    displayName: userCredential.user.displayName || displayName || null,
  };
}

export async function loginWithEmail(
  email: string,
  password: string
): Promise<UserProfile> {
  if (!auth) {
    throw new Error(firebaseConfigError || 'Firebase Authentication is not configured.');
  }
  const userCredential = await signInWithEmailAndPassword(
    auth,
    email.trim(),
    password
  );

  return {
    uid: userCredential.user.uid,
    email: userCredential.user.email,
    displayName: userCredential.user.displayName,
  };
}

/**
 * Update the authenticated Firebase profile and return the same profile shape
 * used by AuthContext. Firebase is the source of truth for account identity;
 * refreshing the ID token keeps the display name available to backend calls.
 */
export async function updateDisplayName(displayName: string): Promise<UserProfile> {
  if (!auth?.currentUser) {
    throw new Error('You must be signed in to update your profile.');
  }

  const trimmedName = displayName.trim();
  if (!trimmedName) {
    throw new Error('Display name cannot be empty.');
  }
  if (trimmedName.length > 32) {
    throw new Error('Display name cannot exceed 32 characters.');
  }

  await updateProfile(auth.currentUser, { displayName: trimmedName });
  await auth.currentUser.getIdToken(true);

  return {
    uid: auth.currentUser.uid,
    email: auth.currentUser.email,
    displayName: auth.currentUser.displayName || trimmedName,
  };
}

export async function logoutUser(): Promise<void> {
  if (!auth) return;
  await signOut(auth);
}

export async function getCurrentUserToken(forceRefresh = false): Promise<string | null> {
  if (!auth) return null;
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken(forceRefresh);
}

export function getCurrentUser(): UserProfile | null {
  if (!auth) return null;
  const user = auth.currentUser;
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
  };
}

export function subscribeToAuthChanges(
  callback: (user: UserProfile | null) => void
): () => void {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      callback({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
      });
    } else {
      callback(null);
    }
  });
}
