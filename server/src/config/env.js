import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { z } from "zod";
export const rootDir = fileURLToPath(new URL("../../../", import.meta.url));
dotenv.config({ path: path.join(rootDir, ".env"), quiet: true });
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  HOST: z.string().default("127.0.0.1"),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(2).default(0),
  SERVE_CLIENT: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  API_PROXY_SECRET: z
    .string()
    .default("")
    .refine(
      (v) =>
        !v ||
        (v.length >= 32 && v.length <= 256 && /^[A-Za-z0-9+/_=-]+$/.test(v)),
    ),
  CLIENT_URL: z.url().default("http://localhost:5173"),
  MONGODB_URI: z.string().default(""),
  REDIS_URL: z.string().default(""),
  JWT_SECRET: z.string().min(32),
  AI_SERVICE_SECRET: z.string().min(32),
  AI_SERVICE_URL: z.url().default("http://127.0.0.1:8000"),
  MAX_FILE_SIZE_MB: z.coerce.number().positive().max(100).default(20),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(1),
  QUEUE_NAME: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,80}$/)
    .default("roottrace-work"),
  INGEST_TIMEOUT_MS: z.coerce.number().int().positive().default(300000),
  STORAGE_PROVIDER: z.enum(["local", "imagekit"]).default("local"),
  IMAGEKIT_PRIVATE_KEY: z.string().trim().default(""),
  IMAGEKIT_URL_ENDPOINT: z.string().trim().default(""),
});
export function validateEnv(values) {
  const parsed = schema.safeParse(values);
  if (!parsed.success)
    throw new Error(
      `Invalid environment configuration: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  const result = parsed.data;
  if (result.STORAGE_PROVIDER === "imagekit") {
    let endpoint;
    try {
      endpoint = new URL(result.IMAGEKIT_URL_ENDPOINT);
    } catch {
      throw new Error("Invalid ImageKit configuration: IMAGEKIT_URL_ENDPOINT");
    }
    if (
      !result.IMAGEKIT_PRIVATE_KEY ||
      endpoint.protocol !== "https:" ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash
    )
      throw new Error(
        "Invalid ImageKit configuration: check private key and HTTPS endpoint",
      );
  }
  if (new URL(result.CLIENT_URL).origin !== result.CLIENT_URL)
    throw new Error(
      "CLIENT_URL must be an origin without a path or trailing slash",
    );
  if (
    result.NODE_ENV === "production" &&
    (!result.CLIENT_URL.startsWith("https://") ||
      !result.REDIS_URL.startsWith("rediss://"))
  )
    throw new Error("Production requires an HTTPS client origin and Redis TLS");
  return result;
}
export const env = validateEnv(process.env);
