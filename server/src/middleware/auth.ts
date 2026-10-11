import { Request, Response, NextFunction } from 'express';
import admin from 'firebase-admin';
import { AppError } from './errorHandler';

export interface AuthenticatedUser {
  uid: string;
  email?: string;
  displayName?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(
      new AppError(
        'Authentication token is required. Provide Authorization: Bearer <token>',
        401,
        'UNAUTHORIZED'
      )
    );
    return;
  }

  const token = authHeader.split('Bearer ')[1]?.trim();

  if (!token) {
    next(
      new AppError(
        'Authentication token is malformed',
        401,
        'UNAUTHORIZED'
      )
    );
    return;
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      displayName: decodedToken.name,
    };
    next();
  } catch (error: any) {
    console.warn('[Auth Middleware] Token verification failed:', error?.message);
    next(
      new AppError(
        'Invalid, expired, or revoked authentication token',
        401,
        'INVALID_TOKEN'
      )
    );
  }
}
