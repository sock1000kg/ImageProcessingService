import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, JetStreamManager, NatsConnection, StringCodec } from "nats";
import { config } from "../../src/config";
import { pool } from "../../src/db/pool";
import { runMigrations } from "../../src/db/migrate";
import { storage, UPLOADS_BUCKET, RESULTS_BUCKET } from "../../src/storage";
import {
  createBatch,
  deleteBatchById,
  getBatchById,
} from "../../src/services/batch.service";
import { applyJobEvent, checkAndCleanBatchWhitelist } from "../../src/db";
import { connectMessaging, closeMessaging } from "../../src/messaging";

describe("Batch Service Integration Tests", () => {
  let nc: NatsConnection;
  let jsm: JetStreamManager;
  const codec = StringCodec();

  beforeAll(async () => {
    await runMigrations();
    await storage.verifyBuckets();
    await connectMessaging();
    nc = await connect({ servers: config.NATS_URL });
    jsm = await nc.jetstreamManager();
  });

  afterAll(async () => {
    await closeMessaging();
    if (nc) await nc.close();
    await pool.end();
  });

  it("creates a batch, verifies §2A command in IMAGE_JOBS, applies events, cleans whitelist, and deletes batch", async () => {
    // 1. Get initial stream state
    const initialStreamInfo = await jsm.streams.info("IMAGE_JOBS");
    const startSeq = initialStreamInfo.state.last_seq;

    // 2. Create batch with 2 images and 1 whitelist photo
    const file1: Express.Multer.File = {
      fieldname: "files",
      originalname: "sample1.jpg",
      encoding: "7bit",
      mimetype: "image/jpeg",
      size: 1024,
      buffer: Buffer.from("dummy-jpeg-1"),
      stream: null as any,
      destination: "",
      filename: "",
      path: "",
    };

    const file2: Express.Multer.File = {
      fieldname: "files",
      originalname: "sample2.png",
      encoding: "7bit",
      mimetype: "image/png",
      size: 2048,
      buffer: Buffer.from("dummy-png-2"),
      stream: null as any,
      destination: "",
      filename: "",
      path: "",
    };

    const whitelistFile: Express.Multer.File = {
      fieldname: "whitelist",
      originalname: "face.jpg",
      encoding: "7bit",
      mimetype: "image/jpeg",
      size: 512,
      buffer: Buffer.from("dummy-whitelist-face"),
      stream: null as any,
      destination: "",
      filename: "",
      path: "",
    };

    const batch = await createBatch({
      files: [file1, file2],
      whitelist: [whitelistFile],
      rawConfig: {
        style: "pixelate",
        quality: "high",
        format: "original",
      },
    });

    expect(batch).toBeDefined();
    expect(batch.jobs).toHaveLength(2);
    expect(batch.status).toBe("PROCESSING");
    expect(batch.whitelistKeys).toHaveLength(1);

    const batchId = batch.id;
    const [job1, job2] = batch.jobs;

    // 3. Verify §2A command in IMAGE_JOBS via stream getMessage by sequence (never creating a consumer)
    const updatedStreamInfo = await jsm.streams.info("IMAGE_JOBS");
    const endSeq = updatedStreamInfo.state.last_seq;
    expect(endSeq).toBeGreaterThan(startSeq);

    const receivedCommands: any[] = [];
    for (let seq = startSeq + 1; seq <= endSeq; seq++) {
      try {
        const storedMsg = await jsm.streams.getMessage("IMAGE_JOBS", { seq });
        const data = JSON.parse(codec.decode(storedMsg.data));
        if (data.batchId === batchId) {
          receivedCommands.push(data);
        }
      } catch {
        // message might not exist or be from another subject
      }
    }

    expect(receivedCommands).toHaveLength(2);

    const cmd1 = receivedCommands.find((c) => c.jobId === job1.id);
    expect(cmd1).toBeDefined();
    expect(cmd1.type).toBe("image-redact");
    expect(cmd1.batchId).toBe(batchId);
    expect(cmd1.input).toEqual({
      bucket: "uploads",
      key: `${batchId}/${job1.id}/input.jpg`,
    });
    expect(cmd1.output).toEqual({
      bucket: "results",
      key: `${batchId}/${job1.id}/result.jpg`,
    });
    expect(cmd1.params.redaction).toEqual({
      targets: ["face", "plate"],
      style: "pixelate",
      strength: 12,
      padding: 0.1,
    });
    expect(cmd1.params.output.quality).toBe("high");
    expect(cmd1.params.whitelist.faces).toEqual([
      { bucket: "uploads", key: batch.whitelistKeys[0] },
    ]);

    // 4. Applying events moves jobs and batch to the right state
    // Apply event for job 1: PROCESSING 50%
    await applyJobEvent({
      jobId: job1.id,
      batchId,
      status: "PROCESSING",
      progress: 50,
      stage: "DETECTING",
    });

    let currentBatch = await getBatchById(batchId);
    expect(currentBatch?.status).toBe("PROCESSING");
    expect(currentBatch?.jobs.find((j) => j.id === job1.id)?.progress).toBe(50);

    // Complete job 1
    await applyJobEvent({
      jobId: job1.id,
      batchId,
      status: "COMPLETED",
      progress: 100,
      stage: "DONE",
      result: { bucket: "results", key: `${batchId}/${job1.id}/result.jpg` },
      resultSummary: {
        counts: { face: 2, plate: 1, redacted: 3, whitelistedFace: 0, lowConfidence: 0 },
      },
    });

    // Whitelist should NOT be deleted yet because job 2 is still pending
    currentBatch = await getBatchById(batchId);
    expect(currentBatch?.whitelistDeletedAt).toBeNull();

    // Complete job 2
    await applyJobEvent({
      jobId: job2.id,
      batchId,
      status: "COMPLETED",
      progress: 100,
      stage: "DONE",
      result: { bucket: "results", key: `${batchId}/${job2.id}/result.png` },
      resultSummary: {
        counts: { face: 1, plate: 0, redacted: 1, whitelistedFace: 1, lowConfidence: 0 },
      },
    });

    // Trigger whitelist cleanup on batch completion
    await checkAndCleanBatchWhitelist(batchId);

    currentBatch = await getBatchById(batchId);
    expect(currentBatch?.status).toBe("COMPLETED");
    expect(currentBatch?.whitelistDeletedAt).not.toBeNull();

    // 5. Delete batch: removes rows and S3 objects
    const deleted = await deleteBatchById(batchId);
    expect(deleted).toBe(true);

    const deletedBatch = await getBatchById(batchId);
    expect(deletedBatch).toBeNull();
  });
});
