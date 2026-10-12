-- AlterEnum
ALTER TYPE "PayrollRunStatus" ADD VALUE IF NOT EXISTS 'PUBLISHED';

-- AlterTable
ALTER TABLE "payroll_periods"
ADD COLUMN "cutoffDate" TIMESTAMP(3),
ADD COLUMN "processingDeadline" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "payroll_runs"
ADD COLUMN "scopeConfig" JSONB,
ADD COLUMN "publishedAt" TIMESTAMP(3),
ADD COLUMN "publishedById" TEXT,
ADD COLUMN "parentRunId" TEXT,
ADD COLUMN "correctionReason" TEXT,
ADD COLUMN "exceptionCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "exceptions" JSONB;

-- AlterTable
ALTER TABLE "employee_payroll_snapshots"
ADD COLUMN "isException" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "exceptionReason" TEXT;

-- CreateIndex
CREATE INDEX "payroll_runs_parentRunId_idx" ON "payroll_runs"("parentRunId");

-- CreateIndex
CREATE INDEX "payroll_runs_publishedById_idx" ON "payroll_runs"("publishedById");

-- CreateIndex
CREATE INDEX "employee_payroll_snapshots_payrollRunId_isException_idx" ON "employee_payroll_snapshots"("payrollRunId", "isException");

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_parentRunId_fkey" FOREIGN KEY ("parentRunId") REFERENCES "payroll_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
