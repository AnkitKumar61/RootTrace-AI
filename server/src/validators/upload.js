import path from "node:path";
import { TextDecoder } from "node:util";
import { AppError } from "../utils/errors.js";
const types = new Set([
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "application/json",
  "application/octet-stream",
]);
export function validateFile(file) {
  if (!file?.buffer?.length)
    throw new AppError(400, "EMPTY_UPLOAD", "Choose a non-empty text file.");
  if (
    ![".log", ".txt", ".json", ".md"].includes(
      path.extname(file.originalname).toLowerCase(),
    )
  )
    throw new AppError(
      400,
      "UNSUPPORTED_FILE",
      "Supported files: .log, .txt, .json, .md.",
    );
  if (!types.has(file.mimetype))
    throw new AppError(
      400,
      "UNSUPPORTED_TYPE",
      "Only text logs and documentation can be uploaded.",
    );
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(file.buffer);
    if (text.includes("\0") || !text.trim()) throw new Error("invalid text");
  } catch {
    throw new AppError(
      400,
      "INVALID_TEXT",
      "The file must contain valid UTF-8 text.",
    );
  }
}
