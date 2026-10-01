import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errors.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { checkOrigin } from './middleware/auth.js';
export function createApp() {
  const app=express();
  app.disable('x-powered-by');
  app.use((req,res,next)=>{ req.id=randomUUID(); res.setHeader('X-Request-ID',req.id); next(); });
  app.use(helmet());
  app.use(cors({ origin:env.CLIENT_URL, credentials:true }));
  app.use(express.json({ limit:'64kb' }));
  app.use(cookieParser());
  app.use(checkOrigin);
  app.use('/api/health',healthRoutes());
  app.use('/api/auth',authRoutes());
  app.use((_req,res)=>res.status(404).json({error:{code:'NOT_FOUND',message:'Route not found.'}}));
  app.use(errorHandler);
  return app;
}
