# Integration Contracts

This document defines the interfaces between the Web, Engine, and Infrastructure components.

NATS subjects are used instead of Redis lists for the queue.

A simple design is:

```text
NATS JetStream
│
├── Stream: AI_JOBS
│   └── Subject: jobs.ai
│       └── Durable Consumer: ai-workers
│
├── Stream: IMAGE_JOBS
│   └── Subject: jobs.image
│       └── Durable Consumer: image-workers
│
└── Stream: JOB_EVENTS
    ├── Subject: jobs.progress
    └── Subject: jobs.completed / jobs.failed
        └── Durable Consumer: backend-job-events
```


## 1. Message Subjects

### Job commands (Backend produces, Workers subcribe)

```text
jobs.ai
jobs.image
```

### Worker events (Workers produce, Backend subcribes)

```text
jobs.events
```

The exact subject hierarchy can be expanded later, for example:

```text
jobs.ai.object-detection
jobs.image.transcode
jobs.events.progress
jobs.events.completed
jobs.events.failed
```

For the initial implementation, keep the number of subjects small.

---

## 2. Job Command Contract

Published by the Backend.

```json
{
  "jobId": "uuid-1234-5678",
  "type": "object-detection",
  "input": {
    "bucket": "uploads",
    "key": "jobs-1234-5678/input.jpg"
  },
  "output": {
    "bucket": "results",
    "key": "jobs-1234-5678/result.json"
  },
  "params": {
    "confidenceThreshold": 0.45
  }
}
```

### Required fields

- `jobId`
- `type`
- `input.bucket`
- `input.key`
- `output.bucket`
- `output.key`

### Optional fields

- `params`

The worker must treat the object references as authoritative locations for the job's input/output artifacts.

---

## 3. Progress Event Contract

Published by Workers and consumed by the Backend.

```json
{
  "jobId": "uuid-1234-5678",
  "status": "PROCESSING",
  "progress": 30,
  "stage": "DOWNLOADING_INPUT",
  "timestamp": "2026-09-15T06:00:00Z"
}
```

### Allowed statuses
Workers have a set of statuses

```text
PROCESSING
COMPLETED
FAILED
```

The backend may also maintain internal states such as:

```text
PENDING
QUEUED
DELETED (This helps check for deletes mid-job and job cleanups)
```

These states do not need to and shouldn't be emitted by the worker.

---

## 4. Completion Event

```json
{
  "jobId": "uuid-1234-5678",
  "status": "COMPLETED",
  "progress": 100,
  "stage": "DONE",
  "result": {
    "bucket": "results",
    "key": "uuid-1234-5678/job-id/result.json"
  },
  "resultSummary": {
    "objectsDetected": 4,
    "processingTimeMs": 1830
  },
  "timestamp": "2026-09-15T06:01:42Z"
}
```

---

## 5. Failure Event

```json
{
  "jobId": "uuid-1234-5678",
  "status": "FAILED",
  "progress": 0,
  "stage": "INFERENCE",
  "error": {
    "code": "MODEL_INFERENCE_ERROR",
    "message": "Inference failed"
  },
  "timestamp": "2026-09-15T06:02:10Z"
}
```

Avoid putting large stack traces into normal user-facing job state. Detailed logs belong in the worker logs/observability system.

---

## 6. Ownership Rules

### Backend owns

- Job creation
- Job lifecycle state
- PostgreSQL schema
- API response format
- Validation of worker events

### Worker owns

- Actual processing
- Model loading
- MinIO input/output
- Progress reporting
- Processing errors

### NATS owns

- Delivery of commands/events
- Durable message storage according to JetStream retention
- Consumer state
- Acknowledgement/redelivery

### PostgreSQL owns

- Current authoritative job state
- Job history/metadata required by the application

### MinIO owns

- Large binary objects

---

## 7. Database State Updates

The Backend consumes worker events:

```text
NATS event
    |
    v
Backend event consumer
    |
    v
Validate event
    |
    v
Update jobs row
    |
    v
PostgreSQL
```

The worker does **not** need a PostgreSQL connection.

This keeps the Engine independent from the Web application's persistence implementation.

---

## 8. Idempotency

Every event contains `jobId`.

The backend should safely handle duplicate events.

For example:

```text
COMPLETED(job-123)
COMPLETED(job-123)
```

must not corrupt the database.

A simple first implementation can use:

- `jobId` as the primary identifier
- monotonically increasing progress
- terminal-state protection

Example:

```text
PROCESSING 80%
     |
     v
COMPLETED 100%
     |
     X
PROCESSING 90%   <- ignore/reject stale event
```

For a more rigorous implementation, add an event sequence number:

```json
{
  "jobId": "uuid-1234",
  "sequence": 4,
  "status": "PROCESSING",
  "progress": 80
}
```

---

## 9. Frontend Contract

The frontend does not communicate with NATS.

It uses the Backend REST API:

```text
Frontend
   |
   +--> POST /api/jobs
   |
   +--> GET /api/jobs/:id
   |
   +--> GET /api/system/stats
```

The backend reads PostgreSQL and returns application state.

This means a browser refresh does not lose job progress.

---

## 10. Queue vs. Database Semantics

### NATS JetStream

Represents work/events that are being transported:

```text
"Here is a job to process."
"Job 123 is now 50% complete."
"Job 123 completed."
```

### PostgreSQL

Represents persistent application state:

```text
"Job 123 currently has status COMPLETED and progress 100."
```

Neither should replace the other.

---

## 11. KEDA Contract

Infrastructure creates the KEDA `ScaledObject`.

Example:

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: ai-worker
spec:
  scaleTargetRef:
    name: ai-worker
  minReplicaCount: 0
  maxReplicaCount: 3
  triggers:
    - type: nats-jetstream
      metadata:
        natsServerMonitoringEndpoint: "nats:8222"
        account: "$G"
        stream: "JOBS"
        consumer: "ai-workers"
        lagThreshold: "3"
        activationLagThreshold: "1"
        useHttps: "false"
```

The exact target and replica values must be tuned through testing on the project's hardware.

---

## 12. Development Independence

### Web can test without the real Engine

Use a mock event publisher:

```text
Backend
   |
   v
NATS
   ^
   |
Mock worker/event publisher
```

### Engine can test without the Web UI

Publish a test job directly:

```text
NATS -> Python Worker -> MinIO
```

The worker publishes progress events back to NATS.

### Infra can test without AI

Inject dummy jobs into JetStream:

```text
test message
    |
    v
NATS JetStream
    |
    v
KEDA
    |
    v
dummy worker Deployment
```

This isolates the autoscaling demonstration from AI inference time.

