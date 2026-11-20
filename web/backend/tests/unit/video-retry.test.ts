/**
 * Retrying a failed video must send it back to the video pool: the image worker cannot decode an MP4 and fails it with
 * a misleading image error. Editing (re-rendering from boxes) exists only for images.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as jobRepository from "../../src/repositories/job.repository";
import { storage } from "../../src/storage";
import * as messaging from "../../src/messaging";
import { editJob, retryFailedJob } from "../../src/services/job.service";
import { JobStatus } from "../../src/generated/prisma/client";

const userId = "11111111-1111-4111-8111-111111111111";
const batchId = "33333333-3333-4333-8333-333333333333";
const jobId = "44444444-4444-4444-8444-444444444444";

function mockRetry(originalFilename: string, format: string) {
  const ext = originalFilename.slice(originalFilename.lastIndexOf("."));
  const failedJob = {
    id: jobId,
    batchId,
    status: JobStatus.FAILED,
    originalFilename,
    inputKey: `${batchId}/${jobId}/input${ext}`,
    outputKey: `${batchId}/${jobId}/result${ext}`,
    inputBytes: 1234,
    whitelistRefs: [],
  };
  vi.spyOn(jobRepository, "getJobOwnedByUser").mockResolvedValue(failedJob as any);
  vi.spyOn(jobRepository, "getBatch").mockResolvedValue({
    id: batchId,
    config: { targets: ["face", "plate"], style: "blur", strength: 15, quality: "high", format },
    whitelistKeys: [],
    whitelistDeletedAt: null,
    startedAt: new Date(),
  } as any);
  vi.spyOn(jobRepository, "getActiveRetryJob").mockResolvedValue(null);
  vi.spyOn(storage, "objectExists").mockResolvedValue(true);
  const insertSpy = vi.spyOn(jobRepository, "insertRetryJob").mockResolvedValue({} as any);
  const publishSpy = vi.spyOn(messaging, "publishJob").mockResolvedValue();
  vi.spyOn(jobRepository, "updateJobQueued").mockResolvedValue();
  vi.spyOn(jobRepository, "getJob").mockResolvedValue({ ...failedJob, id: "retry-1" } as any);
  return { insertSpy, publishSpy };
}

describe("retrying and editing videos", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("a failed video is retried on the video queue as a video job with an .mp4 result", async () => {
    // A batch format of png applies to images only; the video result stays MP4.
    const { insertSpy, publishSpy } = mockRetry("test1.mp4", "png");

    await retryFailedJob(jobId, userId);

    expect(publishSpy).toHaveBeenCalledWith("jobs.video", expect.objectContaining({ type: "video-redact" }));
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ outputKey: expect.stringMatching(/\.mp4$/) }));
  });

  it("a failed image is still retried on the image queue", async () => {
    const { publishSpy } = mockRetry("photo.jpg", "original");

    await retryFailedJob(jobId, userId);

    expect(publishSpy).toHaveBeenCalledWith("jobs.image", expect.objectContaining({ type: "image-redact" }));
  });

  it("editing a video is refused before anything is queued", async () => {
    vi.spyOn(jobRepository, "getJobOwnedByUser").mockResolvedValue({
      id: jobId,
      batchId,
      status: JobStatus.COMPLETED,
      originalFilename: "test1.mp4",
      inputKey: `${batchId}/${jobId}/input.mp4`,
    } as any);
    vi.spyOn(jobRepository, "getActiveEditJob").mockResolvedValue(null);
    const publishSpy = vi.spyOn(messaging, "publishJob").mockResolvedValue();

    await expect(editJob(jobId, userId, { boxes: [] } as any)).rejects.toMatchObject({ code: "JOB_NOT_EDITABLE" });
    expect(publishSpy).not.toHaveBeenCalled();
  });
});
