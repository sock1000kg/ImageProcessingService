# Web application

REST API and React dashboard for the Cloud-Native Image Processing Service. It
accepts an image upload, creates a job, publishes the job to NATS, and displays
the result reported by an Engine worker.

The current MVP supports the two job types implemented by Engine:

- `object-detection` through `jobs.ai`
- `image-convert` through `jobs.image`

The Web service consumes worker events from `jobs.events`. Binary files are
stored in MinIO; PostgreSQL stores job metadata and status.

## Prerequisites

Install the following tools before starting the local system:

- Docker Desktop with Docker Compose.
- Node.js and npm.
- Python 3.11.
- Git.

All commands below use PowerShell and assume they are run from the repository
root unless another directory is specified.

## Run the complete local system

Run the following components in separate PowerShell terminals:

```text
Infrastructure terminal: NATS, PostgreSQL, MinIO
Web terminal 1:           Web backend
Web terminal 2:           Web frontend
Engine terminal:          AI worker or image worker
```

All components must use the same `infra/.env` credentials and the same local
NATS/MinIO endpoints. The Engine worker does not create streams, consumers, or
buckets; Infrastructure provisions them before the applications start.

### 1. Start shared Infrastructure

Run this from the repository root:

```powershell
if (-not (Test-Path infra\.env)) { Copy-Item infra\.env.example infra\.env }
# Edit infra\.env and replace the CHANGE_ME values if needed.
docker compose -f infra\docker-compose.yaml up -d
```

The Compose file starts NATS, PostgreSQL, and MinIO, then provisions:

```text
NATS streams:
  AI_JOBS
  IMAGE_JOBS
  JOB_EVENTS

Durable consumers:
  ai-workers
  image-workers
  backend-job-events

MinIO buckets:
  uploads
  results
```

If the setup containers did not complete or a volume was removed, run them
again:

```powershell
docker compose -f infra\docker-compose.yaml run --rm nats-setup
docker compose -f infra\docker-compose.yaml run --rm minio-setup
```

Do not run `engine\docker-compose.local.yml` at the same time. It starts a
separate local NATS/MinIO configuration and can use different credentials from
the shared system.

### 2. Install and start Web backend

Use Node.js and npm. From the repository root:

```powershell
Set-Location web
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm install
npm run migrate
npm run dev:backend
```

Run `npm run migrate` after starting PostgreSQL and before the first Web
backend start. It is safe to run the migration again.

The backend listens on:

```text
http://localhost:3000
```

### 3. Start Web frontend

Open another PowerShell terminal:

```powershell
Set-Location web
npm run dev:frontend
```

Open the dashboard at:

```text
http://localhost:5173
```

The Vite development server proxies `/api` to the backend and `/results` to
MinIO, so result URLs work the same way locally and in the deployed
environment.

### 4. Start the Engine AI worker

The Engine worker requires Python 3.11, because this is the Python version used
by `engine\Dockerfile`. From another PowerShell terminal:

```powershell
Set-Location engine
if (-not (Test-Path .venv)) { py -3.11 -m venv .venv }
.\.venv\Scripts\Activate.ps1
if (-not (Test-Path .venv\.dependencies-installed)) {
  python -m pip install --upgrade pip
  python -m pip install -r requirements.txt
  New-Item .venv\.dependencies-installed -ItemType File | Out-Null
}

$env:NATS_URL="nats://localhost:4222"
$env:NATS_STREAM_NAME="AI_JOBS"
$env:NATS_CONSUMER_NAME="ai-workers"
$env:NATS_SUBJECTS="jobs.ai"
$env:NATS_EVENTS_SUBJECT="jobs.events"
$env:MINIO_ENDPOINT="localhost:9000"
$env:MINIO_ACCESS_KEY="imgproclocal"
$env:MINIO_SECRET_KEY="CHANGE_ME_minio_local"
$env:MINIO_SECURE="false"

python -m src.main
```

If `engine\.venv` already exists and its dependencies are installed, only
activation and the environment variables are needed. If PowerShell blocks
activation, run this once in a PowerShell terminal opened for your user:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

Use the same `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD` values configured in
`infra\.env` for `MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY`. The value
`CHANGE_ME_minio_local` is only a local development credential; never use it in
production.

The AI worker binds to the pre-provisioned `AI_JOBS` stream and `ai-workers`
consumer. It processes `object-detection` jobs submitted from the Web
dashboard.

### 5. Start the Engine image worker

Stop the AI worker with `Ctrl+C`, then start a new Engine terminal with the
image-worker configuration below. Alternatively, keep both workers running in
separate terminals to process both job types at the same time:

```powershell
Set-Location engine
.\.venv\Scripts\Activate.ps1

$env:NATS_URL="nats://localhost:4222"
$env:NATS_STREAM_NAME="IMAGE_JOBS"
$env:NATS_CONSUMER_NAME="image-workers"
$env:NATS_SUBJECTS="jobs.image"
$env:NATS_EVENTS_SUBJECT="jobs.events"
$env:MINIO_ENDPOINT="localhost:9000"
$env:MINIO_ACCESS_KEY="imgproclocal"
$env:MINIO_SECRET_KEY="CHANGE_ME_minio_local"
$env:MINIO_SECURE="false"

python -m src.main
```

Use this worker to process `image-convert` jobs. The AI worker and image worker
must use their own stream, subject, and durable consumer configuration.

## Test the integration

### Object Detection

1. Start Infrastructure, Web backend, Web frontend, and the AI worker.
2. Open `http://localhost:5173`.
3. Select `Object detection (AI)`.
4. Choose a JPEG, PNG, or WEBP image.
5. Optionally adjust the confidence threshold.
6. Click **Start transformation**.
7. Confirm the job changes from `QUEUED` to `PROCESSING` and then
   `COMPLETED`.
8. Confirm that the result preview, detected labels, processing time, and
   download link are displayed.

### Image Convert

1. Start the image worker with the `IMAGE_JOBS` configuration above.
3. In the dashboard select `Image convert`.
4. Select the target format and optionally set quality, width, and height.
5. Upload an image and start the job.
6. Confirm the converted preview, input/output dimensions, file sizes, and
   download link.

### Expected logs

The Engine should log messages similar to:

```text
Connected to NATS JetStream successfully
Worker binding to stream 'AI_JOBS' or 'IMAGE_JOBS'
[RECEIVED JOB]
Uploaded ... to results/<jobId>/result.<ext>
Emitted COMPLETED event
[JOB COMPLETED & ACKED]
```

The Web backend should receive the event and update the corresponding job in
PostgreSQL. Refreshing the browser must preserve the job and its status.

## Local service endpoints

| Service | Address | Notes |
| --- | --- | --- |
| Web frontend | `http://localhost:5173` | Vite dashboard |
| Web backend | `http://localhost:3000` | REST API |
| Backend health | `http://localhost:3000/health` | Liveness check |
| Backend readiness | `http://localhost:3000/ready` | Dependency check |
| MinIO S3 API | `http://localhost:9000` | Input and result objects |
| MinIO Console | `http://localhost:9001` | Credentials from `infra\.env` |
| PostgreSQL | `localhost:5432` | Database/user: `imgproc` |
| NATS | `localhost:4222` | JetStream |

## Web environment variables

The default `web\.env.example` matches the shared Infrastructure configuration:

```env
DATABASE_URL=postgresql://imgproc:CHANGE_ME_imgproc_local@localhost:5432/imgproc
NATS_URL=nats://localhost:4222
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=imgproclocal
MINIO_SECRET_KEY=CHANGE_ME_minio_local
MINIO_USE_SSL=false
PUBLIC_RESULTS_BASE_URL=/results
UPLOAD_MAX_BYTES=52428800
```

If `infra\.env` uses different credentials, update `web\.env` and the Engine
PowerShell variables to use the same values.

## Troubleshooting

### `ECONNREFUSED` or Web cannot load `/api/jobs`

The Web frontend is running but the backend is not. Start or restart:

```powershell
Set-Location web
npm run dev:backend
```

### Backend reports a missing stream, consumer, or bucket

The shared Infrastructure setup has not completed:

```powershell
docker compose -f infra\docker-compose.yaml run --rm nats-setup
docker compose -f infra\docker-compose.yaml run --rm minio-setup
```

Then restart the Web backend and Engine worker.

### Engine cannot connect to MinIO

Check that:

```text
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY matches MINIO_ROOT_USER
MINIO_SECRET_KEY matches MINIO_ROOT_PASSWORD
MINIO_SECURE=false
```

### Engine cannot bind to a consumer

Check that the worker variables are paired correctly:

```text
AI_JOBS    + ai-workers    + jobs.ai
IMAGE_JOBS + image-workers + jobs.image
```

Also confirm that the corresponding setup container completed successfully.

## Production build

Build both backend and frontend:

```powershell
Set-Location web
npm run build
npm start
```

For deployment, provide `DATABASE_URL`, `NATS_URL`, `MINIO_ENDPOINT`,
`MINIO_PORT`, `MINIO_ACCESS_KEY`, and `MINIO_SECRET_KEY` from
Infrastructure-managed secrets. Do not commit `.env`, credentials, virtual
environments, or `node_modules`.

The Web Docker image is defined in [Dockerfile](Dockerfile). Kubernetes
deployment, public routing, and production secrets are managed by the
Infrastructure team.
