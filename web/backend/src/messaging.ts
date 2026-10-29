import {
  connect,
  JetStreamClient,
  JetStreamManager,
  JsMsg,
  NatsConnection,
  StringCodec,
} from "nats";
import { z } from "zod";

import { config } from "./config";
import { getJob } from "./db";
import { applyJobEvent, checkAndCleanBatchWhitelist } from "./services/batch.service";
import { jobEventSchema } from "./dto";

const codec = StringCodec();
let connection: NatsConnection | null = null;
let jetStream: JetStreamClient | null = null;
let activeMessages: { close: () => Promise<void | Error> } | null = null;
let consuming = false;

export function isMessagingReady(): boolean {
  return connection !== null && jetStream !== null;
}

async function verifyProvisionedResources(manager: JetStreamManager): Promise<void> {
  for (const stream of ["IMAGE_JOBS", "JOB_EVENTS"]) {
    await manager.streams.info(stream);
  }
  await manager.consumers.info("JOB_EVENTS", "backend-job-events");
}

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
    throw new Error(`NATS provisioned resource check failed: ${error instanceof Error ? error.message : String(error)}`);
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
    console.error("Invalid worker event schema; terminating message", z.flattenError(validation.error));
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
    message.ack();
  } catch (error) {
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

export async function publishJob(subject: string, payload: Record<string, unknown>): Promise<void> {
  if (!jetStream) throw new Error("NATS connection is not ready");
  await jetStream.publish(subject, codec.encode(JSON.stringify(payload)));
}

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
