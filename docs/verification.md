# Verification record

## Private cloud storage — 2026-10-20

All 30 Node, 10 React, and 35 Python tests passed, along with the frontend build, JavaScript/Python lint, dependency audit, and live readiness checks. Storage tests exercise private upload parameters through the real ImageKit SDK with a mocked transport, signed reads, bounded/truncated downloads, hidden storage references, ownership, retry queueing, cloud worker processing without local paths, and mixed local/cloud deletion after a lost delete response. An already-missing cloud file is safely treated as deleted, while transient failures retain project metadata for retry.

Live checks uploaded a small fictional file in each supported format (`.log`, `.txt`, `.json`, `.md`), verified exact contents through signed reads, confirmed unsigned requests were rejected, and deleted those exact test files. With ImageKit selected, the full browser workflow passed: registration/login, seven fictional uploads, READY states, incident investigation, persisted report, original citation lines, ownership checks, responsive navigation, and project cleanup. An earlier saved ShopFlow report still opened its original local-file citation. No earlier user files were copied to ImageKit during this change.

The ignored local configuration selects ImageKit for new uploads. Existing local sources continue to need their original upload directory. Public deployment and automatic migration of existing files have not been performed. Real service checks used small fictional fixtures; they do not establish the maximum file size or ongoing quota availability for an ImageKit account.

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

The application remains a single-analysis-process deployment. Local sources need shared API/worker file storage; ImageKit sources can be accessed from separate hosts. No public hosting, reverse-proxy TLS, production backups, or multi-replica operation has been exercised. These hosting-specific concerns are listed in the deployment guide.
