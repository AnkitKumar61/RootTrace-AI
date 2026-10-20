import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable, Transform } from "node:stream";
import ImageKit, { toFile } from "@imagekit/nodejs";
import { AppError } from "../utils/errors.js";

const remotePath = /^\/roottrace\/[a-f0-9-]{36}\.(log|txt|json|md)$/;
function unavailable() {
  return new AppError(
    503,
    "STORAGE_UNAVAILABLE",
    "File storage is unavailable. Please retry later.",
  );
}
function safeError(error) {
  if (error instanceof AppError) return error;
  if (error?.status === 404)
    return new AppError(
      404,
      "SOURCE_FILE_MISSING",
      "The source file is unavailable.",
    );
  if (error?.status === 429)
    return new AppError(
      429,
      "STORAGE_LIMIT",
      "File storage limit reached. Please retry later.",
    );
  return unavailable();
}

export class ImageKitStorage {
  constructor(settings, { client, fetcher = fetch } = {}) {
    this.endpoint = settings.IMAGEKIT_URL_ENDPOINT.replace(/\/+$/, "");
    this.maxBytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024;
    this.client =
      client ||
      new ImageKit({
        privateKey: settings.IMAGEKIT_PRIVATE_KEY,
        maxRetries: 0,
        timeout: 60000,
        logLevel: "off",
      });
    this.fetcher = fetcher;
  }
  reference(source) {
    if (
      !remotePath.test(source?.storedFileName) ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(source?.storageFileId || "")
    )
      throw unavailable();
    return source;
  }
  async save(file) {
    const fileName =
      randomUUID() + path.extname(file.originalname).toLowerCase();
    const storedFileName = `/roottrace/${fileName}`;
    if (!remotePath.test(storedFileName) || file.buffer.length > this.maxBytes)
      throw new AppError(
        400,
        "INVALID_UPLOAD",
        "The file exceeds storage limits or has an unsupported format.",
      );
    try {
      const result = await this.client.files.upload({
        file: await toFile(file.buffer, fileName, { type: "text/plain" }),
        fileName,
        folder: "/roottrace",
        useUniqueFileName: false,
        overwriteFile: false,
        isPrivateFile: true,
        responseFields: ["isPrivateFile"],
      });
      const reference = {
        storageProvider: "imagekit",
        storedFileName,
        storageFileId: result.fileId,
      };
      this.reference(reference);
      if (result.isPrivateFile !== true || result.filePath !== storedFileName) {
        await this.remove(reference);
        throw unavailable();
      }
      return reference;
    } catch (error) {
      throw safeError(error);
    }
  }
  async open(source) {
    this.reference(source);
    try {
      const url = this.client.helper.buildSrc({
        urlEndpoint: this.endpoint,
        src: source.storedFileName,
        signed: true,
        expiresIn: 300,
      });
      const parsed = new URL(url);
      if (
        parsed.origin !== new URL(this.endpoint).origin ||
        parsed.protocol !== "https:"
      )
        throw unavailable();
      const response = await this.fetcher(url, {
        redirect: "error",
        signal: AbortSignal.timeout(60000),
        headers: { "Accept-Encoding": "identity" },
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw { status: response.status };
      }
      if (!response.body) throw unavailable();
      const declared = response.headers.get("content-length");
      const size = source.fileSize ?? (declared ? Number(declared) : undefined);
      if (
        (size !== undefined &&
          (!Number.isSafeInteger(size) || size < 0 || size > this.maxBytes)) ||
        (declared &&
          (!Number.isSafeInteger(Number(declared)) ||
            Number(declared) > this.maxBytes))
      ) {
        await response.body.cancel();
        throw unavailable();
      }
      let bytes = 0;
      const maxBytes = this.maxBytes;
      const input = Readable.fromWeb(response.body);
      const stream = new Transform({
        transform(chunk, _encoding, callback) {
          bytes += chunk.length;
          callback(
            bytes > (size ?? Infinity) || bytes > maxBytes
              ? unavailable()
              : null,
            chunk,
          );
        },
        flush(callback) {
          callback(size !== undefined && bytes !== size ? unavailable() : null);
        },
      });
      // Keep streamed bytes bounded even if the provider omits Content-Length.
      input.once("error", () => stream.destroy(unavailable()));
      stream.once("close", () => input.destroy());
      input.pipe(stream);
      return { stream, size };
    } catch (error) {
      throw safeError(error);
    }
  }
  async read(source) {
    const { stream } = await this.open(source);
    const chunks = [];
    try {
      for await (const chunk of stream) chunks.push(chunk);
      return Buffer.concat(chunks).toString("utf8");
    } catch (error) {
      throw safeError(error);
    } finally {
      stream.destroy();
    }
  }
  async remove(source) {
    this.reference(source);
    try {
      await this.client.files.delete(source.storageFileId);
    } catch (error) {
      if (error?.status !== 404) throw safeError(error);
    }
  }
}
