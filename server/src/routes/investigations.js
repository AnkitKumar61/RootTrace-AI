import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { Investigation } from "../models/Investigation.js";
import { Source } from "../models/Source.js";
import { Project } from "../models/Project.js";
import { authenticate } from "../middleware/auth.js";
import { incidentAccess } from "./incidents.js";
import { analysisRequest } from "../services/analysisClient.js";
import { parseReport } from "../validators/report.js";
import { AppError, asyncRoute } from "../utils/errors.js";
const options = z
  .object({ topK: z.number().int().min(1).max(30).optional() })
  .strict();
export function investigationRoutes({
  investigate = (data) =>
    analysisRequest("POST", "/internal/investigate", data),
} = {}) {
  const router = Router();
  router.use(authenticate);
  router.get(
    "/:incidentId/investigations",
    incidentAccess(),
    asyncRoute(async (req, res) =>
      res.json({
        investigations: await Investigation.find({
          incidentId: req.incident._id,
        }).sort({ createdAt: -1 }),
      }),
    ),
  );
  router.post(
    "/:incidentId/investigate",
    rateLimit({
      windowMs: 60000,
      limit: process.env.NODE_ENV === "test" ? 1000 : 6,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        error: {
          code: "RATE_LIMIT",
          message: "Too many investigations. Retry in one minute.",
        },
      },
    }),
    incidentAccess(true),
    asyncRoute(async (req, res) => {
      const input = options.parse(req.body);
      await Investigation.init();
      await Investigation.updateMany(
        {
          incidentId: req.incident._id,
          status: "RUNNING",
          createdAt: { $lt: new Date(Date.now() - 180000) },
        },
        {
          $set: {
            status: "FAILED",
            failureMessage: "The investigation timed out. You can retry.",
          },
        },
      );
      let record;
      try {
        record = await Investigation.create({
          incidentId: req.incident._id,
          projectId: req.project._id,
          userId: req.user._id,
        });
      } catch (e) {
        if (e.code === 11000)
          throw new AppError(
            409,
            "INVESTIGATION_RUNNING",
            "An investigation is already running for this incident.",
          );
        throw e;
      }
      try {
        const readyIds = (
          await Source.find({
            projectId: req.project._id,
            status: "READY",
          }).select("_id")
        ).map((s) => String(s._id));
        const raw = await investigate({
          projectId: String(req.project._id),
          readySourceIds: readyIds,
          incident: {
            title: req.incident.title,
            description: req.incident.description,
            affectedService: req.incident.affectedService,
            startTime: req.incident.startTime?.toISOString() ?? null,
            endTime: req.incident.endTime?.toISOString() ?? null,
          },
          ...input,
        });
        let report;
        try {
          report = parseReport(raw, req.project._id, readyIds);
        } catch {
          throw new AppError(
            502,
            "INVALID_REPORT",
            "The provider returned an invalid report. Please retry.",
          );
        }
        if (!(await Project.exists({ _id: req.project._id, status: "ACTIVE" })))
          throw new AppError(
            409,
            "PROJECT_DELETING",
            "This project is being deleted.",
          );
        const saved = await Investigation.findOneAndUpdate(
          { _id: record._id, status: "RUNNING" },
          { $set: { ...report, status: "COMPLETED" } },
          { new: true },
        );
        if (!saved)
          throw new AppError(
            409,
            "INVESTIGATION_EXPIRED",
            "The investigation expired. Please retry.",
          );
        res.status(201).json({ investigation: saved });
      } catch (e) {
        await Investigation.updateOne(
          { _id: record._id, status: "RUNNING" },
          {
            $set: {
              status: "FAILED",
              failureMessage:
                e instanceof AppError
                  ? e.message
                  : "The investigation could not be completed. Please retry.",
            },
          },
        );
        throw e;
      }
    }),
  );
  return router;
}
export function reportRoutes() {
  const router = Router();
  router.use(authenticate);
  router.get(
    "/:id",
    asyncRoute(async (req, res) => {
      const report = await Investigation.findOne({
        _id: req.params.id,
        userId: req.user._id,
      });
      if (
        !report ||
        !(await Project.exists({ _id: report.projectId, userId: req.user._id }))
      )
        throw new AppError(404, "NOT_FOUND", "Investigation not found.");
      res.json({ investigation: report });
    }),
  );
  return router;
}
