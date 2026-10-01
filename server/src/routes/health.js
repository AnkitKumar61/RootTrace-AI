import { Router } from "express";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { analysisHttp } from "../services/analysisClient.js";
export function healthRoutes() {
  const router = Router();
  router.get("/", (_req, res) =>
    res.json({ status: "ok", service: "roottrace-server" }),
  );
  router.get("/ready", async (_req, res) => {
    const dependencies = {
      database: mongoose.connection.readyState === 1,
      redisConfigured: Boolean(env.REDIS_URL),
      analysis: false,
    };
    try {
      dependencies.analysis =
        (await analysisHttp.get("/health/ready", { timeout: 3000 })).status ===
        200;
    } catch {
      /* Readiness is reported without provider error details. */
    }
    const ready = Object.values(dependencies).every(Boolean);
    res
      .status(ready ? 200 : 503)
      .json({ status: ready ? "ready" : "unavailable", dependencies });
  });
  return router;
}
