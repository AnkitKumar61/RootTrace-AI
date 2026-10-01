# Interview notes

## Explain the product

RootTrace investigates backend incidents using uploaded logs and engineering documentation. An engineer describes symptoms, retrieves relevant project evidence, and receives a saved structured report with original file/line citations. The report can say that evidence is partial or insufficient. It is an investigation workspace with durable sources and reports.

## Explain the architecture in one minute

React provides the account, project, upload, incident, report, and evaluation screens. Express owns authentication and business records in MongoDB. Uploads save a private file and enqueue a small BullMQ job in Redis, then return 202. A separate worker streams the file to FastAPI. Python parses and chunks it, generates pretrained embeddings, and indexes them in Qdrant. Investigations retrieve READY project evidence, request structured output from Gemini, validate it, and persist the report through Express.

## Frontend and REST

React Router gives each project, incident, and saved report a stable URL. Axios uses cookie credentials. Shared UI components handle fields, notices, badges, and loading states. There is no global state library; account context and local component state cover the current scope.

Polling runs every three seconds only for active work. It pauses while the document is hidden and stops at terminal source states. Citations fetch a bounded slice of the private original file. React renders the source as text, so embedded HTML is not executed.

REST separates resources and actions: projects/sources/incidents have their own routes; investigate is an incident action; saved reports have independent read URLs. Invalid fields return safe 400 responses, inaccessible resources return 404, conflicting work returns 409, and queued uploads/deletions return 202.

## Authentication and authorization

bcrypt hashes passwords with a work factor of 12. Password validation respects bcrypt's 72-byte input boundary. Login returns a one-hour JWT inside an HttpOnly SameSite=Lax cookie, Secure in production. The JWT contains the account ID and session version. Logout increments that version and clears the cookie, invalidating prior sessions.

Authentication answers who made the request. Authorization answers whether that account owns the resource. Project queries include userId. Incident and report access checks both the record and its owning project. Client-supplied user IDs never establish identity. Cookie-based mutations also validate the request origin.

## MongoDB, Redis, and Qdrant

MongoDB stores business metadata, processing state, report snapshots, and evaluation history. Mongoose defines these models and indexes. A partial unique index prevents simultaneous RUNNING investigations for one incident. MongoDB remains the durable source of work status if Redis queue data is lost.

Redis holds BullMQ jobs, retry scheduling, and worker coordination. It is not the metadata database. Queue payloads are small file references and IDs. A dedicated worker lets uploads return quickly while expensive parsing/provider calls run separately.

Qdrant stores embedding vectors and evidence payloads. A vector represents semantic meaning in a numeric space; similar incident queries and source chunks tend to have high cosine similarity. Project and READY-source filters are sent with the vector query so another project's evidence never enters the result set.

## Asynchronous reliability

The source lifecycle is UPLOADED, QUEUED, PROCESSING, then READY or FAILED. Progress advances at coarse completed stages. Ingestion defaults to one concurrent job, three attempts, exponential backoff, and bounded retained jobs. Stable queue IDs prevent duplicate scheduling. Deterministic vector IDs make repeated indexing safe.

A worker checks the project before processing, before sending work, and after ingestion. Missing or DELETING projects are skipped. Shutdown drains current jobs and waits for failure-state writes before disconnecting. On restart, missing queue work is recovered from MongoDB.

Provider quotas cause bounded retries and visible errors. The application does not claim a source is READY until indexing finishes and does not substitute fabricated output after failure.

## Node to Python communication

Express/worker and FastAPI communicate through internal HTTP with a shared secret. The worker sends multipart file bytes rather than a local path. This keeps Python independent of the Node filesystem and allows a private separate analysis host. Public responses do not reveal the internal secret or storage paths.

## Parsing and evidence traceability

The parser extracts common metadata but retains text when structured parsing fails. Stack frames remain with their event. Log chunks preserve related trace/service events; document chunks follow sections and paragraphs. Original line numbers survive parsing and chunking.

Each chunk has a UUID derived from project/source identity, original range, and content hash. An evidence record maps that UUID to filename, source, original lines or section, excerpt, and retrieval score. The provider cites existing IDs; it does not invent source metadata. The frontend follows these records back to the original file.

## Retrieval and generation

Retrieval-augmented generation means retrieving context before requesting a report from a pretrained model. RootTrace uses semantic retrieval plus mandatory project, READY-source, and model constraints. Top-K defaults to eight. Service names and incident windows help the query, while optional metadata filters can narrow it. Hybrid search and reranking are deferred until measurement justifies them.

The embedding adapter verifies one vector per chunk and normalizes 768-dimensional values. Document and query inputs use separate formatting. Gemini investigation and embedding models are behind simple adapters, so changing them does not require rewriting business routes.

LangChain only formats the controlled prompt with `PromptTemplate`. Explicit service code handles retrieval, provider calls, retries, and Pydantic validation. This keeps the actual role small and explainable.

## Structured output and hallucination reduction

The report schema contains summary, suspectedCauses with reasoning/evidenceIds, affectedServices, nextSteps, and evidenceSufficiency. Validation rejects extra fields, unknown citation IDs, invented affected services, and unsupported cause/sufficiency combinations. Express checks the evidence scope again before saving.

Sources and incident descriptions are treated as untrusted data. The prompt instructs the model to ignore embedded instructions, use supplied evidence, and acknowledge uncertainty. No tools or automatic next-step execution are available. Empty retrieval returns INSUFFICIENT without a generation call.

These controls reduce unsupported output. They do not mathematically prove causal truth or semantic entailment. An engineer still reviews the observations and suggested next steps.

## Evaluation

The ShopFlow dataset has 15 fictional cases across five failure categories. Known causes and expected anchors remain outside retrieval/generation prompts. Anchors resolve to actual indexed UUIDs using source filename and original line ranges.

Hit Rate@K asks whether any expected evidence was found. Recall@K asks how much expected evidence was found. Precision@K asks how much retrieved evidence belongs to the annotated expected set. Citation validity and isolation checks test traceability and scope. Provider failures are recorded separately, and metrics show completion coverage.

The live Top-K 8 benchmark found all expected evidence, with 25% strict precision and all 32 accepted citation references valid. The small fictional dataset is a baseline, not a production accuracy claim.

## Deletion and tradeoffs

Project deletion first marks DELETING and disables new actions. Cleanup waits for outstanding work, removes vectors, files, and related metadata, and deletes the MongoDB project last. Checkpoints make a retry safe after partial completion. Repeating file/vector/record removal is harmless. No distributed transaction or lock is required for this initial deployment.

The current design needs shared persistent API/worker upload storage and one FastAPI process for local cancellation. Multi-replica analysis would need a durable cancellation protocol. Worker concurrency, provider throughput, queue command quotas, upload storage, and dataset quality are the first scaling constraints.

## Files worth opening

| Topic                | Files                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------- |
| Request boundaries   | `server/src/app.js`, `middleware/auth.js`, `middleware/ownership.js`                        |
| Business routes      | `server/src/routes`                                                                         |
| Queue and worker     | `server/src/queues/workQueue.js`, `server/src/worker.js`, `workers/ingestionWorker.js`      |
| Deletion             | `server/src/services/cleanup.js`, `ai-service/app/routes/ingestion.py`                      |
| Parsing/chunking     | `ai-service/app/services/parsing_service.py`, `chunking_service.py`                         |
| Retrieval/providers  | `embedding_service.py`, `vector_service.py`, `retrieval_service.py`, `llm_service.py`       |
| Reports/evaluation   | `investigation_service.py`, `evaluation_service.py`, `server/src/validators/report.js`      |
| Screens              | `client/src/pages`, `client/src/components/EvidenceViewer.jsx`                              |
| Evidence of behavior | `server/tests`, `client/src/**/*.test.jsx`, `ai-service/tests`, `scripts/browser-smoke.mjs` |

Python service filenames in this table are under `ai-service/app/services`; middleware and worker paths are under `server/src`.

## Likely questions

**Why keep Express and FastAPI?** Express owns business/authentication concerns; Python hosts parsing and provider/vector libraries. The internal HTTP boundary keeps those responsibilities explicit.

**Why a separate worker?** Provider calls can be slow or rate-limited. A queue gives uploads a fast acknowledgement, independent retries, and recoverable processing status.

**How do you prevent cross-project evidence?** Validate ownership in Express, derive READY source IDs from MongoDB, and send mandatory project/source constraints in Qdrant queries. Tests use distinct users and projects.

**What happens if indexing fails halfway?** The source remains unready and is excluded from retrieval. A retry deletes only that source's old vectors and writes deterministic chunk IDs again.

**Why are citations useful?** They connect a claimed cause to a retrieved chunk and then to an original file and line range. The engineer can inspect the observation instead of trusting an uncited explanation.

**What does INSUFFICIENT mean?** Available evidence does not support a cause. With no retrieved evidence, generation is skipped. Unrelated or healthy-only evidence should also lead to insufficient conclusions.

**Does a valid citation guarantee a correct report?** It guarantees reference existence and project scope, not semantic truth. Output review and better evaluation data remain necessary.

**How would you improve retrieval?** Inspect failed cases, compare Top-K values, improve parsers and annotations, and test metadata filtering. Add hybrid retrieval or reranking only when those measurements identify a need.

**How would you scale?** Increase workers within provider quotas, use shared durable file storage, and introduce a durable analysis cancellation protocol before adding analysis replicas. Monitor bottlenecks before adding infrastructure.

**How is deletion retryable?** Each step is idempotent and recorded. The project marker remains until external and related data cleanup succeeds, so a retry can resume safely.
