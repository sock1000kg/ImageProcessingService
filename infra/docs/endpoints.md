# ImageProcessing endpoints and topology

Infra's operational reference for the Lab-sock k3s tenant (`infra/`) and the
local docker-compose environment: DNS names, secrets, routes, metrics.
**`docs/` is the source of truth for anything the teams agree on.** The
stream/consumer/bucket topology and who provisions it are defined in
`docs/integration-contracts.md` §4. Local dev is described in
`docs/phân-công-và-guideline.md` §1. If this file disagrees with `docs/`, `docs/`
wins: change `docs/` first (with the team), then this file.

## Environments

| | dev | prod |
|---|---|---|
| namespace | `imgproc-dev` | `imgproc-prod` |
| public hostname | `imgproc-dev.sock1000kg.io.vn` | `imgproc.sock1000kg.io.vn` |
| overlay | `infra/overlays/dev` | `infra/overlays/prod` |
| KEDA | namespace `keda` (shared, `infra/cluster/keda`) | same |

Both run on the single lab node `home-server` (i5-7200U, 2C/4T, 12GB, HDD).

## In-cluster service DNS

| service | dev | prod |
|---|---|---|
| NATS client | `nats.imgproc-dev.svc:4222` | `nats.imgproc-prod.svc:4222` |
| NATS monitoring | `nats.imgproc-dev.svc:8222` | `nats.imgproc-prod.svc:8222` |
| PostgreSQL | `postgresql.imgproc-dev.svc:5432` | `postgresql.imgproc-prod.svc:5432` |
| MinIO API | `minio.imgproc-dev.svc:9000` | `minio.imgproc-prod.svc:9000` |
| MinIO console | `minio-console.imgproc-dev.svc:9001` | `minio-console.imgproc-prod.svc:9001` |

- PostgreSQL: database `imgproc`, user `imgproc`, port `5432`.
- MinIO buckets: `uploads` (private), `results` (anonymous **GetObject only**).

## Secrets

| secret | keys | used by |
|---|---|---|
| `imgproc-minio` | `rootUser`, `rootPassword` | MinIO chart (`existingSecret`), MinIO setup Job |
| `imgproc-postgres` | `postgres-password` (admin `postgres`), `password` (user `imgproc`) | PostgreSQL chart (`auth.existingSecret`) |

Create `infra/overlays/<env>/real-secret.yaml` from `real-secret.example.yaml`
(gitignored), then run `infra/seal.sh <env>` to produce `sealed-secret.yaml`.
The committed `sealed-secret.yaml` is a **placeholder**; `deploy.sh` refuses to
run until it has been sealed.

## Public results URL

Finished images are served same-origin by Traefik straight from MinIO:

```
https://<host>/results/<object-key>
```

- HTTPRoute `minio-results` in each namespace, `parentRefs: traefik-gateway`
  (namespace `traefik`), `PathPrefix /results/`, backend `minio:9000`, **no path
  rewrite** — `/results/<key>` maps to bucket `results`, key `<key>`.
- The route matches **GET and HEAD only**. Any other method is refused at the Gateway, so a
  write can never reach an object store that upstream no longer maintains.
- Anonymous `GET` on a known key works; anonymous listing of the bucket is
  denied (403/404). Keys are unguessable UUID paths, which is the access model.
- Cloudflare: the user adds a Tunnel public hostname
  (`imgproc-dev.sock1000kg.io.vn`, `imgproc.sock1000kg.io.vn`) pointing at
  `http://traefik.traefik.svc.cluster.local:80` in the CF dashboard. Nothing in
  this repo creates it.

## Streams, subjects and consumers

Streams use **workqueue** retention, file storage, 1 replica.

| stream | subjects | consumer | ack_wait | max_deliver | max_ack_pending |
|---|---|---|---|---|---|
| `AI_JOBS` | `jobs.ai`, `jobs.ai.>` | `ai-workers` | 5m (300s) | 5 | 1000 |
| `IMAGE_JOBS` | `jobs.image`, `jobs.image.>` | `image-workers` | 1m (60s) | 5 | 1000 |
| `JOB_EVENTS` | `jobs.events`, `jobs.events.>` | `backend-job-events` | 30s | 10 | 1000 |

All consumers use explicit ack. Provisioned idempotently by
`infra/base/nats/setup-streams.sh` (Job `nats-setup`, also the compose service
`nats-setup`).

## KEDA trigger values

```yaml
triggers:
  - type: nats-jetstream
    metadata:
      # Dev-only endpoint by design (engine worker pools are dev-only)
      natsServerMonitoringEndpoint: nats.imgproc-dev.svc.cluster.local:8222
      account: $G
      stream: AI_JOBS          # or IMAGE_JOBS
      consumer: ai-workers     # or image-workers
      lagThreshold: "1"        # AI_JOBS: "1", IMAGE_JOBS: "5"
      activationLagThreshold: "0"
      useHttps: "false"
```

> ScaledObjects configure `pollingInterval: 10` and `cooldownPeriod: 120`. `durableName` is no longer used by KEDA's `nats-jetstream` scaler (legacy STAN parameter; JetStream scaler uses `consumer`).
> Must match `docs/integration-contracts.md` §4 and §11 (per-pool `AI_JOBS` /
> `IMAGE_JOBS` streams).

## Workers (dev)

Engine worker pools deployed in `imgproc-dev` only (agreeing with `docs/integration-contracts.md` §4):

| deployment | stream / consumer | min / max replicas | lag / activation | CPU req / limit | memory req / limit | peak RAM | image |
|---|---|---|---|---|---|---|---|
| `ai-worker` | `AI_JOBS` / `ai-workers` | 0 / 2 | 1 / 0 | 250m / 1000m | 512Mi / 1536Mi | 3072Mi | `socknot1000kg/imgproc-engine:dev` |
| `image-worker` | `IMAGE_JOBS` / `image-workers` | 0 / 3 | 5 / 0 | 100m / 500m | 256Mi / 768Mi | 2304Mi | `socknot1000kg/imgproc-engine:dev` |

Total peak worker RAM: **5376Mi** (2×1536Mi + 3×768Mi). Replicas are managed dynamically by KEDA ScaledObjects (omitted from Deployments).


## Metrics

Pod/prometheus annotations only; the lab observability node scrapes them
(prom-agent → VictoriaMetrics → Grafana).

| workload | annotations |
|---|---|
| NATS pod | `prometheus.io/scrape: "true"`, `prometheus.io/port: "7777"` (nats prom-exporter sidecar) |
| MinIO pod | `prometheus.io/scrape: "true"`, `prometheus.io/port: "9000"`, `prometheus.io/path: /minio/v2/metrics/cluster` |
| PostgreSQL | Service `postgresql-metrics` annotated `prometheus.io/scrape: "true"`, `prometheus.io/port: "9187"` |

MinIO needs `MINIO_PROMETHEUS_AUTH_TYPE=public` for the metrics endpoint to be
readable without credentials.

## Local docker-compose

```bash
cp infra/.env.example infra/.env
docker compose -f infra/docker-compose.yaml up -d
docker compose -f infra/docker-compose.yaml run --rm nats-setup
docker compose -f infra/docker-compose.yaml run --rm minio-setup
docker compose -f infra/docker-compose.yaml down -v
```

| service | endpoint |
|---|---|
| NATS | `localhost:4222` (monitoring `localhost:8222`) |
| PostgreSQL | `localhost:5432`, db/user `imgproc`, password from `infra/.env` |
| MinIO API | `localhost:9000` |
| MinIO console | `localhost:9001` |

The compose setup services bind-mount the very same `setup-streams.sh` /
`setup-buckets.sh` scripts that the Kubernetes Jobs run, so local and cluster
behaviour match. No Gateway there: use `http://localhost:9000/results/<key>`.


## MinIO image (we build it ourselves)

MinIO upstream is archived: `quay.io/minio/minio` and `docker.io/minio/*` no longer allow anonymous
pulls, and `dl.min.io` returns 410. Everything in this repo therefore uses **one image we build**:

| | |
|---|---|
| image | `socknot1000kg/minio:RELEASE.2025-10-15T17-29-55Z` |
| server | built from source, `github.com/minio/minio` @ `RELEASE.2025-10-15T17-29-55Z` (commit `9e49d5e7…`, security fix GHSA-jjjj-jwhf-8rgr) |
| client | official `mc` `RELEASE.2025-08-13T08-35-41Z`, sha256-verified against the release's `.sha256sum` |
| runtime base | `alpine@sha256:5291449c…` (ca-certificates + curl) |
| build image | `golang@sha256:273d4e65…` (Debian trixie) |
| license | AGPL-3.0-only; `LICENSE` + `CREDITS` at `/licenses/` |

Used by the MinIO Deployment, the `minio-setup` Job, `docker-compose.yaml` and the smoke test.
Rebuild (and optionally publish) with:

```bash
infra/images/build-push.sh            # build + post-build checks
docker login -u socknot1000kg && infra/images/build-push.sh --push
```

The build fails if the cloned tag does not resolve to the pinned commit, or if the `mc` sha256 does
not match the official `.sha256sum` — a truncated download or a swapped binary cannot reach the image.

> On the lab the image must be pullable. Until the push above has happened, either push it once, or
> `docker save` / `ctr images import` it onto the `home-server` node.

## Offline verification

| script | what it proves |
|---|---|
| `infra/verify-render.sh` | renders all three overlays and checks nodeSelectors, memory limits, budget, unpullable images, volume ownership, no duplicate env vars, HTTPRoute wiring, KEDA namespace, and worker stream/consumer pairs |
