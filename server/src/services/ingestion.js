import fs from "node:fs";
import FormData from "form-data";
import { z } from "zod";
import { analysisRequest } from "./analysisClient.js";
import { env } from "../config/env.js";
const result = z.object({
  chunkCount: z.number().int().positive(),
  durationMs: z.number().nonnegative().optional(),
});
export async function ingestSource(source) {
  const form = new FormData();
  form.append("projectId", String(source.projectId));
  form.append("sourceId", String(source._id));
  form.append("sourceType", source.sourceType);
  const stream = fs.createReadStream(source.filePath);
  form.append("file", stream, {
    filename: source.originalFileName,
    contentType: source.mimeType || "text/plain",
  });
  try {
    return result.parse(
      await analysisRequest("POST", "/internal/ingest", form, {
        headers: form.getHeaders(),
        timeout: env.INGEST_TIMEOUT_MS,
        maxBodyLength: env.MAX_FILE_SIZE_MB * 1024 * 1024 + 10000,
      }),
    );
  } finally {
    stream.destroy();
  }
}
