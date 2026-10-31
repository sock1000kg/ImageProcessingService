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
BATCH_MAX_FILES=100
CLEANUP_INTERVAL_MS=600000
```

`infra/.env` and `web/.env` have different purposes:

| File         | Used by            | Main settings                                              |
| ------------ | ------------------ | ---------------------------------------------------------- |
| `infra/.env` | Docker Compose     | PostgreSQL password and MinIO root credentials             |
| `web/.env`   | Backend and Prisma | Database URL, NATS URL, S3/MinIO connection, upload limits |

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

| Method   | Path                      | Description                                                                                                      |
| -------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `POST`   | `/api/batches`            | Create draft batch: `whitelist` (0..5), `config` JSON string, optional `name`. Returns 201 `{ batch }` (`DRAFT`) |
| `POST`   | `/api/batches/:id/files`  | Upload single image (`file`) to draft batch. Returns 201 `{ job }` (`PENDING`)                                   |
| `POST`   | `/api/batches/:id/start`  | Start batch processing for pending jobs. Returns 202 `{ batch }`                                                 |
| `GET`    | `/api/batches/:id`        | Batch details and jobs (includes `name`)                                                                         |
| `PATCH`  | `/api/batches/:id`        | Rename batch with JSON `{ name }`. Returns 200 `{ batch }`                                                       |
| `GET`    | `/api/batches/:id/report` | Batch report with totals, review images/reasons, `batchName`, and detections when provided by Engine             |
| `DELETE` | `/api/batches/:id`        | Delete the batch and its `uploads`/`results` objects                                                             |
| `GET`    | `/api/jobs/:id`           | Job status and details                                                                                           |
| `POST`   | `/api/jobs/:id/retry`     | Retry a `FAILED` job with a new job ID and output key                                                            |
| `GET`    | `/api/jobs/:id/original`  | Stream the private original image                                                                                |
| `GET`    | `/api/system/stats`       | Job counts grouped by status                                                                                     |
| `GET`    | `/health`                 | Liveness check                                                                                                   |
| `GET`    | `/ready`                  | PostgreSQL, NATS, and MinIO readiness check                                                                      |

### Upload flow (Per-image upload)

Batch creation and image processing use a three-step flow:

1. **`POST /api/batches`** (Create draft batch)
   - **Request**: Multipart form data with:
     - `name`: optional batch name (1–100 characters after trimming, no control characters). When omitted or empty, the server sets a default name formatted as `Batch <YYYY-MM-DD HH:mm>` in UTC. Values exceeding 100 characters or containing control characters return `400 VALIDATION_ERROR`.
     - `config`: serialized JSON string with redaction options (`targets`, `style`, `strength`, `padding`, `quality`, `format`, `confidenceThreshold`, `reviewThreshold`, `similarityThreshold`).
     - `whitelist`: optional 0 to 5 face reference images (JPG, PNG, WEBP, up to `UPLOAD_MAX_BYTES`).
     - Note: `files` field is **not allowed**; sending it returns `400 BAD_REQUEST` with a message pointing to `/api/batches/:id/files`.
   - **Response**: `201 Created` with `{ batch }` in status `"DRAFT"` (includes `name`).
   - **Errors**: `400 BAD_REQUEST` / `VALIDATION_ERROR`, `413 FILE_TOO_LARGE`.

2. **`POST /api/batches/:id/files`** (Upload individual file)
   - **Request**: Multipart form data with exactly one `file` field (JPG, PNG, or WEBP, up to `UPLOAD_MAX_BYTES`).
   - **Response**: `201 Created` with `{ job }` in status `"PENDING"`.
   - **Concurrency & limits**: Enforced under a PostgreSQL row lock (`SELECT ... FOR UPDATE`) on the batch record.
   - **Errors**:
     - `400 BAD_REQUEST`: missing `file` field or unsupported image format.
     - `404 NOT_FOUND`: batch does not exist.
     - `409 BATCH_STARTED`: batch has already been started.
     - `409 BATCH_FULL`: batch already has `BATCH_MAX_FILES` jobs (default: 100).
     - `413 FILE_TOO_LARGE`: file size exceeds `UPLOAD_MAX_BYTES` (default: 50MB).

3. **`POST /api/batches/:id/start`** (Start processing)
   - **Request**: Empty body.
   - **Response**: `202 Accepted` with `{ batch }` transitioning from `"DRAFT"` to `"PROCESSING"`.
   - **Behavior**: Marks the batch `startedAt` (if null), publishes every job still `PENDING` to NATS on `jobs.image`, and marks each job `QUEUED`.
   - **Idempotency**: Calling `/start` again only publishes jobs that are still `PENDING`. If all jobs have already been queued or finished, no duplicate commands are emitted.
   - **Errors**:
     - `400 BATCH_EMPTY`: batch has 0 jobs.
     - `404 NOT_FOUND`: batch does not exist.
     - `503 SERVICE_UNAVAILABLE`: NATS job queue unavailable; previously queued jobs remain `QUEUED`.

4. **`PATCH /api/batches/:id`** (Rename batch)
   - **Request**: JSON body with `{ name }` (required):
     - `name`: 1–100 characters after trimming, no control characters. An empty or whitespace-only string resets the name to server default `Batch <YYYY-MM-DD HH:mm>` (UTC).
     - Strict schema: unknown properties in the JSON body return `400 VALIDATION_ERROR`.
   - **Behavior**: Renames the batch in PostgreSQL and returns the updated batch representation. Works across all batch states (`DRAFT`, `PROCESSING`, `COMPLETED`, `PARTIAL`).
   - **Response**: `200 OK` with `{ batch }` containing the updated `name`.
   - **Errors**:
     - `400 VALIDATION_ERROR`: missing `name`, name exceeding 100 characters, control characters present, or unknown keys in request body.
     - `404 NOT_FOUND`: batch does not exist.

Every batch response (`BatchResponseDTO`) includes `name: string`. The batch report (`ReportResponseDTO` from `GET /api/batches/:id/report`) includes `batchName: string`.

`BATCH_MAX_BYTES` has been removed. Total batch size is no longer limited in memory on creation; limits are governed by `UPLOAD_MAX_BYTES` per file (50 MB) and `BATCH_MAX_FILES` per batch (default: 100). Draft batches older than 24h are deleted by the periodic cleanup task. Whitelist reference images for draft batches are never removed prior to batch completion.

The Create Batch page also supports selecting a folder (including nested folders) in browsers that expose `webkitdirectory`. Files are validated locally before submission: only JPG/JPEG, PNG, and WEBP are accepted, each file is limited to 50 MB, and a batch is limited to 100 files. Invalid or excess files are reported and are never added to `FormData`; choosing a folder does not upload until **Create secure batch** is pressed. Folder selection is a UI convenience only—uploads are now sent as one file per request (`POST /api/batches/:id/files`).

The report keeps Engine-provided review signals authoritative. An image is marked `needsReview` only when a detection has `lowConfidence: true`, `needsReview: true`, or a provided `similarity` value is within `0.05` of the configured `similarityThreshold`. Missing similarity, confidence, boxes, or flags remain `null`/empty and are not fabricated. Each image also exposes `reviewReasons`, `reviewDetections`, and `lowestRedactedConfidence`; the latter is calculated only from redacted detections that contain confidence.

### Advanced batch report (`GET /api/batches/:id/report`)

- **Latest attempt per image (deduplication)**: Jobs are grouped by `inputKey` to avoid double-counting retried jobs (`POST /api/jobs/:id/retry`). The report keeps only the newest attempt per image (by `createdAt`, tie-breaking on `id`), and exposes `ReportImageDTO.attempts` as the total number of attempts for that input. Totals, image counts, and all derived lists reflect these latest attempts only.
- **Failures**: `ReportImageDTO.error` is typed as `JobError | null` (from `jobErrorSchema`). Failed images are also gathered in `failedImages: [{ jobId, originalFilename, code, message, attempts }]`.
- **Per-person whitelist summary**: `whitelistPeople: [{ whitelistRef, whitelistKey, images: [{ jobId, originalFilename }], imageCount, detectionCount }]` provides one entry per whitelist image in `batch.whitelistKeys` (indexed 0 to N-1, including people appearing in 0 images). Detections with `whitelisted: true` and that `whitelistRef` are counted. Out-of-range `whitelistRef` indices are ignored and logged with `console.warn`.
- **Review notes with values**: Each detection and image exposes `reviewNotes: string[]` alongside `reviewReasons`:
  - `"low confidence 0.41"` (formatted to two decimals);
  - `"kept face near whitelist threshold (similarity 0.62, threshold 0.60)"` when `whitelisted: true`;
  - `"redacted face near whitelist threshold (similarity 0.58, threshold 0.60)"` otherwise;
  - `"engine flagged for review"`.
    Image-level `reviewNotes` deduplicates detection notes, placing kept-face notes first due to privacy risk. Existing `reviewReasons` strings remain unchanged.
- **Image ordering**: Images are sorted across five groups:
  1. Images with `needsReview: true` and a numeric `lowestRedactedConfidence` (sorted ascending by lowest redacted confidence);
  2. Images with `needsReview: true` and `lowestRedactedConfidence: null` (e.g. kept face near whitelist threshold);
  3. Completed images with `needsReview: false` and numeric `lowestRedactedConfidence` (sorted ascending);
  4. Completed images with `lowestRedactedConfidence: null` (no detections);
  5. `FAILED` images.
     Within each group, `originalFilename` (then `jobId`) serves as the tie-break. `reviewImages`, `lowConfidenceDetections`, and `reviewDetections` follow the same sorted image order.
- **Batch-level extras**: Exposes `models: string[]` (unique non-null models across latest completed attempts) and `processingTimeMs: { total, mean, max } | null` over the latest completed attempts.

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

| HTTP status | Code                                                              | Meaning                                         |
| ----------- | ----------------------------------------------------------------- | ----------------------------------------------- |
| `400`       | `VALIDATION_ERROR`, `INVALID_JSON`, `BAD_REQUEST`, `UPLOAD_ERROR` | Invalid request or file                         |
| `404`       | `NOT_FOUND`                                                       | Resource or route not found                     |
| `410`       | `GONE`                                                            | Batch, input, or whitelist expired              |
| `413`       | `FILE_TOO_LARGE`                                                  | File or request exceeds configured limit        |
| `503`       | `SERVICE_UNAVAILABLE`                                             | NATS or another external dependency unavailable |
| `500`       | `INTERNAL_ERROR`                                                  | Unexpected server error                         |

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
