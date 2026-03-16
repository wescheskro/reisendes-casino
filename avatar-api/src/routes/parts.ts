import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { partsService } from '../services/parts';
import { storageService } from '../services/storage';

export const partsRouter = Router();
partsRouter.use(authMiddleware);

partsRouter.get('/', async (req, res) => {
  try {
    const category = req.query.category as string | undefined;
    const parts = await partsService.list(category);
    res.json(parts);
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

partsRouter.get('/:id/glb', async (req, res) => {
  try {
    const part = await partsService.getById(req.params.id);
    if (!part) {
      return res.status(404).json({ error: 'part_not_found' });
    }
    const data = await storageService.download(part.glbUrl);
    res.set('Content-Type', 'model/gltf-binary');
    res.send(data);
  } catch (err: any) {
    if (err.name === 'NoSuchKey') {
      return res.status(404).json({ error: 'part_not_found' });
    }
    res.status(502).json({ error: 'storage_error' });
  }
});
