import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { avatarService } from '../services/avatar';

export const avatarRouter = Router();
avatarRouter.use(authMiddleware);

avatarRouter.get('/:userId', async (req, res) => {
  try {
    const avatar = await avatarService.getByUserId(req.params.userId);
    if (!avatar) {
      return res.status(404).json({ error: 'avatar_not_found' });
    }
    res.json(avatar);
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

avatarRouter.post('/save', async (req, res) => {
  try {
    const avatar = await avatarService.save(req.user!.userId, req.body);
    res.json(avatar);
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});
