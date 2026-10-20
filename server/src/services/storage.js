import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { env, rootDir } from "../config/env.js";
import { ImageKitStorage } from "./imagekitStorage.js";
import { AppError } from "../utils/errors.js";
export class LocalStorage {
  constructor(directory = path.join(rootDir, "uploads")) {
    this.directory = path.resolve(directory);
  }
  resolve(fileName) {
    fileName =
      typeof fileName === "string" ? fileName : fileName?.storedFileName;
    if (typeof fileName !== "string" || !fileName)
      throw new AppError(400, "INVALID_PATH", "Invalid source path.");
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
    return { storageProvider: "local", storedFileName, filePath };
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
  async open(source) {
    const filePath = this.resolve(source);
    try {
      const info = await fs.stat(filePath);
      return { stream: createReadStream(filePath), size: info.size };
    } catch {
      throw new AppError(
        404,
        "SOURCE_FILE_MISSING",
        "The source file is unavailable.",
      );
    }
  }
}

export class Storage {
  constructor(settings = env, { local = new LocalStorage(), imagekit } = {}) {
    this.settings = settings;
    this.local = local;
    this.imagekit = imagekit;
  }
  provider(name) {
    if (name === "local") return this.local;
    if (name === "imagekit") {
      this.imagekit ??= new ImageKitStorage(this.settings);
      return this.imagekit;
    }
    throw new AppError(
      503,
      "STORAGE_UNAVAILABLE",
      "File storage is unavailable. Please retry later.",
    );
  }
  save(file) {
    return this.provider(this.settings.STORAGE_PROVIDER).save(file);
  }
  read(source) {
    return this.provider(source?.storageProvider || "local").read(source);
  }
  open(source) {
    return this.provider(source?.storageProvider || "local").open(source);
  }
  remove(source) {
    return this.provider(source?.storageProvider || "local").remove(source);
  }
}
export const storage = new Storage();
