# Deployment preparation

The repository is prepared for native hosting. No live deployment has been published.

## Runtime layout

Use Node.js 24 and Python 3.11. Install with `npm ci`, create a Python environment, install `ai-service/requirements-lock.txt`, and run `npm run build` before starting the API in production.

Production Express serves `client/dist` and handles frontend deep links. Browser requests use the same hostname and `/api` path as the API, preserving cookie behavior. A separate Vite process is needed only for local development.

Run these processes with a supervisor that restarts crashes and allows graceful termination:

```text
API:      npm run start -w server
Worker:   npm run worker -w server
Analysis: python -m uvicorn app.main:app --app-dir ai-service --host 127.0.0.1 --port 8000
```

`Procfile` documents this layout. Bind analysis to a private interface if it is hosted separately, and set the API's analysis URL accordingly. Do not expose the internal service directly to the public network.

## Configuration

Configure production secrets through the hosting secret manager or an ignored environment file with restricted permissions.

| Setting                  | Production requirement                                                  |
| ------------------------ | ----------------------------------------------------------------------- |
| `NODE_ENV`               | `production`                                                            |
| `HOST` / `PORT`          | Bind address and port expected by the supervisor/proxy                  |
| `CLIENT_URL`             | Exact HTTPS origin, with no trailing slash or path                      |
| `TRUST_PROXY_HOPS`       | Explicit trusted proxy hop count (0 by default)                         |
| `REDIS_URL`              | TCP Redis over TLS (`rediss://`) with eviction disabled                 |
| Database                 | Dedicated database/user with appropriate permissions and network access |
| Session/internal secrets | Distinct high-entropy values shared only by the required processes      |
| Provider/vector keys     | Backend secret configuration only                                       |

Terminate TLS at a trusted reverse proxy. Configure request body limits above the 20 MB upload cap and request timeouts appropriate for investigations (120 seconds internally) and evaluations (300 seconds internally). The application rejects insecure production origin/Redis configuration. HttpOnly session cookies are Secure in production.

## Storage and cleanup

The API and worker must see the **same persistent `uploads` directory**. Co-locating them on one host with persistent storage is the initial deployment layout. Two independent ephemeral disks cannot satisfy this contract. FastAPI receives streamed bytes and can live on a separate private host.

Run one analysis process. Its local cancellation barrier prevents ingestion from completing after vector cleanup. Multiple analysis replicas would require a durable cancellation protocol; that is outside the current implementation. Start with worker concurrency one and scale only after considering provider and Redis quotas.

Do not serve the repository root or uploaded files through a static web server. Serve only the built client. Back up metadata and private files consistently, restrict storage permissions, and keep vector/model collection configuration aligned with the indexed data.

## Operations

- Liveness: `/api/health` and analysis `/health`.
- Readiness: `/api/health/ready`, checking MongoDB, Redis, and protected analysis readiness.
- Controlled shutdown: stop the worker after active work drains, then stop API/analysis. The local launcher coordinates this order; Node processes also handle termination signals.
- Restart recovery: worker startup requeues missing nonterminal source jobs and deleting projects from MongoDB.
- Quotas: monitor Redis commands, vector capacity, and provider rate limits. A 30-second idle queue wait still incurs commands, as do stalled-job checks and retention maintenance. Stop development workers when finished.
- Secrets: scan staged changes and full outgoing history with Gitleaks. Rotate any credential that was exposed through an insecure channel and update backend configuration privately.

Native launch, production static routing, and secure configuration checks have been exercised locally. Host-specific TLS, persistent-disk configuration, proxy behavior, backups, and a deployed domain remain unverified until a hosting environment is selected and tested.
