import { test } from "node:test";
import assert from "node:assert/strict";
process.env.JWT_SECRET = "test-only-session-signing-value-12345";
process.env.AI_SERVICE_SECRET = "test-only-internal-service-value-12345";
const { validateEnv } = await import("../src/config/env.js");
const input = {
  JWT_SECRET: process.env.JWT_SECRET,
  AI_SERVICE_SECRET: process.env.AI_SERVICE_SECRET,
};
test("production configuration requires secure origin and Redis TLS without printing values", () => {
  assert.equal(validateEnv(input).PORT, 5000);
  assert.throws(() =>
    validateEnv({ ...input, CLIENT_URL: "https://dashboard.example.test/" }),
  );
  assert.throws(() => validateEnv({ ...input, NODE_ENV: "production" }));
  assert.equal(
    validateEnv({
      ...input,
      NODE_ENV: "production",
      CLIENT_URL: "https://dashboard.example.test",
      REDIS_URL: "rediss://redis.example.test:6379",
      HOST: "0.0.0.0",
      TRUST_PROXY_HOPS: 1,
    }).HOST,
    "0.0.0.0",
  );
  assert.throws(
    () => validateEnv({ ...input, JWT_SECRET: "private-marker" }),
    (error) => !error.message.includes("private-marker"),
  );
});
