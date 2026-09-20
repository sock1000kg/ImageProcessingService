# Infrastructure KEDA Scaling Isolation Test Plan

This document outlines the plan to independently test the KEDA autoscaling mechanism with NATS JetStream, without depending on the Web Backend or AI Engine teams. The plan is divided into vertically sliced, independently testable milestones.

## Milestone 1: Message Broker Foundation
**Goal:** Deploy NATS JetStream and configure the required streams and consumers.
*   **Tasks:**
    *   Deploy NATS to the Kubernetes cluster with JetStream enabled.
    *   Create the `JOBS` stream.
    *   Create the `jobs.ai` subject and the `ai-workers` durable consumer.
*   **Verification:**
    *   Port-forward the NATS port.
    *   Use the NATS CLI to manually publish a message to `jobs.ai` and fetch it from the `ai-workers` consumer.

## Milestone 2: Dummy Worker Deployment
**Goal:** Deploy a simulated worker that consumes messages and acknowledges them without executing actual AI models.
*   **Tasks:**
    *   Write a minimal script (e.g., Python or Go) that connects to NATS JetStream.
    *   The script should subscribe to the `ai-workers` consumer, sleep for a few seconds to simulate processing time, and then acknowledge (ACK) the message.
    *   Build a lightweight Docker image for this dummy worker.
    *   Create a Kubernetes `Deployment` for the dummy worker with `replicas: 0`.
*   **Verification:**
    *   Manually scale the dummy worker deployment to 1 (`kubectl scale`).
    *   Publish a test message to NATS.
    *   Check the dummy worker pod logs to ensure the message was received, processed (slept), and ACKed.
    *   Scale the deployment back to 0.

## Milestone 3: KEDA Autoscaler Integration
**Goal:** Connect KEDA to the NATS JetStream consumer lag and target the dummy worker deployment.
*   **Tasks:**
    *   Install KEDA in the Kubernetes cluster.
    *   Create a `ScaledObject` resource targeting the dummy worker `Deployment`.
    *   Configure the trigger to use `nats-jetstream`, pointing to the `JOBS` stream and `ai-workers` consumer.
    *   Set `minReplicaCount: 0`, a safe `maxReplicaCount` (e.g., 3), and appropriate lag thresholds (e.g., `lagThreshold: "3"`, `activationLagThreshold: "1"`).
*   **Verification:**
    *   Apply the `ScaledObject`.
    *   Verify that KEDA successfully creates the underlying HorizontalPodAutoscaler (HPA).
    *   Check KEDA operator logs for any connection or configuration errors with the NATS monitoring endpoint.

## Milestone 4: End-to-End Scaling Verification
**Goal:** Prove that the worker scales up automatically under load and scales down to zero when idle.
*   **Tasks:**
    *   Create a simple load generator script to quickly publish a burst of messages (e.g., 20 messages) to the `jobs.ai` subject.
*   **Verification:**
    *   Run the load generator.
    *   Watch the pod count (`kubectl get pods -w`): observe KEDA scaling the dummy worker pods from 0 up to `maxReplicaCount`.
    *   Verify via dummy worker logs that all messages are processed.
    *   Wait for the queue to empty and observe KEDA scaling the pods back down to 0 after the cooldown period.

