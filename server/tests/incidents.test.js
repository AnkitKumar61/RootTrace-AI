import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createApp, testDatabase, account, origin } from "./helpers.js";
let close;
const app = createApp();
before(async () => {
  close = await testDatabase();
});
after(async () => {
  await close?.();
});
test("incident APIs enforce ownership and chronology", async () => {
  const owner = await account(app, "incident-owner@example.test"),
    other = await account(app, "incident-other@example.test");
  const project = (
    await owner
      .post("/api/projects")
      .set("Origin", origin)
      .send({ name: "Incidents" })
  ).body.project;
  const url = `/api/projects/${project._id}/incidents`;
  const input = {
    title: "Payment timeout",
    description: "Checkout calls to payment time out.",
    affectedService: "checkout-service",
  };
  const result = await owner.post(url).set("Origin", origin).send(input);
  assert.equal(result.status, 201);
  const id = result.body.incident._id;
  assert.equal(
    (await other.post(url).set("Origin", origin).send(input)).status,
    404,
  );
  assert.equal((await other.get(`/api/incidents/${id}`)).status, 404);
  assert.equal(
    (
      await other
        .patch(`/api/incidents/${id}`)
        .set("Origin", origin)
        .send({ status: "RESOLVED" })
    ).status,
    404,
  );
  assert.equal(
    (
      await owner
        .patch(`/api/incidents/${id}`)
        .set("Origin", origin)
        .send({ status: "RESOLVED" })
    ).body.incident.status,
    "RESOLVED",
  );
  assert.equal(
    (
      await owner
        .post(url)
        .set("Origin", origin)
        .send({
          ...input,
          startTime: "2026-10-01T10:00:00Z",
          endTime: "2026-10-01T09:00:00Z",
        })
    ).status,
    400,
  );
});
