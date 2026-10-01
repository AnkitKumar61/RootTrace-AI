import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { rootDir } from "../config/env.js";
import { AppError } from "../utils/errors.js";
export class LocalStorage {
  constructor(directory = path.join(rootDir, "uploads")) {
    this.directory = path.resolve(directory);
  }
  resolve(fileName) {
    const resolved = path.resolve(this.directory, fileName);
    if (!resolved.startsWith(this.directory + path.sep))
      throw new AppError(400, "INVALID_PATH", "Invalid source path.");
    return resolved;
  }
  async save(file) {
    await fs.mkdir(this.directory, { recursive: true });
    const storedFileName =
      randomUUID() + path.extname(file.originalname).toLowerCase();
    const filePath = this.resolve(storedFileName);
    await fs.writeFile(filePath, file.buffer, { flag: "wx" });
    return { storedFileName, filePath };
  }
  async read(fileName) {
    try {
      return await fs.readFile(this.resolve(fileName), "utf8");
    } catch {
      throw new AppError(
        404,
        "SOURCE_FILE_MISSING",
        "The source file is unavailable.",
      );
    }
  }
  async remove(fileName) {
    await fs.rm(this.resolve(fileName), { force: true });
  }
}
export const storage = new LocalStorage();
