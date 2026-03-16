import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { avatarRouter } from './routes/avatar';
import { partsRouter } from './routes/parts';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({
    origin: config.corsOrigins,
    credentials: true,
  }));
  app.use(cookieParser());
  app.use(express.json({ limit: '10mb' }));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/avatar/parts', partsRouter);
  app.use('/api/avatar', avatarRouter);

  return app;
}
