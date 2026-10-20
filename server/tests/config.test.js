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

test("ImageKit requires a private key and a clean HTTPS endpoint without exposing values", () => {
  const configuration = {
    ...input,
    STORAGE_PROVIDER: "imagekit",
    IMAGEKIT_PRIVATE_KEY: "private-marker",
    IMAGEKIT_URL_ENDPOINT: "https://ik.imagekit.io/fictional",
  };
  assert.equal(validateEnv(configuration).STORAGE_PROVIDER, "imagekit");
  for (const change of [
    { IMAGEKIT_PRIVATE_KEY: "" },
    { IMAGEKIT_URL_ENDPOINT: "bad-private-marker" },
    { IMAGEKIT_URL_ENDPOINT: "http://ik.imagekit.io/fictional" },
    {
      IMAGEKIT_URL_ENDPOINT: "https://private-marker@ik.imagekit.io/fictional",
    },
    {
      IMAGEKIT_URL_ENDPOINT:
        "https://ik.imagekit.io/fictional?token=private-marker",
    },
  ])
    assert.throws(
      () => validateEnv({ ...configuration, ...change }),
      (error) => !error.message.includes("private-marker"),
    );
});

test("deployment settings parse booleans and isolate queue names without exposing proxy secrets", () => {
  assert.equal(
    validateEnv({
      ...input,
      SERVE_CLIENT: "false",
      QUEUE_NAME: "roottrace-deployed-work",
    }).SERVE_CLIENT,
    false,
  );
  assert.equal(validateEnv(input).QUEUE_NAME, "roottrace-work");
  for (const change of [
    { SERVE_CLIENT: "yes" },
    { QUEUE_NAME: "namespace:invalid" },
    { API_PROXY_SECRET: "private-marker" },
  ])
    assert.throws(
      () => validateEnv({ ...input, ...change }),
      (error) => !error.message.includes("private-marker"),
    );
});
