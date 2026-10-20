# Vercel and Render deployment

This setup uses **Vercel Hobby** for the frontend and **two Render Free web services** for the backend. It uses native Node/Python runtimes, private ImageKit uploads, and your existing managed database, Redis, vector index, and model provider. No Docker, paid worker, persistent disk, or new database service is provisioned. No live deployment has been published.

## What runs where

| Service                                | Host                                              | Repository configuration                       |
| -------------------------------------- | ------------------------------------------------- | ---------------------------------------------- |
| Frontend and `/api` proxy              | Vercel Hobby                                      | `vercel.json`, `npm run build:vercel`          |
| Express API and BullMQ worker together | Render Free web service                           | `render.yaml`, `node scripts/start-render.mjs` |
| One FastAPI process                    | Render Free web service                           | `render.yaml`, native Uvicorn command          |
| Accounts and records                   | Existing MongoDB Atlas Free cluster               | Private backend credentials                    |
| Jobs                                   | Existing Upstash Redis Free database              | TCP/TLS, eviction disabled                     |
| Original files                         | Existing ImageKit free account                    | Private files only                             |
| Evidence index and generation          | Existing Qdrant Cloud Free and Gemini free access | Private analysis credentials                   |

## Free-plan limits

Keep both hosting accounts on their free/Hobby workspace plans. Review that **both Render services say Free** before applying the Blueprint. Do not add a payment method, start a paid trial, enable paid instances, or activate billing on the model account. If the platform asks for payment details, stop that setup rather than changing plans.

Render Free sleeps after 15 minutes without inbound traffic and can take about a minute to wake up. The two services share **750 running hours per workspace per month**. A queue worker does not keep a sleeping web service available. Opening the application wakes the API; ingestion or readiness requests wake analysis. Polling active uploads keeps normal upload requests flowing while the page is visible, but it is not an always-on guarantee. There is no scheduled keep-alive or quota bypass.

Without a payment method, Render suspends services/builds when applicable free allowances run out. Outbound database, storage, and provider traffic can also trigger free-service restrictions. Vercel Hobby is for personal, noncommercial use. Existing storage, Redis, vector, and model quotas still apply; processing can fail honestly when those services are unavailable. This setup is for a personal demo and testing, with no availability or load guarantee. See [Render Free](https://render.com/docs/free) and [Vercel Hobby](https://vercel.com/docs/plans/hobby).

## 1. Prepare private credentials

Rotate credentials previously exposed through an insecure channel before publishing. Enter credentials directly in each platform's environment settings; never commit or upload the local `.env` file.

For a new hosted demo, use a **new MongoDB database name**, for example `roottrace_deployed`, in the Atlas connection string. The Blueprint uses a separate `roottrace-deployed-work` Redis queue and `roottrace_deployed_gemini_embedding2_768` Qdrant collection. This prevents the local worker from consuming hosted jobs when both environments share one Redis account. Use a different queue/collection/database for any additional deployment. Never change queue names while jobs are pending.

Allow Render's documented outbound IP ranges in Atlas network access for the selected region. Use a database user restricted to the hosted database. Keep Redis on TCP/TLS with eviction disabled. Reuse only free provider resources. The ImageKit restricted key needs media read/write access and no account-management access.

**Earlier local uploads are not included in deployment.** A fresh database avoids displaying old records whose files exist only on your computer. Keep the local environment intact. If you need its existing projects online, plan and verify a separate migration of their original files and references first; this setup does not perform that migration.

## 2. Create the two Render Free services

Open [the repository Blueprint](https://dashboard.render.com/blueprint/new?repo=https://github.com/AnkitKumar61/RootTrace-AI), connect GitHub, and select the free workspace. The repository root contains `render.yaml`. It explicitly sets `plan: free` for both services and disables preview environments. Select no paid resources.

Provide these settings when prompted:

| Render service       | Setting                                         | Value                                                    |
| -------------------- | ----------------------------------------------- | -------------------------------------------------------- |
| `roottrace-analysis` | `GEMINI_API_KEY`                                | Your free-access provider key                            |
| `roottrace-analysis` | `QDRANT_URL`, `QDRANT_API_KEY`                  | Your cloud endpoint and key                              |
| `roottrace-api`      | `MONGODB_URI`                                   | Atlas URI containing the hosted database name            |
| `roottrace-api`      | `REDIS_URL`                                     | Upstash `rediss://` TCP connection string                |
| `roottrace-api`      | `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT` | Private key and HTTPS endpoint                           |
| `roottrace-api`      | `CLIENT_URL`                                    | Exact Vercel production origin, without a trailing slash |

If you do not know your Vercel domain yet, use `https://setup.invalid` as a temporary `CLIENT_URL`, then replace it in step 3. Login requests are intentionally blocked until the actual frontend origin is configured.

Render generates distinct JWT, proxy, and internal-service secrets. The internal secret is shared with the API through a service reference. The API also receives analysis's actual public HTTPS URL through `RENDER_EXTERNAL_URL`; do not replace it with a private hostname, because Free services cannot receive private-network requests. Analysis's internal endpoints require the shared secret even though its hostname is public.

The Blueprint pins Node through `.nvmrc`/`package.json` and Python through `PYTHON_VERSION`. Keep one analysis process and worker concurrency one. Both services bind `0.0.0.0` and the supplied `PORT`. Render checks inexpensive liveness endpoints, without making provider calls. Auto-deploy is set to wait for GitHub checks.

After creation, note the API service's actual `https://…onrender.com` URL. In its environment settings, privately copy the generated **`API_PROXY_SECRET`** for the next step. Do not copy `AI_SERVICE_SECRET`, provider keys, or JWT secrets to Vercel.

The checked-in manifests have been checked against the platforms' public JSON schemas. If the Render CLI is installed and authenticated, also run `render blueprints validate render.yaml` before applying. Dashboard validation and actual build/runtime behavior still need to pass in your account; local schema validation does not create or inspect hosted resources.

## 3. Import the frontend into Vercel Hobby

Import `AnkitKumar61/RootTrace-AI` from GitHub. Choose **Hobby**, use repository root `.` as Root Directory, choose framework preset **Other**, and leave the Output Directory override unset. The checked-in configuration runs `npm ci --include=dev` and `npm run build:vercel`. It creates Vercel's standard Build Output API directory automatically.

Add these **Production** environment variables before deploying:

| Vercel variable     | Value                                                          |
| ------------------- | -------------------------------------------------------------- |
| `RENDER_API_ORIGIN` | Actual Render API HTTPS origin, with no path or trailing slash |
| `API_PROXY_SECRET`  | Exact generated proxy secret from the Render API environment   |

Neither variable uses the `VITE_` prefix. The build fails safely if they are missing or invalid. The proxy secret is written only to private routing configuration outside the public static directory. The build never loads the repository root `.env` file. Only the frontend's built files become public; no server function or provider key is bundled.

Use the actual Vercel production domain shown in **Settings → Domains** to update Render API's `CLIENT_URL`, then deploy that API configuration. Keep this one canonical origin. Preview deployments are not authorized to use production cookies; do not assign production proxy credentials to Preview environments. Preview builds without those settings fail intentionally.

Browser requests stay on `/api` at the frontend origin. Vercel forwards them to Render and replaces the private proxy header. The API rejects direct requests other than liveness, still checks the frontend request origin, and uses Secure/HttpOnly/SameSite=Lax cookies without a cross-domain cookie setting. API responses are not cached. The two trusted proxy hops correspond to Vercel and Render; verify the actual forwarding behavior after hosting before opening public registration. See [Vercel external rewrites](https://vercel.com/docs/routing/rewrites) and [Build Output API](https://vercel.com/docs/build-output-api).

## 4. Verify the online application

1. Open `/api/health` on the Vercel domain. Allow time for the first backend wake-up.
2. Open `/api/health/ready` on that domain. A sleeping analysis service can initially return 503 while it starts. Retry after it wakes; expect all dependencies to be ready.
3. Register and sign in. Reload the page and confirm the session survives. Check that sign-out prevents access to protected pages.
4. Create a new project and upload only fictional files from `demo-data`. Confirm `202` upload responses and eventual READY states.
5. Create the sample payment incident, investigate, reload its saved report, and open an original-file citation.
6. Sign in as a different test user and confirm the first user's project cannot be opened.
7. Delete the exact test project and wait for it to disappear after files, vectors, and records are removed.
8. Test a direct frontend deep link and a mobile viewport. Confirm that direct Render API requests are rejected, while `/api/health` remains available. Confirm analysis's `/internal/*` and `/health/ready` reject requests without the service secret.

Vercel externally proxied requests have a **120-second limit**. A cold backend plus a long synchronous investigation can exceed it. Do not immediately repeat an investigation after a proxy timeout: reopen the incident history to check whether it completed and saved a report. Wake and verify both services first, then retry only when the earlier attempt has finished or failed. Upload ingestion remains asynchronous and has bounded worker retries. See [Vercel limits](https://vercel.com/docs/limits).

Hosting-specific TLS, header forwarding, cold starts, available memory, and the complete online workflow remain unverified until those services have actually been created and exercised. Local tests do not replace this final hosted check. Avoid redeploying while uploads, investigations, or project cleanup are active; the cancellation barrier assumes one analysis instance and does not span overlapping deploys.

Render Free does not support a custom `maxShutdownDelaySeconds`. The API/worker supervisor allows 25 seconds to drain within the default 30-second window, and analysis uses a 20-second graceful timeout. Long jobs can be interrupted by a deploy or shutdown; BullMQ's stalled-job handling and deterministic indexing support safe retries after restart. This does not guarantee that work finishes while a free service is asleep.

## Runtime layout

Use Node.js 24 and Python 3.11. Install with `npm ci`, create a Python environment, install `ai-service/requirements-lock.txt`, and run `npm run build` before starting the API in production.

For other native hosting, production Express serves `client/dist` when `SERVE_CLIENT=true` (the default) and handles frontend deep links. The Vercel/Render setup sets this to `false` and does not need a client build on Render. A separate Vite process is needed only for local development.

Run these processes with a supervisor that restarts crashes and allows graceful termination:

```text
API:      npm run start -w server
Worker:   npm run worker -w server
Analysis: python -m uvicorn app.main:app --app-dir ai-service --host 127.0.0.1 --port 8000
```

`Procfile` documents this separate-process layout. Prefer a private interface when the host supports it. Render Free instead uses public HTTPS with the internal service secret; sensitive endpoints always require that secret.

## Configuration

Configure production secrets through the hosting secret manager or an ignored environment file with restricted permissions.

| Setting                  | Production requirement                                                  |
| ------------------------ | ----------------------------------------------------------------------- |
| `NODE_ENV`               | `production`                                                            |
| `HOST` / `PORT`          | Bind address and port expected by the supervisor/proxy                  |
| `CLIENT_URL`             | Exact HTTPS origin, with no trailing slash or path                      |
| `TRUST_PROXY_HOPS`       | Explicit trusted proxy hop count (0 by default)                         |
| `SERVE_CLIENT`           | `false` for a separately hosted frontend; `true` for bundled hosting    |
| `API_PROXY_SECRET`       | Shared only between Vercel's private routing and the Render API         |
| `QUEUE_NAME`             | Separate queue per deployment; API and its worker must match            |
| `REDIS_URL`              | TCP Redis over TLS (`rediss://`) with eviction disabled                 |
| Database                 | Dedicated database/user with appropriate permissions and network access |
| Session/internal secrets | Distinct high-entropy values shared only by the required processes      |
| Provider/vector keys     | Backend secret configuration only                                       |
| `STORAGE_PROVIDER`       | `imagekit` for cloud uploads, or `local` with shared persistent storage |
| ImageKit                 | Same private key and HTTPS endpoint on API and worker, when enabled     |

Terminate TLS at a trusted reverse proxy. Configure request body limits above the 20 MB upload cap and request timeouts appropriate for investigations (120 seconds internally). The application rejects insecure production origin/Redis configuration. HttpOnly session cookies are Secure in production.

## Storage and cleanup

Choose file storage explicitly. The default in `.env.example` is `local`.

For **ImageKit**, configure these backend settings on both the API and worker:

```dotenv
STORAGE_PROVIDER=imagekit
IMAGEKIT_PRIVATE_KEY=your-private-key
IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/your-account
```

Use a restricted key with **Media management: Read and write** and **Account management: None**. Uploads are marked private, receive random filenames under `/roottrace`, and are not transformed. The backend generates five-minute signed URLs for its own reads; these URLs and provider references are excluded from public responses. Citation access continues through ownership-protected source-line endpoints. SDK request logging and automatic upload retries are disabled. Storage failures return safe errors; worker processing and project cleanup retain their bounded job retries. Downloads are streamed with byte limits and finite timeouts.

The API waits for the original file to be stored before returning 202 after queueing. Parsing, embedding, and indexing stay asynchronous in the worker. With ImageKit files, API and worker do not need a shared upload disk and can run on separate hosts. Keep the ImageKit key out of frontend variables. Align `MAX_FILE_SIZE_MB` with the account's raw-file upload **and delivery** limits, and monitor storage and bandwidth quotas. The free plan's raw-file delivery limit can differ from its upload limit. See [ImageKit security](https://imagekit.io/docs/media-delivery-basic-security), [delivery limits](https://imagekit.io/docs/transformations), and [plan limits](https://imagekit.io/plans/).

For **local storage**, the API and worker must see the **same persistent `uploads` directory**. Co-locate them on one host with persistent storage or supply a shared volume. Two independent ephemeral disks cannot satisfy this contract.

Changing `STORAGE_PROVIDER` affects **new uploads only**. Existing records without a provider marker continue to use local files. Preserve the original uploads directory and make it available to both processes until those files are intentionally migrated or their projects deleted. Existing ImageKit records still require ImageKit credentials even if new uploads are switched back to local. This release does not automatically copy previous files to another provider.

Deletion removes each source from its recorded provider. An already-deleted ImageKit file is treated as success; other storage errors keep the project DELETING and retain its metadata for a safe retry. MongoDB project deletion remains the final step. FastAPI receives streamed bytes and can live on a separate host protected by the service secret.

Run one analysis process. Its local cancellation barrier prevents ingestion from completing after vector cleanup. Multiple analysis replicas would require a durable cancellation protocol; that is outside the current implementation. Start with worker concurrency one and scale only after considering provider and Redis quotas.

Do not serve the repository root or uploaded files through a static web server. Serve only the built client. Back up metadata and private files consistently, restrict storage permissions, and keep vector/model collection configuration aligned with the indexed data.

## Operations

- Liveness: `/api/health` and analysis `/health`.
- Readiness: `/api/health/ready`, checking MongoDB, Redis, and protected analysis readiness.
- Controlled shutdown: the local launcher drains the worker before stopping the other processes. The Render supervisor signals both API and worker to stop accepting work and drain, then enforces a finite shutdown deadline. Unexpected child exits stop the whole hosted service so the host can restart it.
- Restart recovery: worker startup requeues missing nonterminal source jobs and deleting projects from MongoDB.
- Quotas: monitor Redis commands, vector capacity, and provider rate limits. A 30-second idle queue wait still incurs commands, as do stalled-job checks and retention maintenance. Stop development workers when finished.
- Secrets: scan staged changes and full outgoing history with Gitleaks. Rotate any credential that was exposed through an insecure channel and update backend configuration privately.

Native launch, production static routing, and secure configuration checks have been exercised locally. Host-specific TLS, persistent-disk configuration, proxy behavior, backups, and a deployed domain remain unverified until a hosting environment is selected and tested.
