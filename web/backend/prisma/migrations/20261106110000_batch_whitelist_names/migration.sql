-- AlterTable
ALTER TABLE "batches" ADD COLUMN "whitelist_names" JSONB NOT NULL DEFAULT '{}';
