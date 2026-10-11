import express from 'express';
import request from 'supertest';
import admin from 'firebase-admin';
import { requireAuth } from '../src/middleware/auth';
import { errorHandler } from '../src/middleware/errorHandler';

// Mock firebase-admin auth
jest.mock('firebase-admin', () => {
  const verifyIdTokenMock = jest.fn();
  return {
    apps: [{}],
    initializeApp: jest.fn(),
    credential: {
      cert: jest.fn(),
    },
    auth: () => ({
      verifyIdToken: verifyIdTokenMock,
    }),
    __mockVerifyIdToken: verifyIdTokenMock,
  };
});

describe('Authentication Middleware (requireAuth)', () => {
  let app: express.Express;
  const mockAdmin = admin as any;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Protected test route
    app.get('/protected', requireAuth, (req, res) => {
      res.status(200).json({
        message: 'Access granted',
        user: req.user,
      });
    });

    app.use(errorHandler);
    jest.clearAllMocks();
  });

  test('returns 401 UNAUTHORIZED when Authorization header is missing', async () => {
    const res = await request(app).get('/protected');

    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('returns 401 UNAUTHORIZED when header is not Bearer format', async () => {
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Basic 12345');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('returns 401 INVALID_TOKEN when Firebase verification fails', async () => {
    mockAdmin.__mockVerifyIdToken.mockRejectedValueOnce(
      new Error('Token is expired or invalid')
    );

    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer invalid-token-xyz');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  test('returns 200 and attaches user when Firebase token is valid', async () => {
    const mockDecodedToken = {
      uid: 'user_firebase_123',
      email: 'student@hostel.edu',
      name: 'Rohan Sharma',
    };

    mockAdmin.__mockVerifyIdToken.mockResolvedValueOnce(mockDecodedToken);

    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer valid-firebase-id-token');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Access granted');
    expect(res.body.user).toEqual({
      uid: 'user_firebase_123',
      email: 'student@hostel.edu',
      displayName: 'Rohan Sharma',
    });
  });
});
