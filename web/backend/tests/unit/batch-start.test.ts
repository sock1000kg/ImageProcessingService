import { describe, expect, it, vi, beforeEach } from "vitest";
import { startBatch } from "../../src/services/batch.service";
import * as jobRepository from "../../src/repositories/job.repository";
import * as messaging from "../../src/messaging";
import { JobStatus } from "../../src/generated/prisma/client";

describe("startBatch Unit Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("throws 400 BATCH_EMPTY if batch has no jobs", async () => {
    vi.spyOn(jobRepository, "getBatch").mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      config: {},
      whitelistKeys: [],
      whitelistDeletedAt: null,
      startedAt: null,
      createdAt: new Date(),
    } as any);
    vi.spyOn(jobRepository, "getJobsByBatchId").mockResolvedValue([]);

    await expect(startBatch("11111111-1111-1111-1111-111111111111")).rejects.toMatchObject({
      status: 400,
      code: "BATCH_EMPTY",
    });
  });

  it("publishes ONLY jobs still PENDING, marks them QUEUED, and is idempotent", async () => {
    const batchId = "22222222-2222-2222-2222-222222222222";
    const batchData = {
      id: batchId,
      config: { targets: ["face"], style: "blur" },
      whitelistKeys: [],
      whitelistDeletedAt: null,
      startedAt: null,
      createdAt: new Date(),
    };

    const pendingJob = {
      id: "job-pending-1",
      batchId,
      originalFilename: "pending.jpg",
      inputKey: `${batchId}/job-pending-1/input.jpg`,
      outputKey: `${batchId}/job-pending-1/result.jpg`,
      status: JobStatus.PENDING,
      progress: 0,
      stage: null,
      resultUrl: null,
      resultSummary: null,
      error: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const queuedJob = {
      id: "job-queued-2",
      batchId,
      originalFilename: "queued.jpg",
      inputKey: `${batchId}/job-queued-2/input.jpg`,
      outputKey: `${batchId}/job-queued-2/result.jpg`,
      status: JobStatus.QUEUED,
      progress: 0,
      stage: null,
      resultUrl: null,
      resultSummary: null,
      error: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const completedJob = {
      id: "job-completed-3",
      batchId,
      originalFilename: "completed.jpg",
      inputKey: `${batchId}/job-completed-3/input.jpg`,
      outputKey: `${batchId}/job-completed-3/result.jpg`,
      status: JobStatus.COMPLETED,
      progress: 100,
      stage: "DONE",
      resultUrl: "/results/sample.jpg",
      resultSummary: null,
      error: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const allJobs = [pendingJob, queuedJob, completedJob];

    vi.spyOn(jobRepository, "getBatch").mockImplementation(async () => ({
      ...batchData,
      startedAt: batchData.startedAt ? new Date(batchData.startedAt) : null,
    } as any));

    vi.spyOn(jobRepository, "getJobsByBatchId").mockResolvedValue(allJobs as any);

    const pendingList = [pendingJob];
    vi.spyOn(jobRepository, "getPendingJobsByBatchId").mockResolvedValue(pendingList as any);

    const setBatchStartedSpy = vi.spyOn(jobRepository, "setBatchStarted").mockImplementation(async () => {
      batchData.startedAt = new Date() as any;
    });

    const publishedSubjects: string[] = [];
    const publishedCommands: any[] = [];
    vi.spyOn(messaging, "publishJob").mockImplementation(async (subject, command) => {
      publishedSubjects.push(subject);
      publishedCommands.push(command);
    });

    const updateJobQueuedSpy = vi.spyOn(jobRepository, "updateJobQueued").mockImplementation(async (id) => {
      const found = allJobs.find((j) => j.id === id);
      if (found) found.status = JobStatus.QUEUED;
    });

    // First call to startBatch
    const result1 = await startBatch(batchId);

    expect(setBatchStartedSpy).toHaveBeenCalledWith(batchId);
    expect(publishedCommands).toHaveLength(1);
    expect(publishedCommands[0].jobId).toBe("job-pending-1");
    expect(updateJobQueuedSpy).toHaveBeenCalledWith("job-pending-1");
    expect(updateJobQueuedSpy).not.toHaveBeenCalledWith("job-queued-2");
    expect(updateJobQueuedSpy).not.toHaveBeenCalledWith("job-completed-3");

    // Second call to startBatch - now 0 pending jobs
    vi.spyOn(jobRepository, "getPendingJobsByBatchId").mockResolvedValue([]);
    const result2 = await startBatch(batchId);

    // No additional publishes
    expect(publishedCommands).toHaveLength(1);
  });
});
