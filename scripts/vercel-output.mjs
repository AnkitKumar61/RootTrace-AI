import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export function vercelConfig(values) {
  let origin;
  try {
    origin = new URL(values.RENDER_API_ORIGIN);
  } catch {
    /* handled below */
  }
  if (
    !origin ||
    origin.protocol !== "https:" ||
    origin.origin !== values.RENDER_API_ORIGIN ||
    !origin.hostname.endsWith(".onrender.com")
  )
    throw new Error(
      "RENDER_API_ORIGIN must be the Render API HTTPS origin, without a trailing slash.",
    );
  const secret = values.API_PROXY_SECRET || "";
  if (
    secret.length < 32 ||
    secret.length > 256 ||
    !/^[A-Za-z0-9+/_=-]+$/.test(secret)
  )
    throw new Error(
      "Set API_PROXY_SECRET to the same private value on Vercel and Render.",
    );
  return {
    version: 3,
    routes: [
      {
        src: "/.*",
        headers: {
          "X-Content-Type-Options": "nosniff",
          "Referrer-Policy": "strict-origin-when-cross-origin",
          "X-Frame-Options": "DENY",
        },
        continue: true,
      },
      {
        src: "^(/api(?:/.*)?)$",
        dest: `${origin.origin}$1`,
        headers: {
          "Cache-Control": "no-store",
          "CDN-Cache-Control": "no-store",
          "x-vercel-enable-rewrite-caching": "0",
        },
        transforms: [
          {
            type: "request.headers",
            op: "set",
            target: { key: "X-RootTrace-Proxy" },
            args: secret,
          },
        ],
      },
      { handle: "filesystem" },
      { src: "/.*", dest: "/index.html" },
    ],
  };
}

export async function writeVercelOutput(root, values) {
  const config = vercelConfig(values);
  const output = path.join(root, ".vercel/output");
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  // Only Vite's public output is copied; the private routing config stays outside static/.
  await cp(path.join(root, "client/dist"), path.join(output, "static"), {
    recursive: true,
  });
  await writeFile(
    path.join(output, "config.json"),
    JSON.stringify(config, null, 2) + "\n",
  );
}
