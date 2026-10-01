import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";
dotenv.config({ quiet: true });
if (process.env.NODE_ENV === "production") {
  const response = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", "await import('./server/src/config/env.js')"],
    { stdio: "ignore" },
  );
  if (response.status !== 0) {
    console.error(
      "Invalid production environment. Check HTTPS origin, Redis TLS and secret lengths.",
    );
    process.exit(1);
  }
}
let failures = 0;
function check(label, ok) {
  console.log(`${ok ? "OK" : "MISSING"} ${label}`);
  if (!ok) failures++;
}
check("Node.js 24 or later", Number(process.versions.node.split(".")[0]) >= 24);
check(
  "JavaScript dependencies",
  fs.existsSync("node_modules/express") && fs.existsSync("node_modules/vite"),
);
const python = path.resolve(
  "ai-service/.venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
check("Project Python environment", fs.existsSync(python));
if (fs.existsSync(python)) {
  const runtime = spawnSync(
    python,
    [
      "-c",
      "import sys; import fastapi, qdrant_client, google.genai; assert sys.version_info >= (3,11)",
    ],
    { stdio: "ignore" },
  );
  check("Python 3.11+ and analysis dependencies", runtime.status === 0);
}
for (const name of [
  "MONGODB_URI",
  "REDIS_URL",
  "JWT_SECRET",
  "AI_SERVICE_SECRET",
  "GEMINI_API_KEY",
  "QDRANT_URL",
  "QDRANT_API_KEY",
])
  check(`${name} configured`, Boolean(process.env[name]?.trim()));
check(
  "Session/internal secrets are distinct and long",
  process.env.JWT_SECRET?.length >= 32 &&
    process.env.AI_SERVICE_SECRET?.length >= 32 &&
    process.env.JWT_SECRET !== process.env.AI_SERVICE_SECRET,
);
check("Redis uses TLS", process.env.REDIS_URL?.startsWith("rediss://"));
if (process.argv.includes("--live")) {
  try {
    const response = await fetch(
      `http://127.0.0.1:${process.env.PORT || 5000}/api/health/ready`,
      { signal: AbortSignal.timeout(12000) },
    );
    check("Live service readiness", response.ok);
  } catch {
    check("Live service readiness", false);
  }
}
process.exitCode = failures ? 1 : 0;
