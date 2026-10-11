import { Router } from 'express';
import healthRouter from './health';
import roomsRouter from './rooms';
import invitationsRouter from './invitations';
import expensesRouter from './expenses';
import settlementsRouter from './settlements';

const router = Router();

// Base /api/v1 routes
router.use('/', healthRouter);
router.use('/rooms', roomsRouter);
router.use('/invitations', invitationsRouter);
router.use('/expenses', expensesRouter);
router.use('/settlements', settlementsRouter);

export default router;
