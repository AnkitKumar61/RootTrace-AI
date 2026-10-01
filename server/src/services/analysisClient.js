import axios from "axios";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
export const analysisHttp = axios.create({
  baseURL: env.AI_SERVICE_URL,
  timeout: 120000,
  headers: { "X-Service-Secret": env.AI_SERVICE_SECRET },
});
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
