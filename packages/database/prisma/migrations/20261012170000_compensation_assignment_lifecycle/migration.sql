-- CreateEnum
CREATE TYPE "CompensationStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CompensationChangeReason" AS ENUM ('JOINING', 'ANNUAL_INCREMENT', 'PROMOTION', 'MARKET_CORRECTION', 'ROLE_CHANGE', 'PROBATION_CONFIRMATION', 'SPECIAL_ADJUSTMENT', 'OTHER');

-- AlterTable
ALTER TABLE "employee_compensations"
ADD COLUMN "status" "CompensationStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN "changeReason" "CompensationChangeReason" NOT NULL DEFAULT 'JOINING',
ADD COLUMN "notes" TEXT,
ADD COLUMN "createdById" TEXT,
ADD COLUMN "approvedById" TEXT,
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "rejectionReason" TEXT;

-- CreateIndex
CREATE INDEX "employee_compensations_status_idx" ON "employee_compensations"("status");

-- CreateIndex
CREATE INDEX "employee_compensations_createdById_idx" ON "employee_compensations"("createdById");

-- CreateIndex
CREATE INDEX "employee_compensations_approvedById_idx" ON "employee_compensations"("approvedById");

-- AddForeignKey
ALTER TABLE "employee_compensations" ADD CONSTRAINT "employee_compensations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_compensations" ADD CONSTRAINT "employee_compensations_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
