import { logger } from "../utils/logger.js";
import { AppError } from "../utils/errors.js";
export function errorHandler(error, req, res, _next) {
  let status = error instanceof AppError ? error.status : 500;
  let code = error instanceof AppError ? error.code : "INTERNAL_ERROR";
  let message =
    error instanceof AppError
      ? error.message
      : "The operation could not be completed. Please try again.";
  if (error.name === "ZodError") {
    status = 400;
    code = "INVALID_INPUT";
    message = "Please check the supplied fields.";
  }
  if (error.name === "CastError") {
    status = 404;
    code = "NOT_FOUND";
    message = "The requested resource was not found.";
  }
  if (error.code === 11000) {
    status = 409;
    code = "CONFLICT";
    message = "That record already exists.";
  }
  if (error.code === "LIMIT_FILE_SIZE") {
    status = 413;
    code = "FILE_TOO_LARGE";
    message = "The file exceeds the upload limit.";
  }
  if (error.name === "MulterError" && status === 500) {
    status = 400;
    code = "INVALID_UPLOAD";
    message = "The upload is malformed.";
  }
  if (error.type === "entity.parse.failed") {
    status = 400;
    code = "INVALID_JSON";
    message = "The request must contain valid JSON.";
  }
  if (error.type === "entity.too.large") {
    status = 413;
    code = "REQUEST_TOO_LARGE";
    message = "The request body exceeds the size limit.";
  }
  logger.warn({ requestId: req.id, code, status }, "Request failed");
  res.status(status).json({ error: { code, message, requestId: req.id } });
}
