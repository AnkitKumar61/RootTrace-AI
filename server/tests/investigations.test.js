import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { testDatabase, createApp, account, origin } from "./helpers.js";
import { Source } from "../src/models/Source.js";
import { Investigation } from "../src/models/Investigation.js";
import { AppError } from "../src/utils/errors.js";
test("reports enforce ownership, serialize concurrent requests and persist only valid evidence", async () => {
  const stop = await testDatabase();
  let release;
  const app = createApp({
    investigate: async (data) =>
      new Promise((resolve) => {
        release = () =>
          resolve({
            summary: "No available evidence.",
            suspectedCauses: [],
            affectedServices: [],
            nextSteps: ["Upload relevant logs."],
            evidenceSufficiency: "INSUFFICIENT",
            retrievedEvidence: [],
            modelInformation: {
              provider: "fixture",
              model: "not-called",
              embeddingModel: "fixture",
              topK: 8,
              retrievalDurationMs: 0,
              generationDurationMs: 0,
            },
          });
        assert.equal(data.readySourceIds.length, 0);
      }),
  });
  try {
    const a = await account(app),
      b = await account(app, "second@example.test");
    const project = (
      await a
        .post("/api/projects")
        .set("Origin", origin)
        .send({ name: "ShopFlow" })
    ).body.project;
    const incident = (
      await a
        .post(`/api/projects/${project._id}/incidents`)
        .set("Origin", origin)
        .send({
          title: "Payment failure",
          description: "Checkout requests are failing.",
        })
    ).body.incident;
    const url = `/api/incidents/${incident._id}/investigate`;
    assert.equal(
      (await b.post(url).set("Origin", origin).send({})).status,
      404,
    );
    const pending = a
      .post(url)
      .set("Origin", origin)
      .send({})
      .then((r) => r);
    while (!release) await new Promise((r) => setTimeout(r, 10));
    assert.equal(
      (await a.post(url).set("Origin", origin).send({})).status,
      409,
    );
    release();
    const completed = await pending;
    assert.equal(completed.status, 201);
    assert.equal(
      (await a.get(`/api/investigations/${completed.body.investigation._id}`))
        .status,
      200,
    );
    assert.equal(
      (await b.get(`/api/investigations/${completed.body.investigation._id}`))
        .status,
      404,
    );
    assert.equal(
      (await a.get(`/api/incidents/${incident._id}/investigations`)).body
        .investigations.length,
      1,
    );
    const id = randomUUID();
    const invalid = createApp({
      investigate: async () => ({
        summary: "Bad citation",
        suspectedCauses: [
          { cause: "Failure", reasoning: "Invented", evidenceIds: [id] },
        ],
        affectedServices: [],
        nextSteps: ["Check logs"],
        evidenceSufficiency: "PARTIAL",
        retrievedEvidence: [],
        modelInformation: {
          provider: "fixture",
          model: "fixture",
          embeddingModel: "fixture",
          topK: 8,
          retrievalDurationMs: 1,
          generationDurationMs: 1,
        },
      }),
    });
    const invalidAgent = await account(invalid, "third@example.test");
    const p = (
      await invalidAgent
        .post("/api/projects")
        .set("Origin", origin)
        .send({ name: "Another" })
    ).body.project;
    const i = (
      await invalidAgent
        .post(`/api/projects/${p._id}/incidents`)
        .set("Origin", origin)
        .send({
          title: "Failure",
          description: "An unrelated incident description",
        })
    ).body.incident;
    assert.equal(
      (
        await invalidAgent
          .post(`/api/incidents/${i._id}/investigate`)
          .set("Origin", origin)
          .send({})
      ).status,
      502,
    );
    assert.equal(
      (await Investigation.findOne({ incidentId: i._id })).status,
      "FAILED",
    );
    const unavailable = createApp({
      investigate: async () => {
        throw new AppError(
          429,
          "PROVIDER_LIMIT",
          "The provider quota was reached. Please retry later.",
        );
      },
    });
    const failureAgent = await account(unavailable, "fourth@example.test");
    const pf = (
      await failureAgent
        .post("/api/projects")
        .set("Origin", origin)
        .send({ name: "Quota" })
    ).body.project;
    const inf = (
      await failureAgent
        .post(`/api/projects/${pf._id}/incidents`)
        .set("Origin", origin)
        .send({ title: "Failure", description: "The provider is unavailable." })
    ).body.incident;
    assert.equal(
      (
        await failureAgent
          .post(`/api/incidents/${inf._id}/investigate`)
          .set("Origin", origin)
          .send({})
      ).status,
      429,
    );
    assert.equal(await Source.countDocuments(), 0);
  } finally {
    await stop();
  }
});
