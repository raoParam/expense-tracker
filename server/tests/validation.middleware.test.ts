import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { validateRequest } from '../src/middleware/validate';
import { errorHandler } from '../src/middleware/errorHandler';

describe('Validation Middleware (validateRequest)', () => {
  let app: express.Express;

  const testSchema = {
    body: z.object({
      name: z.string().min(2, 'Name must be at least 2 chars'),
      amountPaise: z.number().int().positive('Amount must be positive integer'),
    }),
  };

  beforeEach(() => {
    app = express();
    app.use(express.json());

    app.post('/validate-test', validateRequest(testSchema), (req, res) => {
      res.status(200).json({ success: true, data: req.body });
    });

    app.use(errorHandler);
  });

  test('passes validation with valid payload', async () => {
    const res = await request(app)
      .post('/validate-test')
      .send({ name: 'Hostel PG', amountPaise: 5000 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({ name: 'Hostel PG', amountPaise: 5000 });
  });

  test('fails validation with 400 VALIDATION_ERROR and field details on invalid payload', async () => {
    const res = await request(app)
      .post('/validate-test')
      .send({ name: 'A', amountPaise: -10 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toBeInstanceOf(Array);
    expect(res.body.error.details.length).toBeGreaterThanOrEqual(2);
  });
});
