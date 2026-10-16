import {
  createUserWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { registerWithEmail } from '../src/services/auth-service';

// Mock firebase/auth
jest.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: jest.fn(),
  updateProfile: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  onAuthStateChanged: jest.fn(),
}));

// Mock firebase initialization
jest.mock('../src/services/firebase', () => ({
  auth: {
    currentUser: null,
  },
  firebaseConfigError: null,
}));

describe('auth-service registration regression tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('registerWithEmail updates profile and force-refreshes token when displayName is provided', async () => {
    const mockGetIdToken = jest.fn().mockResolvedValue('fresh-jwt-token-with-name');
    const mockUser = {
      uid: 'user-new-123',
      email: 'rohan@hostel.edu',
      displayName: null,
      getIdToken: mockGetIdToken,
    };

    (createUserWithEmailAndPassword as jest.Mock).mockResolvedValueOnce({
      user: mockUser,
    });
    (updateProfile as jest.Mock).mockResolvedValueOnce(undefined);

    const profile = await registerWithEmail(
      'rohan@hostel.edu',
      'password123',
      'Rohan Sharma'
    );

    // Verify user was created
    expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(
      expect.anything(),
      'rohan@hostel.edu',
      'password123'
    );

    // Verify updateProfile was called with trimmed name
    expect(updateProfile).toHaveBeenCalledWith(mockUser, {
      displayName: 'Rohan Sharma',
    });

    // CRITICAL: Verify token was force-refreshed with true
    expect(mockGetIdToken).toHaveBeenCalledWith(true);

    // Verify returned UserProfile
    expect(profile).toEqual({
      uid: 'user-new-123',
      email: 'rohan@hostel.edu',
      displayName: 'Rohan Sharma',
    });
  });

  test('registerWithEmail does not call updateProfile or force token refresh when displayName is omitted', async () => {
    const mockGetIdToken = jest.fn();
    const mockUser = {
      uid: 'user-anon-456',
      email: 'anon@hostel.edu',
      displayName: null,
      getIdToken: mockGetIdToken,
    };

    (createUserWithEmailAndPassword as jest.Mock).mockResolvedValueOnce({
      user: mockUser,
    });

    const profile = await registerWithEmail(
      'anon@hostel.edu',
      'password123'
    );

    expect(createUserWithEmailAndPassword).toHaveBeenCalled();
    expect(updateProfile).not.toHaveBeenCalled();
    expect(mockGetIdToken).not.toHaveBeenCalled();
    expect(profile.displayName).toBeNull();
  });
});
