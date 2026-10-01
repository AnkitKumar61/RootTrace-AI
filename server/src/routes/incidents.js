import { Router } from "express";
import { z } from "zod";
import { Incident } from "../models/Incident.js";
import { Project } from "../models/Project.js";
import { authenticate } from "../middleware/auth.js";
import { projectAccess } from "../middleware/ownership.js";
import { asyncRoute, AppError } from "../utils/errors.js";
const input = z
  .object({
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().min(10).max(6000),
    affectedService: z.string().trim().max(120).default(""),
    startTime: z.iso
      .datetime()
      .transform((v) => new Date(v))
      .optional(),
    endTime: z.iso
      .datetime()
      .transform((v) => new Date(v))
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.startTime && data.endTime && data.endTime < data.startTime)
      ctx.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "End time must follow start time",
      });
  });
export const incidentAccess = (active = false) =>
  asyncRoute(async (req, _res, next) => {
    const incident = await Incident.findOne({
      _id: req.params.incidentId,
      userId: req.user._id,
    });
    if (!incident) throw new AppError(404, "NOT_FOUND", "Incident not found.");
    const project = await Project.findOne({
      _id: incident.projectId,
      userId: req.user._id,
    });
    if (!project) throw new AppError(404, "NOT_FOUND", "Project not found.");
    if (active && project.status !== "ACTIVE")
      throw new AppError(
        409,
        "PROJECT_DELETING",
        "This project is being deleted.",
      );
    req.incident = incident;
    req.project = project;
    next();
  });
export function projectIncidentRoutes() {
  const router = Router({ mergeParams: true });
  router.use(authenticate, projectAccess());
  router.get(
    "/",
    asyncRoute(async (req, res) =>
      res.json({
        incidents: await Incident.find({ projectId: req.project._id }).sort({
          createdAt: -1,
        }),
      }),
    ),
  );
  router.post(
    "/",
    projectAccess(true),
    asyncRoute(async (req, res) =>
      res
        .status(201)
        .json({
          incident: await Incident.create({
            ...input.parse(req.body),
            projectId: req.project._id,
            userId: req.user._id,
          }),
        }),
    ),
  );
  return router;
}
export function incidentRoutes() {
  const router = Router();
  router.use(authenticate);
  router.get("/:incidentId", incidentAccess(), (req, res) =>
    res.json({ incident: req.incident }),
  );
  router.patch(
    "/:incidentId",
    incidentAccess(true),
    asyncRoute(async (req, res) => {
      req.incident.status = z.enum(["OPEN", "RESOLVED"]).parse(req.body.status);
      await req.incident.save();
      res.json({ incident: req.incident });
    }),
  );
  return router;
}
