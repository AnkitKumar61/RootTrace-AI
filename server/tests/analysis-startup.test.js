import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { Readable } from "node:stream";
import axios from "axios";
import { waitForAnalysis } from "../src/services/analysisClient.js";
import { ingestSource } from "../src/services/ingestion.js";

const source = {
  projectId: "a".repeat(24),
  _id: "b".repeat(24),
  sourceType: "log",
  originalFileName: "fictional.log",
};

test("cold analysis waits through host errors and a loading page before opening and streaming a file once", async () => {
  let probes = 0,
    uploads = 0,
    opened = 0,
    waiting = 0,
    clock = 0;
  const text = "ERROR fictional-service dependency timeout\n".repeat(4000);
  const server = createServer(async (req, res) => {
    if (req.url === "/health") {
      probes++;
      if (probes === 1) {
        res.writeHead(503).end("Host is starting");
      } else if (probes === 2) {
        res.writeHead(200, { "Content-Type": "text/html" }).end("Loading");
      } else {
        res
          .writeHead(200, { "Content-Type": "application/json" })
          .end(JSON.stringify({ status: "ok", service: "roottrace-analysis" }));
      }
      return;
    }
    assert.equal(probes, 3);
    uploads++;
    const parts = [];
    for await (const part of req) parts.push(part);
    assert.ok(Buffer.concat(parts).toString().includes(text));
    res
      .writeHead(200, { "Content-Type": "application/json" })
      .end(JSON.stringify({ chunkCount: 60 }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const client = axios.create({
    baseURL: `http://127.0.0.1:${server.address().port}`,
    proxy: false,
  });
  let stream;
  try {
    const result = await ingestSource(source, {
      waitUntilReady: (options) =>
        waitForAnalysis({
          ...options,
          client,
          now: () => clock,
          sleep: async (ms) => {
            assert.equal(opened, 0);
            clock += ms;
          },
        }),
      onWaiting: async () => waiting++,
      store: {
        open: async () => {
          assert.equal(probes, 3);
          opened++;
          stream = Readable.from([Buffer.from(text)]);
          return { stream, size: Buffer.byteLength(text) };
        },
      },
      request: async (method, url, form, options) =>
        (await client.request({ method, url, data: form, ...options })).data,
    });
    assert.equal(result.chunkCount, 60);
    assert.equal(opened, 1);
    assert.equal(uploads, 1);
    assert.equal(waiting, 1);
    assert.equal(stream.destroyed, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("startup wait has a deadline and never exposes private transport errors", async () => {
  let clock = 0;
  const pauses = [];
  await assert.rejects(
    waitForAnalysis({
      timeoutMs: 12000,
      now: () => clock,
      sleep: async (ms) => {
        pauses.push(ms);
        clock += ms;
      },
      client: {
        get: async (_path, { timeout }) => {
          assert.ok(timeout > 0 && timeout <= 10000);
          throw new Error("private transport credentials");
        },
      },
    }),
    (error) => {
      assert.equal(error.code, "ANALYSIS_UNAVAILABLE");
      assert.doesNotMatch(error.message, /private|credentials/);
      return true;
    },
  );
  assert.deepEqual(pauses, [5000, 5000, 2000]);
});

test("project deletion during startup prevents reading or sending its file", async () => {
  let active = true;
  const result = await ingestSource(source, {
    isActive: async () => active,
    waitUntilReady: (options) =>
      waitForAnalysis({
        ...options,
        client: {
          get: async () => {
            throw new Error("Starting");
          },
        },
        sleep: async () => {
          active = false;
        },
      }),
    store: {
      open: async () => assert.fail("A deleted project's file was opened"),
    },
    request: async () => assert.fail("A deleted project's file was sent"),
  });
  assert.deepEqual(result, { skipped: true });
});
