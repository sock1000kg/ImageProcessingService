# Web application

REST API and React dashboard for the Cloud-Native Privacy Service. It accepts batch image uploads with optional face whitelist reference photos, creates individual jobs, publishes `image-redact` commands to NATS JetStream (`jobs.image`), and displays progress and results reported by Engine workers.

The service implements the contract defined in `docs/integration-contracts.md` (§2A, §3, §4, §5, §8, §9):
- Batch image redaction via `jobs.image` on stream `IMAGE_JOBS`.
- Consumes worker events from `jobs.events` on stream `JOB_EVENTS` (durable consumer `backend-job-events`).
- Storage managed via `@aws-sdk/client-s3` (`uploads` for private inputs and whitelist, `results` for public outputs).
- PostgreSQL persists application state (batches and jobs).

## Prerequisites

Install the following tools before starting the local system:

- Docker Desktop with Docker Compose.
- Node.js and npm.
- Git.

All commands below assume they are run from the repository root unless another directory is specified.

## Run the local system

### 1. Start shared Infrastructure

```bash
cp infra/.env.example infra/.env
docker compose -f infra/docker-compose.yaml up -d
```

The Compose file starts NATS, PostgreSQL, and MinIO, and runs setup containers to provision streams and buckets:

```text
NATS streams:
  IMAGE_JOBS
  JOB_EVENTS

Durable consumers:
  image-workers
  backend-job-events

MinIO buckets:
  uploads
  results
```

### 2. Install dependencies and start Web backend

From the repository root:

```bash
cd web
cp .env.example .env
npm install
npm run migrate
npm run dev:backend
```

The backend listens on `http://localhost:3000`.

### 3. Start Web frontend

From another terminal:

```bash
cd web
npm run dev:frontend
```

Open the dashboard at `http://localhost:5173`. The Vite development server proxies `/api` to the backend and `/results` to MinIO.

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/batches` | Multipart upload: `files` (1..20), `whitelist` (0..5), `config` (JSON string) |
| `GET` | `/api/batches/:id` | Batch details, derived status, and list of jobs |
| `GET` | `/api/batches/:id/report` | Batch statistics (totals of images, faces, plates, redacted, whitelisted, lowConfidence) |
| `DELETE` | `/api/batches/:id` | Delete batch record and remove all objects in S3 under `uploads/<batchId>/` and `results/<batchId>/` |
| `GET` | `/api/jobs/:id` | Job status and details |
| `GET` | `/api/jobs/:id/original` | Stream the original uploaded private image from S3 |
| `GET` | `/api/system/stats` | Counts of jobs grouped by status |
| `GET` | `/health` | Liveness check |
| `GET` | `/ready` | Readiness check (validates PostgreSQL, NATS, and MinIO buckets) |

## Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3000` | Port for Express server |
| `DATABASE_URL` | `postgresql://imgproc:CHANGE_ME_imgproc_local@localhost:5432/imgproc` | PostgreSQL connection string |
| `NATS_URL` | `nats://localhost:4222` | NATS connection URL |
| `MINIO_ENDPOINT` | `localhost` | MinIO / S3 endpoint host |
| `MINIO_PORT` | `9000` | MinIO / S3 endpoint port |
| `MINIO_ACCESS_KEY` | `imgproclocal` | S3 Access Key |
| `MINIO_SECRET_KEY` | `CHANGE_ME_minio_local` | S3 Secret Key |
| `MINIO_USE_SSL` | `false` | Whether to use SSL for S3 connection |
| `PUBLIC_RESULTS_BASE_URL` | `/results` | Base URL prefix for publicly served results |
| `UPLOAD_MAX_BYTES` | `52428800` (50MB) | Maximum file size per uploaded image |
| `BATCH_MAX_FILES` | `20` | Maximum number of images per batch |
| `BATCH_MAX_BYTES` | `94371840` (90MB) | Maximum total request payload size |
| `CLEANUP_INTERVAL_MS` | `600000` (10 min) | Interval for database retention cleanup (>24h batches) |

## Testing

```bash
# Backend unit tests
npm run test:backend

# Frontend unit tests
npm run test:frontend

# Run all unit tests
npm test

# Service tests (requires running docker-compose infrastructure)
npm run test:service
```

## Production build

```bash
npm run build
npm start
```
