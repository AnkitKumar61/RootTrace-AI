import mongoose from "mongoose";
import { Project } from "../models/Project.js";
import { Source } from "../models/Source.js";
import { storage } from "./storage.js";
import { analysisRequest } from "./analysisClient.js";
import { AppError } from "../utils/errors.js";
export async function cleanupProject(
  projectId,
  {
    queue,
    store = storage,
    removeVectors = (id) =>
      analysisRequest("DELETE", `/internal/projects/${id}`),
  } = {},
) {
  const project = await Project.findById(projectId);
  if (!project) return { skipped: true };
  if (project.status !== "DELETING")
    throw new AppError(
      409,
      "PROJECT_ACTIVE",
      "Only projects marked for deletion can be cleaned up.",
    );
  const sources = await Source.find({ projectId }).select("+storedFileName");
  if (queue) {
    const active = await queue.getJobs(["active"]);
    if (
      active.some(
        (job) => job.name === "ingest" && job.data.projectId === projectId,
      )
    )
      throw new AppError(
        503,
        "CLEANUP_WAIT",
        "Waiting for source processing to stop.",
      );
    for (const source of sources) {
      if (!source.bullmqJobId) continue;
      const job = await queue.getJob(source.bullmqJobId);
      if (
        job &&
        ["waiting", "delayed", "paused"].includes(await job.getState())
      )
        await job.remove();
    }
  }
  const running = await mongoose.connection
    .collection("investigations")
    .countDocuments({
      projectId: project._id,
      status: "RUNNING",
      createdAt: { $gte: new Date(Date.now() - 180000) },
    });
  if (running)
    throw new AppError(
      503,
      "CLEANUP_WAIT",
      "Waiting for the current investigation to stop.",
    );
  const completed = new Set(project.cleanupSteps);
  const step = async (name, operation) => {
    if (completed.has(name)) return;
    await operation();
    await Project.updateOne(
      { _id: projectId, status: "DELETING" },
      { $addToSet: { cleanupSteps: name }, $set: { cleanupError: "" } },
    );
  };
  try {
    await step("vectors", () => removeVectors(projectId));
    await step("files", async () => {
      for (const source of sources) await store.remove(source.storedFileName);
    });
    await step("records", async () => {
      for (const name of [
        "sources",
        "incidents",
        "investigations",
        "evaluationruns",
      ])
        await mongoose.connection
          .collection(name)
          .deleteMany({ projectId: project._id });
    });
    await Project.deleteOne({ _id: projectId, status: "DELETING" });
    return { deleted: true };
  } catch (error) {
    await Project.updateOne(
      { _id: projectId },
      {
        $set: {
          cleanupError:
            "Cleanup is incomplete. It will retry safely; use Retry deletion if retries are exhausted.",
        },
      },
    );
    throw error;
  }
}
