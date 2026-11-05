-- CreateTable
CREATE TABLE "face_lists" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "face_lists_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_face_lists_user_created_at" ON "face_lists"("user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "face_lists" ADD CONSTRAINT "face_lists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
