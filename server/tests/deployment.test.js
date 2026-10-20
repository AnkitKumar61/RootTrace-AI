import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { once, EventEmitter } from "node:events";
import { spawnSync } from "node:child_process";
import { parse } from "yaml";
import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
  vercelConfig,
  writeVercelOutput,
} from "../../scripts/vercel-output.mjs";
import { supervise } from "../../scripts/process-supervisor.mjs";

const proxySecret = "test-only-proxy-credential-1234567890";
process.env.NODE_ENV = "production";
process.env.CLIENT_URL = "https://dashboard.example.test";
process.env.REDIS_URL = "rediss://redis.example.test:6379";
process.env.JWT_SECRET = "test-only-session-signing-value-12345";
process.env.AI_SERVICE_SECRET = "test-only-internal-service-value-12345";
process.env.API_PROXY_SECRET = proxySecret;
process.env.SERVE_CLIENT = "false";
process.env.STORAGE_PROVIDER = "local";
process.env.QUEUE_NAME = "roottrace-deployed-work";
const { createApp } = await import("../src/app.js");
const { queueName } = await import("../src/queues/workQueue.js");

test("API-only production protects proxy access, preserves secure sessions and rejects other origins", async () => {
  const database = await MongoMemoryServer.create();
  await mongoose.connect(database.getUri());
  try {
    const app = createApp();
    const call = (method, url) =>
      request(app)
        [method](url)
        .set("X-RootTrace-Proxy", proxySecret)
        .set("Origin", process.env.CLIENT_URL);
    assert.equal((await request(app).get("/api/health")).status, 200);
    for (const url of [
      "/api/health/ready",
      "/api/health/config",
      "/api/auth/me",
      "/api/projects",
    ])
      assert.equal((await request(app).get(url)).status, 403);
    assert.equal(
      (await request(app).get("/api/auth/me").set("X-RootTrace-Proxy", "wrong"))
        .status,
      403,
    );
    const input = {
      name: "Deployment Engineer",
      email: "hosting@example.test",
      password: "fictional-password-123",
    };
    assert.equal(
      (await call("post", "/api/auth/register").send(input)).status,
      201,
    );
    const login = await call("post", "/api/auth/login").send(input);
    assert.equal(login.status, 200);
    const cookie = login.headers["set-cookie"][0];
    for (const flag of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/api"])
      assert.ok(cookie.includes(flag));
    assert.ok(!cookie.includes("Domain="));
    const me = await call("get", "/api/auth/me").set(
      "Cookie",
      cookie.split(";")[0],
    );
    assert.equal(me.body.user.email, input.email);
    assert.equal(me.headers["cache-control"], "no-store");
    assert.equal(me.headers["cdn-cache-control"], "no-store");
    assert.ok(!me.text.includes(proxySecret));
    assert.equal(
      (
        await call("post", "/api/auth/logout")
          .set("Cookie", cookie.split(";")[0])
          .set("Origin", "https://other.example.test")
      ).status,
      403,
    );
    assert.equal(
      (
        await call("post", "/api/auth/logout").set(
          "Cookie",
          cookie.split(";")[0],
        )
      ).status,
      204,
    );
    assert.equal(
      (await call("get", "/api/auth/me").set("Cookie", cookie.split(";")[0]))
        .status,
      401,
    );
    assert.equal((await request(app).get("/projects/fixture")).status, 404);
    assert.equal((await request(app).get("/.env")).status, 404);
    assert.equal(
      (await call("get", "/api/unknown")).body.error.code,
      "NOT_FOUND",
    );
  } finally {
    await mongoose.disconnect();
    await database.stop();
  }
});

test("Vercel keeps private routing outside static files, proxies API paths before SPA fallback, and clears old output", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "roottrace-vercel-"));
  const values = {
    RENDER_API_ORIGIN: "https://fictional-api.onrender.com",
    API_PROXY_SECRET: proxySecret,
  };
  try {
    await mkdir(path.join(root, "client/dist/assets"), { recursive: true });
    await writeFile(
      path.join(root, "client/dist/index.html"),
      "<main>Frontend fixture</main>",
    );
    await writeFile(path.join(root, ".env"), "PRIVATE=never-publish");
    await writeVercelOutput(root, values);
    await writeFile(
      path.join(root, ".vercel/output/static/stale.txt"),
      "old artifact",
    );
    await writeVercelOutput(root, values);
    const config = JSON.parse(
      await readFile(path.join(root, ".vercel/output/config.json"), "utf8"),
    );
    assert.equal(config.version, 3);
    assert.deepEqual(await readdir(path.join(root, ".vercel/output/static")), [
      "assets",
      "index.html",
    ]);
    const api = config.routes[1];
    for (const url of [
      "/api",
      "/api/auth/login",
      "/api/projects/fixture/sources/fixture/lines",
    ])
      assert.equal(
        url.replace(new RegExp(api.src), api.dest),
        `${values.RENDER_API_ORIGIN}${url}`,
      );
    assert.ok(!new RegExp(api.src).test("/apiary"));
    assert.equal(api.transforms[0].op, "set");
    assert.equal(api.transforms[0].args, proxySecret);
    assert.equal(api.headers["x-vercel-enable-rewrite-caching"], "0");
    assert.deepEqual(config.routes[2], { handle: "filesystem" });
    assert.equal(config.routes[3].dest, "/index.html");
    assert.ok(
      !(
        await readFile(
          path.join(root, ".vercel/output/static/index.html"),
          "utf8",
        )
      ).includes(proxySecret),
    );
    for (const origin of [
      undefined,
      "http://fictional-api.onrender.com",
      "https://private-marker@fictional-api.onrender.com",
      "https://fictional-api.onrender.com/?private-marker",
      "https://fictional-api.onrender.com/",
      "https://elsewhere.example.test",
    ])
      assert.throws(
        () => vercelConfig({ ...values, RENDER_API_ORIGIN: origin }),
        (e) => !e.message.includes("private-marker"),
      );
    assert.throws(
      () => vercelConfig({ ...values, API_PROXY_SECRET: "private-marker" }),
      (e) => !e.message.includes("private-marker"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Render manifest provisions only two native Free web services and shares the internal secret", async () => {
  const manifest = parse(
    await readFile(new URL("../../render.yaml", import.meta.url), "utf8"),
  );
  assert.equal(manifest.previews.generation, "off");
  assert.equal(manifest.services.length, 2);
  assert.equal(manifest.databases, undefined);
  for (const service of manifest.services) {
    assert.equal(service.type, "web");
    assert.equal(service.plan, "free");
    assert.equal(service.autoDeployTrigger, "checksPass");
    assert.equal(service.disk, undefined);
    assert.ok(!service.runtime.includes("docker"));
    for (const setting of service.envVars.filter((v) =>
      /KEY|SECRET|MONGODB_URI|REDIS_URL/.test(v.key),
    ))
      assert.equal(setting.value, undefined);
  }
  const api = manifest.services.find((s) => s.runtime === "node");
  const settings = Object.fromEntries(api.envVars.map((v) => [v.key, v]));
  assert.equal(settings.SERVE_CLIENT.value, "false");
  assert.equal(settings.STORAGE_PROVIDER.value, "imagekit");
  assert.equal(settings.QUEUE_NAME.value, queueName);
  assert.notEqual(queueName, "roottrace-work");
  assert.equal(
    settings.AI_SERVICE_SECRET.fromService.name,
    "roottrace-analysis",
  );
  assert.equal(
    settings.AI_SERVICE_URL.fromService.envVarKey,
    "RENDER_EXTERNAL_URL",
  );
});

test("supervisor drains real API/worker children through IPC", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "roottrace-supervisor-"));
  try {
    const file = path.join(root, "child.cjs");
    await writeFile(
      file,
      'setInterval(()=>{},1000); process.send("ready"); process.on("message", m=>{if(m==="shutdown")setTimeout(()=>process.exit(0),20)});',
    );
    const children = [];
    const { fork } = await import("node:child_process");
    const service = supervise({
      commands: [
        ["API", file],
        ["Worker", file],
      ],
      cwd: root,
      env: {},
      shutdownMs: 3000,
      forkProcess: (...args) => {
        const child = fork(...args);
        children.push(child);
        return child;
      },
    });
    await Promise.all(children.map((child) => once(child, "message")));
    assert.equal(await service.stop(), 0);
    assert.ok(children.every((child) => child.exitCode === 0));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("supervisor fails the whole service if a worker exits and bounds unresponsive shutdown", async () => {
  const children = [];
  const service = supervise({
    commands: [
      ["API", "unused"],
      ["Worker", "unused"],
    ],
    shutdownMs: 20,
    forkProcess: () => {
      const child = new EventEmitter();
      Object.assign(child, {
        exitCode: null,
        signalCode: null,
        connected: true,
        send: () => {},
        kill: (signal) => {
          child.signalCode = signal;
          child.emit("exit");
        },
      });
      children.push(child);
      return child;
    },
  });
  children[1].exitCode = 1;
  children[1].emit("exit", 1);
  assert.equal(await service.done, 1);
  assert.equal(children[0].signalCode, "SIGKILL");
});

test("hosting and worker startup failures redact connection settings and reject ephemeral upload storage", () => {
  const root = new URL("../../", import.meta.url);
  for (const file of [
    "scripts/start-render.mjs",
    "server/src/start-worker.js",
  ]) {
    const result = spawnSync(process.execPath, [file], {
      cwd: root,
      env: {
        ...process.env,
        MONGODB_URI: "unsupported://private-marker",
        STORAGE_PROVIDER: "local",
      },
      encoding: "utf8",
      timeout: 15000,
      windowsHide: true,
    });
    assert.equal(result.status, 1);
    assert.ok(!`${result.stdout}${result.stderr}`.includes("private-marker"));
    assert.match(result.stderr, /startup failed/);
  }
});
