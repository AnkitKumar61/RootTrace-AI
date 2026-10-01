import Redis from "ioredis";
import { env } from "./env.js";
import { logger } from "../utils/logger.js";
export function createRedis({ worker = false } = {}) {
  if (!env.REDIS_URL) throw new Error("REDIS_URL is required");
  const connection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: worker ? null : 1,
    enableReadyCheck: false,
    connectTimeout: 5000,
    ...(worker ? {} : { commandTimeout: 5000 }),
    retryStrategy: (attempt) => Math.min(attempt * 500, 5000),
  });
  connection.on("error", () => logger.warn("Redis connection unavailable"));
  return connection;
}
