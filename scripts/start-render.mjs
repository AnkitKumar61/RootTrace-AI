import { fileURLToPath } from "node:url";
import { supervise } from "./process-supervisor.mjs";

try {
  const { env } = await import("../server/src/config/env.js");
  if (
    env.NODE_ENV !== "production" ||
    env.SERVE_CLIENT ||
    env.STORAGE_PROVIDER !== "imagekit" ||
    !env.API_PROXY_SECRET ||
    !env.MONGODB_URI ||
    !env.AI_SERVICE_URL.startsWith("https://")
  )
    throw new Error("Incomplete hosting configuration");
  const root = fileURLToPath(new URL("../", import.meta.url));
  const service = supervise({
    cwd: root,
    env: process.env,
    commands: [
      ["API", "server/src/server.js"],
      ["Worker", "server/src/start-worker.js"],
    ],
    // Render allows 300 seconds; leave time for process termination after draining.
    shutdownMs: 280000,
  });
  process.once("SIGTERM", () => service.stop());
  process.once("SIGINT", () => service.stop());
  process.exitCode = await service.done;
} catch {
  console.error(
    "Render startup failed. Check production origins, private storage, proxy secret, and managed-service configuration.",
  );
  process.exitCode = 1;
}
