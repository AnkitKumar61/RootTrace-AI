# Verification record

## Upload recovery after idle — 2026-10-20

A hosted Apache upload exhausted three retries in approximately 23 seconds while analysis was unavailable. An on-demand health request then took approximately 56 seconds to return the analysis service's expected response. Public readiness recovered without changing plans or credentials. Retrying the existing upload reached READY with 49 chunks; no duplicate upload was created. This exposed a startup gap that the earlier warm-service fixture run did not exercise.

Ingestion now waits for analysis liveness before opening or streaming an original file. A local HTTP regression test simulates a 503 followed by an HTML loading page and then a healthy response; a 172 KB fictional log is sent intact exactly once after startup. Additional tests cover the two-minute deadline, safe failure messages, and project deletion while waiting. Existing cloud-stream tests still verify closure after success and failure. The wait runs only when processing a queued source; it does not keep idle hosting alive.

## Public deployment — 2026-10-20

[RootTrace](https://roottrace-pied.vercel.app) is deployed on Vercel Hobby with two native Render Free web services. The Render Blueprint was applied to the two existing services, with no duplicate resources. Python 3.11.17 and Node.js 24 builds started successfully. Both Render services use Free compute; the workspace showed no card on file. No payment method or paid resource was added.

The hosted environment uses a separate MongoDB database, Redis queue, and Qdrant collection. The first API start exposed a missing database permission; granting only `readWrite` on the hosted database, while retaining the local database permission, resolved it. Public readiness returned 200 with database, Redis, and analysis ready. Direct protected API access returned 403, and analysis readiness without its internal secret returned 401.

Hosted browser checks passed for registration, sign-in, a new project, automatic source-status updates, incident creation, real investigation, report persistence after reload, and opening the original payment-log lines from private cloud storage. All seven fictional ShopFlow files were uploaded through the public HTTPS API and returned 202 in approximately 3.2–3.5 seconds each before reaching READY. Automated browser file selection was blocked by the Chrome extension's file-URL permission; that picker action was not verified on the hosted page. Multiple-file selection was previously verified locally with the unchanged upload interface.

Additional HTTPS checks passed for Secure/HttpOnly/SameSite cookies, session persistence and revocation, origin validation, uncached API responses, invalid-extension rejection, cross-user project/source isolation, hidden storage references, project editing, incident resolution, and report evidence belonging to the project's ready sources. All seven original files were confirmed private in ImageKit. The test project was deleted through the API and disappeared from the UI. Subsequent checks found all seven cloud files missing, zero vector points for that project, and no remaining project/source/incident/report metadata.

The desktop report had no horizontal overflow at 1280 pixels and no application console errors were observed. Responsive layouts were previously checked locally at 390 pixels; a hosted mobile viewport was not exercised in this browser session. GitHub checks passed for the deployed implementation, including 37 Node, 10 React, and 35 Python tests, builds, lint, dependency checks, and secret scanning.

These checks use small fictional fixtures. Maximum-size uploads, concurrent-user capacity, backup recovery, repeated idle cold starts, monthly quota exhaustion, and continuous uptime have not been established. Free services can sleep or exhaust allowances. Keep one analysis process and avoid redeploying during active work. Local accounts and uploads were not migrated.

## Free hosting preparation — 2026-10-20

Before publication, the Vercel frontend build and two native Render Free web services were configured in the repository. Automated coverage totaled 37 Node, 10 React, and 35 Python tests. The client build, JavaScript/Python lint, dependency consistency checks, and production dependency audit passed. Both hosting manifests and the generated Vercel routing rules passed public JSON schema validation. The later hosted check above supersedes the pending deployment checks in this preparation record.

New checks exercise API-only production startup, direct-backend rejection, origin validation, Secure/HttpOnly/SameSite cookies, session revocation, API cache prevention, private proxy configuration outside static files, SPA/API routing order, and separate hosted queue settings. Real fixture child processes verify supervisor shutdown through IPC; controlled failures verify whole-service termination and a finite shutdown deadline. Invalid worker connection settings and an unsupported local-storage hosting configuration fail with redacted messages.

The Vercel build was generated using fictional routing values. Its public files contained neither the proxy credential nor values from the ignored local environment. Generated Vercel files are ignored and explicitly rejected by the repository's tracked-file safety check. No credentials or user uploads are committed.

After restarting the updated local application, the full browser workflow passed against configured managed services: registration/login, seven private ImageKit uploads, READY processing, incident investigation, persisted report after reload, original citation lines, cross-user isolation, responsive navigation, and project cleanup. An initial attempt encountered a temporary storage/Redis connection failure on one file; its exact fictional project was cleaned up before the successful repeat. This result does not establish continuous provider availability.

At this preparation stage no hosted resources or payment methods had been created. Public HTTPS, forwarding, hosted runtimes, and the online workflow were still pending. The local cancellation barrier continues to require one analysis process; avoid overlapping deployment and active processing. Existing local uploads have not been migrated.

## Private cloud storage — 2026-10-20

All 30 Node, 10 React, and 35 Python tests passed, along with the frontend build, JavaScript/Python lint, dependency audit, and live readiness checks. Storage tests exercise private upload parameters through the real ImageKit SDK with a mocked transport, signed reads, bounded/truncated downloads, hidden storage references, ownership, retry queueing, cloud worker processing without local paths, and mixed local/cloud deletion after a lost delete response. An already-missing cloud file is safely treated as deleted, while transient failures retain project metadata for retry.

Live checks uploaded a small fictional file in each supported format (`.log`, `.txt`, `.json`, `.md`), verified exact contents through signed reads, confirmed unsigned requests were rejected, and deleted those exact test files. With ImageKit selected, the full browser workflow passed: registration/login, seven fictional uploads, READY states, incident investigation, persisted report, original citation lines, ownership checks, responsive navigation, and project cleanup. An earlier saved ShopFlow report still opened its original local-file citation. No earlier user files were copied to ImageKit during this change.

The ignored local configuration selects ImageKit for new uploads. Existing local sources continue to need their original upload directory. At this storage-integration stage public deployment had not been performed. Existing files are not automatically migrated. Real service checks used small fictional fixtures; they do not establish the maximum file size or ongoing quota availability for an ImageKit account.

## LangChain integration — 2026-10-18

The analysis service now uses LangChain's embedding interface, project-scoped retriever, chat prompt, and structured Gemini model chain. The migration preserves the public API, parser/chunker, embedding input formats, Qdrant collection/payloads, report schema, and citation references.

All 35 Python tests, 21 Node tests, and 10 React tests passed. The frontend production build, JavaScript/Python lint, Python dependency consistency check, and live readiness check passed. New coverage exercises the real LangChain Gemini model with a mocked SDK transport, including schema parsing, system/input separation, disabled tracing, a 60-second timeout, single SDK attempts, wrapped authentication/quota/service failures, and rejection of invalid reports. Retriever tests use two distinct projects in local Qdrant and preserve original evidence IDs and line references. Embedding tests verify the existing formats, bounded batches, cardinality, dimensions, and finite/nonzero normalization.

The complete browser workflow passed against configured MongoDB, Redis, Qdrant Cloud, and Gemini: register/login → project → seven fictional ShopFlow uploads → READY → incident → investigation → saved report after reload → original source lines → ownership checks → desktop/mobile navigation → project deletion. The generated verification project was removed after cleanup. No user-uploaded production logs were resent during verification.

## Earlier checks

Verified locally on 2026-10-01 with Node.js 24, Python 3.11, and managed MongoDB, Upstash Redis TCP/TLS, Qdrant Cloud, and Gemini access.
Redis memory information reported `noeviction` for the configured database.

## Automated coverage

- Node tests cover authentication, origin checks, session revocation, ownership, project CRUD, deletion retries, uploads, queue references, incident chronology, report validation/persistence, concurrent requests, worker transitions, deletion races, production routing/configuration, and environment generation.
- React tests cover multiple-file uploads, source type selection, per-file retries, opening original citation lines, recovery after connection failures, safe rendering of source text, and polling pause/terminal-state behavior.
- Python tests cover log/document parsing, stack traces and line mapping, stable chunks, embedding cardinality/dimensions, project filters, idempotent indexing/deletion, retrieval, structured report validation, injected source instructions, unrelated/weak/no evidence, and provider failures.
- A live Redis test exercises job completion, three-attempt retry exhaustion, stable job identity, and graceful worker close in an isolated test queue.
- Builds, dependency checks, linting, and full-history secret scans pass. GitHub Actions independently runs the isolated suite and secret scan.

## Live workflow

The browser check exercises register → login → project → seven uploads acknowledged with 202 → READY → incident → investigation → persisted report after reload → original citation lines → ownership checks → project deletion and UI removal.

Multiple-file selection was verified on 2026-10-15: all seven demo files were selected together, classified as logs/documents, and submitted with one button. Each received 202 and reached READY. Frontend tests additionally cover sequential requests, per-file rejection and retry, invalid/oversized files, duplicate-submit prevention, unconfirmed upload responses, and leaving the upload page.

Rate-limit handling was checked on 2026-10-16 after larger-file processing returned 429. Fictional embedding batches reproduced the provider limit. Tests verify 30/60-second fallback waits, provider retry hints, bounded handling of long quota resets, safe internal retry headers, and distinct saved-source messages for quota versus service failures. These checks do not imply that provider quota is always available.

A larger fictional upload also exposed a Qdrant write timeout. Source indexing now writes at most 16 points per request and retries transient storage failures three times using the same deterministic IDs and already-generated vectors. Tests simulate a write that succeeds before its response is lost, verify no duplicate points, and check bounded, redacted failures.

After these changes, a generated 204,889-byte, 2,000-line fictional log was uploaded through the browser, acknowledged with 202, and reached READY with 60 chunks using the managed services. Its verification project was queued for cleanup. Live verification used generated fictional data only.

Desktop and 390-pixel mobile layouts were checked for horizontal overflow, report/evidence stacking, and navigation. Runtime browser errors were checked. Screenshots in this repository contain fictional ShopFlow data only; temporary accounts and sessions stay in ignored local files.

Separate managed-Qdrant checks deliberately supplied source IDs from two different projects. Each search returned only its requested project. The upload smoke test returned in approximately half a second while processing continued in the worker. Live embeddings produced separate finite 768-dimensional vectors. The first live report was persisted with validated source citations.

The native launcher starts all four processes. Readiness passes with MongoDB, Redis, and analysis reachable. A shutdown check closed all three listening ports and logged worker draining. The full browser workflow also passed using this launcher and the updated worker.

The product interface focuses on uploads, incidents, reports, and original file citations. Optional benchmark screens and their technical metrics have been removed. Automated security and reliability tests remain part of development and CI.

## Scope of evidence

Provider error, invalid output, weak evidence, and prompt-injection cases are controlled automated tests. They test handling and validation boundaries; they do not establish that a model will always resist every attack or correctly explain every production incident. Live checks use fictional fixtures and configured services.

The application remains a single-analysis-process deployment. Local sources need shared API/worker file storage; ImageKit sources can be accessed from separate hosts. Public hosting and reverse-proxy TLS are covered by the hosted check above. Backup recovery and multi-replica operation remain unverified. Operational limits are listed in the deployment guide.
