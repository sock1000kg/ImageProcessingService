import { connect, JetStreamClient, JetStreamManager, NatsConnection, StringCodec } from "nats";
import { consumerOpts } from "nats";
import { RetentionPolicy } from "nats/lib/jetstream/jsapi_types";
import { JsMsg } from "nats/lib/jetstream/jsmsg";

import { config } from "./config";
import { applyJobEvent } from "./db";

const codec = StringCodec();
let connection: NatsConnection | null = null;
let jetStream: JetStreamClient | null = null;

async function ensureStream(manager: JetStreamManager, name: string, subjects: string[]): Promise<void> {
  try {
    await manager.streams.info(name);
  } catch {
    await manager.streams.add({ name, subjects, retention: RetentionPolicy.Workqueue });
  }
}

export async function connectMessaging(): Promise<void> {
  connection = await connect({ servers: config.NATS_URL });
  jetStream = connection.jetstream();
  const manager = await connection.jetstreamManager();

  await ensureStream(manager, "AI_JOBS", ["jobs.ai", "jobs.ai.>"]);
  await ensureStream(manager, "IMAGE_JOBS", ["jobs.image", "jobs.image.>"]);
  await ensureStream(manager, "JOB_EVENTS", [
    "jobs.events",
    "jobs.events.>",
    "jobs.progress",
    "jobs.completed",
    "jobs.failed",
  ]);

  const options = consumerOpts();
  options.durable("backend-job-events").ackExplicit().deliverAll();
  const subscription = await jetStream.pullSubscribe("jobs.events", options);
  void consumeEvents(subscription);
}

async function consumeEvents(subscription: AsyncIterable<JsMsg> & { pull: (options: { batch: number; expires: number }) => void }): Promise<void> {
  while (true) {
    subscription.pull({ batch: 10, expires: 30_000 });
    for await (const message of subscription) {
      try {
        const event = JSON.parse(codec.decode(message.data));
        await applyJobEvent(event);
        message.ack();
      } catch (error) {
        console.error("Invalid worker event; message was not acknowledged", error);
      }
    }
  }
}

export async function publishJob(subject: string, payload: Record<string, unknown>): Promise<void> {
  if (!jetStream) {
    throw new Error("NATS connection is not ready");
  }
  await jetStream.publish(subject, codec.encode(JSON.stringify(payload)));
}

export async function closeMessaging(): Promise<void> {
  if (connection) {
    await connection.drain();
    connection = null;
    jetStream = null;
  }
}
