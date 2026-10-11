import express from 'express';
import request from 'supertest';
import { notFoundHandler, errorHandler, AppError } from '../src/middleware/errorHandler';

describe('Error Handling Middleware', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    app.get('/custom-error', (_req, _res, next) => {
      next(new AppError('Custom conflict occurred', 409, 'CONFLICT', { field: 'email' }));
    });

    app.get('/unhandled-error', (_req, _res, next) => {
      next(new Error('Unexpected database failure'));
    });

    app.use(notFoundHandler);
    app.use(errorHandler);
  });

  test('returns 404 NOT_FOUND for undefined routes', async () => {
    const res = await request(app).get('/non-existent-path');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Cannot GET /non-existent-path',
      },
    });
  });

  test('formats custom AppError accurately', async () => {
    const res = await request(app).get('/custom-error');

    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: {
        code: 'CONFLICT',
        message: 'Custom conflict occurred',
        details: { field: 'email' },
      },
    });
  });

  test('formats generic unhandled errors as 500 INTERNAL_SERVER_ERROR without leaking details', async () => {
    const res = await request(app).get('/unhandled-error');

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected internal error occurred',
      },
    });
  });
});
