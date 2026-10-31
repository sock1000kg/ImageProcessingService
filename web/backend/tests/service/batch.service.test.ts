import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, JetStreamManager, NatsConnection, StringCodec } from "nats";
import { config } from "../../src/config";
import { closeDatabase } from "../../src/db";
import { storage } from "../../src/storage";
import {
  addBatchFile,
  applyJobEvent,
  checkAndCleanBatchWhitelist,
  createDraftBatch,
  deleteBatchById,
  getBatchById,
  renameBatch,
  startBatch,
} from "../../src/services/batch.service";
import { connectMessaging, closeMessaging } from "../../src/messaging";

describe("Batch Service Integration Tests", () => {
  let nc: NatsConnection;
  let jsm: JetStreamManager;
  const codec = StringCodec();

  beforeAll(async () => {
    await storage.verifyBuckets();
    await connectMessaging();
    nc = await connect({ servers: config.NATS_URL });
    jsm = await nc.jetstreamManager();
  });

  afterAll(async () => {
    await closeMessaging();
    if (nc) await nc.close();
    await closeDatabase();
  });

  it("creates a draft, uploads 3 files, starts batch, verifies commands, enforces limits and idempotency", async () => {
    // 1. Get initial stream state
    const initialStreamInfo = await jsm.streams.info("IMAGE_JOBS");
    const startSeq = initialStreamInfo.state.last_seq;

    // 2. Create draft batch with 1 whitelist photo
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

    const draftBatch = await createDraftBatch({
      whitelist: [whitelistFile],
      rawConfig: {
        style: "pixelate",
        quality: "high",
        format: "original",
      },
    });

    expect(draftBatch).toBeDefined();
    expect(draftBatch.status).toBe("DRAFT");
    expect(draftBatch.jobs).toHaveLength(0);
    expect(draftBatch.whitelistKeys).toHaveLength(1);

    const batchId = draftBatch.id;

    // 3. Upload 3 files one-by-one
    const file1: Express.Multer.File = {
      fieldname: "file",
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
      fieldname: "file",
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

    const file3: Express.Multer.File = {
      fieldname: "file",
      originalname: "sample3.webp",
      encoding: "7bit",
      mimetype: "image/webp",
      size: 1536,
      buffer: Buffer.from("dummy-webp-3"),
      stream: null as any,
      destination: "",
      filename: "",
      path: "",
    };

    const job1 = await addBatchFile(batchId, file1);
    const job2 = await addBatchFile(batchId, file2);
    const job3 = await addBatchFile(batchId, file3);

    expect(job1.status).toBe("PENDING");
    expect(job2.status).toBe("PENDING");
    expect(job3.status).toBe("PENDING");

    // Before start: no commands published yet
    const midStreamInfo = await jsm.streams.info("IMAGE_JOBS");
    expect(midStreamInfo.state.last_seq).toBe(startSeq);

    // 4. Start batch -> 3 commands published, batch is not DRAFT
    const startedBatch = await startBatch(batchId);
    expect(startedBatch.status).not.toBe("DRAFT");
    expect(startedBatch.status).toBe("PROCESSING");

    const endSeq = (await jsm.streams.info("IMAGE_JOBS")).state.last_seq;
    expect(endSeq).toBe(startSeq + 3);

    const receivedCommands: any[] = [];
    for (let seq = startSeq + 1; seq <= endSeq; seq++) {
      try {
        const storedMsg = await jsm.streams.getMessage("IMAGE_JOBS", { seq });
        const data = JSON.parse(codec.decode(storedMsg.data));
        if (data.batchId === batchId) {
          receivedCommands.push(data);
        }
      } catch {
        // message might not exist
      }
    }
    expect(receivedCommands).toHaveLength(3);

    // 5. Calling start again -> no duplicate publish
    const startedAgain = await startBatch(batchId);
    const afterSecondStartSeq = (await jsm.streams.info("IMAGE_JOBS")).state.last_seq;
    expect(afterSecondStartSeq).toBe(endSeq);

    // 6. Upload after start -> 409 BATCH_STARTED
    await expect(addBatchFile(batchId, file1)).rejects.toMatchObject({
      status: 409,
      code: "BATCH_STARTED",
    });

    // 7. Upload over limit -> 409 BATCH_FULL
    const originalMaxFiles = config.BATCH_MAX_FILES;
    try {
      (config as any).BATCH_MAX_FILES = 1;
      const limitBatch = await createDraftBatch({ rawConfig: {} });
      await addBatchFile(limitBatch.id, file1);
      await expect(addBatchFile(limitBatch.id, file2)).rejects.toMatchObject({
        status: 409,
        code: "BATCH_FULL",
      });
      await deleteBatchById(limitBatch.id);
    } finally {
      (config as any).BATCH_MAX_FILES = originalMaxFiles;
    }

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
      { bucket: "uploads", key: draftBatch.whitelistKeys[0] },
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

    // Whitelist should still be kept because job 3 is still pending
    await checkAndCleanBatchWhitelist(batchId);
    currentBatch = await getBatchById(batchId);
    expect(currentBatch?.status).toBe("PROCESSING");
    expect(currentBatch?.whitelistDeletedAt).toBeNull();

    // Complete job 3
    await applyJobEvent({
      jobId: job3.id,
      batchId,
      status: "COMPLETED",
      progress: 100,
      stage: "DONE",
      result: { bucket: "results", key: `${batchId}/${job3.id}/result.webp` },
      resultSummary: {
        counts: { face: 0, plate: 0, redacted: 0, whitelistedFace: 0, lowConfidence: 0 },
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

  it("creates a batch with a name, renames it with renameBatch (PATCH), and returns 404 for unknown id", async () => {
    // 1. Create with a name -> response has it
    const batch = await createDraftBatch({
      name: "Custom Initial Name",
      rawConfig: { style: "blur" },
    });
    expect(batch.name).toBe("Custom Initial Name");

    // 2. PATCH (rename) -> GET shows the new name
    const renamed = await renameBatch(batch.id, "Renamed Batch Title");
    expect(renamed.name).toBe("Renamed Batch Title");

    const fetched = await getBatchById(batch.id);
    expect(fetched?.name).toBe("Renamed Batch Title");

    // 3. PATCH on an unknown id -> 404
    await expect(
      renameBatch("00000000-0000-0000-0000-000000000000", "Valid Name"),
    ).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });

    // Cleanup
    await deleteBatchById(batch.id);
  });
});
