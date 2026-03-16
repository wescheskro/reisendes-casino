import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth';
import { avatarService } from '../services/avatar';

export const avatarRouter = Router();
avatarRouter.use(authMiddleware);

const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files allowed'));
      return;
    }
    cb(null, true);
  },
});

avatarRouter.post('/save', async (req, res) => {
  try {
    const avatar = await avatarService.save(req.user!.userId, req.body);
    res.json(avatar);
  } catch (err) {
    console.error('avatar route error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

avatarRouter.post('/thumbnail', async (req, res) => {
  if (!req.body.thumbnailDataUrl) {
    return res.status(422).json({ error: 'missing_thumbnail' });
  }
  try {
    const avatar = await avatarService.save(req.user!.userId, {
      thumbnailDataUrl: req.body.thumbnailDataUrl,
    });
    res.json({ thumbnailUrl: avatar.thumbnailUrl });
  } catch (err) {
    console.error('avatar route error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

avatarRouter.post('/generate', upload.single('photo'), async (req, res) => {
  if (!req.file && !req.body.photo) {
    return res.status(422).json({ error: 'no_photo', hint: 'Bitte lade ein Foto mit einem klar sichtbaren Gesicht hoch' });
  }
  res.status(503).json({ error: 'ai_service_unavailable', retry_after: 30 });
});

avatarRouter.post('/interpret', async (req, res) => {
  if (!req.body.text) {
    return res.status(422).json({ error: 'missing_text' });
  }
  res.status(503).json({ error: 'ai_service_unavailable', retry_after: 30 });
});

avatarRouter.get('/:userId', async (req, res) => {
  try {
    const avatar = await avatarService.getByUserId(req.params.userId);
    if (!avatar) {
      return res.status(404).json({ error: 'avatar_not_found' });
    }
    res.json(avatar);
  } catch (err) {
    console.error('avatar route error:', err);
    res.status(500).json({ error: 'internal_error' });
  }
});

avatarRouter.use((err: any, _req: any, res: any, next: any) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'file_too_large', max: '10MB' });
  }
  if (err.message === 'Only image files allowed') {
    return res.status(422).json({ error: 'invalid_file_type', hint: 'Nur Bilddateien erlaubt' });
  }
  next(err);
});
