import { prisma } from "../db/prisma";
import { BatchConfig } from "../types";
import { JobStatus, Prisma } from "../generated/prisma/client";

export async function insertBatchAndJobs(
  batch: {
    id: string;
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

export async function getActiveRetryJob(job: {
  id: string;
  batchId: string;
  inputKey: string;
}) {
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
}) {
  return prisma.job.create({
    data: {
      id: job.id,
      batchId: job.batchId,
      originalFilename: job.originalFilename,
      inputKey: job.inputKey,
      outputKey: job.outputKey,
      status: JobStatus.PENDING,
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

export async function updateJobState(
  jobId: string,
  state: {
    status: JobStatus;
    progress: number;
    stage: string | null;
    resultUrl: string | null;
    resultSummary: Record<string, unknown> | null;
    error: { code: string; message: string } | null;
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
      resultUrl: state.resultUrl,
      // Prisma InputJsonValue requires casting for structured JSON fields
      resultSummary: state.resultSummary
        ? (state.resultSummary as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      error: state.error ? (state.error as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
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

export async function cleanupExpiredBatches(): Promise<number> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const result = await prisma.batch.deleteMany({
    where: {
      createdAt: { lt: cutoff },
    },
  });
  return result.count;
}

export async function getExpiredBatches() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return prisma.batch.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { id: true },
  });
}

export async function getStats(): Promise<Record<string, number>> {
  const groups = await prisma.job.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  return Object.fromEntries(groups.map((group) => [group.status, group._count._all]));
}
