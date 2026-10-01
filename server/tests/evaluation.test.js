import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { testDatabase, createApp, account, origin } from "./helpers.js";
import { Source } from "../src/models/Source.js";
test("evaluation requires ready dataset, protects ownership and persists measurements", async () => {
  const stop = await testDatabase();
  const app = createApp({
    evaluate: async (data) => {
      assert.equal(data.readySourceIds.length, 7);
      return {
        datasetVersion: "shopflow-v1",
        topK: 8,
        includeReports: false,
        totalCases: 15,
        completedCases: 15,
        failedCases: 0,
        hitRate: 1,
        recall: 1,
        precision: 0.25,
        citationValidity: null,
        citationCount: 0,
        isolation: { checkedEvidence: 120, violations: 0 },
        cases: [],
      };
    },
  });
  try {
    const a = await account(app),
      b = await account(app, "other-eval@example.test");
    const p = (
      await a
        .post("/api/projects")
        .set("Origin", origin)
        .send({ name: "ShopFlow" })
    ).body.project;
    const url = `/api/projects/${p._id}/evaluation`;
    assert.equal((await b.get(url)).status, 404);
    assert.equal(
      (await b.post(url).set("Origin", origin).send({})).status,
      404,
    );
    assert.equal(
      (await a.post(url).set("Origin", origin).send({})).status,
      409,
    );
    const dataset = JSON.parse(
      await fs.readFile(
        new URL("../../demo-data/evaluation/cases.json", import.meta.url),
        "utf8",
      ),
    );
    await Source.insertMany(
      dataset.requiredFiles.map((name) => ({
        projectId: p._id,
        userId: p.userId,
        originalFileName: name,
        storedFileName: "fixture",
        filePath: "fixture",
        sourceType: name.endsWith(".log") ? "log" : "document",
        mimeType: "text/plain",
        fileSize: 100,
        status: "READY",
      })),
    );
    assert.equal((await a.get(`${url}/dataset`)).body.missingFiles.length, 0);
    const completed = await a.post(url).set("Origin", origin).send({});
    assert.equal(completed.status, 201);
    assert.equal(completed.body.run.result.hitRate, 1);
    assert.equal((await a.get(`${url}/${completed.body.run._id}`)).status, 200);
    assert.equal((await b.get(`${url}/${completed.body.run._id}`)).status, 404);
  } finally {
    await stop();
  }
});
