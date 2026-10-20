# Complete Infrastructure Delivery Plan

This document outlines the complete plan to deploy the foundational infrastructure for the Cloud-Native Elastic AI Processing Platform. By following these milestones, the infrastructure team will deliver a production-ready environment that can be developed and tested in isolation, and is fully ready for integration with the Web and Engine teams.

> **Round 1 – tenant migration (done in code, NOT yet verified on the lab).**
> `infra/` is now a tenant of the existing **Lab-sock** k3s cluster instead of a
> standalone kind setup. Layout: `infra/app/{nats,postgresql,minio,engine-workers}`,
> `infra/app` (one environment, `imgproc`), `infra/cluster/keda`, plus `deploy.sh`,
> `seal.sh`, `smoke-test.sh`, `scaling-demo.sh`, `docker-compose.yaml`.
> The lab provides k3s, node `home-server` (**i5-7200U, 2C/4T, 12GB RAM, HDD**),
> Traefik Gateway API (`Gateway/traefik-gateway` in ns `traefik`, listener 8000,
> `allowedRoutes: All`), a token-based `cloudflared` tunnel, the
> `sealed-secrets` controller (ns `kube-system`), an observability node running
> prom-agent → VictoriaMetrics → Grafana, and StorageClass `local-path`.
> We only ship project-specific pieces: NATS JetStream, PostgreSQL, MinIO, the
> KEDA install, HTTPRoutes and the two setup Jobs. We never touch lab apps.
> * Deploy: `infra/deploy.sh [cluster|app]` (`kubectl kustomize --enable-helm | kubectl apply`).
> * Secrets: `infra/seal.sh`; committed `sealed-secret.yaml` is a placeholder until then.
> * Anything below is only marked `[x]` when it actually passed on the lab.

## Scripts

| Script | What it does | Who runs it |
|---|---|---|
| `infra/deploy.sh` | Deploys cluster (KEDA) or app (`imgproc`) with pre/post checks | User (lab) |
| `infra/seal.sh` | Seals `infra/app/real-secret.yaml` using kubeseal | User (lab) / Developer |
| `infra/smoke-test.sh` | End-to-end smoke test of cluster services and routes | User (lab) |
| `infra/images/build-push.sh` | Builds custom MinIO+mc image and optionally pushes to registry | Maintainer / CI |
| `infra/verify-render.sh` | Verifies rendered manifests, resource limits, and budgets | Coder / Reviewer / CI |
| `infra/app/nats/setup-streams.sh` | Sets up NATS JetStream streams and durable consumers | Run automatically (Job / compose) |
| `infra/app/minio/setup-buckets.sh` | Sets up MinIO buckets, access policy, and ILM lifecycle | Run automatically (Job / compose) |
| `infra/scaling-demo.sh` | Demonstrates independent autoscaling of AI and Image worker pools | User (lab) |

## Milestone 1: Messaging and Event Bus Foundation
**Goal:** Deploy NATS JetStream and configure the complete streaming topology exactly as defined in the integration contracts.
*   **Tasks:**
        - [x] Deploy NATS to the Kubernetes cluster with JetStream enabled via Helm/Kustomize.
        - [x] Create the `AI_JOBS` stream with subject `jobs.ai` and the `ai-workers` durable consumer.
        - [x] Create the `IMAGE_JOBS` stream with subject `jobs.image` and the `image-workers` durable consumer.
        - [x] Create the `JOB_EVENTS` stream with subject `jobs.events` and the `backend-job-events` durable consumer.
*   **Verification:**
        - [x] Use the NATS CLI within a `nats-box` pod to verify all streams and consumers exist. *(provisioned idempotently by the `nats-setup` Job / `setup-streams.sh`; automated in `smoke-test.sh`, not yet run on the lab)*
        - [x] Manually publish test messages to `jobs.ai`, `jobs.image`, and `jobs.events` and verify they can be fetched by their respective consumers. *(automated in the NATS section of `smoke-test.sh`; not yet run on the lab)*

## Milestone 2: Persistent Storage and State Authority
**Goal:** Deploy PostgreSQL for authoritative job state and MinIO for large binary object storage, complete with networking and data lifecycle policies.
*   **Tasks:**
        - [x] Deploy PostgreSQL via Helm/Kustomize to serve as the application state backend.
        - [x] Deploy MinIO for object storage (buckets: `uploads` and `results`).
        - [x] Configure the MinIO `results` bucket for public read-only access.
        - [x] Set up an HTTPRoute `minio-results` on the lab's `traefik-gateway` (ns `traefik`) routing `/results/` directly to MinIO `minio:9000` without path rewrite (Same-Origin Routing). Public hostname (`imgproc.sock1000kg.io.vn`) is configured by the user in the Cloudflare dashboard pointing at `http://traefik.traefik.svc.cluster.local:80`.
        - [x] Configure MinIO lifecycle policies (TTL) to automatically delete objects in `uploads` and `results` sau 24 giờ (MVP data deletion).
*   **Verification:**
        - [ ] Verify PostgreSQL connectivity from a temporary client pod.
        - [ ] Upload a test image to the `results` bucket and verify it is publicly accessible via the `/results/...` ingress route.
        - [ ] Verify the TTL policy is applied to the buckets.

## Milestone 3: Engine Worker Deployments & Resource Limits
**Goal:** Deploy engine worker Deployments (`ai-worker`, `image-worker`) to validate the message consumption patterns and enforce the constrained hardware limits (**2C/4T i5-7200U, 12GB RAM, HDD** node, shared with the rest of the lab; platform services app + KEDA steady-state memory limits are capped at ~2.5Gi).
*   **Tasks:**
        - [x] Configure engine worker manifests (`infra/app/engine-workers/`) using the real engine image `socknot1000kg/imgproc-engine:dev`. *(code only, not yet run on the lab)*
        - [x] Deploy an `ai-worker` Deployment consuming from `ai-workers` on `AI_JOBS` (`jobs.ai`). *(code only, not yet run on the lab)*
        - [x] Deploy an `image-worker` Deployment consuming from `image-workers` on `IMAGE_JOBS` (`jobs.image`). *(code only, not yet run on the lab)*
        - [x] Set strict CPU and Memory requests/limits on these deployments (AI: 512Mi/1536Mi; Image: 256Mi/768Mi). *(code only, not yet run on the lab)*
*   **Verification:**
        - [ ] Manually scale both deployments to 1.
        - [ ] Publish messages to both queues and verify independent processing and ACKing in the respective logs.

## Milestone 4: Autoscaler Integration & Independent Scaling
**Goal:** Connect KEDA to NATS JetStream consumer lag to demonstrate that different worker pools can scale independently based on their specific queue depths.
*   **Tasks:**
        - [ ] Install KEDA in the Kubernetes cluster. *(already installed by `infra/deploy.sh cluster` into ns `keda` — this item only becomes `[x]` once it is verified running on the lab)*
        - [x] Create a `ScaledObject` for `ai-worker` targeting the `AI_JOBS` stream and `ai-workers` consumer lag. *(code only, not yet run on the lab)*
        - [x] Create a `ScaledObject` for `image-worker` targeting the `IMAGE_JOBS` stream and `image-workers` consumer lag. *(code only, not yet run on the lab)*
        - [x] Set `minReplicaCount: 0`, and distinct `maxReplicaCount` values and scaling thresholds for each pool based on their simulated resource weight. *(code only, not yet run on the lab)*
*   **Verification:**
        - [ ] Verify that KEDA creates HorizontalPodAutoscalers for both deployments.
        - [ ] Publish a burst of messages *only* to `jobs.ai` and verify only the AI workers scale up.
        - [ ] Publish a burst to `jobs.image` and verify independent scaling of Image workers.
        - [ ] Verify both scale down to 0 after queues are empty.

## Milestone 5: Integration Readiness & Monitoring
**Goal:** Ensure the infrastructure is completely ready to be handed over to the Web and Engine teams.
*   **Tasks:**
        - [x] Document the exact connection strings, internal service DNS names (`nats.<ns>.svc:4222`, `postgresql.<ns>.svc:5432`, `minio.<ns>.svc:9000`), public endpoints and the stream/consumer table in `infra/docs/endpoints.md`.
        - [x] Deploy basic monitoring: `prometheus.io/scrape|port|path` annotations on the NATS exporter sidecar (7777), the MinIO pod (9000, `/minio/v2/metrics/cluster`, `MINIO_PROMETHEUS_AUTH_TYPE=public`) and the `postgresql-metrics` Service (9187) — scraped by the lab's prom-agent.
*   **Verification:**
        - [ ] The Web team can successfully connect to Postgres, MinIO, and NATS.
        - [ ] The Engine team can connect to NATS and MinIO, consume jobs, and publish events.

## Operational notes (Round 1)
* Namespace: `imgproc`; KEDA lives in `keda` and is installed once.
* Every Deployment/StatefulSet/Job is pinned with `nodeSelector: kubernetes.io/hostname: home-server` and has an explicit memory limit. `infra/verify-render.sh` renders `app` and `cluster/keda` overlays and prints both totals: steady-state (setup Jobs excluded — the budget gate, currently **1696Mi**, capped at **2560Mi**) and including the transient setup Jobs (**1888Mi**, informational only). The gate is the steady-state total, which must stay ≤ ~2.5Gi.
* `MINIO_PROMETHEUS_AUTH_TYPE=public` is emitted by the MinIO chart via `metrics.serviceMonitor.public: true` — never add it again under `environment:` in `values.yaml`, a duplicate env key breaks client-side re-apply. `verify-render.sh` fails on duplicate env names.
* The MinIO chart defaults to a **16Gi** memory request — always keep the `resources` override in `infra/app/minio/values.yaml`. Memory limit: **MinIO 512Mi** (set in `infra/app/minio/values.yaml`).
* Bucket setup: anonymous policy is **GetObject only** (no ListBucket) and lifecycle is imported wholesale with `mc ilm import`, so re-running the Job is safe.
* The setup scripts (`infra/app/nats/setup-streams.sh`, `infra/app/minio/setup-buckets.sh`) are shared verbatim with `infra/docker-compose.yaml`.
* `kubectl run ... --command -- /bin/sh -c <script> sh <arg>`: `--command` is a boolean flag and the trailing `sh` becomes `$0`, so the real argument must come after it.
* **MinIO image is ours, not upstream's.** MinIO is archived and its images can't be pulled any more, so `infra/images/minio/Dockerfile` builds the server from the release source and bundles the official sha256-verified `mc` client. Everything uses `socknot1000kg/minio:RELEASE.2025-10-15T17-29-55Z`. Rebuild with `infra/images/build-push.sh`; never re-pin to a MinIO registry. `verify-render.sh` fails if any rendered image points at `quay.io/minio`, `minio/mc` or `docker.io/minio/`.
* The public `/results/` HTTPRoute matches **GET and HEAD only**; `verify-render.sh` asserts it.

## Operational notes (Round 1.2 — KEDA namespace fix)
* **Never put `namespace:` at the top level of a kustomization that uses `helmCharts`.** The namespace transformer rewrites *every* namespaced resource, including the ones the chart deliberately creates in `kube-system`. KEDA's `RoleBinding/keda-operator-auth-reader` (Role `extension-apiserver-authentication-reader` → SA `keda/keda-metrics-server`) was dragged into `keda`, granted nothing, and crash-looped the metrics apiserver with `unable to load configmap based request-header` for `configmap/extension-apiserver-authentication` in `kube-system`.
* Correct shape: no top-level `namespace`, `namespace: keda` **inside the `helmCharts` entry**. `namespace.yaml` stays in `resources`. Same pitfall applies to any future chart with cross-namespace RBAC.
* `verify-render.sh` asserts `RoleBinding/keda-operator-auth-reader` stays in `kube-system` and fails on anything rendering into `default` (or without namespace).
* `infra/deploy.sh cluster` deletes the stray `keda/keda-operator-auth-reader` (`--ignore-not-found -o name`) before applying, then — **before** any `rollout status` — restarts `deploy/keda-operator-metrics-apiserver` if that stray RoleBinding was actually deleted or if a pod is in `CrashLoopBackOff`. The restart must precede the waits: `rollout status` blocks until `ROLLOUT_TIMEOUT` on a crash-looping pod, so waiting first would never reach the restart. It then waits for all three KEDA deployments and finally for (default 180s, `APISERVICE_TIMEOUT`) `apiservice/v1beta1.external.metrics.k8s.io` to be `Available`, dumping the metrics apiserver logs if it isn't. Idempotent: on a clean run with nothing stray, no restart is issued.

## Operational notes (Round 1.3 — volume ownership on ACL'd local-path)
* **The lab's storage directory has inherited POSIX ACLs.** `/var/lib/rancher/k3s/storage/` shows `drwxrwsrwx+ root <fsGroup>`: the `+` means an ACL inherited from a default ACL on the storage dir, whose **mask caps the group class**. A non-root uid that reaches the directory through the group/ACL entries therefore cannot write, even though the mode bits say `rwx`. That is why MinIO died with `unable to create (/export/.minio.sys/tmp) file access denied` and Postgres with `mkdir: cannot create directory '/bitnami/postgresql'`.
* **The lab ACL is left untouched on purpose** — the user says it may be a dependency of another app (an existing `media-dev` Postgres works because its data dir is *owned* by its uid; the owner class is not capped by the mask). Never run `setfacl -k` lab-wide. The fix lives in our manifests only.
* **Fix = ownership, not permission.** Every Deployment/StatefulSet that mounts a PVC and runs its main container as non-root gets an init container that runs as uid 0 with `drop: ALL` + `CHOWN` + `FOWNER` and chowns the data volume to the writing uid:
  * MinIO: `infra/app/minio/patch-volume-permissions.yaml` (chart 5.4.0 cannot render an init container, hence a kustomize patch). It uses **our** `socknot1000kg/minio:RELEASE.2025-10-15T17-29-55Z` image (Alpine, has `sh`/`chown`/`stat`) and chowns to `1000:1000` (the chart's `securityContext.runAsUser/runAsGroup`). It only chowns **recursively** when the top-level owner is wrong, so a big bucket directory is not walked on every restart, and it prints what it did.
  * Postgres: the chart's own `volumePermissions.enabled: true` (`bitnamilegacy/os-shell:12-debian-12-r51`, pinned by digest — `bitnami/os-shell` only has a rolling `latest`), plus `infra/app/postgresql/patch-volume-permissions.yaml` to add `drop: ALL` + `CHOWN`/`FOWNER`, since the chart would otherwise give the init container the full default capability set (including `DAC_OVERRIDE`). `FOWNER` is needed because the chart's `chmod 700 .../data` runs *after* the chown.
  * NATS runs as root, which bypasses ACLs, so it needs no init container.
* `verify-render.sh` enforces this: any PVC-mounted workload whose main container is non-root must have an init container that mounts the same volume, runs as uid 0 and has `CHOWN`. Init containers also need memory limits, and are excluded from the steady-state budget like setup Jobs.
* If Postgres still fails after this change, the earlier crash likely left a half-initialised data dir: delete PVC `data-postgresql-0` **in `imgproc`** (holds no persistent data yet) and redeploy.

## Operational notes (Task 2, engine workers)
* **Worker workloads:** Engine worker Deployments (`ai-worker`, `image-worker`) are included in `infra/app` via `infra/app/kustomization.yaml` (`engine-workers`).
* **Temporary `:dev` tag:** Deployments use `socknot1000kg/imgproc-engine:dev` with `imagePullPolicy: Always` as a temporary measure until CI publishes immutable digest/SHA tags.
* **Worker label and steady-state budget:** Worker Deployments carry label `app.kubernetes.io/component: worker` and are excluded from the platform steady-state budget (which remains at **2560Mi**). Their sizing (AI: 1536Mi limit; Image: 768Mi limit) is reported informationally by `verify-render.sh`.
* **MinIO credentials:** Workers mount MinIO credentials from the existing `imgproc-minio` Secret (`rootUser`/`rootPassword`). Root credentials are used temporarily for dev; a scoped MinIO service account user is a future improvement.
* **Smoke test interaction:** When worker Deployments have ready replicas, `smoke-test.sh` skips the pool queue drain (`SKIP (workers running)`) to prevent racing with active engine workers, and asserts stream and consumer presence.

## Operational notes (Task 3, KEDA ScaledObjects)
* **Replicas owned by KEDA:** `ai-worker` and `image-worker` Deployments omit `replicas` so `kubectl apply` does not fight the KEDA HPA.
* **Pool thresholds and peak RAM:** `ai-worker` scales with `lagThreshold: "1"` (1 heavy inference job per pod) up to 2 replicas (peak 3072Mi limit); `image-worker` scales with `lagThreshold: "5"` up to 3 replicas (peak 2304Mi limit). Total peak worker memory is **5376Mi**.
* **Monitoring endpoint:** Trigger `natsServerMonitoringEndpoint: nats.imgproc.svc.cluster.local:8222` targets the `imgproc` namespace.


