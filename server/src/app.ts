import express, { Express } from 'express';
import cors from 'cors';
import { initFirebase } from './config/firebase';
import apiRouter from './routes';
import { notFoundHandler, errorHandler } from './middleware/errorHandler';

export function createApp(): Express {
  const app = express();

  // Initialize Firebase Admin SDK
  initFirebase();

  // Core Middleware
  app.use(
    cors({
      origin: true,
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    })
  );
  app.use(express.json());

  // Versioned API Routes (/api/v1)
  app.use('/api/v1', apiRouter);

  // 404 Handler for unmatched routes
  app.use(notFoundHandler);

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
}
