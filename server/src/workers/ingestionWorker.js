import fs from "node:fs/promises";
import { Source } from "../models/Source.js";
import { Project } from "../models/Project.js";
import { AppError } from "../utils/errors.js";
export async function processIngestion(job, { ingest } = {}) {
  const { sourceId, projectId } = job.data;
  const active = () => Project.exists({ _id: projectId, status: "ACTIVE" });
  if (!(await active())) return { skipped: true };
  const source = await Source.findOne({ _id: sourceId, projectId }).select(
    "+filePath +storedFileName",
  );
  if (!source) return { skipped: true };
  if (source.status === "READY") return { chunkCount: source.chunkCount };
  const progress = async (value, stage) => {
    await Source.updateOne(
      { _id: sourceId },
      {
        $set: {
          status: "PROCESSING",
          processingProgress: value,
          processingStage: stage,
          processingError: "",
        },
      },
    );
    await job.updateProgress(value);
  };
  await Source.updateOne({ _id: sourceId }, { $inc: { attempts: 1 } });
  await fs.access(source.filePath);
  await progress(10, "Stored file validated");
  if (!(await active())) return { skipped: true };
  await progress(30, "Stored source accepted; parsing, embedding and indexing");
  if (!ingest)
    throw new AppError(
      503,
      "PROCESSOR_UNAVAILABLE",
      "Source processing is not available yet.",
    );
  const result = await ingest(source);
  if (!(await active())) return { skipped: true };
  await progress(90, "Indexing complete");
  await Source.updateOne(
    { _id: sourceId },
    {
      $set: {
        status: "READY",
        processingProgress: 100,
        processingStage: "Ready for retrieval",
        chunkCount: result.chunkCount,
        processingError: "",
      },
    },
  );
  await job.updateProgress(100);
  return result;
}
export async function recordIngestionFailure(job, error) {
  if (!job || job.name !== "ingest") return;
  const terminal = job.attemptsMade >= (job.opts.attempts || 1);
  const quotaReached = error?.code === "PROVIDER_LIMIT";
  let processingError = terminal
    ? "Processing failed after retries. Check service availability and retry this source."
    : "Temporary processing failure. A retry is scheduled.";
  if (quotaReached)
    processingError = terminal
      ? "The processing provider's usage limit was reached. Your file is saved. Wait for the limit to reset, then retry this source."
      : "The processing provider's usage limit was reached. Your file is saved and an automatic retry is scheduled.";
  else if (error?.code === "ANALYSIS_UNAVAILABLE")
    processingError = terminal
      ? "The analysis service could not be reached or complete processing. Your file is saved. Check that the service is running, then retry."
      : "The analysis service is unavailable. Your file is saved and an automatic retry is scheduled.";
  else if (error?.code === "ANALYSIS_VALIDATION")
    processingError =
      "The analysis service could not process this file. Check its text content and supported format before retrying.";
  await Source.updateOne(
    { _id: job.data.sourceId, status: { $ne: "READY" } },
    {
      $set: {
        status: terminal ? "FAILED" : "QUEUED",
        processingStage: terminal
          ? quotaReached
            ? "Provider usage limit reached"
            : "Processing failed"
          : "Waiting to retry",
        processingError,
      },
    },
  );
}
