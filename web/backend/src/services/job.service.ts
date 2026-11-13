/**
 * Single-job operations: read, delete, retry a failed job, and edit (re-render) a finished image.
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "../config";
import {
  countJobsByBatchId,
  deleteJob,
  getActiveEditJob,
  getActiveRetryJob,
  getBatch,
  getJob,
  getJobOwnedByUser,
  insertEditJob,
  insertRetryJob,
  updateJobQueued,
} from "../repositories/job.repository";
import { publishJob } from "../messaging";
import { RESULTS_BUCKET, storage, UPLOADS_BUCKET } from "../storage";
import { JobStatus } from "../generated/prisma/client";
import { buildImageRedactCommand, buildImageRenderCommand, RenderBox, resolveOutputExtension } from "../domain";
import { DEFAULT_REDACTION_STRENGTHS, EditJobInput, JobResponseDTO, parseBatchConfigJson, toJobResponse } from "../dto";
import { badRequest, conflict, gone, notFound, unavailable } from "../errors";
import { deleteBatchById } from "./batch.service";
import { checkAndCleanBatchWhitelist } from "./retention.service";

export async function deleteJobById(id: string, userId: string): Promise<void> {
  const job = await getJobOwnedByUser(id, userId);
  if (!job) {
    throw notFound("Job not found");
  }

  if (job.status === JobStatus.QUEUED || job.status === JobStatus.PROCESSING) {
    throw conflict("Cannot delete an active job", "JOB_ACTIVE");
  }

  try {
    await storage.deleteObject(UPLOADS_BUCKET, job.inputKey);
  } catch (err) {
    console.error(`Failed to delete input object ${job.inputKey}`, err);
  }

  try {
    await storage.deleteObject(RESULTS_BUCKET, job.outputKey);
  } catch (err) {
    console.error(`Failed to delete result object ${job.outputKey}`, err);
  }

  const totalJobs = await countJobsByBatchId(job.batchId);
  if (totalJobs <= 1) {
    await deleteBatchById(job.batchId, userId);
  } else {
    await deleteJob(job.id);
    await checkAndCleanBatchWhitelist(job.batchId);
  }
}

export async function getJobById(id: string, userId: string): Promise<JobResponseDTO | null> {
  const job = await getJobOwnedByUser(id, userId);
  return toJobResponse(job);
}

export async function retryFailedJob(
  id: string,
  userId: string,
  options?: { acceptMissingFaces?: boolean },
): Promise<JobResponseDTO> {
  const failedJob = await getJobOwnedByUser(id, userId);
  if (!failedJob) {
    throw gone("Job not found or its batch has expired", "JOB_EXPIRED");
  }
  // Why edit guard: Re-running image-redact on an edit job would discard user-drawn boxes and overrides.
  if (failedJob.replacesJobId) {
    throw badRequest("Edit jobs cannot be retried", "JOB_NOT_RETRYABLE");
  }
  if (failedJob.status !== JobStatus.FAILED) {
    throw badRequest("Only FAILED jobs can be retried", "JOB_NOT_FAILED");
  }

  const batch = await getBatch(failedJob.batchId);
  if (!batch) {
    throw gone("Batch has expired", "BATCH_EXPIRED");
  }
  if (!(await storage.objectExists(UPLOADS_BUCKET, failedJob.inputKey))) {
    throw gone("Original input has expired and cannot be retried", "INPUT_EXPIRED");
  }

  const activeRetry = await getActiveRetryJob(failedJob);
  if (activeRetry) {
    return toJobResponse(activeRetry)!;
  }

  const survivingKeys: string[] = [];
  for (const whitelistKey of batch.whitelistKeys) {
    if (await storage.objectExists(UPLOADS_BUCKET, whitelistKey)) {
      survivingKeys.push(whitelistKey);
    }
  }

  const missingCount = batch.whitelistKeys.length - survivingKeys.length;
  if (missingCount > 0 && !options?.acceptMissingFaces) {
    throw conflict("Some allow list faces are no longer available", "WHITELIST_FACES_MISSING", {
      missing: missingCount,
      total: batch.whitelistKeys.length,
    });
  }

  const whitelistRefs =
    survivingKeys.length < batch.whitelistKeys.length
      ? survivingKeys.map((key) => batch.whitelistKeys.indexOf(key))
      : [];

  const batchConfig = parseBatchConfigJson(batch.config);
  const retryJobId = randomUUID();
  const retryJob = {
    id: retryJobId,
    batchId: failedJob.batchId,
    originalFilename: failedJob.originalFilename,
    inputKey: failedJob.inputKey,
    outputKey: `${failedJob.batchId}/${retryJobId}/result.${resolveOutputExtension(
      batchConfig.format,
      failedJob.originalFilename,
    )}`,
    inputBytes: failedJob.inputBytes,
    whitelistRefs,
  };
  await insertRetryJob(retryJob);

  try {
    const command = buildImageRedactCommand({
      jobId: retryJob.id,
      batchId: retryJob.batchId,
      inputKey: retryJob.inputKey,
      outputKey: retryJob.outputKey,
      config: batchConfig,
      whitelistKeys: survivingKeys,
    });
    await publishJob("jobs.image", command);
    await updateJobQueued(retryJob.id);
  } catch (error) {
    await deleteJob(retryJob.id);
    console.error(`Failed to publish retry command for job ${id}`, error);
    throw unavailable("Job queue is unavailable");
  }

  const createdRetry = await getJob(retryJob.id);
  if (!createdRetry) {
    throw unavailable("Retry job could not be created");
  }
  return toJobResponse(createdRetry)!;
}

/**
 * Re-renders a completed image job with modified bounding boxes and redaction options per Contract §2C.
 *
 * Why new Job row with replacesJobId: The original result remains accessible and intact until the new render
 * successfully completes. Once completed, the old row and storage objects are cleaned up in-place.
 */
export async function editJob(id: string, userId: string, input: EditJobInput): Promise<JobResponseDTO> {
  const job = await getJobOwnedByUser(id, userId);
  if (!job) {
    throw notFound("Job not found");
  }

  // Why active check: Returns running edit without creating duplicate workers or redundant storage objects.
  const activeEdit = await getActiveEditJob(job.id);
  if (activeEdit) {
    return toJobResponse(activeEdit)!;
  }

  if (job.status !== JobStatus.COMPLETED) {
    throw conflict("Only COMPLETED jobs can be edited", "JOB_NOT_EDITABLE");
  }

  if (!(await storage.objectExists(UPLOADS_BUCKET, job.inputKey))) {
    throw gone("Original input has expired and cannot be edited", "INPUT_EXPIRED");
  }

  const existingDetections = Array.isArray((job.resultSummary as Record<string, unknown> | null)?.detections)
    ? ((job.resultSummary as Record<string, unknown>).detections as Array<Record<string, unknown>>)
    : [];

  for (const idx of input.redactIndices) {
    if (idx < 0 || idx >= existingDetections.length) {
      throw badRequest(
        `Index ${idx} is out of range of detections (0-${Math.max(0, existingDetections.length - 1)})`,
        "INDEX_OUT_OF_RANGE",
      );
    }
  }

  const batch = await getBatch(job.batchId);
  if (!batch) {
    throw gone("Batch has expired", "BATCH_EXPIRED");
  }
  const batchConfig = parseBatchConfigJson(batch.config);

  const effectiveStyle = input.style ?? batchConfig.style;
  const effectivePadding = input.padding ?? batchConfig.padding;

  let effectiveStrength: number | undefined;
  if (effectiveStyle === "blackout") {
    effectiveStrength = undefined;
  } else if (input.strength !== undefined) {
    effectiveStrength = input.strength;
  } else if (input.style !== undefined && input.style !== batchConfig.style) {
    // Style changed without explicit strength: fallback to style defaults from Contract §2
    effectiveStrength = DEFAULT_REDACTION_STRENGTHS[input.style as "blur" | "pixelate"];
  } else {
    // Inherit batch config strength
    effectiveStrength = batchConfig.strength;
  }

  // Validate strength against effective style range (task 85 / Contract §2)
  if (effectiveStrength !== undefined) {
    if (effectiveStyle === "blur" && (effectiveStrength < 1 || effectiveStrength > 50)) {
      throw badRequest("Strength for blur style must be between 1 and 50", "VALIDATION_ERROR");
    }
    if (effectiveStyle === "pixelate" && (effectiveStrength < 3 || effectiveStrength > 32)) {
      throw badRequest("Strength for pixelate style must be between 3 and 32", "VALIDATION_ERROR");
    }
  }

  const uniqueRedactIndices = Array.from(new Set(input.redactIndices));
  const engineBoxes: RenderBox[] = [];

  for (const idx of uniqueRedactIndices) {
    const det = existingDetections[idx];
    const rawBox = Array.isArray(det.box) && det.box.length === 4 ? det.box : null;
    if (!rawBox) {
      throw badRequest(`Detection at index ${idx} is missing bounding box`, "INVALID_DETECTION");
    }
    const box: [number, number, number, number] = [
      Number(rawBox[0]),
      Number(rawBox[1]),
      Number(rawBox[2]),
      Number(rawBox[3]),
    ];
    const label = typeof det.label === "string" ? det.label : "custom";
    engineBoxes.push({ label, box });
  }

  for (const added of input.addedBoxes) {
    engineBoxes.push({
      label: "custom",
      box: added.box,
    });
  }

  const redactSet = new Set(input.redactIndices);
  const resultingDetections: Array<Record<string, unknown>> = existingDetections.map((det, idx) => ({
    ...det,
    redacted: redactSet.has(idx),
  }));

  for (const added of input.addedBoxes) {
    resultingDetections.push({
      label: "custom",
      box: added.box,
      redacted: true,
    });
  }

  const newJobId = randomUUID();
  const ext = path.extname(job.originalFilename).toLowerCase() || path.extname(job.inputKey).toLowerCase() || ".jpg";
  const destInputKey = `${job.batchId}/${newJobId}/input${ext}`;
  const outExt = resolveOutputExtension(batchConfig.format, job.originalFilename);
  const destOutputKey = `${job.batchId}/${newJobId}/result.${outExt}`;

  await storage.copyObject(UPLOADS_BUCKET, job.inputKey, destInputKey);

  await insertEditJob({
    id: newJobId,
    batchId: job.batchId,
    originalFilename: job.originalFilename,
    inputKey: destInputKey,
    outputKey: destOutputKey,
    inputBytes: job.inputBytes,
    replacesJobId: job.id,
    resultSummary: {
      detections: resultingDetections,
    },
  });

  try {
    const command = buildImageRenderCommand({
      jobId: newJobId,
      batchId: job.batchId,
      inputKey: destInputKey,
      outputKey: destOutputKey,
      redaction: {
        style: effectiveStyle,
        strength: effectiveStrength,
        padding: effectivePadding,
      },
      quality: batchConfig.quality,
      boxes: engineBoxes,
    });
    await publishJob("jobs.image", command);
    await updateJobQueued(newJobId);
  } catch (error) {
    await deleteJob(newJobId);
    try {
      await storage.deleteObject(UPLOADS_BUCKET, destInputKey);
    } catch (cleanupErr) {
      console.error(`Failed to cleanup copied input ${destInputKey}`, cleanupErr);
    }
    console.error(`Failed to publish image-render command for job ${job.id}`, error);
    throw unavailable("Job queue is unavailable");
  }

  const createdEdit = await getJob(newJobId);
  if (!createdEdit) {
    throw unavailable("Edit job could not be created");
  }
  return toJobResponse(createdEdit)!;
}
