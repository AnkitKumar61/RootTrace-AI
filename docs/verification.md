# Verification record

Verified locally on 2026-10-01 with Node.js 24, Python 3.11, and managed MongoDB, Upstash Redis TCP/TLS, Qdrant Cloud, and Gemini access.
Redis memory information reported `noeviction` for the configured database.

## Automated coverage

- Node tests cover authentication, origin checks, session revocation, ownership, project CRUD, deletion retries, uploads, queue references, incident chronology, report validation/persistence, concurrent requests, evaluation access, worker transitions, deletion races, production routing/configuration, and environment generation.
- React tests cover opening original citation lines, safe rendering of source text, and polling pause/terminal-state behavior.
- Python tests cover log/document parsing, stack traces and line mapping, stable chunks, embedding cardinality/dimensions, project filters, idempotent indexing/deletion, retrieval, structured report validation, injected source instructions, unrelated/weak/no evidence, provider failures, and evaluation measurements.
- A live Redis test exercises job completion, three-attempt retry exhaustion, stable job identity, and graceful worker close in an isolated test queue.
- Builds, dependency checks, linting, and full-history secret scans pass. GitHub Actions independently runs the isolated suite and secret scan.

## Live workflow

The browser check exercised register → login → project → seven uploads acknowledged with 202 → READY → incident → investigation → persisted report after reload → original citation lines → evaluation → ownership checks → project deletion and UI removal.

Desktop and 390-pixel mobile layouts were checked for horizontal overflow, report/evidence stacking, and navigation. Runtime browser errors were checked. Screenshots in this repository contain fictional ShopFlow data only; temporary accounts and sessions stay in ignored local files.

Separate managed-Qdrant checks deliberately supplied source IDs from two different projects. Each search returned only its requested project. The upload smoke test returned in approximately half a second while processing continued in the worker. Live embeddings produced separate finite 768-dimensional vectors. The first live report was persisted with validated source citations.

The native launcher starts all four processes. Readiness passes with MongoDB, Redis, and analysis reachable. A shutdown check closed all three listening ports and logged worker draining. The full browser workflow also passed using this launcher and the updated worker.

The report-inclusive ShopFlow run completed all 15 cases with Hit Rate@8 100%, Recall@8 100%, Precision@8 25%, and 32 valid accepted citation references. Isolation checks covered 120 retrieved records with zero violations. See the evaluation guide for metric definitions and limitations.

## Scope of evidence

Provider error, invalid output, weak evidence, and prompt-injection cases are controlled automated tests. They test handling and validation boundaries; they do not establish that a model will always resist every attack or correctly explain every production incident. Live checks use fictional fixtures and configured services.

The application remains a single-analysis-process deployment with shared API/worker file storage. No public hosting, reverse-proxy TLS, production backups, or multi-replica operation has been exercised. These hosting-specific concerns are listed in the deployment guide.
