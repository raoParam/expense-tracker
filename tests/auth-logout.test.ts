import { handleLogoutSequence } from '../src/context/AuthContext';
import { NotificationService } from '../src/services/notification-service';
import * as authService from '../src/services/auth-service';

// Mock dependencies
jest.mock('../src/services/notification-service', () => ({
  NotificationService: {
    unregisterTokenFromBackend: jest.fn(),
  },
}));

jest.mock('../src/services/auth-service', () => ({
  logoutUser: jest.fn(),
  getCurrentUser: jest.fn(() => null),
  subscribeToAuthChanges: jest.fn(() => () => {}),
  loginWithEmail: jest.fn(),
  registerWithEmail: jest.fn(),
  getCurrentUserToken: jest.fn(),
}));

describe('AuthContext handleLogoutSequence Regression Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('proves unregister request happens BEFORE Firebase signOut', async () => {
    const executionOrder: string[] = [];

    const mockUnregister = jest.fn(async () => {
      executionOrder.push('unregister_push_token');
    });

    const mockSignOut = jest.fn(async () => {
      executionOrder.push('firebase_sign_out');
    });

    await handleLogoutSequence(mockUnregister, mockSignOut);

    expect(mockUnregister).toHaveBeenCalledTimes(1);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(executionOrder).toEqual(['unregister_push_token', 'firebase_sign_out']);
  });

  it('handles offline or network failures gracefully without blocking Firebase signOut', async () => {
    const mockUnregister = jest.fn(async () => {
      throw new Error('Device offline - network unreachable');
    });

    const mockSignOut = jest.fn(async () => {
      // Sign out succeeds even if unregister failed
      return undefined;
    });

    await expect(handleLogoutSequence(mockUnregister, mockSignOut)).resolves.not.toThrow();

    expect(mockUnregister).toHaveBeenCalledTimes(1);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('propagates signOut errors if Firebase signOut itself fails', async () => {
    const mockUnregister = jest.fn(async () => {});
    const mockSignOut = jest.fn(async () => {
      throw new Error('Firebase internal error');
    });

    await expect(handleLogoutSequence(mockUnregister, mockSignOut)).rejects.toThrow(
      'Firebase internal error'
    );

    expect(mockUnregister).toHaveBeenCalledTimes(1);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('proves default handleLogoutSequence executes authenticated unregister request before Firebase signOut', async () => {
    let unregisterExecutedWithAuth = false;
    let signedOut = false;

    (authService.getCurrentUserToken as jest.Mock).mockImplementation(async () => {
      return signedOut ? null : 'valid-mock-firebase-id-token';
    });

    (NotificationService.unregisterTokenFromBackend as jest.Mock).mockImplementation(async () => {
      const activeToken = await authService.getCurrentUserToken();
      if (activeToken === 'valid-mock-firebase-id-token' && !signedOut) {
        unregisterExecutedWithAuth = true;
      }
    });

    (authService.logoutUser as jest.Mock).mockImplementation(async () => {
      signedOut = true;
    });

    await handleLogoutSequence();

    expect(unregisterExecutedWithAuth).toBe(true);
    expect(signedOut).toBe(true);
    expect(NotificationService.unregisterTokenFromBackend).toHaveBeenCalledTimes(1);
    expect(authService.logoutUser).toHaveBeenCalledTimes(1);
  });

  it('proves default handleLogoutSequence proceeds to signOut when unregisterTokenFromBackend fails (offline/timeout)', async () => {
    let signedOut = false;

    (NotificationService.unregisterTokenFromBackend as jest.Mock).mockRejectedValue(
      new Error('Network timeout / device offline')
    );

    (authService.logoutUser as jest.Mock).mockImplementation(async () => {
      signedOut = true;
    });

    await expect(handleLogoutSequence()).resolves.not.toThrow();

    expect(signedOut).toBe(true);
    expect(NotificationService.unregisterTokenFromBackend).toHaveBeenCalledTimes(1);
    expect(authService.logoutUser).toHaveBeenCalledTimes(1);
  });
});
