import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import mongoose from "mongoose";
import { testDatabase } from "./helpers.js";
import { Project } from "../src/models/Project.js";
import { Source } from "../src/models/Source.js";
import { LocalStorage, Storage } from "../src/services/storage.js";
import { ImageKitStorage } from "../src/services/imagekitStorage.js";
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
  const legacyRuns = mongoose.connection.collection("evaluationruns");
  await legacyRuns.insertOne({ projectId: project._id, status: "COMPLETED" });
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
  assert.equal(await legacyRuns.countDocuments({ projectId: project._id }), 0);
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

test("mixed local and cloud cleanup resumes after a lost delete response and removes project last", async () => {
  const local = new LocalStorage(dir);
  const old = await local.save({
    originalname: "legacy.log",
    buffer: Buffer.from("fictional source"),
  });
  const project = await Project.create({
    name: "Mixed cleanup",
    userId: "123456789012345678901234",
    status: "DELETING",
  });
  const legacy = await Source.create({
    ...old,
    projectId: project._id,
    userId: project.userId,
    originalFileName: "legacy.log",
    sourceType: "log",
  });
  await Source.collection.updateOne(
    { _id: legacy._id },
    { $unset: { storageProvider: "" } },
  );
  await Source.create({
    storageProvider: "imagekit",
    storedFileName: "/roottrace/12345678-1234-1234-1234-123456789012.log",
    storageFileId: "fictional-id",
    projectId: project._id,
    userId: project.userId,
    originalFileName: "cloud.log",
    sourceType: "log",
  });
  let calls = 0;
  const cloud = new ImageKitStorage(
    {
      IMAGEKIT_URL_ENDPOINT: "https://ik.imagekit.io/fictional",
      MAX_FILE_SIZE_MB: 20,
    },
    {
      client: {
        files: {
          delete: async (id) => {
            assert.equal(id, "fictional-id");
            calls++;
            throw { status: calls === 1 ? 503 : 404 };
          },
        },
      },
    },
  );
  const store = new Storage(
    { STORAGE_PROVIDER: "imagekit" },
    { local, imagekit: cloud },
  );
  const options = { store, removeVectors: async () => {} };
  await assert.rejects(cleanupProject(String(project._id), options));
  assert.ok(await Project.exists({ _id: project._id }));
  assert.equal(await Source.countDocuments({ projectId: project._id }), 2);
  assert.deepEqual(
    (await Project.findById(project._id)).cleanupSteps.toObject(),
    ["vectors"],
  );
  assert.deepEqual(await cleanupProject(String(project._id), options), {
    deleted: true,
  });
  assert.equal(calls, 2);
  assert.equal(await Source.countDocuments({ projectId: project._id }), 0);
  assert.equal(await Project.findById(project._id), null);
});
