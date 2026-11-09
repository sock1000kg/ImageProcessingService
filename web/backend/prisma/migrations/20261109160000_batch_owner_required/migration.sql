-- Delete batches without an owner (jobs cascade automatically)
DELETE FROM "batches" WHERE "user_id" IS NULL;

-- AlterTable
ALTER TABLE "batches" ALTER COLUMN "user_id" SET NOT NULL;

-- DropForeignKey
ALTER TABLE "batches" DROP CONSTRAINT "batches_user_id_fkey";

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
