import axios from "axios";
import { setTimeout as delay } from "node:timers/promises";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
export const analysisHttp = axios.create({
  baseURL: env.AI_SERVICE_URL,
  timeout: 120000,
  headers: { "X-Service-Secret": env.AI_SERVICE_SECRET },
});
export async function waitForAnalysis({
  client = analysisHttp,
  timeoutMs = 120000,
  now = Date.now,
  sleep = delay,
  isActive = async () => true,
  onWaiting = async () => {},
} = {}) {
  const deadline = now() + timeoutMs;
  let notified = false;
  // Wake an idle service before opening a file stream. A cold host may reject
  // multipart POSTs immediately while it is still starting.
  while (now() < deadline) {
    if (!(await isActive())) return false;
    try {
      const response = await client.get("/health", {
        timeout: Math.min(10000, deadline - now()),
      });
      if (
        response.data?.status === "ok" &&
        response.data?.service === "roottrace-analysis"
      )
        return true;
    } catch {
      // Do not expose connection configuration or the host's error page.
    }
    if (!notified) {
      await onWaiting();
      notified = true;
    }
    const remaining = deadline - now();
    if (remaining > 0) await sleep(Math.min(5000, remaining));
  }
  throw new AppError(
    503,
    "ANALYSIS_UNAVAILABLE",
    "The analysis service is taking too long to start. Please retry later.",
  );
}
export async function analysisRequest(method, url, data, options = {}) {
  try {
    return (await analysisHttp.request({ method, url, data, ...options })).data;
  } catch (error) {
    const status = error.response?.status;
    if (status === 422)
      throw new AppError(
        422,
        "ANALYSIS_VALIDATION",
        "The evidence could not be processed. Check file format and incident details.",
      );
    if (status === 429)
      throw new AppError(
        429,
        "PROVIDER_LIMIT",
        "The provider quota was reached. Please retry later.",
      );
    throw new AppError(
      503,
      "ANALYSIS_UNAVAILABLE",
      "The analysis service is temporarily unavailable. Please try again.",
    );
  }
}
