-- CreateEnum
CREATE TYPE "ParticipantStatus" AS ENUM ('ENROLLED', 'EXEMPTED', 'WITHDRAWN', 'COMPLETED');

-- AlterTable
ALTER TABLE "review_cycles" ADD COLUMN     "eligibleEmploymentStatuses" JSONB,
ADD COLUMN     "instructions" TEXT,
ADD COLUMN     "joiningDateCutoff" TIMESTAMP(3),
ADD COLUMN     "ratingScaleRubric" JSONB,
ADD COLUMN     "reopenReason" TEXT,
ADD COLUMN     "reopenedAt" TIMESTAMP(3),
ADD COLUMN     "reopenedById" TEXT,
ADD COLUMN     "templateVersion" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "review_cycle_participants" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "managerId" TEXT,
    "departmentId" TEXT,
    "branchId" TEXT,
    "designationId" TEXT,
    "status" "ParticipantStatus" NOT NULL DEFAULT 'ENROLLED',
    "exemptionReason" TEXT,
    "policySnapshot" JSONB,
    "managerReassignedAt" TIMESTAMP(3),
    "previousManagerId" TEXT,
    "reassignmentReason" TEXT,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_cycle_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_cycle_histories" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changeReason" TEXT,
    "previousState" JSONB,
    "newState" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_cycle_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "review_cycle_participants_cycleId_status_idx" ON "review_cycle_participants"("cycleId", "status");

-- CreateIndex
CREATE INDEX "review_cycle_participants_employeeId_idx" ON "review_cycle_participants"("employeeId");

-- CreateIndex
CREATE INDEX "review_cycle_participants_managerId_idx" ON "review_cycle_participants"("managerId");

-- CreateIndex
CREATE UNIQUE INDEX "review_cycle_participants_cycleId_employeeId_key" ON "review_cycle_participants"("cycleId", "employeeId");

-- CreateIndex
CREATE INDEX "review_cycle_histories_cycleId_idx" ON "review_cycle_histories"("cycleId");

-- CreateIndex
CREATE INDEX "review_cycle_histories_createdAt_idx" ON "review_cycle_histories"("createdAt");

-- AddForeignKey
ALTER TABLE "review_cycle_participants" ADD CONSTRAINT "review_cycle_participants_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "review_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_cycle_participants" ADD CONSTRAINT "review_cycle_participants_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_cycle_participants" ADD CONSTRAINT "review_cycle_participants_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_cycle_histories" ADD CONSTRAINT "review_cycle_histories_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "review_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

