import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { rootDir } from "../config/env.js";
import { authenticate } from "../middleware/auth.js";
import { projectAccess } from "../middleware/ownership.js";
import { Source } from "../models/Source.js";
import { Project } from "../models/Project.js";
import { EvaluationRun } from "../models/EvaluationRun.js";
import { analysisRequest } from "../services/analysisClient.js";
import { asyncRoute, AppError } from "../utils/errors.js";
const input = z
  .object({
    topK: z.number().int().min(1).max(30).default(8),
    includeReports: z.boolean().default(false),
  })
  .strict();
const metric = z.number().min(0).max(1).nullable();
const output = z
  .object({
    datasetVersion: z.string().max(80),
    topK: z.number().int().min(1).max(30),
    includeReports: z.boolean(),
    totalCases: z.number().int().nonnegative(),
    completedCases: z.number().int().nonnegative(),
    failedCases: z.number().int().nonnegative(),
    hitRate: metric,
    recall: metric,
    precision: metric,
    citationValidity: metric,
    citationCount: z.number().int().nonnegative(),
    isolation: z.object({
      checkedEvidence: z.number().int().nonnegative(),
      violations: z.number().int().nonnegative(),
    }),
    cases: z
      .array(
        z.object({
          id: z.string().max(80),
          category: z.string().max(120),
          title: z.string().max(200),
          knownCause: z.string().max(1000),
          expectedEvidenceIds: z.array(z.uuid()).max(1000),
          retrievedEvidenceIds: z.array(z.uuid()).max(30).optional(),
          status: z.enum(["COMPLETED", "FAILED"]),
          hit: metric.optional(),
          recall: metric.optional(),
          precision: metric.optional(),
          retrievalDurationMs: z.number().nonnegative().optional(),
          evidenceSufficiency: z
            .enum(["SUFFICIENT", "PARTIAL", "INSUFFICIENT"])
            .optional(),
          error: z.string().max(200).optional(),
        }),
      )
      .max(20),
  })
  .strict();
export function evaluationRoutes({
  evaluate = (data) =>
    analysisRequest("POST", "/internal/evaluate", data, { timeout: 300000 }),
} = {}) {
  const router = Router({ mergeParams: true });
  router.use(authenticate, projectAccess());
  router.get(
    "/",
    asyncRoute(async (req, res) =>
      res.json({
        runs: await EvaluationRun.find({ projectId: req.project._id })
          .select("-result.cases")
          .sort({ createdAt: -1 })
          .limit(20),
      }),
    ),
  );
  router.get(
    "/dataset",
    asyncRoute(async (req, res) => {
      const dataset = JSON.parse(
        await fs.readFile(
          path.join(rootDir, "demo-data/evaluation/cases.json"),
          "utf8",
        ),
      );
      const ready = (
        await Source.find({ projectId: req.project._id, status: "READY" })
      ).map((s) => s.originalFileName);
      res.json({
        version: dataset.version,
        totalCases: dataset.cases.length,
        requiredFiles: dataset.requiredFiles,
        missingFiles: dataset.requiredFiles.filter((f) => !ready.includes(f)),
      });
    }),
  );
  router.get(
    "/:id",
    asyncRoute(async (req, res) => {
      const run = await EvaluationRun.findOne({
        _id: req.params.id,
        projectId: req.project._id,
      });
      if (!run) throw new AppError(404, "NOT_FOUND", "Evaluation not found.");
      res.json({ run });
    }),
  );
  router.post(
    "/",
    projectAccess(true),
    rateLimit({
      windowMs: 60000,
      limit: process.env.NODE_ENV === "test" ? 1000 : 2,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        error: {
          code: "RATE_LIMIT",
          message: "Evaluation limit reached. Retry in one minute.",
        },
      },
    }),
    asyncRoute(async (req, res) => {
      const options = input.parse(req.body);
      const sources = await Source.find({
        projectId: req.project._id,
        status: "READY",
      });
      const dataset = JSON.parse(
        await fs.readFile(
          path.join(rootDir, "demo-data/evaluation/cases.json"),
          "utf8",
        ),
      );
      const missing = dataset.requiredFiles.filter(
        (name) => !sources.some((s) => s.originalFileName === name),
      );
      if (missing.length)
        throw new AppError(
          409,
          "DATASET_MISSING",
          `Upload and index the supplied ShopFlow files first. Missing: ${missing.join(", ")}`,
        );
      await EvaluationRun.init();
      await EvaluationRun.updateMany(
        {
          projectId: req.project._id,
          status: "RUNNING",
          createdAt: { $lt: new Date(Date.now() - 360000) },
        },
        {
          $set: {
            status: "FAILED",
            failureMessage: "Evaluation timed out. Please retry.",
          },
        },
      );
      let run;
      try {
        run = await EvaluationRun.create({
          ...options,
          projectId: req.project._id,
          userId: req.user._id,
        });
      } catch (e) {
        if (e.code === 11000)
          throw new AppError(
            409,
            "EVALUATION_RUNNING",
            "An evaluation is already running for this project.",
          );
        throw e;
      }
      try {
        if (
          !(await Project.exists({ _id: req.project._id, status: "ACTIVE" }))
        ) {
          await EvaluationRun.deleteOne({ _id: run._id });
          throw new AppError(
            409,
            "PROJECT_DELETING",
            "This project is being deleted.",
          );
        }
        const raw = await evaluate({
          projectId: String(req.project._id),
          readySourceIds: sources.map((s) => String(s._id)),
          ...options,
        });
        let result;
        try {
          result = output.parse(raw);
        } catch {
          throw new AppError(
            502,
            "INVALID_EVALUATION",
            "The evaluation returned invalid results. Please retry.",
          );
        }
        if (!(await Project.exists({ _id: req.project._id, status: "ACTIVE" })))
          throw new AppError(
            409,
            "PROJECT_DELETING",
            "This project is being deleted.",
          );
        const saved = await EvaluationRun.findOneAndUpdate(
          { _id: run._id, status: "RUNNING" },
          {
            $set: {
              result,
              status: result.failedCases ? "PARTIAL" : "COMPLETED",
            },
          },
          { new: true },
        );
        if (!saved)
          throw new AppError(
            409,
            "EVALUATION_EXPIRED",
            "Evaluation expired. Please retry.",
          );
        res.status(201).json({ run: saved });
      } catch (e) {
        await EvaluationRun.updateOne(
          { _id: run._id, status: "RUNNING" },
          {
            $set: {
              status: "FAILED",
              failureMessage:
                e instanceof AppError
                  ? e.message
                  : "Evaluation could not be completed.",
            },
          },
        );
        throw e;
      }
    }),
  );
  return router;
}
