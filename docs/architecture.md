# Cloud-Native Elastic AI Processing Platform

## 1. Architecture Overview

**Objective:** Build a scalable, event-driven image-processing platform demonstrating dynamic worker scaling via KEDA and NATS JetStream, optimized for a constrained 4-core / 12GB RAM Kubernetes node.

The architecture deliberately avoids a custom Kubernetes Operator/CRD. Kubernetes-native resources, KEDA, PostgreSQL, MinIO, and NATS JetStream are sufficient for the project's scaling and integration requirements.

### Core Components

* **Web API / Backend**

  * Accepts uploads and job requests.
  * Coordinates job creation, messaging, and application state.
  * Exposes REST endpoints for the frontend.

* **PostgreSQL**

  * Authoritative source of truth for job state, progress, metadata, and result summaries.

* **MinIO**

  * S3-compatible object storage for uploaded media and generated artifacts.
  * Large binaries never pass through PostgreSQL or NATS.

* **NATS + JetStream**

  * Durable messaging infrastructure for processing commands and worker events.
  * Provides persistence, acknowledgements, consumer state, and replay/redelivery.

* **KEDA**

  * Scales worker Deployments according to JetStream consumer lag.
  * Supports scale-to-zero and configurable replica limits.

* **Worker Deployments**

  * Purpose-built pools such as AI and FFmpeg/video workers.
  * Long-running processes consume multiple jobs.
  * AI workers load model weights once at startup.

See `integration-contracts.md` for message formats, subjects, ownership rules, and component interfaces.

---

## 2. System Design Principles

The architecture separates responsibilities:

| Component      | Responsibility                      |
| -------------- | ----------------------------------- |
| Frontend       | User interaction and presentation   |
| Backend        | Application logic and job lifecycle |
| PostgreSQL     | Authoritative application state     |
| NATS JetStream | Work and event delivery             |
| MinIO          | Media and artifact storage          |
| KEDA           | Event-driven worker autoscaling     |
| Workers        | Media processing and inference      |

**Key principle:** NATS transports work and events; PostgreSQL stores the current application state.

Workers do not need direct PostgreSQL access. The frontend communicates with the backend rather than accessing NATS directly.

---

## 3. Infrastructure and Scaling

### Kubernetes and KEDA

KEDA uses the NATS JetStream scaler to monitor consumer lag and adjust worker replica counts.

* Separate worker pools can scale independently.
* `minReplicaCount` can be `0`.
* `maxReplicaCount` is constrained by available hardware.
* Replica counts and scaling thresholds must be benchmarked on the actual node.

Infrastructure owns the Kubernetes resources, KEDA configuration, and scaling tests.

### Long-Running Workers

Long-running worker Deployments avoid repeatedly starting a process and loading AI model weights for every individual job.

```text
Worker Pod
  |
  +--> Load model once
  |
  +--> Consume job
  +--> Process job
  +--> Consume next job
  +--> ...
```

This reduces repeated initialization overhead, particularly on the project's resource-constrained hardware.

---

## 4. Technology Rationale

| Component      | Responsibility           | Rationale                                         |
| -------------- | ------------------------ | ------------------------------------------------- |
| Kubernetes     | Runtime orchestration    | Runs backend and worker workloads                 |
| KEDA           | Event-driven autoscaling | Scales workers from messaging demand              |
| NATS JetStream | Durable messaging        | Lightweight, persistent messaging and streaming   |
| PostgreSQL     | Application state        | Durable, queryable job history and state          |
| MinIO          | Object storage           | Keeps large media outside the database and broker |
| Python         | Processing engine        | AI and media-processing ecosystem                 |

NATS JetStream and KEDA provide durable asynchronous messaging and event-driven scaling without requiring a custom scaler or Kubernetes Operator.

---

## 5. Team Responsibilities

```text
project-root/
├── web/
│   ├── frontend/
│   └── backend/
├── engine/
│   ├── ai-worker/
│   └── video-worker/
├── infra/
│   ├── k8s/
│   ├── keda/
│   ├── nats/
│   ├── minio/
│   └── postgres/
└── README.md
```

### Person 1 — Web / Backend

* Frontend UI and REST API.
* PostgreSQL schema and migrations.
* MinIO integration.
* Job creation and messaging integration.
* Job state and progress API.

### Person 2 — Engine

* Python processing engine.
* AI model loading and inference.
* Image/video processing.
* NATS and MinIO integration.
* Progress reporting, retries, and idempotency.

### Person 3 — Infrastructure

* Kubernetes cluster and deployment resources.
* NATS, MinIO, and PostgreSQL deployment.
* KEDA installation and `ScaledObject` configuration.
* Worker resource limits and scaling tests.
* Monitoring, observability, and Helm/Kustomize manifests.

Each component can be developed and tested independently using mock events, test jobs, and dummy workers. See `integration-contracts.md` for the development integration procedures.

---

## 6. Final Architecture Decision

The project uses:

```text
Kubernetes
  +
KEDA
  +
NATS JetStream
  +
PostgreSQL
  +
MinIO
  +
Long-running worker Deployments
```

It explicitly does not use:

* Redis
* Custom Kubernetes Operator
* Custom CRD
* Pod-per-image Kubernetes Jobs
* Direct worker-to-PostgreSQL state writes

The architecture is designed to demonstrate:

* Event-driven architecture and durable asynchronous messaging.
* Kubernetes workload orchestration and event-driven autoscaling.
* Independent worker pools.
* Persistent job state and object storage.
* AI/media processing.
* Resource-aware scaling on constrained hardware.

The implementation is scoped for a six-week student project while retaining clear separation between application logic, processing workloads, and infrastructure.

The resulting architecture has four distinct responsibilities:

```text
                 ┌─────────────────┐
                 │    Frontend     │
                 └────────┬────────┘
                          │ REST
                          v
                 ┌────────────────────┐
                 │       Backend      │
                 │    State authority │
                 └────┬──────────┬────┘
                      │          │
                state │          │ commands
                      v          v
                ┌─────────┐  ┌──────────────┐
                │ Postgres│  │ NATS         │
                │ state   │  │ JetStream    │
                └─────────┘  └──────┬───────┘
                                   │
                              consumer lag
                                   │
                                   v
                                 KEDA
                                   │
                                   v
                          ┌─────────────────┐
                          │ Worker Pool     │
                          │ AI / FFmpeg     │
                          └───────┬─────────┘
                                  │
                              object I/O
                                  │
                                  v
                              ┌───────┐
                              │ MinIO │
                              └───────┘
```

The key design rule is:

> **NATS transports work and events; PostgreSQL stores the current application state.**

This is preferable to treating the queue itself as the job database.