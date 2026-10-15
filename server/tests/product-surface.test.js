import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp, testDatabase, account, origin } from "./helpers.js";

test("retired benchmark endpoints are unavailable while project sources and incidents remain accessible", async () => {
  const stop = await testDatabase();
  try {
    const owner = await account(createApp(), "surface@example.test");
    const project = (
      await owner
        .post("/api/projects")
        .set("Origin", origin)
        .send({ name: "ShopFlow" })
    ).body.project;
    const base = `/api/projects/${project._id}`;
    assert.equal((await owner.get(`${base}/sources`)).status, 200);
    assert.equal((await owner.get(`${base}/incidents`)).status, 200);
    assert.equal((await owner.get(`${base}/evaluation`)).status, 404);
    assert.equal(
      (await owner.post(`${base}/evaluation`).set("Origin", origin).send({}))
        .status,
      404,
    );
  } finally {
    await stop();
  }
});
