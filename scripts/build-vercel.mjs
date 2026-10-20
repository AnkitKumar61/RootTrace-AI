import { fileURLToPath } from "node:url";
import { build } from "vite";
import { vercelConfig, writeVercelOutput } from "./vercel-output.mjs";

try {
  // Fail before building if routing is incomplete. Never load the root .env here.
  vercelConfig(process.env);
  const root = fileURLToPath(new URL("../", import.meta.url));
  await build({ root: fileURLToPath(new URL("../client/", import.meta.url)) });
  await writeVercelOutput(root, process.env);
  console.log("Frontend and private API routing prepared for Vercel.");
} catch {
  console.error(
    "Vercel build failed. Check RENDER_API_ORIGIN, API_PROXY_SECRET, and the client build. Values are not logged.",
  );
  process.exitCode = 1;
}
