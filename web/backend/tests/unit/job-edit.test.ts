import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Request, Response } from "express";
import { applyJobEvent, editJob, retryFailedJob } from "../../src/services/batch.service";
import * as jobRepository from "../../src/repositories/job.repository";
import * as messaging from "../../src/messaging";
import { RESULTS_BUCKET, storage, UPLOADS_BUCKET } from "../../src/storage";
import { JobStatus } from "../../src/generated/prisma/client";
import { buildImageRenderCommand, ImageRenderCommand } from "../../src/domain";
import { editJobHandler } from "../../src/controllers/jobs.controller";

describe("Job Edit Unit Tests (Task 91)", () => {
  const userId = "123e4567-e89b-42d3-a456-426614174000";
  const otherUserId = "987e6543-e21b-42d3-a456-426614174999";
  const batchId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const jobId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  const defaultBatch = {
    id: batchId,
    userId,
    name: "Test Batch",
    config: {
      targets: ["face", "plate"],
      style: "blur",
      strength: 15,
      padding: 0.1,
      quality: "high",
      format: "original",
      faceConfidenceThreshold: 0.17,
      plateConfidenceThreshold: 0.11,
      reviewThreshold: 0.25,
      similarityThreshold: 0.45,
    },
    whitelistKeys: [],
    whitelistNames: {},
    whitelistDeletedAt: new Date("2026-11-09T10:00:00Z"),
    startedAt: new Date("2026-11-09T09:00:00Z"),
    createdAt: new Date("2026-11-09T08:00:00Z"),
  };

  const completedJob = {
    id: jobId,
    batchId,
    originalFilename: "sample.jpg",
    inputKey: `${batchId}/${jobId}/input.jpg`,
    outputKey: `${batchId}/${jobId}/result.jpg`,
    inputBytes: 50000,
    resultBytes: 45000,
    status: JobStatus.COMPLETED,
    progress: 100,
    stage: "DONE",
    resultSummary: {
      imageSize: [1920, 1080],
      detections: [
        { label: "face", box: [34, 12, 120, 250], redacted: true, confidence: 0.95 },
        { label: "plate", box: [200, 300, 400, 380], redacted: true, confidence: 0.88 },
        { label: "face", box: [600, 70, 750, 220], redacted: false, confidence: 0.82 },
      ],
      model: "yolov8n",
      processingTimeMs: 120,
    },
    error: null,
    whitelistRefs: [],
    replacesJobId: null,
    createdAt: new Date("2026-11-09T09:01:00Z"),
    updatedAt: new Date("2026-11-09T09:02:00Z"),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. buildImageRenderCommand (§2C Contract)", () => {
    it("builds exact §2C command shape with boxes, style, and quality", () => {
      const command = buildImageRenderCommand({
        jobId: "render-job-1",
        batchId: "batch-1",
        inputKey: "batch-1/render-job-1/input.jpg",
        outputKey: "batch-1/render-job-1/result.jpg",
        redaction: {
          style: "blur",
          strength: 15,
          padding: 0.1,
        },
        quality: "high",
        boxes: [
          { label: "face", box: [34, 12, 120, 250] },
          { label: "custom", box: [500, 600, 700, 660] },
        ],
      });

      expect(command).toEqual({
        jobId: "render-job-1",
        batchId: "batch-1",
        type: "image-render",
        input: { bucket: "uploads", key: "batch-1/render-job-1/input.jpg" },
        output: { bucket: "results", key: "batch-1/render-job-1/result.jpg" },
        params: {
          redaction: {
            style: "blur",
            strength: 15,
            padding: 0.1,
          },
          output: { quality: "high" },
          boxes: [
            { label: "face", box: [34, 12, 120, 250] },
            { label: "custom", box: [500, 600, 700, 660] },
          ],
        },
      });
    });

    it("omits strength parameter for blackout style", () => {
      const command = buildImageRenderCommand({
        jobId: "render-job-2",
        batchId: "batch-1",
        inputKey: "batch-1/render-job-2/input.jpg",
        outputKey: "batch-1/render-job-2/result.jpg",
        redaction: {
          style: "blackout",
          padding: 0.15,
        },
        quality: "standard",
        boxes: [{ label: "custom", box: [10, 10, 100, 100] }],
      });

      expect(command.params.redaction.style).toBe("blackout");
      expect(command.params.redaction.strength).toBeUndefined();
      expect(command.params.redaction.padding).toBe(0.15);
    });
  });

  describe("2. Service: editJob creation and command dispatch", () => {
    it("creates a new PENDING/QUEUED row, publishes image-render command with expected boxes, and keeps old row untouched", async () => {
      vi.spyOn(jobRepository, "getJobOwnedByUser").mockResolvedValue(completedJob as any);
      vi.spyOn(jobRepository, "getActiveEditJob").mockResolvedValue(null);
      vi.spyOn(jobRepository, "getBatch").mockResolvedValue(defaultBatch as any);
      vi.spyOn(storage, "objectExists").mockResolvedValue(true);
      const copySpy = vi.spyOn(storage, "copyObject").mockResolvedValue();

      let createdJobData: any = null;
      vi.spyOn(jobRepository, "insertEditJob").mockImplementation(async (data: any) => {
        createdJobData = data;
        return {
          ...data,
          status: JobStatus.PENDING,
          progress: 0,
          stage: null,
          error: null,
          whitelistRefs: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      });

      let publishedSubject = "";
      let publishedPayload: any = null;
      vi.spyOn(messaging, "publishJob").mockImplementation(async (sub, payload) => {
        publishedSubject = sub;
        publishedPayload = payload;
      });

      const queuedSpy = vi.spyOn(jobRepository, "updateJobQueued").mockResolvedValue();
      const deleteJobSpy = vi.spyOn(jobRepository, "deleteJob").mockResolvedValue();

      vi.spyOn(jobRepository, "getJob").mockImplementation(async (id: string) => {
        if (createdJobData && id === createdJobData.id) {
          return {
            ...createdJobData,
            status: JobStatus.QUEUED,
            progress: 0,
            stage: null,
            error: null,
            whitelistRefs: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }
        return null;
      });

      // User selects detection index 0 (face) to keep, drops index 1 (plate), adds custom box
      const result = await editJob(jobId, userId, {
        redactIndices: [0],
        addedBoxes: [{ box: [500, 600, 700, 660] }],
        style: "blur",
        strength: 20,
        padding: 0.1,
      });

      // Verify copied original into new job directory
      expect(copySpy).toHaveBeenCalledWith(
        UPLOADS_BUCKET,
        completedJob.inputKey,
        expect.stringMatching(new RegExp(`^${batchId}/[^/]+/input\\.jpg$`)),
      );

      // Verify inserted edit job links to old job and holds resulting detections
      expect(createdJobData).toBeDefined();
      expect(createdJobData.replacesJobId).toBe(jobId);
      expect(createdJobData.batchId).toBe(batchId);
      expect(createdJobData.resultSummary.detections).toEqual([
        { label: "face", box: [34, 12, 120, 250], redacted: true, confidence: 0.95 },
        { label: "plate", box: [200, 300, 400, 380], redacted: false, confidence: 0.88 },
        { label: "face", box: [600, 70, 750, 220], redacted: false, confidence: 0.82 },
        { label: "custom", box: [500, 600, 700, 660], redacted: true },
      ]);

      // Verify published image-render command
      expect(publishedSubject).toBe("jobs.image");
      expect(publishedPayload.type).toBe("image-render");
      expect(publishedPayload.params.redaction).toEqual({
        style: "blur",
        strength: 20,
        padding: 0.1,
      });
      // Engine boxes: kept index 0 + added custom box
      expect(publishedPayload.params.boxes).toEqual([
        { label: "face", box: [34, 12, 120, 250] },
        { label: "custom", box: [500, 600, 700, 660] },
      ]);

      expect(queuedSpy).toHaveBeenCalledWith(createdJobData.id);
      // Old row untouched
      expect(deleteJobSpy).not.toHaveBeenCalled();
      expect(result.id).toBe(createdJobData.id);
      expect(result.replacesJobId).toBe(jobId);
    });

    it("cleans up new job row and copied object if command publish fails", async () => {
      vi.spyOn(jobRepository, "getJobOwnedByUser").mockResolvedValue(completedJob as any);
      vi.spyOn(jobRepository, "getActiveEditJob").mockResolvedValue(null);
      vi.spyOn(jobRepository, "getBatch").mockResolvedValue(defaultBatch as any);
      vi.spyOn(storage, "objectExists").mockResolvedValue(true);
      vi.spyOn(storage, "copyObject").mockResolvedValue();

      let insertedId = "";
      vi.spyOn(jobRepository, "insertEditJob").mockImplementation(async (data: any) => {
        insertedId = data.id;
        return data as any;
      });

      vi.spyOn(messaging, "publishJob").mockRejectedValue(new Error("NATS timeout"));
      const deleteJobSpy = vi.spyOn(jobRepository, "deleteJob").mockResolvedValue();
      const deleteObjSpy = vi.spyOn(storage, "deleteObject").mockResolvedValue();

      await expect(
        editJob(jobId, userId, {
          redactIndices: [],
          addedBoxes: [],
        }),
      ).rejects.toThrow(/queue is unavailable/i);

      expect(deleteJobSpy).toHaveBeenCalledWith(insertedId);
      expect(deleteObjSpy).toHaveBeenCalledWith(
        UPLOADS_BUCKET,
        expect.stringMatching(new RegExp(`^${batchId}/${insertedId}/input\\.jpg$`)),
      );
    });

    it("preserves batch strength when style is sent matching batch style without strength parameter", async () => {
      const customBatch = {
        ...defaultBatch,
        config: {
          ...defaultBatch.config,
          style: "blur",
          strength: 25,
        },
      };
      vi.spyOn(jobRepository, "getJobOwnedByUser").mockResolvedValue(completedJob as any);
      vi.spyOn(jobRepository, "getActiveEditJob").mockResolvedValue(null);
      vi.spyOn(jobRepository, "getBatch").mockResolvedValue(customBatch as any);
      vi.spyOn(storage, "objectExists").mockResolvedValue(true);
      vi.spyOn(storage, "copyObject").mockResolvedValue();

      let publishedPayload: any = null;
      vi.spyOn(messaging, "publishJob").mockImplementation(async (_sub, payload) => {
        publishedPayload = payload;
      });
      vi.spyOn(jobRepository, "insertEditJob").mockImplementation(async (data: any) => ({
        ...data,
        status: JobStatus.PENDING,
        progress: 0,
        stage: null,
        error: null,
        whitelistRefs: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
      vi.spyOn(jobRepository, "updateJobQueued").mockResolvedValue();
      vi.spyOn(jobRepository, "getJob").mockImplementation(async (id: string) => ({
        id,
        batchId,
        originalFilename: "sample.jpg",
        inputKey: `${batchId}/${id}/input.jpg`,
        outputKey: `${batchId}/${id}/result.jpg`,
        inputBytes: 50000,
        resultBytes: null,
        status: JobStatus.QUEUED,
        progress: 0,
        stage: null,
        resultSummary: { detections: [] },
        error: null,
        whitelistRefs: [],
        replacesJobId: jobId,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      await editJob(jobId, userId, {
        redactIndices: [0],
        addedBoxes: [],
        style: "blur", // style sent without strength: must preserve batch strength 25
      });

      expect(publishedPayload.params.redaction.style).toBe("blur");
      expect(publishedPayload.params.redaction.strength).toBe(25);
    });

    it("falls back to style default strength when style changes without strength parameter", async () => {
      vi.spyOn(jobRepository, "getJobOwnedByUser").mockResolvedValue(completedJob as any);
      vi.spyOn(jobRepository, "getActiveEditJob").mockResolvedValue(null);
      vi.spyOn(jobRepository, "getBatch").mockResolvedValue(defaultBatch as any); // defaultBatch has style: blur, strength: 15
      vi.spyOn(storage, "objectExists").mockResolvedValue(true);
      vi.spyOn(storage, "copyObject").mockResolvedValue();

      let publishedPayload: any = null;
      vi.spyOn(messaging, "publishJob").mockImplementation(async (_sub, payload) => {
        publishedPayload = payload;
      });
      vi.spyOn(jobRepository, "insertEditJob").mockImplementation(async (data: any) => ({
        ...data,
        status: JobStatus.PENDING,
        progress: 0,
        stage: null,
        error: null,
        whitelistRefs: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
      vi.spyOn(jobRepository, "updateJobQueued").mockResolvedValue();
      vi.spyOn(jobRepository, "getJob").mockImplementation(async (id: string) => ({
        id,
        batchId,
        originalFilename: "sample.jpg",
        inputKey: `${batchId}/${id}/input.jpg`,
        outputKey: `${batchId}/${id}/result.jpg`,
        inputBytes: 50000,
        resultBytes: null,
        status: JobStatus.QUEUED,
        progress: 0,
        stage: null,
        resultSummary: { detections: [] },
        error: null,
        whitelistRefs: [],
        replacesJobId: jobId,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      await editJob(jobId, userId, {
        redactIndices: [0],
        addedBoxes: [],
        style: "pixelate", // style changed from blur to pixelate without strength: must use pixelate default (8)
      });

      expect(publishedPayload.params.redaction.style).toBe("pixelate");
      expect(publishedPayload.params.redaction.strength).toBe(8);
    });
  });

  describe("3. Completion: applyJobEvent replaces old job in place", () => {
    it("COMPLETED event removes old row and its objects, leaves one row whose summary retains detections", async () => {
      const editJobId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
      const editJobRow = {
        id: editJobId,
        batchId,
        originalFilename: "sample.jpg",
        inputKey: `${batchId}/${editJobId}/input.jpg`,
        outputKey: `${batchId}/${editJobId}/result.jpg`,
        inputBytes: 50000,
        resultBytes: null,
        status: JobStatus.QUEUED,
        progress: 0,
        stage: null,
        resultSummary: {
          detections: [
            { label: "face", box: [34, 12, 120, 250], redacted: true, confidence: 0.95 },
            { label: "plate", box: [200, 300, 400, 380], redacted: false, confidence: 0.88 },
            { label: "custom", box: [500, 600, 700, 660], redacted: true },
          ],
        },
        error: null,
        whitelistRefs: [],
        replacesJobId: jobId,
        createdAt: new Date("2026-11-09T09:10:00Z"),
        updatedAt: new Date("2026-11-09T09:10:00Z"),
      };

      vi.spyOn(jobRepository, "getJob").mockImplementation(async (id: string) => {
        if (id === editJobId) return editJobRow as any;
        if (id === jobId) return completedJob as any;
        return null;
      });

      const updateJobStateSpy = vi.spyOn(jobRepository, "updateJobState").mockResolvedValue();
      const deleteJobSpy = vi.spyOn(jobRepository, "deleteJob").mockResolvedValue();
      const deleteObjSpy = vi.spyOn(storage, "deleteObject").mockResolvedValue();
      const clearReplacesSpy = vi.spyOn(jobRepository, "clearJobReplacesJobId").mockResolvedValue();
      vi.spyOn(storage, "statObject").mockResolvedValue(42000);

      // Event from image-render worker per §3B3 (no detections array)
      await applyJobEvent({
        jobId: editJobId,
        status: "COMPLETED",
        progress: 100,
        stage: "DONE",
        resultSummary: {
          imageSize: [1920, 1080],
          boxes: 2,
          redaction: { style: "blur", strength: 20, padding: 0.1 },
          processingTimeMs: 45,
        },
        timestamp: "2026-11-09T09:11:00Z",
      });

      // 1. Saved new row as COMPLETED with merged summary
      expect(updateJobStateSpy).toHaveBeenCalledWith(
        editJobId,
        expect.objectContaining({
          status: JobStatus.COMPLETED,
          progress: 100,
          resultBytes: 42000,
          resultSummary: {
            detections: [
              { label: "face", box: [34, 12, 120, 250], redacted: true, confidence: 0.95 },
              { label: "plate", box: [200, 300, 400, 380], redacted: false, confidence: 0.88 },
              { label: "custom", box: [500, 600, 700, 660], redacted: true },
            ],
            imageSize: [1920, 1080],
            boxes: 2,
            redaction: { style: "blur", strength: 20, padding: 0.1 },
            processingTimeMs: 45,
          },
        }),
      );

      // 2. Old row's result and input objects deleted
      expect(deleteObjSpy).toHaveBeenCalledWith(RESULTS_BUCKET, completedJob.outputKey);
      expect(deleteObjSpy).toHaveBeenCalledWith(UPLOADS_BUCKET, completedJob.inputKey);

      // 3. Old DB row deleted
      expect(deleteJobSpy).toHaveBeenCalledWith(jobId);

      // 4. replacesJobId cleared on new row
      expect(clearReplacesSpy).toHaveBeenCalledWith(editJobId);
    });

    it("FAILED event leaves old row and its result intact", async () => {
      const editJobId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
      const editJobRow = {
        id: editJobId,
        batchId,
        originalFilename: "sample.jpg",
        inputKey: `${batchId}/${editJobId}/input.jpg`,
        outputKey: `${batchId}/${editJobId}/result.jpg`,
        inputBytes: 50000,
        resultBytes: null,
        status: JobStatus.PROCESSING,
        progress: 50,
        stage: "RENDERING",
        resultSummary: { detections: [] },
        error: null,
        whitelistRefs: [],
        replacesJobId: jobId,
        createdAt: new Date("2026-11-09T09:10:00Z"),
        updatedAt: new Date("2026-11-09T09:10:00Z"),
      };

      vi.spyOn(jobRepository, "getJob").mockImplementation(async (id: string) => {
        if (id === editJobId) return editJobRow as any;
        if (id === jobId) return completedJob as any;
        return null;
      });

      const updateJobStateSpy = vi.spyOn(jobRepository, "updateJobState").mockResolvedValue();
      const deleteJobSpy = vi.spyOn(jobRepository, "deleteJob").mockResolvedValue();
      const deleteObjSpy = vi.spyOn(storage, "deleteObject").mockResolvedValue();
      const clearReplacesSpy = vi.spyOn(jobRepository, "clearJobReplacesJobId").mockResolvedValue();

      await applyJobEvent({
        jobId: editJobId,
        status: "FAILED",
        progress: 50,
        error: { code: "INVALID_INPUT_FILE", message: "Corrupted input file" },
        timestamp: "2026-11-09T09:11:00Z",
      });

      expect(updateJobStateSpy).toHaveBeenCalledWith(
        editJobId,
        expect.objectContaining({
          status: JobStatus.FAILED,
          error: { code: "INVALID_INPUT_FILE", message: "Corrupted input file" },
        }),
      );

      // Old row and objects untouched
      expect(deleteJobSpy).not.toHaveBeenCalled();
      expect(deleteObjSpy).not.toHaveBeenCalled();
      expect(clearReplacesSpy).not.toHaveBeenCalled();
    });
  });

  describe("4. Error validation and guards", () => {
    it("returns 404 for another user's job or non-existent job", async () => {
      vi.spyOn(jobRepository, "getJobOwnedByUser").mockResolvedValue(null);

      await expect(
        editJob(jobId, otherUserId, {
          redactIndices: [0],
          addedBoxes: [],
        }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it("returns 409 JOB_NOT_EDITABLE for non-COMPLETED job", async () => {
      vi.spyOn(jobRepository, "getJobOwnedByUser").mockResolvedValue({
        ...completedJob,
        status: JobStatus.PROCESSING,
      } as any);
      vi.spyOn(jobRepository, "getActiveEditJob").mockResolvedValue(null);

      await expect(
        editJob(jobId, userId, {
          redactIndices: [0],
          addedBoxes: [],
        }),
      ).rejects.toMatchObject({ status: 409, code: "JOB_NOT_EDITABLE" });
    });

    it("returns active running edit row if second edit is called while one is already running", async () => {
      const activeRunningEdit = {
        id: "active-edit-id",
        batchId,
        originalFilename: "sample.jpg",
        inputKey: `${batchId}/active-edit-id/input.jpg`,
        outputKey: `${batchId}/active-edit-id/result.jpg`,
        inputBytes: 50000,
        resultBytes: null,
        status: JobStatus.PROCESSING,
        progress: 45,
        stage: "RENDERING",
        resultSummary: { detections: [] },
        error: null,
        replacesJobId: jobId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.spyOn(jobRepository, "getJobOwnedByUser").mockResolvedValue(completedJob as any);
      vi.spyOn(jobRepository, "getActiveEditJob").mockResolvedValue(activeRunningEdit as any);
      const copySpy = vi.spyOn(storage, "copyObject").mockResolvedValue();

      const result = await editJob(jobId, userId, {
        redactIndices: [0],
        addedBoxes: [],
      });

      expect(result.id).toBe("active-edit-id");
      expect(result.status).toBe(JobStatus.PROCESSING);
      // Did not attempt to create another copy or job
      expect(copySpy).not.toHaveBeenCalled();
    });

    it("returns 400 for out-of-range detection index", async () => {
      vi.spyOn(jobRepository, "getJobOwnedByUser").mockResolvedValue(completedJob as any);
      vi.spyOn(jobRepository, "getActiveEditJob").mockResolvedValue(null);
      vi.spyOn(storage, "objectExists").mockResolvedValue(true);

      // completedJob has 3 detections (indices 0, 1, 2); index 3 is out of range
      await expect(
        editJob(jobId, userId, {
          redactIndices: [3],
          addedBoxes: [],
        }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it("returns 410 INPUT_EXPIRED if original input object is gone", async () => {
      vi.spyOn(jobRepository, "getJobOwnedByUser").mockResolvedValue(completedJob as any);
      vi.spyOn(jobRepository, "getActiveEditJob").mockResolvedValue(null);
      vi.spyOn(storage, "objectExists").mockResolvedValue(false);

      await expect(
        editJob(jobId, userId, {
          redactIndices: [0],
          addedBoxes: [],
        }),
      ).rejects.toMatchObject({ status: 410, code: "INPUT_EXPIRED" });
    });

    it("refuses retry of an edit row with 400 JOB_NOT_RETRYABLE", async () => {
      const failedEditJob = {
        ...completedJob,
        status: JobStatus.FAILED,
        replacesJobId: "original-job-id",
      };
      vi.spyOn(jobRepository, "getJobOwnedByUser").mockResolvedValue(failedEditJob as any);

      await expect(retryFailedJob(jobId, userId)).rejects.toMatchObject({
        status: 400,
        code: "JOB_NOT_RETRYABLE",
      });
    });
  });

  describe("5. Controller & Zod validation", () => {
    it("handles POST /api/jobs/:id/edit returning 201 with job DTO", async () => {
      vi.spyOn(jobRepository, "getJobOwnedByUser").mockResolvedValue(completedJob as any);
      vi.spyOn(jobRepository, "getActiveEditJob").mockResolvedValue(null);
      vi.spyOn(jobRepository, "getBatch").mockResolvedValue(defaultBatch as any);
      vi.spyOn(storage, "objectExists").mockResolvedValue(true);
      vi.spyOn(storage, "copyObject").mockResolvedValue();

      let insertedJob: any = null;
      vi.spyOn(jobRepository, "insertEditJob").mockImplementation(async (data: any) => {
        insertedJob = {
          ...data,
          status: JobStatus.PENDING,
          progress: 0,
          stage: null,
          error: null,
          whitelistRefs: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        return insertedJob;
      });
      vi.spyOn(messaging, "publishJob").mockResolvedValue();
      vi.spyOn(jobRepository, "updateJobQueued").mockResolvedValue();
      vi.spyOn(jobRepository, "getJob").mockImplementation(async (id: string) => {
        if (insertedJob && id === insertedJob.id) {
          return {
            ...insertedJob,
            status: JobStatus.QUEUED,
          };
        }
        return null;
      });

      const req = {
        params: { id: jobId },
        authUser: { id: userId, email: "user@example.com" },
        body: {
          redactIndices: [0],
          addedBoxes: [{ box: [100, 200, 300, 400] }],
          style: "blur",
          strength: 25,
          padding: 0.1,
        },
      } as unknown as Request;

      const jsonMock = vi.fn();
      const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
      const res = {
        status: statusMock,
        json: jsonMock,
      } as unknown as Response;
      const next = vi.fn();

      await editJobHandler(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          job: expect.objectContaining({
            id: insertedJob.id,
            replacesJobId: jobId,
          }),
        }),
      );
    });

    it("rejects bad box coordinates (x1 >= x2) with validation error in controller", async () => {
      const req = {
        params: { id: jobId },
        authUser: { id: userId, email: "user@example.com" },
        body: {
          redactIndices: [0],
          addedBoxes: [{ box: [300, 200, 100, 400] }], // x1 > x2 is invalid!
        },
      } as unknown as Request;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      await editJobHandler(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "ZodError",
        }),
      );
    });
  });
});
