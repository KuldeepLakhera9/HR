-- AlterTable
ALTER TABLE "performance_reviews" ADD COLUMN "participantId" TEXT,
ADD COLUMN "templateVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "skillsDeveloped" TEXT,
ADD COLUMN "developmentInterests" TEXT,
ADD COLUMN "selfEvidenceAttachments" JSONB,
ADD COLUMN "reopenedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "performance_review_items" ADD COLUMN "selfEvidenceUrl" TEXT;

-- CreateTable
CREATE TABLE "performance_review_histories" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changeReason" TEXT,
    "previousState" JSONB,
    "newState" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_review_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "performance_reviews_participantId_idx" ON "performance_reviews"("participantId");

-- CreateIndex
CREATE INDEX "performance_review_histories_reviewId_idx" ON "performance_review_histories"("reviewId");

-- CreateIndex
CREATE INDEX "performance_review_histories_createdAt_idx" ON "performance_review_histories"("createdAt");

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "review_cycle_participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_review_histories" ADD CONSTRAINT "performance_review_histories_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "performance_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_review_histories" ADD CONSTRAINT "performance_review_histories_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
