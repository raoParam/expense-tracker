import request from 'supertest';
import { createApp } from '../src/app';

// Mock Firebase Admin to prevent background connection handles in test suite
jest.mock('firebase-admin', () => ({
  apps: [{}],
  initializeApp: jest.fn(),
  credential: {
    cert: jest.fn(),
  },
  auth: () => ({
    verifyIdToken: jest.fn(),
  }),
}));

describe('Health Check Endpoint (GET /api/v1/health)', () => {
  const app = createApp();

  test('returns 200 OK with health details', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('service', 'hostel-expense-api');
    expect(res.body).toHaveProperty('version', '1.0.0');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('database');
    expect(res.body).toHaveProperty('firebase');
  });
});
