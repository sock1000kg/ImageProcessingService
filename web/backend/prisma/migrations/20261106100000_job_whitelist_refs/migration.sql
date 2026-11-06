-- AlterTable
ALTER TABLE "jobs" ADD COLUMN "whitelist_refs" INTEGER[] NOT NULL DEFAULT '{}';
