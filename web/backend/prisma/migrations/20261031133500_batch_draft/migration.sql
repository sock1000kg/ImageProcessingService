-- AlterTable
ALTER TABLE "batches" ADD COLUMN "started_at" TIMESTAMPTZ;

-- Backfill existing rows so old batches are not drafts
UPDATE "batches" SET "started_at" = "created_at" WHERE "started_at" IS NULL;
