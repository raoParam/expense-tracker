import { Router, Request, Response } from 'express';
import { getDatabaseStatus } from '../config/db';
import { isFirebaseInitialized } from '../config/firebase';

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'hostel-expense-api',
    version: '1.0.0',
    database: getDatabaseStatus(),
    firebase: isFirebaseInitialized() ? 'initialized' : 'unconfigured',
  });
});

export default router;
