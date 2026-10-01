import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp, testDatabase, origin } from "./helpers.js";
let close;
const app = createApp();
before(async () => {
  close = await testDatabase();
});
after(async () => {
  await close?.();
});
test("registration, login, cookie protection, origin checks and revocation", async () => {
  const agent = request.agent(app);
  const registered = await agent.post("/api/auth/register").send({
    name: "Engineer",
    email: "engineer@example.test",
    password: "demo-password-123",
  });
  assert.equal(registered.status, 201);
  assert.equal(registered.body.user.passwordHash, undefined);
  assert.equal((await agent.get("/api/auth/me")).status, 401);
  assert.equal(
    (
      await agent
        .post("/api/auth/login")
        .send({ email: "engineer@example.test", password: "bad-password" })
    ).status,
    401,
  );
  const login = await agent
    .post("/api/auth/login")
    .send({ email: "engineer@example.test", password: "demo-password-123" });
  assert.equal(login.status, 200);
  assert.match(login.headers["set-cookie"][0], /HttpOnly/);
  const cookie = login.headers["set-cookie"][0];
  assert.equal((await agent.get("/api/auth/me")).status, 200);
  assert.equal(
    (await agent.post("/api/auth/logout").set("Origin", "https://invalid.test"))
      .status,
    403,
  );
  assert.equal(
    (await agent.post("/api/auth/logout").set("Origin", origin)).status,
    204,
  );
  assert.equal(
    (await request(app).get("/api/auth/me").set("Cookie", cookie)).status,
    401,
  );
});
test("reject duplicate and invalid registrations", async () => {
  const body = {
    name: "Engineer",
    email: "engineer@example.test",
    password: "demo-password-123",
  };
  assert.equal(
    (await request(app).post("/api/auth/register").send(body)).status,
    409,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/auth/register")
        .send({ ...body, password: "short" })
    ).status,
    400,
  );
});
