import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import request from "supertest";
process.env.NODE_ENV = "production";
process.env.CLIENT_URL = "https://dashboard.example.test";
process.env.REDIS_URL = "rediss://redis.example.test:6379";
process.env.JWT_SECRET = "test-only-session-signing-value-12345";
process.env.AI_SERVICE_SECRET = "test-only-internal-service-value-12345";
const { createApp } = await import("../src/app.js");
test(
  "production serves built SPA routes while API failures stay JSON and private files stay hidden",
  {
    skip: !existsSync(new URL("../../client/dist/index.html", import.meta.url)),
  },
  async () => {
    const app = createApp();
    const page = await request(app).get(
      "/projects/fictional/incidents/fictional",
    );
    assert.equal(page.status, 200);
    assert.match(page.text, /<div id="root">/);
    const missing = await request(app).get("/api/unknown");
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, "NOT_FOUND");
    const privateFile = await request(app).get("/.env");
    assert.ok(!privateFile.text.includes("MONGODB_URI"));
    assert.equal((await request(app).get("/api/auth/me")).status, 401);
  },
);
