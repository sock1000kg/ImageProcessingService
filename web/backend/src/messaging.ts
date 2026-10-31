/**
 * NATS JetStream messaging client managing job publishing and worker event consumption.
 */
import { connect, JetStreamClient, JetStreamManager, JsMsg, NatsConnection, StringCodec } from "nats";
import { z } from "zod";

import { config } from "./config";
import { getJob } from "./db";
import { applyJobEvent, checkAndCleanBatchWhitelist } from "./services/batch.service";
import { jobEventSchema } from "./dto";
import { ImageRedactCommand } from "./domain";

const codec = StringCodec();
let connection: NatsConnection | null = null;
let jetStream: JetStreamClient | null = null;
let activeMessages: { close: () => Promise<void | Error> } | null = null;
let consuming = false;

/**
 * Checks whether active NATS JetStream connection is healthy and initialized.
 */
export function isMessagingReady(): boolean {
  return connection !== null && jetStream !== null;
}

async function verifyProvisionedResources(manager: JetStreamManager): Promise<void> {
  for (const stream of ["IMAGE_JOBS", "JOB_EVENTS"]) {
    await manager.streams.info(stream);
  }
  await manager.consumers.info("JOB_EVENTS", "backend-job-events");
}

/**
 * Establishes NATS JetStream connection, verifies streams/consumers, and starts event consumer loop.
 */
export async function connectMessaging(): Promise<void> {
  connection = await connect({ servers: config.NATS_URL });
  jetStream = connection.jetstream();
  const manager = await connection.jetstreamManager();
  try {
    await verifyProvisionedResources(manager);
  } catch (error) {
    await connection.close();
    connection = null;
    jetStream = null;
    throw new Error(
      `NATS provisioned resource check failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const consumer = await jetStream.consumers.get("JOB_EVENTS", "backend-job-events");
  const messages = await consumer.consume();
  activeMessages = messages;
  consuming = true;
  void consumeEvents(messages);
}

async function consumeEvents(messages: AsyncIterable<JsMsg>): Promise<void> {
  try {
    for await (const message of messages) {
      if (!consuming) break;
      await handleEventMessage(message);
    }
  } catch (error) {
    if (consuming) {
      console.error("Error in event consumption loop", error);
    }
  }
}

async function handleEventMessage(message: JsMsg): Promise<void> {
  // Why NATS term policy: If a message is malformed JSON, fails Zod validation, or references an unknown job ID,
  // it is a deterministic poison-pill. Redelivery will never succeed. Calling message.term() permanently
  // discards the invalid message without causing poison loops or exhaustively consuming consumer max_deliveries.
  let parsed: unknown;
  try {
    parsed = JSON.parse(codec.decode(message.data));
  } catch (error) {
    console.error("Invalid worker event JSON; terminating message", error);
    message.term();
    return;
  }

  const validation = jobEventSchema.safeParse(parsed);
  if (!validation.success) {
    const rawJobId =
      typeof parsed === "object" && parsed !== null && "jobId" in parsed
        ? (parsed as { jobId?: unknown }).jobId
        : undefined;
    console.error("Invalid worker event schema; terminating message", {
      jobId: typeof rawJobId === "string" ? rawJobId : undefined,
      issues: validation.error.issues,
    });
    message.term();
    return;
  }

  const job = await getJob(validation.data.jobId);
  if (!job) {
    console.error(`Worker event references unknown job ${validation.data.jobId}; terminating message`);
    message.term();
    return;
  }

  try {
    await applyJobEvent(validation.data);
    // Positively acknowledge message once the event state update is committed to Postgres
    message.ack();
  } catch (error) {
    // Why NATS nak policy: Database connection or persistence errors are transient. Negatively acknowledging
    // with a 5000ms delay instructs NATS JetStream to back off and redeliver after the transient condition clears.
    console.error("Failed to apply worker event; negatively acknowledging message", error);
    message.nak(5000);
    return;
  }

  if (validation.data.status === "COMPLETED" || validation.data.status === "FAILED") {
    try {
      await checkAndCleanBatchWhitelist(job.batchId);
    } catch (error) {
      console.error(`Failed to clean batch whitelist for ${job.batchId}`, error);
    }
  }
}

/**
 * Publishes a redaction command payload to the specified NATS subject.
 */
export async function publishJob(
  subject: string,
  payload: ImageRedactCommand | Record<string, unknown>,
): Promise<void> {
  if (!jetStream) throw new Error("NATS connection is not ready");
  await jetStream.publish(subject, codec.encode(JSON.stringify(payload)));
}

/**
 * Gracefully shuts down active consumer loops and drains the NATS connection.
 */
export async function closeMessaging(): Promise<void> {
  consuming = false;
  if (activeMessages) {
    try {
      await activeMessages.close();
    } catch {
      // Ignore errors on close
    }
    activeMessages = null;
  }
  if (connection) {
    await connection.drain();
    connection = null;
    jetStream = null;
  }
}
