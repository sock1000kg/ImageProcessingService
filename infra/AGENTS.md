# Complete Infrastructure Delivery Plan

This document outlines the complete plan to deploy the foundational infrastructure for the Cloud-Native Elastic AI Processing Platform. By following these milestones, the infrastructure team will deliver a production-ready environment that can be developed and tested in isolation, and is fully ready for integration with the Web and Engine teams.

## Milestone 1: Messaging and Event Bus Foundation
**Goal:** Deploy NATS JetStream and configure the complete streaming topology exactly as defined in the integration contracts.
*   **Tasks:**
    *   Deploy NATS to the Kubernetes cluster with JetStream enabled via Helm/Kustomize.
    *   Create the `AI_JOBS` stream with subject `jobs.ai` and the `ai-workers` durable consumer.
    *   Create the `IMAGE_JOBS` stream with subject `jobs.image` and the `image-workers` durable consumer.
    *   Create the `JOB_EVENTS` stream with subject `jobs.events` and the `backend-job-events` durable consumer.
*   **Verification:**
    *   Use the NATS CLI within a `nats-box` pod to verify all streams and consumers exist.
    *   Manually publish test messages to `jobs.ai`, `jobs.image`, and `jobs.events` and verify they can be fetched by their respective consumers.

## Milestone 2: Persistent Storage and State Authority
**Goal:** Deploy PostgreSQL for authoritative job state and MinIO for large binary object storage, complete with networking and data lifecycle policies.
*   **Tasks:**
    *   Deploy PostgreSQL via Helm/Kustomize to serve as the application state backend.
    *   Deploy MinIO for object storage (buckets: `uploads` and `results`).
    *   Configure the MinIO `results` bucket for public read-only access.
    *   Set up a Kubernetes Gateway API (HTTPRoute) or Ingress to route `/results/` directly to MinIO (Same-Origin Routing), bypassing the backend for serving large files.
    *   Configure MinIO lifecycle policies (TTL) to automatically delete objects in `uploads` and `results` sau 24 giờ (MVP data deletion).
*   **Verification:**
    *   Verify PostgreSQL connectivity from a temporary client pod.
    *   Upload a test image to the `results` bucket and verify it is publicly accessible via the `/results/...` ingress route.
    *   Verify the TTL policy is applied to the buckets.

## Milestone 3: Dummy Worker Deployment & Resource Limits
**Goal:** Deploy simulated worker pools to validate the message consumption patterns and enforce the constrained hardware limits (4-core / 12GB RAM node).
*   **Tasks:**
    *   Create a minimal script (e.g., Python/Go) that acts as a dummy worker. It should subscribe to a specified consumer, simulate processing (sleep), and ACK the message.
    *   Deploy an `ai-worker-dummy` Deployment consuming from `ai-workers` (simulating heavy AI tasks).
    *   Deploy an `image-worker-dummy` Deployment consuming from `image-workers` (simulating fast image tasks).
    *   Set strict CPU and Memory requests/limits on these deployments to represent the actual hardware constraints.
*   **Verification:**
    *   Manually scale both deployments to 1.
    *   Publish messages to both queues and verify independent processing and ACKing in the respective logs.

## Milestone 4: Autoscaler Integration & Independent Scaling
**Goal:** Connect KEDA to NATS JetStream consumer lag to demonstrate that different worker pools can scale independently based on their specific queue depths.
*   **Tasks:**
    *   Install KEDA in the Kubernetes cluster.
    *   Create a `ScaledObject` for `ai-worker-dummy` targeting the `AI_JOBS` stream and `ai-workers` consumer lag.
    *   Create a `ScaledObject` for `image-worker-dummy` targeting the `IMAGE_JOBS` stream and `image-workers` consumer lag.
    *   Set `minReplicaCount: 0`, and distinct `maxReplicaCount` values and scaling thresholds for each pool based on their simulated resource weight.
*   **Verification:**
    *   Verify that KEDA creates HorizontalPodAutoscalers for both deployments.
    *   Publish a burst of messages *only* to `jobs.ai` and verify only the AI workers scale up.
    *   Publish a burst to `jobs.image` and verify independent scaling of Image workers.
    *   Verify both scale down to 0 after queues are empty.

## Milestone 5: Integration Readiness & Monitoring
**Goal:** Ensure the infrastructure is completely ready to be handed over to the Web and Engine teams.
*   **Tasks:**
    *   Document the exact connection strings, internal service DNS names (e.g., `nats:4222`, `postgres:5432`, `minio:9000`), and public endpoints in a shared config map or document.
    *   Deploy basic monitoring (e.g., Prometheus/Grafana or KEDA metrics) to visualize queue depth, scaling events, and node resource utilization during testing.
*   **Verification:**
    *   The Web team can successfully connect to Postgres, MinIO, and NATS.
    *   The Engine team can connect to NATS and MinIO, consume jobs, and publish events.
