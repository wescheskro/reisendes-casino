import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';

export const avatarRouter = Router();
avatarRouter.use(authMiddleware);

avatarRouter.get('/:userId', (req, res) => {
  res.status(404).json({ error: 'avatar_not_found' });
});
