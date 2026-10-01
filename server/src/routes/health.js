import { Router } from "express";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { analysisHttp } from "../services/analysisClient.js";
import { getQueue } from "../queues/workQueue.js";
export function healthRoutes() {
  const router = Router();
  router.get("/config", (_req, res) =>
    res.json({
      maxFileSizeMB: env.MAX_FILE_SIZE_MB,
      acceptedExtensions: [".log", ".txt", ".json", ".md"],
    }),
  );
  router.get("/", (_req, res) =>
    res.json({ status: "ok", service: "roottrace-server" }),
  );
  router.get("/ready", async (_req, res) => {
    const dependencies = {
      database: mongoose.connection.readyState === 1,
      redis: false,
      analysis: false,
    };
    await Promise.allSettled([
      (async () => {
        if (env.REDIS_URL)
          dependencies.redis =
            (await (await getQueue().client).ping()) === "PONG";
      })(),
      (async () => {
        dependencies.analysis =
          (await analysisHttp.get("/health/ready", { timeout: 5000 }))
            .status === 200;
      })(),
    ]);
    const ready = Object.values(dependencies).every(Boolean);
    res
      .status(ready ? 200 : 503)
      .json({ status: ready ? "ready" : "unavailable", dependencies });
  });
  return router;
}
