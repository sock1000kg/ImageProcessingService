import {
  connect,
  consumerOpts,
  JetStreamClient,
  JetStreamManager,
  JsMsg,
  NatsConnection,
  StringCodec,
} from "nats";

import { config } from "./config";
import { applyJobEvent, getJob } from "./db";
import { jobEventSchema } from "./schemas/job-event.schema";

const codec = StringCodec();
let connection: NatsConnection | null = null;
let jetStream: JetStreamClient | null = null;
let eventSubscription: (AsyncIterable<JsMsg> & { pull: (options: { batch: number; expires: number }) => void }) | null = null;
let consuming = false;

export function isMessagingReady(): boolean {
  return connection !== null && jetStream !== null;
}

async function verifyProvisionedResources(manager: JetStreamManager): Promise<void> {
  for (const stream of ["AI_JOBS", "IMAGE_JOBS", "JOB_EVENTS"]) {
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

  const options = consumerOpts();
  options.durable("backend-job-events").ackExplicit().deliverAll();
  eventSubscription = await jetStream.pullSubscribe("jobs.events", options);
  consuming = true;
  void consumeEvents(eventSubscription);
}

async function consumeEvents(subscription: AsyncIterable<JsMsg> & { pull: (options: { batch: number; expires: number }) => void }): Promise<void> {
  while (consuming) {
    subscription.pull({ batch: 10, expires: 30_000 });
    for await (const message of subscription) {
      if (!consuming) break;
      await handleEventMessage(message);
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
    console.error("Invalid worker event schema; terminating message", validation.error.flatten());
    message.term();
    return;
  }

  try {
    const job = await getJob(validation.data.jobId);
    if (!job) {
      console.error(`Worker event references unknown job ${validation.data.jobId}; terminating message`);
      message.term();
      return;
    }
    await applyJobEvent(validation.data);
    message.ack();
  } catch (error) {
    console.error("Failed to apply worker event; negatively acknowledging message", error);
    message.nak(5000);
  }
}

export async function publishJob(subject: string, payload: Record<string, unknown>): Promise<void> {
  if (!jetStream) throw new Error("NATS connection is not ready");
  await jetStream.publish(subject, codec.encode(JSON.stringify(payload)));
}

export async function closeMessaging(): Promise<void> {
  consuming = false;
  eventSubscription = null;
  if (connection) {
    await connection.drain();
    connection = null;
    jetStream = null;
  }
}
