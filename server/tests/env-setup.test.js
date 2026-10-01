import { test } from "node:test";
import assert from "node:assert/strict";
import { populateSecrets } from "../../scripts/env-template.mjs";
test("environment setup generates separate secrets for blank fields and preserves existing credentials", () => {
  const original =
    "JWT_SECRET=\t\r\nAI_SERVICE_SECRET=\r\nMONGODB_URI=fixture-value\r\n";
  const prepared = populateSecrets(original),
    values = Object.fromEntries(
      prepared
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => line.split("=")),
    );
  assert.equal(values.MONGODB_URI, "fixture-value");
  assert.ok(values.JWT_SECRET.length >= 32);
  assert.ok(values.AI_SERVICE_SECRET.length >= 32);
  assert.notEqual(values.JWT_SECRET, values.AI_SERVICE_SECRET);
  assert.equal(populateSecrets(prepared), prepared);
  assert.equal(
    populateSecrets("JWT_SECRET=tt\nAI_SERVICE_SECRET=existing-value\n"),
    "JWT_SECRET=tt\nAI_SERVICE_SECRET=existing-value\n",
  );
});
