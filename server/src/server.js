import mongoose from "mongoose";
import { createApp } from "./app.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
try {
  await connectDatabase();
  const server = createApp().listen(env.PORT, "127.0.0.1", () =>
    logger.info({ port: env.PORT }, "Server listening"),
  );
  const shutdown = () =>
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
} catch {
  logger.error(
    "Server startup failed. Check database connectivity and environment configuration.",
  );
  process.exit(1);
}
