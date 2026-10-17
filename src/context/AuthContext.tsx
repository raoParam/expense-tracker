import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  UserProfile,
  subscribeToAuthChanges,
  loginWithEmail,
  registerWithEmail,
  logoutUser,
  getCurrentUserToken,
  getCurrentUser,
} from '../services/auth-service';
import { NotificationService } from '../services/notification-service';

export interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  error: string | null;
  login: (email: string, pass: string) => Promise<void>;
  register: (email: string, pass: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  getToken: (forceRefresh?: boolean) => Promise<string | null>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Executes logout sequence ensuring push token is unregistered before Firebase session is cleared.
 * Safe against network failures or offline state so logout is never blocked.
 */
export async function handleLogoutSequence(
  unregisterFn = () => NotificationService.unregisterTokenFromBackend(),
  signOutFn = () => logoutUser()
): Promise<void> {
  try {
    await unregisterFn();
  } catch (notifErr: any) {
    console.warn(
      '[AuthContext] Failed to unregister device push token before logout:',
      notifErr?.message
    );
  }
  await signOutFn();
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(getCurrentUser());
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges((currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = async (email: string, pass: string) => {
    setError(null);
    setLoading(true);
    try {
      const loggedUser = await loginWithEmail(email, pass);
      setUser(loggedUser);
    } catch (err: any) {
      const msg = err?.message || 'Login failed. Please check your credentials.';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const register = async (email: string, pass: string, displayName?: string) => {
    setError(null);
    setLoading(true);
    try {
      const newUser = await registerWithEmail(email, pass, displayName);
      setUser(newUser);
    } catch (err: any) {
      const msg = err?.message || 'Registration failed. Please try again.';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setError(null);
    try {
      await handleLogoutSequence();
      setUser(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to logout.');
      throw err;
    }
  };

  const getToken = async (forceRefresh = false) => {
    return getCurrentUserToken(forceRefresh);
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        login,
        register,
        logout,
        getToken,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
