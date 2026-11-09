-- AlterTable
ALTER TABLE "jobs" ADD COLUMN "replaces_job_id" UUID;

-- CreateIndex
CREATE INDEX "idx_jobs_replaces_job_id" ON "jobs"("replaces_job_id");
