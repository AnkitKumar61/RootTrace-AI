import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ImageKit from "@imagekit/nodejs";
import { ImageKitStorage } from "../src/services/imagekitStorage.js";
import { LocalStorage, Storage } from "../src/services/storage.js";
import { ingestSource } from "../src/services/ingestion.js";

const settings = {
  STORAGE_PROVIDER: "imagekit",
  IMAGEKIT_PRIVATE_KEY: "private_fictional_test_key",
  IMAGEKIT_URL_ENDPOINT: "https://ik.imagekit.io/fictional",
  MAX_FILE_SIZE_MB: 20,
};
const reference = {
  storageProvider: "imagekit",
  storedFileName: "/roottrace/12345678-1234-1234-1234-123456789012.log",
  storageFileId: "fictional-file-id",
};
function client(fetcher) {
  return new ImageKit({
    privateKey: settings.IMAGEKIT_PRIVATE_KEY,
    fetch: fetcher,
    maxRetries: 0,
    logLevel: "off",
  });
}
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("ImageKit uploads all supported formats privately and reads through expiring signed URLs", async () => {
  let uploads = 0;
  const sdk = client(async (url, options) => {
    assert.equal(new URL(url).origin, "https://upload.imagekit.io");
    const form = await new Request(url, options).formData();
    assert.equal(form.get("isPrivateFile"), "true");
    assert.equal(form.get("overwriteFile"), "false");
    assert.equal(form.get("useUniqueFileName"), "false");
    assert.match(form.get("responseFields"), /isPrivateFile/);
    assert.equal(
      await form.get("file").text(),
      "Fictional source\nsecond line",
    );
    uploads++;
    return json({
      fileId: `file-${uploads}`,
      filePath: `/roottrace/${form.get("fileName")}`,
      isPrivateFile: true,
    });
  });
  const store = new ImageKitStorage(settings, {
    client: sdk,
    fetcher: async (url, options) => {
      const parsed = new URL(url);
      assert.equal(parsed.origin, "https://ik.imagekit.io");
      assert.ok(parsed.pathname.startsWith("/fictional/roottrace/"));
      assert.ok(parsed.searchParams.get("ik-s"));
      const remaining =
        Number(parsed.searchParams.get("ik-t")) - Date.now() / 1000;
      assert.ok(remaining > 0 && remaining <= 300);
      assert.equal(options.redirect, "error");
      assert.equal(options.headers.Authorization, undefined);
      return new Response("Fictional source\nsecond line");
    },
  });
  for (const extension of ["log", "txt", "json", "md"]) {
    const saved = await store.save({
      originalname: `../../original.${extension}`,
      buffer: Buffer.from("Fictional source\nsecond line"),
    });
    assert.equal(saved.filePath, undefined);
    assert.match(
      saved.storedFileName,
      new RegExp(`^/roottrace/[a-f0-9-]{36}\\.${extension}$`),
    );
    assert.equal(await store.read(saved), "Fictional source\nsecond line");
  }
  assert.equal(uploads, 4);
});

test("ImageKit failures are safe, deletion is idempotent, and transient deletes remain retryable", async () => {
  let calls = 0;
  const store = new ImageKitStorage(settings, {
    client: client(async () => {
      calls++;
      return json(
        { message: "private provider request details" },
        calls === 1 ? 503 : 404,
      );
    }),
  });
  await assert.rejects(
    store.remove(reference),
    (error) =>
      error.code === "STORAGE_UNAVAILABLE" &&
      !error.message.includes("private"),
  );
  assert.equal(calls, 1);
  await store.remove(reference);
  await store.remove(reference);
  assert.equal(calls, 3);
  const limited = new ImageKitStorage(settings, {
    client: client(async () => json({ message: "private quota data" }, 429)),
  });
  await assert.rejects(
    limited.save({ originalname: "fixture.log", buffer: Buffer.from("test") }),
    (error) =>
      error.code === "STORAGE_LIMIT" && !error.message.includes("private"),
  );
});

test("remote reads reject invalid references, redirects, oversized streams and truncated files", async () => {
  let calls = 0;
  let response = () => new Response("12345");
  const store = new ImageKitStorage(settings, {
    client: client(() => assert.fail()),
    fetcher: async () => {
      calls++;
      return response();
    },
  });
  await assert.rejects(
    store.read({
      ...reference,
      storedFileName: "https://example.test/private",
    }),
  );
  await assert.rejects(
    store.read({ ...reference, storedFileName: "/roottrace/../secret.log" }),
  );
  assert.equal(calls, 0);
  store.maxBytes = 4;
  await assert.rejects(
    store.read(reference),
    (error) => error.code === "STORAGE_UNAVAILABLE",
  );
  response = () => new Response("12");
  await assert.rejects(
    store.read({ ...reference, fileSize: 4 }),
    (error) => error.code === "STORAGE_UNAVAILABLE",
  );
  response = () =>
    new Response("", {
      status: 302,
      headers: { location: "https://example.test/private" },
    });
  await assert.rejects(
    store.read(reference),
    (error) => error.code === "STORAGE_UNAVAILABLE",
  );
});

test("switching the upload provider preserves legacy local reads and cleanup", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "roottrace-storage-"),
  );
  try {
    const local = new LocalStorage(directory);
    const old = await local.save({
      originalname: "legacy.log",
      buffer: Buffer.from("legacy source"),
    });
    delete old.storageProvider;
    const cloud = {
      save: async () => reference,
      read: async () => "cloud source",
    };
    const store = new Storage(settings, { local, imagekit: cloud });
    assert.deepEqual(await store.save({}), reference);
    assert.equal(await store.read(old), "legacy source");
    assert.equal(await store.read(reference), "cloud source");
    await store.remove(old);
    await store.remove(old);
    await assert.rejects(
      store.read(old),
      (error) => error.code === "SOURCE_FILE_MISSING",
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("ingestion streams cloud bytes to analysis without a filesystem path and closes the stream", async () => {
  const text = "ERROR fictional-service timeout\n";
  const store = new ImageKitStorage(settings, {
    client: client(() => assert.fail()),
    fetcher: async () => new Response(text),
  });
  const source = {
    ...reference,
    _id: "b".repeat(24),
    projectId: "a".repeat(24),
    sourceType: "log",
    originalFileName: "fictional.log",
    fileSize: Buffer.byteLength(text),
  };
  const open = store.open.bind(store);
  let openedStream;
  store.open = async (value) => {
    const opened = await open(value);
    openedStream = opened.stream;
    return opened;
  };
  let streamed = false;
  const result = await ingestSource(source, {
    store,
    request: async (method, url, form) => {
      assert.equal(method, "POST");
      assert.equal(url, "/internal/ingest");
      const chunks = [];
      await new Promise((resolve, reject) => {
        form.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        form.on("end", resolve);
        form.on("error", reject);
        form.resume();
      });
      const body = Buffer.concat(chunks).toString("utf8");
      assert.ok(body.includes(text));
      assert.ok(body.includes('filename="fictional.log"'));
      assert.ok(!body.includes("ik-s="));
      streamed = true;
      return { chunkCount: 1 };
    },
  });
  assert.equal(streamed, true);
  assert.equal(result.chunkCount, 1);
  assert.equal(openedStream.destroyed, true);
  await assert.rejects(
    ingestSource(source, {
      store,
      request: async () => {
        throw new Error("fictional analysis failure");
      },
    }),
  );
  assert.equal(openedStream.destroyed, true);
});
