-- CreateEnum
CREATE TYPE "PayrollExceptionSeverity" AS ENUM ('BLOCKING_ERROR', 'WARNING', 'INFORMATION');

-- CreateEnum
CREATE TYPE "PayrollExceptionCategory" AS ENUM (
  'MISSING_COMPENSATION',
  'UNRESOLVED_ATTENDANCE',
  'ANOMALY_SALARY_SPIKE',
  'ANOMALY_SALARY_DROP',
  'NEGATIVE_NET_PAY',
  'MISSING_BANK_DETAILS',
  'MISSING_TAX_IDENTIFIER',
  'CALCULATION_DISCREPANCY',
  'LATE_SOURCE_CHANGE',
  'POLICY_VIOLATION'
);

-- CreateEnum
CREATE TYPE "PayrollExceptionStatus" AS ENUM ('OPEN', 'RESOLVED', 'OVERRIDDEN', 'DISMISSED');

-- CreateTable
CREATE TABLE "payroll_exceptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "employeeId" TEXT,
    "snapshotId" TEXT,
    "severity" "PayrollExceptionSeverity" NOT NULL DEFAULT 'WARNING',
    "category" "PayrollExceptionCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "sourceRecordType" TEXT,
    "sourceRecordId" TEXT,
    "ruleName" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calculationVersion" INTEGER NOT NULL DEFAULT 1,
    "status" "PayrollExceptionStatus" NOT NULL DEFAULT 'OPEN',
    "resolutionAction" TEXT,
    "resolutionNotes" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payroll_exceptions_organizationId_status_idx" ON "payroll_exceptions"("organizationId", "status");

-- CreateIndex
CREATE INDEX "payroll_exceptions_payrollRunId_severity_idx" ON "payroll_exceptions"("payrollRunId", "severity");

-- CreateIndex
CREATE INDEX "payroll_exceptions_payrollRunId_status_idx" ON "payroll_exceptions"("payrollRunId", "status");

-- CreateIndex
CREATE INDEX "payroll_exceptions_employeeId_idx" ON "payroll_exceptions"("employeeId");

-- CreateIndex
CREATE INDEX "payroll_exceptions_category_idx" ON "payroll_exceptions"("category");

-- AddForeignKey
ALTER TABLE "payroll_exceptions" ADD CONSTRAINT "payroll_exceptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_exceptions" ADD CONSTRAINT "payroll_exceptions_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_exceptions" ADD CONSTRAINT "payroll_exceptions_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_exceptions" ADD CONSTRAINT "payroll_exceptions_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "employee_payroll_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_exceptions" ADD CONSTRAINT "payroll_exceptions_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
