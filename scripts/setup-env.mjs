import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { populateSecrets } from "./env-template.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const target = path.join(root, ".env");
let contents;
try {
  contents = await fs.readFile(target, "utf8");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
  contents = await fs.readFile(path.join(root, ".env.example"), "utf8");
}
contents = populateSecrets(contents);
await fs.writeFile(target, contents, { mode: 0o600 });
console.log(
  "Private environment file prepared. Existing values were preserved. Fill managed-service credentials in .env.",
);
