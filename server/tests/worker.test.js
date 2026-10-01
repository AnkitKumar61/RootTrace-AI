import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { testDatabase } from "./helpers.js";
import { Project } from "../src/models/Project.js";
import { Source } from "../src/models/Source.js";
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
