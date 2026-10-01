import { Router } from "express";
import { z } from "zod";
import { Project } from "../models/Project.js";
import { authenticate } from "../middleware/auth.js";
import { projectAccess } from "../middleware/ownership.js";
import { asyncRoute, AppError } from "../utils/errors.js";
import { enqueueCleanup } from "../queues/workQueue.js";
const input = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(2000).default(""),
});
export function projectRoutes(services = {}) {
  const router = Router();
  router.use(authenticate);
  router.get(
    "/",
    asyncRoute(async (req, res) =>
      res.json({
        projects: await Project.find({ userId: req.user._id }).sort({
          createdAt: -1,
        }),
      }),
    ),
  );
  router.post(
    "/",
    asyncRoute(async (req, res) =>
      res.status(201).json({
        project: await Project.create({
          ...input.parse(req.body),
          userId: req.user._id,
        }),
      }),
    ),
  );
  router.get("/:projectId", projectAccess(), (req, res) =>
    res.json({ project: req.project }),
  );
  router.patch(
    "/:projectId",
    projectAccess(true),
    asyncRoute(async (req, res) => {
      Object.assign(req.project, input.partial().parse(req.body));
      await req.project.save();
      res.json({ project: req.project });
    }),
  );
  router.delete(
    "/:projectId",
    projectAccess(),
    asyncRoute(async (req, res) => {
      await Project.updateOne(
        { _id: req.project._id },
        { $set: { status: "DELETING", cleanupError: "" } },
      );
      try {
        await (services.enqueueCleanup || enqueueCleanup)(
          String(req.project._id),
        );
      } catch {
        await Project.updateOne(
          { _id: req.project._id },
          {
            $set: {
              cleanupError: "Cleanup could not be queued. Retry deletion.",
            },
          },
        );
        throw new AppError(
          503,
          "QUEUE_UNAVAILABLE",
          "The project is marked for deletion. Retry when the queue is available.",
        );
      }
      res.status(202).json({ status: "DELETING" });
    }),
  );
  return router;
}
