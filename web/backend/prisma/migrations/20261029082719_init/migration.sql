-- CreateEnum
CREATE TYPE "job_status" AS ENUM ('PENDING', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "batches" (
    "id" UUID NOT NULL,
    "config" JSONB NOT NULL,
    "whitelist_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "whitelist_deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "original_filename" TEXT NOT NULL,
    "input_key" TEXT NOT NULL,
    "output_key" TEXT NOT NULL,
    "status" "job_status" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "stage" TEXT,
    "result_url" TEXT,
    "result_summary" JSONB,
    "error" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_batches_created_at" ON "batches"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_jobs_batch_id" ON "jobs"("batch_id");

-- CreateIndex
CREATE INDEX "idx_jobs_status" ON "jobs"("status");

-- CreateIndex
CREATE INDEX "idx_jobs_created_at" ON "jobs"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
