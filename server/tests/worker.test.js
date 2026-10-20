import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { testDatabase } from "./helpers.js";
import { Project } from "../src/models/Project.js";
import { Source } from "../src/models/Source.js";
import { AppError } from "../src/utils/errors.js";
import {
  processIngestion,
  recordIngestionFailure,
} from "../src/workers/ingestionWorker.js";
let close, dir;
before(async () => {
  close = await testDatabase();
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "roottrace-worker-"));
});
after(async () => {
  await close?.();
  if (dir) await fs.rm(dir, { recursive: true, force: true });
});
async function fixture() {
  const project = await Project.create({
    name: "Worker fixture",
    userId: "123456789012345678901234",
  });
  const filePath = path.join(dir, "sample.log");
  await fs.writeFile(filePath, "ERROR timeout");
  const source = await Source.create({
    projectId: project._id,
    userId: project.userId,
    originalFileName: "sample.log",
    storedFileName: "sample.log",
    filePath,
    sourceType: "log",
    status: "QUEUED",
  });
  const values = [];
  const job = {
    name: "ingest",
    data: { sourceId: String(source._id), projectId: String(project._id) },
    opts: { attempts: 3 },
    attemptsMade: 1,
    updateProgress: async (p) => values.push(p),
  };
  return { project, source, job, values };
}
test("fake processor proves progress and duplicate protection", async () => {
  const { source, job, values } = await fixture();
  let calls = 0;
  await processIngestion(job, {
    ingest: async () => {
      calls++;
      return { chunkCount: 3 };
    },
  });
  assert.deepEqual(values, [10, 30, 90, 100]);
  assert.equal((await Source.findById(source._id)).status, "READY");
  await processIngestion(job, {
    ingest: async () => {
      calls++;
    },
  });
  assert.equal(calls, 1);
});
test("retries end in FAILED and skip deleting or missing projects", async () => {
  const { project, source, job } = await fixture();
  await assert.rejects(
    processIngestion(job, {
      ingest: async () => {
        throw Error("provider unavailable");
      },
    }),
  );
  await recordIngestionFailure(job);
  assert.equal((await Source.findById(source._id)).status, "QUEUED");
  job.attemptsMade = 3;
  await recordIngestionFailure(job);
  assert.equal((await Source.findById(source._id)).status, "FAILED");
  await Project.updateOne(
    { _id: project._id },
    { $set: { status: "DELETING" } },
  );
  assert.deepEqual(
    await processIngestion(job, { ingest: async () => assert.fail() }),
    { skipped: true },
  );
  await Project.deleteOne({ _id: project._id });
  assert.deepEqual(
    await processIngestion(job, { ingest: async () => assert.fail() }),
    { skipped: true },
  );
});

test("provider limits remain clear through retries without exposing raw errors", async () => {
  const { source, job } = await fixture();
  const error = new AppError(
    429,
    "PROVIDER_LIMIT",
    "private provider response must not be exposed",
  );
  await recordIngestionFailure(job, error);
  let saved = await Source.findById(source._id);
  assert.equal(saved.status, "QUEUED");
  assert.match(saved.processingError, /usage limit.*automatic retry/);
  assert.doesNotMatch(saved.processingError, /private provider/);
  job.attemptsMade = 3;
  await recordIngestionFailure(job, error);
  saved = await Source.findById(source._id);
  assert.equal(saved.status, "FAILED");
  assert.equal(saved.processingStage, "Provider usage limit reached");
  assert.match(saved.processingError, /Your file is saved.*limit to reset/);
  assert.doesNotMatch(
    saved.processingError,
    /Check service availability|private provider/,
  );
  await processIngestion(job, { ingest: async () => ({ chunkCount: 2 }) });
  await recordIngestionFailure(job, error);
  saved = await Source.findById(source._id);
  assert.equal(saved.status, "READY");
  assert.equal(saved.processingError, "");
});

test("service failures and unknown errors use distinct safe messages", async () => {
  const { source, job } = await fixture();
  job.attemptsMade = 3;
  await recordIngestionFailure(
    job,
    new AppError(503, "ANALYSIS_UNAVAILABLE", "private address"),
  );
  assert.match(
    (await Source.findById(source._id)).processingError,
    /analysis service.*Your file is saved/,
  );
  await recordIngestionFailure(job, new Error("private address"));
  const saved = await Source.findById(source._id);
  assert.match(saved.processingError, /Processing failed after retries/);
  assert.doesNotMatch(saved.processingError, /private address/);
});

test("workers process cloud references without a local path and persist safe storage failures", async () => {
  const { source, job } = await fixture();
  await Source.updateOne(
    { _id: source._id },
    {
      $set: { storageProvider: "imagekit", storageFileId: "fictional-id" },
      $unset: { filePath: "" },
    },
  );
  await processIngestion(job, {
    ingest: async (stored) => {
      assert.equal(stored.storageProvider, "imagekit");
      assert.equal(stored.storageFileId, "fictional-id");
      assert.equal(stored.filePath, undefined);
      return { chunkCount: 1 };
    },
  });
  assert.equal((await Source.findById(source._id)).status, "READY");
  await Source.updateOne({ _id: source._id }, { status: "PROCESSING" });
  job.attemptsMade = 3;
  await recordIngestionFailure(
    job,
    new AppError(503, "STORAGE_UNAVAILABLE", "private key marker"),
  );
  const saved = await Source.findById(source._id);
  assert.equal(saved.status, "FAILED");
  assert.match(saved.processingError, /storage/);
  assert.doesNotMatch(saved.processingError, /private key marker/);
});

test("workers show startup waiting and stop if a project is deleted during the wait", async () => {
  const { project, source, job, values } = await fixture();
  const result = await processIngestion(job, {
    ingest: async (_source, { isActive, onWaiting }) => {
      await onWaiting();
      assert.match(
        (await Source.findById(source._id)).processingStage,
        /Waiting for analysis service/,
      );
      await Project.updateOne(
        { _id: project._id },
        { $set: { status: "DELETING" } },
      );
      assert.equal(Boolean(await isActive()), false);
      return { skipped: true };
    },
  });
  assert.deepEqual(result, { skipped: true });
  assert.deepEqual(values, [10, 30, 30]);
  assert.notEqual((await Source.findById(source._id)).status, "READY");
});
