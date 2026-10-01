import mongoose from "mongoose";
import { createApp } from "./app.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { closeQueue } from "./queues/workQueue.js";
try {
  await connectDatabase();
  const server = createApp().listen(env.PORT, env.HOST, () =>
    logger.info({ port: env.PORT }, "Server listening"),
  );
  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    server.close(async () => {
      await mongoose.disconnect();
      await closeQueue();
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("message", (message) => {
    if (message === "shutdown") shutdown();
  });
} catch {
  logger.error(
    "Server startup failed. Check database connectivity and environment configuration.",
  );
  process.exit(1);
}
