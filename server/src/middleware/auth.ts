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
    let displayName = decodedToken.name;

    if (!displayName) {
      try {
        const userRecord = await admin.auth().getUser(decodedToken.uid);
        if (userRecord && userRecord.displayName) {
          displayName = userRecord.displayName;
        }
      } catch (userErr: any) {
        console.warn('[Auth Middleware] Could not fetch user profile from Firebase Admin:', userErr?.message);
      }
    }

    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      displayName,
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
