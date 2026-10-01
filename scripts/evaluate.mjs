import { parseArgs } from "node:util";
import fs from "node:fs/promises";
import dotenv from "dotenv";
import axios from "axios";
dotenv.config({ quiet: true });
try {
  const { values } = parseArgs({
    options: {
      project: { type: "string" },
      "top-k": { type: "string", default: "8" },
      reports: { type: "boolean", default: false },
    },
  });
  const topK = Number(values["top-k"]);
  if (
    !/^[a-f0-9]{24}$/.test(values.project || "") ||
    !Number.isInteger(topK) ||
    topK < 1 ||
    topK > 30
  )
    throw new Error(
      "Usage: npm run evaluate -- --project <projectId> --top-k 8 [--reports]",
    );
  if (!process.env.ROOTTRACE_EVAL_EMAIL || !process.env.ROOTTRACE_EVAL_PASSWORD)
    throw new Error(
      "Set ROOTTRACE_EVAL_EMAIL and ROOTTRACE_EVAL_PASSWORD in the private .env file.",
    );
  const http = axios.create({
    baseURL: process.env.ROOTTRACE_API_URL || "http://127.0.0.1:5000/api",
    timeout: 320000,
    headers: { Origin: process.env.CLIENT_URL || "http://localhost:5173" },
  });
  const login = await http.post("/auth/login", {
    email: process.env.ROOTTRACE_EVAL_EMAIL,
    password: process.env.ROOTTRACE_EVAL_PASSWORD,
  });
  http.defaults.headers.Cookie = login.headers["set-cookie"]
    .map((c) => c.split(";")[0])
    .join("; ");
  const { data } = await http.post(`/projects/${values.project}/evaluation`, {
    topK,
    includeReports: values.reports,
  });
  await fs.mkdir(".local", { recursive: true });
  await fs.writeFile(
    ".local/evaluation-latest.json",
    JSON.stringify(data.run, null, 2),
  );
  const result = data.run.result;
  console.log(
    JSON.stringify(
      {
        status: data.run.status,
        completedCases: result.completedCases,
        totalCases: result.totalCases,
        failedCases: result.failedCases,
        hitRate: result.hitRate,
        recall: result.recall,
        precision: result.precision,
        citationValidity: result.citationValidity,
        isolation: result.isolation,
      },
      null,
      2,
    ),
  );
  console.log("Full results saved privately to .local/evaluation-latest.json.");
  if (result.failedCases) process.exitCode = 1;
} catch (error) {
  console.error(
    error.isAxiosError
      ? error.response?.data?.error?.message ||
          "Evaluation request unavailable."
      : error.message,
  );
  process.exitCode = 1;
}
