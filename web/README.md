# Web application

REST API and React dashboard for the Cloud-Native Privacy Service. Web receives an image batch, stores private inputs in MinIO, creates one job per image, publishes `image-redact` commands to NATS JetStream, and displays worker progress and results.

The implementation follows [`docs/integration-contracts.md`](../docs/integration-contracts.md):

- Jobs are published to `jobs.image` on `IMAGE_JOBS`.
- Worker events are consumed from `jobs.events` on `JOB_EVENTS` by `backend-job-events`.
- `uploads` is used for private inputs and whitelist images.
- `results` is used for processed outputs.
- PostgreSQL state is accessed through Prisma.

## Architecture

```text
React/Vite frontend
        |
        | REST /api
        v
Express Web backend
   |          |             |
   v          v             v
Prisma    NATS JetStream   MinIO/S3
Postgres  jobs.image       uploads/results
           jobs.events
```

The current upload API accepts one multipart request for the whole batch. The planned three-step DRAFT/files/start flow is not enabled yet, so do not use it.

## Prerequisites

Install:

- Docker Desktop with Docker Compose.
- Node.js `20.19+` or Node.js `22.12+` (required by Prisma 7).
- npm.
- Git.
- Python and the Engine dependencies if you want to process images end to end.

All commands below use Windows PowerShell. Run them from the repository root unless another directory is specified.

## Quick start on Windows

### 1. Configure Infrastructure

Create `infra/.env` from the example if it does not exist:

```powershell
Set-Location "E:\cacvandehiendaicntt\ImageProcessingService"
if (!(Test-Path ".\infra\.env")) {
  Copy-Item ".\infra\.env.example" ".\infra\.env"
}
```

`infra/.env` is used only by Docker Compose and must contain:

```env
MINIO_ROOT_USER=imgproclocal
MINIO_ROOT_PASSWORD=CHANGE_ME_minio_local
POSTGRES_PASSWORD=CHANGE_ME_imgproc_local
```

Start the local infrastructure:

```powershell
docker compose -f ".\infra\docker-compose.yaml" up -d
docker compose -f ".\infra\docker-compose.yaml" ps
```

Expected running services:

```text
imgproc-local-postgres-1   healthy
imgproc-local-nats-1       healthy
imgproc-local-minio-1      healthy
```

The `nats-setup` and `minio-setup` services normally exit with code `0` after provisioning streams, consumers, buckets, and the MinIO lifecycle policy. They can be run again safely:

```powershell
docker compose -f ".\infra\docker-compose.yaml" run --rm nats-setup
docker compose -f ".\infra\docker-compose.yaml" run --rm minio-setup
```

Do not use an old container named `local-postgres`; use the Compose container shown by `docker compose ps`.

### 2. Configure Web

Create `web/.env`:

```powershell
Set-Location ".\web"
if (!(Test-Path ".\.env")) {
  Copy-Item ".\.env.example" ".\.env"
}
```

Set `web/.env` to match the local Compose credentials:

```env
PORT=3000
DATABASE_URL=postgresql://imgproc:CHANGE_ME_imgproc_local@localhost:5432/imgproc
NATS_URL=nats://localhost:4222
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=imgproclocal
MINIO_SECRET_KEY=CHANGE_ME_minio_local
MINIO_USE_SSL=false
PUBLIC_RESULTS_BASE_URL=/results
UPLOAD_MAX_BYTES=52428800
BATCH_MAX_FILES=20
BATCH_MAX_BYTES=94371840
CLEANUP_INTERVAL_MS=600000
```

`infra/.env` and `web/.env` have different purposes:

| File | Used by | Main settings |
| --- | --- | --- |
| `infra/.env` | Docker Compose | PostgreSQL password and MinIO root credentials |
| `web/.env` | Backend and Prisma | Database URL, NATS URL, S3/MinIO connection, upload limits |

Do not commit either file if it contains real credentials.

### 3. Install dependencies and generate Prisma Client

```powershell
npm install
npm run db:generate
```

### 4. Prepare the database

For a new local database:

```powershell
npm run db:deploy
```

If Prisma reports `P3005` ("database schema is not empty"), the database contains an older SQL schema. Do not run `npm run db:deploy` repeatedly and do not run `prisma migrate reset` unless all local data can be deleted.

Inspect the current database:

```powershell
docker exec -it imgproc-local-postgres-1 psql -U imgproc -d imgproc
```

Inside `psql`:

```sql
\dt
\d jobs
\q
```

If the database contains only disposable test data, reset the local `public` schema and deploy the Prisma migration:

```powershell
docker exec -i imgproc-local-postgres-1 psql -U imgproc -d imgproc -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
npm run db:deploy
```

If data must be preserved, stop here and create a deliberate migration/baseline for the old schema. Do not mark the Prisma migration as applied until the existing tables actually match `backend/prisma/schema.prisma`.

### 5. Start the Web backend

In the `web` directory:

```powershell
npm run dev:backend
```

The backend listens on `http://localhost:3000`.

Check liveness and readiness from another PowerShell terminal:

```powershell
Invoke-WebRequest http://localhost:3000/health
Invoke-WebRequest http://localhost:3000/ready
```

`/ready` checks PostgreSQL, NATS, and the `uploads`/`results` buckets. If it fails, inspect the backend terminal and `docker compose ps`.

### 6. Start the Web frontend

In another terminal:

```powershell
Set-Location "E:\cacvandehiendaicntt\ImageProcessingService\web"
npm run dev:frontend
```

Open `http://localhost:5173`.

The Vite server proxies:

- `/api` to the Web backend at `localhost:3000`.
- `/health` to the Web backend.
- `/results` to MinIO at `localhost:9000`.

### 7. Start Engine for real processing

The Web can build and start without Engine, but jobs require an Engine worker:

```powershell
Set-Location "E:\cacvandehiendaicntt\ImageProcessingService\engine"
python -m src.main
```

The Engine must have its Python environment, model weights, and configuration ready. If Python is not found, install Python and select the correct interpreter before starting the worker.

## API endpoints

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/batches` | Multipart upload: `files` (1..20), `whitelist` (0..5), `config` JSON string |
| `GET` | `/api/batches/:id` | Batch details and jobs |
| `GET` | `/api/batches/:id/report` | Batch report with totals and detections when provided by Engine |
| `DELETE` | `/api/batches/:id` | Delete the batch and its `uploads`/`results` objects |
| `GET` | `/api/jobs/:id` | Job status and details |
| `POST` | `/api/jobs/:id/retry` | Retry a `FAILED` job with a new job ID and output key |
| `GET` | `/api/jobs/:id/original` | Stream the private original image |
| `GET` | `/api/system/stats` | Job counts grouped by status |
| `GET` | `/health` | Liveness check |
| `GET` | `/ready` | PostgreSQL, NATS, and MinIO readiness check |

### Current upload contract

`POST /api/batches` is currently a single multipart request:

- `files`: one or more JPG, PNG, or WEBP images.
- `whitelist`: optional JPG, PNG, or WEBP face references.
- `config`: serialized JSON configuration.

The backend creates one job per image and publishes one `image-redact` command per job. The three-step `DRAFT`/`files`/`start` API described in the longer Web plan is not implemented yet.

## Error response format

API errors use `ErrorDTO`:

```json
{
  "error": {
    "code": "UPPER_SNAKE",
    "message": "Human-readable error description",
    "details": []
  }
}
```

Common statuses:

| HTTP status | Code | Meaning |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR`, `INVALID_JSON`, `BAD_REQUEST`, `UPLOAD_ERROR` | Invalid request or file |
| `404` | `NOT_FOUND` | Resource or route not found |
| `410` | `GONE` | Batch, input, or whitelist expired |
| `413` | `FILE_TOO_LARGE` | File or request exceeds configured limit |
| `503` | `SERVICE_UNAVAILABLE` | NATS or another external dependency unavailable |
| `500` | `INTERNAL_ERROR` | Unexpected server error |

## Prisma workflow

Run these commands from `web`:

```powershell
npm run db:generate   # Generate Prisma Client
npm run db:deploy     # Apply committed migrations
npm run db:migrate    # Create a development migration
npm run db:studio     # Open Prisma Studio
```

Never edit `backend/src/generated/prisma` manually.

## Testing and build

Unit tests do not require Docker services:

```powershell
npm run test:backend
npm run test:frontend
npm test
```

Build both backend and frontend:

```powershell
npm run build
```

Service tests require PostgreSQL, NATS, MinIO, provisioned buckets, streams, and consumers:

```powershell
npm run db:deploy
npm run test:service
```

If a service is unavailable, typical errors are:

- `P1001`: PostgreSQL is not reachable.
- `ECONNREFUSED ...:9000`: MinIO is not reachable.
- NATS provisioned resource error: setup containers have not completed or the stream/consumer names differ from the contract.

## Production build

```powershell
npm run build
npm start
```

## Project structure

```text
web/
├── prisma.config.ts
├── backend/
│   ├── prisma/              # schema.prisma and committed migrations
│   └── src/
│       ├── app.ts           # Express middleware and routes
│       ├── server.ts        # Bootstrap, readiness, and cleanup lifecycle
│       ├── domain/          # Command, job-state, and batch-status logic
│       ├── dto/             # Zod validation and response DTOs
│       ├── repositories/    # Prisma data access
│       ├── services/        # Batch, retry, report, and cleanup orchestration
│       ├── controllers/     # Express handlers
│       ├── routes/          # API routes
│       ├── messaging.ts     # NATS JetStream integration
│       └── storage.ts       # AWS SDK S3/MinIO integration
└── frontend/
    └── src/                 # React dashboard and Phase 1 components
```
