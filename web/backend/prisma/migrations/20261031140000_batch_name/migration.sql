-- AlterTable: add name column
ALTER TABLE "batches" ADD COLUMN "name" VARCHAR(100);

-- Backfill existing rows
UPDATE "batches"
SET "name" = 'Batch ' || to_char("created_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')
WHERE "name" IS NULL;

-- AlterTable: enforce NOT NULL
ALTER TABLE "batches" ALTER COLUMN "name" SET NOT NULL;
