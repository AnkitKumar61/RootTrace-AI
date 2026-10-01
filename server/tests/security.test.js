import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createApp, testDatabase, account, origin } from "./helpers.js";
import { Project } from "../src/models/Project.js";
import { Source } from "../src/models/Source.js";
import { parseReport } from "../src/validators/report.js";
import { recordIngestionFailure } from "../src/workers/ingestionWorker.js";
test("malformed JSON and unexpected exceptions never echo request data", async () => {
  const response = await request(createApp())
    .post("/api/auth/login")
    .set("Content-Type", "application/json")
    .send('{"password":"private-marker"');
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "INVALID_JSON");
  assert.ok(!response.text.includes("private-marker"));
  assert.equal(response.headers["cache-control"], "no-store");
  const large = await request(createApp())
    .post("/api/auth/register")
    .send({ name: "x".repeat(70000) });
  assert.equal(large.status, 413);
  assert.equal(large.body.error.code, "REQUEST_TOO_LARGE");
});
test("an upload racing project deletion removes its file and metadata before queueing", async () => {
  const stop = await testDatabase();
  let projectId,
    removed = 0,
    queued = 0;
  const app = createApp({
    storage: {
      save: async () => {
        await Project.updateOne(
          { _id: projectId },
          { $set: { status: "DELETING" } },
        );
        return {
          storedFileName: "fixture.txt",
          filePath: "private-fixture.txt",
        };
      },
      remove: async () => {
        removed++;
      },
    },
    enqueue: async () => {
      queued++;
    },
  });
  try {
    const a = await account(app);
    projectId = (
      await a
        .post("/api/projects")
        .set("Origin", origin)
        .send({ name: "Race fixture" })
    ).body.project._id;
    const response = await a
      .post(`/api/projects/${projectId}/sources`)
      .set("Origin", origin)
      .field("sourceType", "log")
      .attach("file", Buffer.from("ERROR timeout"), {
        filename: "fixture.log",
        contentType: "text/plain",
      });
    assert.equal(response.status, 409);
    assert.equal(removed, 1);
    assert.equal(queued, 0);
    assert.equal(await Source.countDocuments(), 0);
    const ready = await Source.create({
      projectId,
      userId: (await Project.findById(projectId)).userId,
      originalFileName: "ready.log",
      storedFileName: "fixture",
      filePath: "fixture",
      sourceType: "log",
      mimeType: "text/plain",
      fileSize: 12,
      status: "READY",
    });
    await recordIngestionFailure({
      name: "ingest",
      data: { sourceId: ready._id },
      attemptsMade: 3,
      opts: { attempts: 3 },
    });
    assert.equal((await Source.findById(ready._id)).status, "READY");
  } finally {
    await stop();
  }
});
test("report validation rejects cross-project evidence and fabricated source citations", () => {
  const id = randomUUID(),
    sourceId = "b".repeat(24),
    projectId = "a".repeat(24);
  const value = {
    summary: "Timeout",
    suspectedCauses: [
      { cause: "Failure", reasoning: "Timeout recorded.", evidenceIds: [id] },
    ],
    affectedServices: [],
    nextSteps: ["Check availability"],
    evidenceSufficiency: "PARTIAL",
    retrievedEvidence: [
      {
        chunkId: id,
        evidenceId: id,
        projectId,
        sourceId,
        fileName: "test.log",
        chunkType: "log",
        lineStart: 1,
        lineEnd: 1,
        text: "ERROR timeout",
        score: 0.8,
      },
    ],
    modelInformation: {
      provider: "fixture",
      model: "fixture",
      embeddingModel: "fixture",
      topK: 8,
      retrievalDurationMs: 1,
      generationDurationMs: 1,
    },
  };
  assert.equal(parseReport(value, projectId, [sourceId]).summary, "Timeout");
  assert.throws(() => parseReport(value, "c".repeat(24), [sourceId]));
  assert.throws(() => parseReport(value, projectId, []));
  value.suspectedCauses[0].evidenceIds = [randomUUID()];
  assert.throws(() => parseReport(value, projectId, [sourceId]));
});
