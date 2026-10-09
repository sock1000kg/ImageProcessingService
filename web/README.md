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

Start the NATS and MinIO services from `engine/docker-compose.local.yml`, and
start PostgreSQL separately. Copy `.env.example` to `.env` and adjust
`DATABASE_URL` and the MinIO credentials if needed:

```powershell
Set-Location web
Copy-Item .env.example .env
npm install
npm run dev:backend
```

In another terminal:

```powershell
Set-Location web
npm run dev:frontend
```

Open `http://localhost:5173`. The Vite development server proxies `/api` to
the backend on port 3000. For a production build, run `npm run build` and then
`npm start`.

## Deployment configuration

All connection details are environment variables. Kubernetes deployments must
provide `DATABASE_URL`, `NATS_URL`, `MINIO_ENDPOINT`, `MINIO_PORT`,
`MINIO_ACCESS_KEY`, and `MINIO_SECRET_KEY` from the infrastructure-managed
Secrets. `PUBLIC_RESULTS_BASE_URL` defaults to `/results`, matching the
HTTPRoute that exposes the public MinIO `results` bucket.
