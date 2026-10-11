# Web application

The Web component contains the REST backend and React UI for the MVP:

- `POST /api/jobs`: accepts a multipart `file`, `type` (`object-detection` or
  `image-convert`) and optional JSON `params`.
- `GET /api/jobs`: returns the latest jobs.
- `GET /api/jobs/:id`: returns one job and its processing state.
- `GET /api/system/stats`: returns counts grouped by job status.

The backend stores media in MinIO, persists job metadata in PostgreSQL, publishes
the command to `jobs.ai` or `jobs.image`, and consumes worker events from
`jobs.events`. It never sends binary files through PostgreSQL or NATS.

## Local development

### 1. Start infrastructure services

From the `engine` directory, start NATS and MinIO (Silo):

```powershell
Set-Location engine
docker compose -f docker-compose.local.yml up -d nats minio minio-init
```

> **Note:** Official `minio/minio` and `minio/mc` images are no longer available on Docker Hub / Quay.
> The local compose file uses the community images `pgsty/silo` and `pgsty/mc` instead.
> You can also remove the obsolete `version:` key at the top of `docker-compose.local.yml`.

### 2. Start PostgreSQL (separately)

Use PostgreSQL **16** (do not use `postgres:latest` — version 18+ changes the data directory layout):

```powershell
docker run --name local-postgres `
  -e POSTGRES_USER=postgres `
  -e POSTGRES_PASSWORD=postgres `
  -e POSTGRES_DB=image_processing `
  -p 5432:5432 `
  -v image-processing-postgres:/var/lib/postgresql/data `
  -d postgres:16
```

If the container already exists and you need a clean start:

```powershell
docker rm -f local-postgres
docker volume rm image-processing-postgres
# then re-run the docker run command above
```

### 3. Configure and start the Web app

```powershell
Set-Location web
Copy-Item .env.example .env   # only needed the first time
npm install
npm run dev:backend
```

In another terminal:

```powershell
Set-Location web
npm run dev:frontend
```

Open `http://localhost:5173`. The Vite development server proxies `/api` to the backend on port 3000.

For a production build, run `npm run build` and then `npm start`.

### Expected services

| Service       | Address / Port        | Notes                                                |
| ------------- | --------------------- | ---------------------------------------------------- |
| Frontend      | http://localhost:5173 | Vite                                                 |
| Backend API   | http://localhost:3000 |                                                      |
| MinIO S3 API  | http://localhost:9000 |                                                      |
| MinIO Console | http://localhost:9001 | login: minioadmin / minioadmin                       |
| PostgreSQL    | localhost:5432        | user/pass/db: postgres / postgres / image_processing |
| NATS          | localhost:4222        | monitoring: 8222                                     |

Default `.env` values that match the containers above:

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/image_processing
NATS_URL=nats://localhost:4222
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_USE_SSL=false
PUBLIC_RESULTS_BASE_URL=/results
UPLOAD_MAX_BYTES=52428800
```

## Deployment configuration

All connection details are environment variables. Kubernetes deployments must
provide `DATABASE_URL`, `NATS_URL`, `MINIO_ENDPOINT`, `MINIO_PORT`,
`MINIO_ACCESS_KEY`, and `MINIO_SECRET_KEY` from the infrastructure-managed
Secrets. `PUBLIC_RESULTS_BASE_URL` defaults to `/results`, matching the
HTTPRoute that exposes the public MinIO `results` bucket.

```

```
