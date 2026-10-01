import { Project } from "../models/Project.js";
import { AppError, asyncRoute } from "../utils/errors.js";
export const projectAccess = (active = false) =>
  asyncRoute(async (req, _res, next) => {
    const project = await Project.findOne({
      _id: req.params.projectId,
      userId: req.user._id,
    });
    if (!project) throw new AppError(404, "NOT_FOUND", "Project not found.");
    if (active && project.status !== "ACTIVE")
      throw new AppError(
        409,
        "PROJECT_DELETING",
        "This project is being deleted.",
      );
    req.project = project;
    next();
  });
