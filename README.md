# Cloud-Native Privacy Service

An open-source cloud service that automatically detects and redacts **faces** and **license plates** in images and short videos (blur, pixelate or blackout), with a face whitelist to keep the people you choose. It's built cloud-native and event-driven, and scales its workers with demand on a small, CPU-only Kubernetes node (2C/4T, 12GB RAM).

## Core technologies
- **Kubernetes & KEDA:** worker pools scale from 0 based on queue lag. Image and video pools scale independently.
- **NATS JetStream:** durable, lightweight job and event transport.
- **PostgreSQL:** source of truth for batches, jobs, states and result summaries.
- **MinIO:** S3-compatible storage for originals, whitelist photos and redacted results (auto-deleted after 24h).
- **Python engine:** YOLOv8n detection, face embeddings for the whitelist, ByteTrack and FFmpeg for video.

## How it works
1. **Upload:** the user uploads a batch of images (plus optional whitelist selfies) and picks a redaction style. The backend stores the files in MinIO and creates one job per image in PostgreSQL.
2. **Queue:** the backend publishes one command per image to NATS (`jobs.image`, or `jobs.video` for videos).
3. **Scale:** KEDA watches the consumer lag and scales the worker pool up, then back to 0.
4. **Process:** workers detect faces and plates, skip whitelisted faces, redact, and upload the result and detections.
5. **Report:** workers publish events back to NATS. The backend updates PostgreSQL, and the UI shows before/after, lets the user re-tune the redaction, and exports a JSON report.

## Documentation
- [`docs/integration-contracts.md`](docs/integration-contracts.md): message formats, streams, object paths, ownership
- [`docs/milestones.md`](docs/milestones.md): Phase 1 and 2 milestones per team
- [`docs/architecture.md`](docs/architecture.md): system design
- [`docs/phân-công-và-guideline.md`](docs/phân-công-và-guideline.md): team roles and dev workflow

## Repository structure
- `/web`: frontend UI and REST API backend
- `/engine`: Python redaction workers
- `/infra`: Kubernetes manifests, KEDA, deployment scripts (see `infra/AGENTS.md`)
