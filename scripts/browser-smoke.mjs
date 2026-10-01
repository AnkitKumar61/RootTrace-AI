/* global document, window */
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const base = process.env.ROOTTRACE_BROWSER_URL || "http://localhost:5173";
const email = `verification-${randomUUID()}@example.test`,
  password = randomBytes(24).toString("base64url");
const artifacts = path.resolve(".local/browser");
await fs.mkdir(artifacts, { recursive: true });
let browser, page;
try {
  browser = await chromium.launch({
    channel:
      process.env.BROWSER_CHANNEL ||
      (process.platform === "win32" ? "msedge" : undefined),
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  page = await context.newPage();
  const runtimeErrors = [];
  page.on("pageerror", (error) => {
    runtimeErrors.push(error.message);
    console.error(`Browser runtime: ${error.message.slice(0, 200)}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400)
      console.log(
        `Browser response ${response.status()}: ${new URL(response.url()).pathname}`,
      );
  });
  page.setDefaultTimeout(30000);
  await page.goto(`${base}/register`);
  await page.getByLabel("Full name").fill("Verification Engineer");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.waitForURL("**/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/projects");
  console.log("Registration and login passed.");
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await page.getByLabel("Project name").fill("ShopFlow browser verification");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Fictional full-flow verification project.");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await page.getByRole("link", { name: "Open project" }).click();
  await page.waitForURL("**/projects/*");
  const projectId = new URL(page.url()).pathname.split("/")[2],
    projectURL = `${base}/projects/${projectId}`;
  await fs.writeFile(
    path.join(artifacts, "session.json"),
    JSON.stringify({ email, password, projectId }),
  );
  for (const [folder, sourceType] of [
    ["logs", "log"],
    ["docs", "document"],
  ])
    for (const name of await fs.readdir(`demo-data/${folder}`)) {
      await page.goto(`${projectURL}/sources/upload`);
      await page.getByLabel("Source type").selectOption(sourceType);
      await page
        .getByLabel("Source file")
        .setInputFiles(path.resolve("demo-data", folder, name));
      const acknowledged = page.waitForResponse(
        (r) =>
          r.url().endsWith(`/api/projects/${projectId}/sources`) &&
          r.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Upload and process" }).click();
      assert.equal((await acknowledged).status(), 202);
      await page.waitForURL(`**/projects/${projectId}/sources`);
    }
  await page.waitForFunction(
    () =>
      document.querySelectorAll("tbody tr").length === 7 &&
      Array.from(document.querySelectorAll("tbody tr")).every((row) =>
        row.innerText.includes("READY"),
      ),
    null,
    { timeout: 300000 },
  );
  await page.screenshot({
    path: path.join(artifacts, "sources.png"),
    fullPage: true,
  });
  console.log("Seven uploads acknowledged asynchronously and reached READY.");
  await page.goto(`${projectURL}/incidents/new`);
  await page.getByLabel("Incident title").fill("Payment gateway timeout");
  await page
    .getByLabel("Symptoms and context")
    .fill(
      "Checkout returns 502 while payment-service connections to the sandbox gateway remain pending and time out after 5000ms. Trace pay-301 shows ETIMEDOUT.",
    );
  await page.getByLabel("Affected service").fill("payment-service");
  await page
    .getByRole("button", { name: "Create incident", exact: true })
    .click();
  await page.waitForURL((url) =>
    /\/incidents\/[a-f0-9]{24}$/.test(url.pathname),
  );
  const incidentURL = page.url();
  await page
    .getByRole("button", { name: "Investigate incident", exact: true })
    .click();
  await page.waitForURL("**/reports/*", { timeout: 150000 });
  await page.getByRole("heading", { name: "Evidence assessment" }).waitFor();
  const reportURL = page.url();
  await page.reload();
  await page.getByRole("heading", { name: "Suspected causes" }).waitFor();
  await page
    .getByRole("button", { name: /View .* lines/ })
    .first()
    .click();
  await page.getByLabel("Original source lines").waitFor();
  await page.screenshot({
    path: path.join(artifacts, "report.png"),
    fullPage: true,
  });
  console.log(
    "Incident, investigation, persisted report and original citation passed.",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: path.join(artifacts, "report-mobile.png"),
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
  );
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await page.getByRole("heading", { name: "Recent investigations" }).waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: path.join(artifacts, "dashboard-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${projectURL}/evaluation`);
  await page
    .getByRole("button", { name: "Run evaluation", exact: true })
    .waitFor();
  if (process.argv.includes("--reports"))
    await page.getByRole("checkbox", { name: /Include report/ }).check();
  await page
    .getByRole("button", { name: "Run evaluation", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Run results", exact: true })
    .waitFor({ timeout: 320000 });
  await page.getByText(/15 \/ 15 cases completed/).waitFor();
  await page.screenshot({
    path: path.join(artifacts, "evaluation.png"),
    fullPage: true,
  });
  console.log("Evaluation results and desktop/mobile navigation passed.");
  // A separate browser has no credentials for this user's resources.
  const stranger = await browser.newContext();
  const unauthenticated = await stranger.request.get(
    `${base}/api/projects/${projectId}/sources`,
  );
  assert.equal(unauthenticated.status(), 401);
  const otherEmail = `isolation-${randomUUID()}@example.test`,
    otherPassword = randomBytes(24).toString("base64url");
  const headers = { Origin: new URL(base).origin };
  assert.equal(
    (
      await stranger.request.post(`${base}/api/auth/register`, {
        headers,
        data: {
          name: "Isolation Engineer",
          email: otherEmail,
          password: otherPassword,
        },
      })
    ).status(),
    201,
  );
  assert.equal(
    (
      await stranger.request.post(`${base}/api/auth/login`, {
        headers,
        data: { email: otherEmail, password: otherPassword },
      })
    ).status(),
    200,
  );
  for (const resource of [
    `projects/${projectId}`,
    `projects/${projectId}/sources`,
    `projects/${projectId}/evaluation`,
    `incidents/${new URL(incidentURL).pathname.split("/").at(-1)}`,
    `investigations/${new URL(reportURL).pathname.split("/").at(-1)}`,
  ])
    assert.equal(
      (await stranger.request.get(`${base}/api/${resource}`)).status(),
      404,
    );
  await stranger.close();
  await page.goto(incidentURL);
  await page.getByRole("link", { name: "Open report", exact: true }).waitFor();
  assert.deepEqual(runtimeErrors, []);
  await fs.writeFile(
    path.join(artifacts, "session.json"),
    JSON.stringify({ email, password, projectId, reportURL }),
  );
  if (process.argv.includes("--cleanup")) {
    await page.goto(projectURL);
    page.once("dialog", (d) => d.accept());
    await page
      .getByRole("button", { name: "Delete project", exact: true })
      .click();
    await page.waitForURL("**/projects", { timeout: 180000 });
    console.log(
      "Project cleanup completed and disappeared from the interface.",
    );
  }
  console.log(
    "Full browser workflow passed. Screenshots and fictional session details are in .local/browser.",
  );
} catch (error) {
  await page
    ?.screenshot({ path: path.join(artifacts, "failure.png"), fullPage: true })
    .catch(() => {});
  console.error(
    `Browser verification failed at ${new URL(page?.url() || base).pathname}: ${error instanceof assert.AssertionError ? "Assertion failed" : error.message.split("\n")[0]}`,
  );
  process.exitCode = 1;
} finally {
  await browser?.close();
}
