import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { testDatabase } from "./helpers.js";
import { Project } from "../src/models/Project.js";
import { Source } from "../src/models/Source.js";
import { LocalStorage } from "../src/services/storage.js";
import { cleanupProject } from "../src/services/cleanup.js";
let close, dir;
before(async () => {
  close = await testDatabase();
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "roottrace-cleanup-"));
});
after(async () => {
  await close?.();
  if (dir) await fs.rm(dir, { recursive: true, force: true });
});
test("partial deletion resumes idempotently and deletes project last", async () => {
  const store = new LocalStorage(dir);
  const saved = await store.save({
    originalname: "logs.log",
    buffer: Buffer.from("test log"),
  });
  const project = await Project.create({
    name: "Cleanup",
    userId: "123456789012345678901234",
    status: "DELETING",
  });
  await Source.create({
    ...saved,
    projectId: project._id,
    userId: project.userId,
    originalFileName: "logs.log",
    sourceType: "log",
  });
  let vectorCalls = 0,
    fail = true;
  const options = {
    store: {
      remove: async (name) => {
        await store.remove(name);
        if (fail) {
          fail = false;
          throw Error("temporary disk failure");
        }
      },
    },
    removeVectors: async () => {
      vectorCalls++;
    },
  };
  await assert.rejects(cleanupProject(String(project._id), options));
  assert.ok(await Project.exists({ _id: project._id }));
  assert.equal(await Source.countDocuments({ projectId: project._id }), 1);
  assert.deepEqual(
    (await Project.findById(project._id)).cleanupSteps.toObject(),
    ["vectors"],
  );
  assert.deepEqual(await cleanupProject(String(project._id), options), {
    deleted: true,
  });
  assert.equal(vectorCalls, 1);
  assert.equal(await Source.countDocuments({ projectId: project._id }), 0);
  assert.equal(await Project.findById(project._id), null);
  assert.deepEqual(await cleanupProject(String(project._id), options), {
    skipped: true,
  });
});
test("cleanup waits for active ingestion before removing anything", async () => {
  const project = await Project.create({
    name: "Busy cleanup",
    userId: "123456789012345678901234",
    status: "DELETING",
  });
  await assert.rejects(
    cleanupProject(String(project._id), {
      queue: {
        getJobs: async () => [
          { name: "ingest", data: { projectId: String(project._id) } },
        ],
      },
      removeVectors: async () => assert.fail(),
    }),
    (e) => e.code === "CLEANUP_WAIT",
  );
  assert.ok(await Project.exists({ _id: project._id }));
});
