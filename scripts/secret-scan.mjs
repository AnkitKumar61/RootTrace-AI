import { spawnSync } from "node:child_process";
import fs from "node:fs";
const tracked = spawnSync("git", ["ls-files", "-z"], { encoding: "utf8" });
if (tracked.status !== 0) process.exit(1);
const unsafe = tracked.stdout
  .split("\0")
  .filter(
    (file) =>
      file &&
      /(^|\/)(?:\.env(?:\..+)?|\.venv|node_modules|uploads|\.local|__pycache__)(?:\/|$)/.test(
        file,
      ) &&
      !file.endsWith(".env.example"),
  );
if (unsafe.length) {
  console.error(
    "Sensitive or generated files are tracked. Remove them from the index.",
  );
  process.exit(1);
}
let binary = "gitleaks";
if (process.platform === "win32" && fs.existsSync(".tools/gitleaks.exe"))
  binary = ".tools/gitleaks.exe";
const staged = process.argv.includes("--staged");
const args = [
  "git",
  "--redact",
  "--no-banner",
  ...(staged ? ["--pre-commit", "--staged"] : []),
];
const scan = spawnSync(binary, args, { stdio: "inherit" });
if (scan.error) {
  console.error(
    "Install Gitleaks from its official releases and rerun the scan.",
  );
  process.exit(1);
}
process.exit(scan.status ?? 1);
