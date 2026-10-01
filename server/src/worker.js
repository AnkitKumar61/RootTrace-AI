import mongoose from "mongoose";
import { Worker } from "bullmq";
import { connectDatabase } from "./config/database.js";
import { createRedis } from "./config/redis.js";
import { env } from "./config/env.js";
import {
  queueName,
  getQueue,
  closeQueue,
  enqueue,
  enqueueCleanup,
} from "./queues/workQueue.js";
import {
  processIngestion,
  recordIngestionFailure,
} from "./workers/ingestionWorker.js";
import { cleanupProject } from "./services/cleanup.js";
import { Project } from "./models/Project.js";
import { Source } from "./models/Source.js";
import { logger } from "./utils/logger.js";
import { ingestSource } from "./services/ingestion.js";
await connectDatabase();
const connection = createRedis({ worker: true });
const queue = getQueue();
const worker = new Worker(
  queueName,
  async (job) => {
    logger.info({ jobId: job.id, operation: job.name }, "Job started");
    if (job.name === "cleanup")
      return cleanupProject(job.data.projectId, { queue });
    if (job.name === "ingest")
      return processIngestion(job, { ingest: ingestSource });
    throw new Error("Unknown job type");
  },
  { connection, concurrency: env.WORKER_CONCURRENCY },
);
worker.on("failed", (job) => {
  recordIngestionFailure(job).catch(() =>
    logger.error("Could not persist job failure"),
  );
  if (job?.name === "cleanup" && job.attemptsMade >= (job.opts.attempts || 1))
    Project.updateOne(
      { _id: job.data.projectId },
      {
        $set: {
          cleanupError:
            "Cleanup needs attention. Check service availability and retry deletion.",
        },
      },
    ).catch(() => logger.error("Could not persist cleanup failure"));
  logger.warn(
    { jobId: job?.id, attempts: job?.attemptsMade },
    "Job attempt failed",
  );
});
worker.on("completed", (job) =>
  logger.info({ jobId: job.id }, "Job completed"),
);
worker.on("error", () => logger.warn("Worker connection unavailable"));
// MongoDB remains the durable record of work if queue data is lost.
for (const project of await Project.find({ status: "DELETING" }))
  await enqueueCleanup(String(project._id));
for (const source of await Source.find({
  status: { $in: ["UPLOADED", "QUEUED", "PROCESSING"] },
}).select("+filePath")) {
  if (!(await Project.exists({ _id: source.projectId, status: "ACTIVE" })))
    continue;
  const id = `ingest-${source._id}`;
  if (!(await queue.getJob(id))) {
    await Source.updateOne(
      { _id: source._id },
      { $set: { status: "QUEUED", bullmqJobId: id } },
    );
    await enqueue("ingest", id, {
      sourceId: String(source._id),
      projectId: String(source.projectId),
      userId: String(source.userId),
      filePath: source.filePath,
    });
  }
}
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  logger.info("Worker draining");
  await worker.close();
  await connection.quit();
  await closeQueue();
  await mongoose.disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
