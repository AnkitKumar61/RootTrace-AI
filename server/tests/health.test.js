import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-only-session-signing-value-12345";
process.env.AI_SERVICE_SECRET = "test-only-internal-service-value-12345";
const { createApp } = await import("../src/app.js");
test("health and safe errors", async () => {
  const r = await request(createApp()).get("/api/health");
  assert.equal(r.status, 200);
  assert.equal(r.body.status, "ok");
  const missing = await request(createApp()).get("/missing");
  assert.equal(missing.status, 404);
});
