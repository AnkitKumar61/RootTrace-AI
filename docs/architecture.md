# Architecture and interfaces

```mermaid
flowchart LR
    Browser[React browser] --> API[Express API]
    API --> Mongo[(MongoDB metadata)]
    API --> Storage[Private uploaded files]
    API --> Queue[(Redis / BullMQ)]
    Queue --> Worker[Dedicated worker]
    Worker --> Storage
    Worker -->|streamed file bytes| Analysis[FastAPI analysis]
    API -->|authenticated internal requests| Analysis
    Analysis --> Chain[LangChain retrieval and report chain]
    Chain --> Gemini[Gemini adapters]
    Analysis --> Qdrant[(Qdrant vectors)]
```

## Boundaries

Express owns users, projects, source status, incidents, and persisted reports. MongoDB stores this metadata and report snapshots. It does not store embeddings.

The worker performs expensive ingestion outside the upload request. Queue payloads contain source/project IDs and a private file reference; uploaded bytes are not copied into Redis. API and worker must share their upload directory.

FastAPI has no user-facing CRUD or access to the Node upload directory. Internal requests require a constant-time comparison of the shared service secret. Parsing, chunking, provider calls, vector operations, and output validation belong here.

LangChain provides an asynchronous embedding interface, a request-scoped evidence retriever, and a chat-prompt/structured-model chain. The existing parser and Qdrant adapter preserve line references, vector IDs, mandatory project filters, and write retries. Application code validates citation references before Express independently checks and saves the report. Empty retrieval bypasses generation. Tracing is disabled for retrieval and generation; no additional service is needed.

The frontend uses local component state, a small account context, and a reusable resource hook. Active work is polled every three seconds, paused while the page is hidden, and stopped at terminal states. Plain CSS provides the desktop sidebar, responsive navigation, tables, and report/evidence panels.

## Data models

| Model         | Purpose                                                                                            |
| ------------- | -------------------------------------------------------------------------------------------------- |
| User          | Name, unique email, bcrypt hash, session revocation version                                        |
| Project       | Owner, name, description, ACTIVE/DELETING state, cleanup checkpoints                               |
| Source        | Project/owner, original filename, hidden storage reference, progress/status, attempts, chunk count |
| Incident      | Project/owner, symptoms, service, incident window, OPEN/RESOLVED state                             |
| Investigation | Incident/project/owner, lifecycle, validated report, evidence snapshot, model timings              |

A partial unique MongoDB index permits one RUNNING investigation per incident. Expired runs can be marked failed before a retry. This is an admission constraint, not a distributed lock.

## Public REST API

All project-scoped operations derive identity from the session and enforce ownership. An inaccessible resource returns 404.

| Method               | Path                                                                 | Behavior                                          |
| -------------------- | -------------------------------------------------------------------- | ------------------------------------------------- |
| POST                 | `/api/auth/register`                                                 | Register with a hashed password                   |
| POST                 | `/api/auth/login`                                                    | Set an HttpOnly session cookie                    |
| GET                  | `/api/auth/me`                                                       | Current account                                   |
| POST                 | `/api/auth/logout`                                                   | Revoke sessions and clear cookie                  |
| GET / POST           | `/api/projects`                                                      | List owned projects / create                      |
| GET / PATCH / DELETE | `/api/projects/:projectId`                                           | Read / edit / queue deletion                      |
| GET                  | `/api/projects/:projectId/dashboard`                                 | Project counts and recent work                    |
| GET / POST           | `/api/projects/:projectId/sources`                                   | List / validate and queue upload (202)            |
| GET                  | `/api/projects/:projectId/sources/:sourceId`                         | Source status                                     |
| GET                  | `/api/projects/:projectId/sources/:sourceId/lines?start=1&limit=200` | Numbered original lines, maximum 500 per response |
| POST                 | `/api/projects/:projectId/sources/:sourceId/retry`                   | Retry a failed source                             |
| GET / POST           | `/api/projects/:projectId/incidents`                                 | List / create incidents                           |
| GET / PATCH          | `/api/incidents/:incidentId`                                         | Details / resolve or reopen                       |
| GET                  | `/api/incidents/:incidentId/investigations`                          | Investigation history                             |
| POST                 | `/api/incidents/:incidentId/investigate`                             | Retrieve, generate, validate, and persist         |
| GET                  | `/api/investigations/:id`                                            | Saved report                                      |
| GET                  | `/api/health`                                                        | Liveness                                          |
| GET                  | `/api/health/ready`                                                  | MongoDB, Redis, and analysis readiness            |
| GET                  | `/api/health/config`                                                 | Safe upload configuration                         |

Mutating browser requests must have the configured origin. Production cookies are Secure; all sessions are HttpOnly and SameSite=Lax. Passwords are limited to bcrypt's 72-byte input boundary. Logout increments the account's session version, invalidating older tokens.

## Internal REST API

`X-Service-Secret` is required on ingestion, retrieval, investigation, cleanup, and readiness.

| Method | Path                     | Input                                                                 |
| ------ | ------------------------ | --------------------------------------------------------------------- |
| POST   | `/internal/ingest`       | Multipart bytes plus project/source ID and source type                |
| POST   | `/internal/retrieve`     | Incident, project, READY source IDs, Top-K, optional metadata filters |
| POST   | `/internal/investigate`  | Incident and project evidence scope                                   |
| DELETE | `/internal/projects/:id` | Cancel in-flight ingestion and delete project vectors                 |

## Ingestion and deletion

The upload interface accepts multiple files, detects their initial source type by extension, and allows per-file overrides. It sends one file per request in sequence through the existing authenticated upload endpoint. Rejected files can be retried without resending accepted files; saved-but-unqueued and ambiguous network outcomes direct the user to Sources before resubmission. This keeps each request within the configured per-file memory and size limits.

Upload validation enforces extension, actual UTF-8 text, no NUL bytes, and the configured size limit (20 MB by default). UUID storage filenames prevent user-controlled filesystem paths. Files stay outside public directories.

Source states are UPLOADED → QUEUED → PROCESSING → READY, with bounded retries leading to FAILED. Worker concurrency defaults to one, ingestion attempts to three, and exponential backoff to five seconds initially. Queue retention is bounded to 100 completed and 200 failed jobs. Restart reconciliation requeues missing work from MongoDB.

Deletion first marks the project DELETING and rejects new work. Cleanup waits for active ingestion/investigation, removes pending source jobs, and runs checkpointed vector, file, and record removal. Each operation tolerates prior deletion. MongoDB project deletion is the final step. Workers skip projects that are absent or deleting. Uploads racing deletion remove their newly saved file and metadata rather than leaving an orphan. Cleanup also removes legacy benchmark records created by earlier versions when their project is deleted.

Important files: `server/src/app.js`, `server/src/routes`, `server/src/workers/ingestionWorker.js`, `server/src/services/cleanup.js`, `ai-service/app/services`, and `client/src/pages`.
