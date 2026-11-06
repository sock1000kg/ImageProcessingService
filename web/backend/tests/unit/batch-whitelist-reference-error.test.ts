/**
 * Unit tests verifying bad reference photo filename sanitization and error handling (Task 62).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyJobEvent } from "../../src/services/batch.service";
import * as jobRepository from "../../src/repositories/job.repository";
import { ValidatedJobEvent } from "../../src/dto";
import { JobStatus } from "../../src/generated/prisma/client";

describe("Bad reference photo error sanitization (Task 62)", () => {
  const batchId = "11111111-1111-4111-8111-111111111111";
  const jobId = "22222222-2222-4222-8222-222222222222";
  const listKey = "lists/user-1/list-1/face-1.jpg";
  const uploadedKey = `${batchId}/whitelist/face-1.jpg`;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const baseJob = {
    id: jobId,
    batchId,
    originalFilename: "sample.jpg",
    inputKey: `${batchId}/${jobId}/input.jpg`,
    outputKey: `${batchId}/${jobId}/result.jpg`,
    inputBytes: 1234,
    status: JobStatus.PROCESSING,
    progress: 20,
    stage: "DETECTING",
    resultUrl: null,
    resultSummary: null,
    error: null,
    whitelistRefs: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("stores a message containing the filename and not the key for a list photo", async () => {
    vi.spyOn(jobRepository, "getJob").mockResolvedValue(baseJob as any);
    const getBatchSpy = vi.spyOn(jobRepository, "getBatch").mockResolvedValue({
      id: batchId,
      whitelistKeys: [listKey],
      whitelistNames: {
        [listKey]: "0_Parade_marchingband_1_511.jpg",
      },
    } as any);

    let updatedState: any = null;
    vi.spyOn(jobRepository, "updateJobState").mockImplementation(async (_id, state) => {
      updatedState = state;
    });

    const event: ValidatedJobEvent = {
      jobId,
      status: "FAILED",
      error: {
        code: "WHITELIST_REFERENCE_ERROR",
        message: `No face detected in whitelist reference image 'uploads/${listKey}'.`,
      },
    };

    await applyJobEvent(event);

    expect(getBatchSpy).toHaveBeenCalledWith(batchId);
    expect(updatedState).toBeDefined();
    expect(updatedState.status).toBe(JobStatus.FAILED);
    expect(updatedState.error.code).toBe("WHITELIST_REFERENCE_ERROR");
    expect(updatedState.error.message).toContain("0_Parade_marchingband_1_511.jpg");
    expect(updatedState.error.message).not.toContain(listKey);
    expect(updatedState.error.message).not.toContain("uploads/");
  });

  it("stores a message containing the filename and not the key for an uploaded photo", async () => {
    vi.spyOn(jobRepository, "getJob").mockResolvedValue(baseJob as any);
    const getBatchSpy = vi.spyOn(jobRepository, "getBatch").mockResolvedValue({
      id: batchId,
      whitelistKeys: [uploadedKey],
      whitelistNames: {
        [uploadedKey]: "uploaded_face.png",
      },
    } as any);

    let updatedState: any = null;
    vi.spyOn(jobRepository, "updateJobState").mockImplementation(async (_id, state) => {
      updatedState = state;
    });

    const event: ValidatedJobEvent = {
      jobId,
      status: "FAILED",
      error: {
        code: "WHITELIST_REFERENCE_ERROR",
        message: `Cannot identify or decode whitelist reference image 'uploads/${uploadedKey}': invalid header`,
      },
    };

    await applyJobEvent(event);

    expect(getBatchSpy).toHaveBeenCalledWith(batchId);
    expect(updatedState).toBeDefined();
    expect(updatedState.status).toBe(JobStatus.FAILED);
    expect(updatedState.error.code).toBe("WHITELIST_REFERENCE_ERROR");
    expect(updatedState.error.message).toContain("uploaded_face.png");
    expect(updatedState.error.message).not.toContain(uploadedKey);
    expect(updatedState.error.message).not.toContain("uploads/");
  });

  it("falls back to 'a reference photo' when there is no match or no name recorded, leaving no key", async () => {
    vi.spyOn(jobRepository, "getJob").mockResolvedValue(baseJob as any);
    vi.spyOn(jobRepository, "getBatch").mockResolvedValue({
      id: batchId,
      whitelistKeys: ["lists/different-user/different-list/face-9.jpg"],
      whitelistNames: {},
    } as any);

    let updatedState: any = null;
    vi.spyOn(jobRepository, "updateJobState").mockImplementation(async (_id, state) => {
      updatedState = state;
    });

    const event: ValidatedJobEvent = {
      jobId,
      status: "FAILED",
      error: {
        code: "WHITELIST_REFERENCE_ERROR",
        message: "No face detected in whitelist reference image 'uploads/lists/orphan/face.jpg'.",
      },
    };

    await applyJobEvent(event);

    expect(updatedState).toBeDefined();
    expect(updatedState.status).toBe(JobStatus.FAILED);
    expect(updatedState.error.code).toBe("WHITELIST_REFERENCE_ERROR");
    expect(updatedState.error.message).toContain("a reference photo");
    expect(updatedState.error.message).not.toContain("uploads/lists/orphan/face.jpg");
    expect(updatedState.error.message).not.toContain("uploads/");
  });

  it("keeps error code unchanged on WHITELIST_REFERENCE_ERROR", async () => {
    vi.spyOn(jobRepository, "getJob").mockResolvedValue(baseJob as any);
    vi.spyOn(jobRepository, "getBatch").mockResolvedValue({
      id: batchId,
      whitelistKeys: [listKey],
      whitelistNames: { [listKey]: "reference.jpg" },
    } as any);

    let updatedState: any = null;
    vi.spyOn(jobRepository, "updateJobState").mockImplementation(async (_id, state) => {
      updatedState = state;
    });

    const event: ValidatedJobEvent = {
      jobId,
      status: "FAILED",
      error: {
        code: "WHITELIST_REFERENCE_ERROR",
        message: `Whitelist reference image 'uploads/${listKey}' is empty (0 bytes).`,
      },
    };

    await applyJobEvent(event);

    expect(updatedState.error.code).toBe("WHITELIST_REFERENCE_ERROR");
  });

  it("keeps other failure codes and messages intact without loading the batch", async () => {
    vi.spyOn(jobRepository, "getJob").mockResolvedValue(baseJob as any);
    const getBatchSpy = vi.spyOn(jobRepository, "getBatch");

    let updatedState: any = null;
    vi.spyOn(jobRepository, "updateJobState").mockImplementation(async (_id, state) => {
      updatedState = state;
    });

    const originalMsg = "Inference failed: CUDA memory limit exceeded for input uploads/batches/input.jpg";
    const event: ValidatedJobEvent = {
      jobId,
      status: "FAILED",
      error: {
        code: "MODEL_INFERENCE_ERROR",
        message: originalMsg,
      },
    };

    await applyJobEvent(event);

    expect(getBatchSpy).not.toHaveBeenCalled();
    expect(updatedState).toBeDefined();
    expect(updatedState.error.code).toBe("MODEL_INFERENCE_ERROR");
    expect(updatedState.error.message).toBe(originalMsg);
  });
});
