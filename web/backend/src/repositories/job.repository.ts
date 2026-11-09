/**
 * Database repository managing batches and image jobs with PostgreSQL row-level locks.
 */
import { prisma } from "../db/prisma";
import { config } from "../config";
import { conflict, notFound } from "../errors";
import { BatchConfig } from "../types";
import { JobStatus, Prisma } from "../generated/prisma/client";
import { formatDefaultBatchName } from "../dto";

/**
 * Persists a new draft batch record.
 */
export async function createDraftBatch(batch: {
  id: string;
  userId?: string;
  name: string;
  config: BatchConfig;
  whitelistKeys: string[];
  whitelistNames?: Record<string, string>;
}) {
  return prisma.batch.create({
    data: {
      id: batch.id,
      ...(batch.userId ? { userId: batch.userId } : {}),
      name: batch.name,
      config: batch.config as unknown as Prisma.InputJsonValue,
      whitelistKeys: batch.whitelistKeys,
      whitelistNames: (batch.whitelistNames ?? {}) as unknown as Prisma.InputJsonValue,
      startedAt: null,
    },
  });
}

/**
 * Appends a new image job to a draft batch under a PostgreSQL row lock.
 *
 * Why row lock (`FOR UPDATE`): Concurrent uploads running in parallel workers could otherwise race
 * to read the job count simultaneously and exceed `BATCH_MAX_FILES`, or race against `startBatch` and
 * insert pending jobs after dispatch has completed. The row lock serialises checks and inserts.
 */
export async function addJobToBatchWithLock(
  batchId: string,
  jobData: {
    id: string;
    originalFilename: string;
    inputKey: string;
    outputKey: string;
    inputBytes?: number;
  },
) {
  return prisma.$transaction(async (tx) => {
    // Acquire exclusive row lock on the batch record to prevent race conditions during file addition
    const rows = await tx.$queryRaw<Array<{ id: string; started_at: Date | null }>>`
      SELECT id, started_at FROM batches WHERE id = ${batchId}::uuid FOR UPDATE
    `;
    if (!rows || rows.length === 0) {
      throw notFound("Batch not found");
    }
    const batchRow = rows[0];
    if (batchRow.started_at !== null) {
      throw conflict("Batch has already been started", "BATCH_STARTED");
    }

    const jobCount = await tx.job.count({
      where: { batchId },
    });
    if (jobCount >= config.BATCH_MAX_FILES) {
      throw conflict(`Batch is full: maximum allowed is ${config.BATCH_MAX_FILES} files`, "BATCH_FULL");
    }

    return tx.job.create({
      data: {
        id: jobData.id,
        batchId,
        originalFilename: jobData.originalFilename,
        inputKey: jobData.inputKey,
        outputKey: jobData.outputKey,
        inputBytes: jobData.inputBytes ?? null,
        status: JobStatus.PENDING,
      },
    });
  });
}

export async function setBatchStarted(batchId: string): Promise<void> {
  await prisma.batch.updateMany({
    where: {
      id: batchId,
      startedAt: null,
    },
    data: {
      startedAt: new Date(),
    },
  });
}

export async function getPendingJobsByBatchId(batchId: string) {
  return prisma.job.findMany({
    where: {
      batchId,
      status: JobStatus.PENDING,
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function insertBatchAndJobs(
  batch: {
    id: string;
    name?: string;
    config: BatchConfig;
    whitelistKeys: string[];
  },
  jobs: Array<{
    id: string;
    originalFilename: string;
    inputKey: string;
    outputKey: string;
  }>,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.batch.create({
      data: {
        id: batch.id,
        name: batch.name ?? formatDefaultBatchName(),
        // Prisma InputJsonValue requires casting for structured JSON fields
        config: batch.config as unknown as Prisma.InputJsonValue,
        whitelistKeys: batch.whitelistKeys,
      },
    });

    if (jobs.length > 0) {
      await tx.job.createMany({
        data: jobs.map((job) => ({
          id: job.id,
          batchId: batch.id,
          originalFilename: job.originalFilename,
          inputKey: job.inputKey,
          outputKey: job.outputKey,
          status: JobStatus.PENDING,
        })),
      });
    }
  });
}

export async function updateJobQueued(id: string): Promise<void> {
  await prisma.job.updateMany({
    where: {
      id,
      status: JobStatus.PENDING,
    },
    data: {
      status: JobStatus.QUEUED,
    },
  });
}

export async function getJob(id: string) {
  return prisma.job.findUnique({
    where: { id },
  });
}

export async function getJobOwnedByUser(id: string, userId: string) {
  return prisma.job.findFirst({ where: { id, batch: { userId } } });
}

export async function getActiveRetryJob(job: { id: string; batchId: string; inputKey: string }) {
  return prisma.job.findFirst({
    where: {
      batchId: job.batchId,
      inputKey: job.inputKey,
      id: { not: job.id },
      status: { not: JobStatus.FAILED },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function insertRetryJob(job: {
  id: string;
  batchId: string;
  originalFilename: string;
  inputKey: string;
  outputKey: string;
  inputBytes?: number | null;
  whitelistRefs?: number[];
}) {
  return prisma.job.create({
    data: {
      id: job.id,
      batchId: job.batchId,
      originalFilename: job.originalFilename,
      inputKey: job.inputKey,
      outputKey: job.outputKey,
      inputBytes: job.inputBytes ?? null,
      status: JobStatus.PENDING,
      whitelistRefs: job.whitelistRefs ?? [],
    },
  });
}

export async function deleteJob(id: string): Promise<void> {
  await prisma.job.deleteMany({ where: { id } });
}

export async function getBatch(id: string) {
  return prisma.batch.findUnique({
    where: { id },
  });
}

export async function getBatchOwnedByUser(id: string, userId: string) {
  return prisma.batch.findFirst({ where: { id, userId } });
}

export async function getJobsByBatchId(batchId: string) {
  return prisma.job.findMany({
    where: { batchId },
    orderBy: { createdAt: "asc" },
  });
}

export async function deleteBatchRow(id: string): Promise<boolean> {
  const result = await prisma.batch.deleteMany({
    where: { id },
  });
  return result.count > 0;
}

export async function deleteBatchRowOwnedByUser(id: string, userId: string): Promise<boolean> {
  const result = await prisma.batch.deleteMany({ where: { id, userId } });
  return result.count > 0;
}

export async function updateBatchName(id: string, name: string) {
  return prisma.batch.update({
    where: { id },
    data: { name },
  });
}

export async function countJobsByBatchId(batchId: string): Promise<number> {
  return prisma.job.count({
    where: { batchId },
  });
}

export async function listBatchesByUserId(userId: string, options: { limit: number; cursor?: string }) {
  const query = {
    where: { userId },
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
    take: options.limit + 1,
    include: {
      jobs: {
        select: {
          id: true,
          status: true,
          inputBytes: true,
          resultBytes: true,
          outputKey: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" as const },
      },
    },
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
  };
  try {
    return await prisma.batch.findMany(query);
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === "P2025") {
      return [];
    }
    throw err;
  }
}

export async function getAccountUsage(userId: string): Promise<{ bytes: number; batches: number; jobs: number }> {
  const rows = await prisma.$queryRaw<Array<{ batches: number; jobs: number; bytes: bigint | number }>>`
    SELECT
      COUNT(DISTINCT b.id)::int AS batches,
      COUNT(j.id)::int AS jobs,
      COALESCE(SUM(COALESCE(j.input_bytes, 0) + COALESCE(j.result_bytes, 0)), 0)::bigint AS bytes
    FROM batches b
    LEFT JOIN jobs j ON j.batch_id = b.id
    WHERE b.user_id = ${userId}::uuid
  `;
  const row = rows[0];
  return {
    batches: Number(row?.batches ?? 0),
    jobs: Number(row?.jobs ?? 0),
    bytes: Number(row?.bytes ?? 0),
  };
}

export async function updateJobState(
  jobId: string,
  state: {
    status: JobStatus;
    progress: number;
    stage: string | null;
    resultSummary: Record<string, unknown> | null;
    error: { code: string; message: string } | null;
    resultBytes?: number | null;
  },
): Promise<void> {
  await prisma.job.updateMany({
    where: {
      id: jobId,
      status: { notIn: [JobStatus.COMPLETED, JobStatus.FAILED] },
    },
    data: {
      status: state.status,
      progress: state.progress,
      stage: state.stage,
      // Prisma InputJsonValue requires casting for structured JSON fields
      resultSummary: state.resultSummary ? (state.resultSummary as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
      error: state.error ? (state.error as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
      ...(state.resultBytes !== undefined ? { resultBytes: state.resultBytes } : {}),
    },
  });
}

export async function countNonTerminalJobs(batchId: string): Promise<number> {
  return prisma.job.count({
    where: {
      batchId,
      status: { notIn: [JobStatus.COMPLETED, JobStatus.FAILED] },
    },
  });
}

export async function markBatchWhitelistDeleted(batchId: string): Promise<void> {
  await prisma.batch.updateMany({
    where: {
      id: batchId,
      whitelistDeletedAt: null,
    },
    data: {
      whitelistDeletedAt: new Date(),
    },
  });
}

/**
 * Returns batches whose jobs have all reached terminal state but whose whitelist photos
 * have not yet been successfully deleted from storage.
 *
 * Why query criteria: Draft batches still accept files, and batches with non-terminal jobs
 * still need their reference photos. Only batches that have started, have at least one job,
 * and have no remaining running or queued jobs are eligible for whitelist cleanup retry.
 */
export async function getBatchesPendingWhitelistCleanup(): Promise<Array<{ id: string }>> {
  return prisma.batch.findMany({
    where: {
      startedAt: { not: null },
      whitelistDeletedAt: null,
      jobs: {
        some: {},
        none: {
          status: { notIn: [JobStatus.COMPLETED, JobStatus.FAILED] },
        },
      },
    },
    select: { id: true },
  });
}

export async function getExpiredBatches(retentionDays?: number) {
  const days = retentionDays !== undefined ? retentionDays : config.RETENTION_DAYS;
  if (days !== undefined) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const draftCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    // Abandoned drafts hold private originals nobody can use, so expire them after 24 hours
    // regardless of the retention period configured for completed batches.
    return prisma.batch.findMany({
      where: {
        OR: [{ createdAt: { lt: cutoff } }, { startedAt: null, createdAt: { lt: draftCutoff } }],
      },
      select: { id: true },
    });
  }
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return prisma.batch.findMany({
    where: { startedAt: null, createdAt: { lt: cutoff } },
    select: { id: true },
  });
}

export async function getStats(userId?: string): Promise<Record<string, number>> {
  const groups = await prisma.job.groupBy({
    by: ["status"],
    where: userId ? { batch: { userId } } : undefined,
    _count: { _all: true },
  });
  return Object.fromEntries(groups.map((group) => [group.status, group._count._all]));
}
