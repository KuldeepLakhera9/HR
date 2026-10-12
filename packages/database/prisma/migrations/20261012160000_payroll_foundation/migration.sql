-- CreateEnum
CREATE TYPE "ComponentType" AS ENUM ('EARNING', 'DEDUCTION');

-- CreateEnum
CREATE TYPE "ComponentCalculationType" AS ENUM ('FLAT_AMOUNT', 'PERCENTAGE_OF_BASIC', 'PERCENTAGE_OF_GROSS', 'FORMULA');

-- CreateEnum
CREATE TYPE "PayrollPeriodStatus" AS ENUM ('UPCOMING', 'OPEN', 'PROCESSING', 'COMPLETED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'CALCULATING', 'CALCULATED', 'REVIEW_PENDING', 'APPROVED', 'LOCKED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AdjustmentType" AS ENUM ('BONUS', 'ARREAR', 'OVERTIME', 'INCENTIVE', 'REIMBURSEMENT', 'DEDUCTION_OTHER', 'ADVANCE_RECOVERY');

-- CreateEnum
CREATE TYPE "AdjustmentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PROCESSED');

-- CreateEnum
CREATE TYPE "PayslipStatus" AS ENUM ('GENERATED', 'PUBLISHED', 'WITHHELD');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PROCESSING', 'PAID', 'FAILED');

-- CreateTable
CREATE TABLE "salary_components" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "ComponentType" NOT NULL,
    "calculationType" "ComponentCalculationType" NOT NULL,
    "formula" TEXT,
    "isTaxable" BOOLEAN NOT NULL DEFAULT true,
    "isStatutory" BOOLEAN NOT NULL DEFAULT false,
    "isProRataApplicable" BOOLEAN NOT NULL DEFAULT true,
    "affectsNetSalary" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "salary_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_structures" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "salary_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_structure_items" (
    "id" TEXT NOT NULL,
    "structureId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "calculationType" "ComponentCalculationType" NOT NULL,
    "amountOrPercentage" DECIMAL(12,4) NOT NULL,
    "formula" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_structure_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_compensations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "structureId" TEXT NOT NULL,
    "ctcAnnual" DECIMAL(14,2) NOT NULL,
    "grossMonthly" DECIMAL(14,2) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "reason" TEXT,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "employee_compensations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_compensation_items" (
    "id" TEXT NOT NULL,
    "compensationId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "monthlyAmount" DECIMAL(12,2) NOT NULL,
    "annualAmount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_compensation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_periods" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "totalDays" INTEGER NOT NULL,
    "payoutDate" TIMESTAMP(3),
    "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "runNumber" INTEGER NOT NULL DEFAULT 1,
    "scope" TEXT NOT NULL DEFAULT 'ALL',
    "calculationVersion" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "totalEmployees" INTEGER NOT NULL DEFAULT 0,
    "totalGross" DECIMAL(14,2) NOT NULL DEFAULT 0.0,
    "totalDeductions" DECIMAL(14,2) NOT NULL DEFAULT 0.0,
    "totalNet" DECIMAL(14,2) NOT NULL DEFAULT 0.0,
    "calculatedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lockedById" TEXT,
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "calculationLog" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_approval_histories" (
    "id" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "comments" TEXT,
    "previousStatus" "PayrollRunStatus",
    "newStatus" "PayrollRunStatus" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_approval_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_adjustments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "payrollRunId" TEXT,
    "type" "AdjustmentType" NOT NULL,
    "title" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "isTaxable" BOOLEAN NOT NULL DEFAULT true,
    "status" "AdjustmentStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "supportingDocKey" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_payroll_snapshots" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "payslipNumber" TEXT NOT NULL,
    "payslipStatus" "PayslipStatus" NOT NULL DEFAULT 'GENERATED',
    "publishedAt" TIMESTAMP(3),
    "employeeCode" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "departmentName" TEXT,
    "designationTitle" TEXT,
    "branchName" TEXT,
    "bankName" TEXT,
    "bankAccountMasked" TEXT,
    "panMasked" TEXT,
    "pfUan" TEXT,
    "calendarDays" DECIMAL(5,2) NOT NULL,
    "workingDays" DECIMAL(5,2) NOT NULL,
    "paidDays" DECIMAL(5,2) NOT NULL,
    "lopDays" DECIMAL(5,2) NOT NULL,
    "baseMonthlyGross" DECIMAL(12,2) NOT NULL,
    "earnedGross" DECIMAL(12,2) NOT NULL,
    "totalDeductions" DECIMAL(12,2) NOT NULL,
    "netSalary" DECIMAL(12,2) NOT NULL,
    "roundingAdjustment" DECIMAL(5,2) NOT NULL DEFAULT 0.0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "paymentMethod" TEXT,
    "paymentReference" TEXT,
    "paidAt" TIMESTAMP(3),
    "calculationInputSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_payroll_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_items" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "componentId" TEXT,
    "componentCode" TEXT NOT NULL,
    "componentName" TEXT NOT NULL,
    "type" "ComponentType" NOT NULL,
    "standardAmount" DECIMAL(12,2) NOT NULL,
    "earnedAmount" DECIMAL(12,2) NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "salary_components_organizationId_type_idx" ON "salary_components"("organizationId", "type");

-- CreateIndex
CREATE INDEX "salary_components_isActive_idx" ON "salary_components"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "salary_components_organizationId_code_key" ON "salary_components"("organizationId", "code");

-- CreateIndex
CREATE INDEX "salary_structures_organizationId_idx" ON "salary_structures"("organizationId");

-- CreateIndex
CREATE INDEX "salary_structures_isActive_idx" ON "salary_structures"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "salary_structures_organizationId_code_version_key" ON "salary_structures"("organizationId", "code", "version");

-- CreateIndex
CREATE INDEX "salary_structure_items_structureId_idx" ON "salary_structure_items"("structureId");

-- CreateIndex
CREATE INDEX "salary_structure_items_componentId_idx" ON "salary_structure_items"("componentId");

-- CreateIndex
CREATE UNIQUE INDEX "salary_structure_items_structureId_componentId_key" ON "salary_structure_items"("structureId", "componentId");

-- CreateIndex
CREATE INDEX "employee_compensations_organizationId_idx" ON "employee_compensations"("organizationId");

-- CreateIndex
CREATE INDEX "employee_compensations_employeeId_effectiveFrom_effectiveTo_idx" ON "employee_compensations"("employeeId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "employee_compensations_structureId_idx" ON "employee_compensations"("structureId");

-- CreateIndex
CREATE INDEX "employee_compensation_items_compensationId_idx" ON "employee_compensation_items"("compensationId");

-- CreateIndex
CREATE INDEX "employee_compensation_items_componentId_idx" ON "employee_compensation_items"("componentId");

-- CreateIndex
CREATE UNIQUE INDEX "employee_compensation_items_compensationId_componentId_key" ON "employee_compensation_items"("compensationId", "componentId");

-- CreateIndex
CREATE INDEX "payroll_periods_organizationId_status_idx" ON "payroll_periods"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_periods_organizationId_year_month_key" ON "payroll_periods"("organizationId", "year", "month");

-- CreateIndex
CREATE INDEX "payroll_runs_organizationId_status_idx" ON "payroll_runs"("organizationId", "status");

-- CreateIndex
CREATE INDEX "payroll_runs_periodId_idx" ON "payroll_runs"("periodId");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_organizationId_periodId_scope_runNumber_calcul_key" ON "payroll_runs"("organizationId", "periodId", "scope", "runNumber", "calculationVersion");

-- CreateIndex
CREATE INDEX "payroll_approval_histories_payrollRunId_idx" ON "payroll_approval_histories"("payrollRunId");

-- CreateIndex
CREATE INDEX "payroll_approval_histories_actorId_idx" ON "payroll_approval_histories"("actorId");

-- CreateIndex
CREATE INDEX "payroll_adjustments_organizationId_employeeId_idx" ON "payroll_adjustments"("organizationId", "employeeId");

-- CreateIndex
CREATE INDEX "payroll_adjustments_periodId_status_idx" ON "payroll_adjustments"("periodId", "status");

-- CreateIndex
CREATE INDEX "payroll_adjustments_payrollRunId_idx" ON "payroll_adjustments"("payrollRunId");

-- CreateIndex
CREATE INDEX "employee_payroll_snapshots_employeeId_payslipStatus_idx" ON "employee_payroll_snapshots"("employeeId", "payslipStatus");

-- CreateIndex
CREATE INDEX "employee_payroll_snapshots_payrollRunId_idx" ON "employee_payroll_snapshots"("payrollRunId");

-- CreateIndex
CREATE INDEX "employee_payroll_snapshots_organizationId_paymentStatus_idx" ON "employee_payroll_snapshots"("organizationId", "paymentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "employee_payroll_snapshots_payrollRunId_employeeId_key" ON "employee_payroll_snapshots"("payrollRunId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "employee_payroll_snapshots_organizationId_payslipNumber_key" ON "employee_payroll_snapshots"("organizationId", "payslipNumber");

-- CreateIndex
CREATE INDEX "payroll_items_snapshotId_idx" ON "payroll_items"("snapshotId");

-- CreateIndex
CREATE INDEX "payroll_items_componentId_idx" ON "payroll_items"("componentId");

-- AddForeignKey
ALTER TABLE "salary_components" ADD CONSTRAINT "salary_components_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_structure_items" ADD CONSTRAINT "salary_structure_items_structureId_fkey" FOREIGN KEY ("structureId") REFERENCES "salary_structures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_structure_items" ADD CONSTRAINT "salary_structure_items_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "salary_components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_compensations" ADD CONSTRAINT "employee_compensations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_compensations" ADD CONSTRAINT "employee_compensations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_compensations" ADD CONSTRAINT "employee_compensations_structureId_fkey" FOREIGN KEY ("structureId") REFERENCES "salary_structures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_compensation_items" ADD CONSTRAINT "employee_compensation_items_compensationId_fkey" FOREIGN KEY ("compensationId") REFERENCES "employee_compensations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_compensation_items" ADD CONSTRAINT "employee_compensation_items_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "salary_components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "payroll_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_approval_histories" ADD CONSTRAINT "payroll_approval_histories_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_approval_histories" ADD CONSTRAINT "payroll_approval_histories_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "payroll_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_payroll_snapshots" ADD CONSTRAINT "employee_payroll_snapshots_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_payroll_snapshots" ADD CONSTRAINT "employee_payroll_snapshots_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_payroll_snapshots" ADD CONSTRAINT "employee_payroll_snapshots_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "employee_payroll_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "salary_components"("id") ON DELETE SET NULL ON UPDATE CASCADE;

