import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import dotenv from "dotenv";
dotenv.config({ quiet: true });
const root = process.cwd(),
  python = path.resolve(
    "ai-service/.venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  );
if (!fs.existsSync(python) || !fs.existsSync("node_modules")) {
  console.error("Install dependencies and run npm run doctor first.");
  process.exit(1);
}
const commands = [
  ["server", process.execPath, ["server/src/server.js"]],
  ["worker", process.execPath, ["server/src/worker.js"]],
  [
    "analysis",
    python,
    [
      "-m",
      "uvicorn",
      "app.main:app",
      "--app-dir",
      "ai-service",
      "--host",
      "127.0.0.1",
      "--port",
      "8000",
    ],
  ],
  [
    "client",
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      "5173",
      "--strictPort",
    ],
    "client",
  ],
];
const children = new Map();
let stopping = false;
function waitForExit(child, timeout) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) return resolve();
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve();
    }, timeout);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  console.log("Draining active work before stopping services…");
  for (const label of ["worker", "server"]) {
    const child = children.get(label);
    if (child?.connected) child.send("shutdown");
    await waitForExit(
      child,
      label === "worker"
        ? Number(process.env.INGEST_TIMEOUT_MS || 300000) + 10000
        : 350000,
    );
  }
  for (const label of ["analysis", "client"]) {
    const child = children.get(label);
    child?.kill("SIGTERM");
    await waitForExit(child, 5000);
  }
  process.exit(code);
}
for (const [label, binary, args, cwd] of commands) {
  const resolvedArgs =
    label === "client" ? [path.join(root, args[0]), ...args.slice(1)] : args;
  const child = spawn(binary, resolvedArgs, {
    cwd: cwd ? path.join(root, cwd) : root,
    stdio: [
      "ignore",
      "pipe",
      "pipe",
      ...(["worker", "server"].includes(label) ? ["ipc"] : []),
    ],
    windowsHide: true,
  });
  children.set(label, child);
  for (const stream of [child.stdout, child.stderr])
    readline
      .createInterface({ input: stream })
      .on("line", (line) => console.log(`[${label}] ${line}`));
  child.on("error", () => {
    console.error(`${label} failed to start.`);
    stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping) {
      console.error(`${label} stopped (${code ?? "signal"}).`);
      stop(1);
    }
  });
}
console.log(
  "Open http://localhost:5173. Press Ctrl+C to stop all four processes.",
);
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
