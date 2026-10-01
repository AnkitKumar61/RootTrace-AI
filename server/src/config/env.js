import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { z } from 'zod';
export const rootDir = fileURLToPath(new URL('../../../', import.meta.url));
dotenv.config({ path: path.join(rootDir, '.env'), quiet: true });
const schema = z.object({
  NODE_ENV: z.enum(['development','test','production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  CLIENT_URL: z.url().default('http://localhost:5173'),
  MONGODB_URI: z.string().default(''), REDIS_URL: z.string().default(''),
  JWT_SECRET: z.string().min(32), AI_SERVICE_SECRET: z.string().min(32),
  AI_SERVICE_URL: z.url().default('http://127.0.0.1:8000'),
  MAX_FILE_SIZE_MB: z.coerce.number().positive().max(100).default(20),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(1),
  INGEST_TIMEOUT_MS: z.coerce.number().int().positive().default(300000)
});
const parsed = schema.safeParse(process.env);
if (!parsed.success) throw new Error(`Invalid environment configuration: ${parsed.error.issues.map(i => i.path.join('.')).join(', ')}`);
export const env = parsed.data;
