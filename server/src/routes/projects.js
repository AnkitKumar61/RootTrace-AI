import { Router } from "express";
import { z } from "zod";
import { Project } from "../models/Project.js";
import { authenticate } from "../middleware/auth.js";
import { projectAccess } from "../middleware/ownership.js";
import { asyncRoute, AppError } from "../utils/errors.js";
import { enqueueCleanup } from "../queues/workQueue.js";
import { Source } from "../models/Source.js";
import { Incident } from "../models/Incident.js";
import { Investigation } from "../models/Investigation.js";
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
  router.get(
    "/:projectId/dashboard",
    projectAccess(),
    asyncRoute(async (req, res) => {
      const projectId = req.project._id;
      const [sourceGroups, incidents, recentInvestigations, running] =
        await Promise.all([
          Source.aggregate([
            { $match: { projectId } },
            { $group: { _id: "$status", count: { $sum: 1 } } },
          ]),
          Incident.find({ projectId }).sort({ createdAt: -1 }).limit(5),
          Investigation.find({ projectId })
            .select(
              "incidentId status summary evidenceSufficiency failureMessage createdAt",
            )
            .sort({ createdAt: -1 })
            .limit(5)
            .populate("incidentId", "title"),
          Investigation.countDocuments({ projectId, status: "RUNNING" }),
        ]);
      const sources = Object.fromEntries(
        sourceGroups.map((s) => [s._id, s.count]),
      );
      res.json({
        sources,
        incidentCount: await Incident.countDocuments({ projectId }),
        incidents,
        recentInvestigations,
        activeWork:
          running > 0 ||
          ["QUEUED", "PROCESSING", "UPLOADED"].some((s) => sources[s] > 0),
      });
    }),
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
