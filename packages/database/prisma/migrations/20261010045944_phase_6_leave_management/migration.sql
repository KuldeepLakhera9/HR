-- CreateEnum
CREATE TYPE "LeaveDurationType" AS ENUM ('FULL_DAY', 'FIRST_HALF', 'SECOND_HALF');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LeaveAccrualFrequency" AS ENUM ('ANNUAL', 'MONTHLY', 'QUARTERLY');

-- CreateEnum
CREATE TYPE "LeaveTransactionType" AS ENUM ('OPENING_GRANT', 'ACCRUAL', 'RESERVATION', 'RELEASE_RESERVATION', 'CONSUMPTION', 'REVERSAL', 'MANUAL_ADJUSTMENT', 'EXPIRY');

-- AlterTable
ALTER TABLE "attendance_daily_summaries" ADD COLUMN     "leaveRequestId" TEXT;

-- CreateTable
CREATE TABLE "holidays" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "year" INTEGER NOT NULL,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_types" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#d97706',
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "allowHalfDay" BOOLEAN NOT NULL DEFAULT true,
    "requiresDoc" BOOLEAN NOT NULL DEFAULT false,
    "docThresholdDays" INTEGER NOT NULL DEFAULT 2,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_policies" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "annualEntitlement" DECIMAL(5,2) NOT NULL DEFAULT 12.0,
    "accrualFrequency" "LeaveAccrualFrequency" NOT NULL DEFAULT 'ANNUAL',
    "carryForwardLimit" DECIMAL(5,2) NOT NULL DEFAULT 0.0,
    "maxConsecutiveDays" INTEGER,
    "minNoticeDays" INTEGER NOT NULL DEFAULT 0,
    "countWeekendsAsLeave" BOOLEAN NOT NULL DEFAULT false,
    "countHolidaysAsLeave" BOOLEAN NOT NULL DEFAULT false,
    "allowNegativeBalance" BOOLEAN NOT NULL DEFAULT false,
    "maxNegativeBalance" DECIMAL(5,2) NOT NULL DEFAULT 0.0,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_leave_policy_assignments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leavePolicyId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_leave_policy_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_balance_accounts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "leaveYear" INTEGER NOT NULL,
    "openingBalance" DECIMAL(5,2) NOT NULL DEFAULT 0.0,
    "accruedBalance" DECIMAL(5,2) NOT NULL DEFAULT 0.0,
    "allocatedBalance" DECIMAL(5,2) NOT NULL DEFAULT 0.0,
    "usedBalance" DECIMAL(5,2) NOT NULL DEFAULT 0.0,
    "pendingBalance" DECIMAL(5,2) NOT NULL DEFAULT 0.0,
    "closingBalance" DECIMAL(5,2) NOT NULL DEFAULT 0.0,
    "lastReconciledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_balance_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_balance_transactions" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "leaveRequestId" TEXT,
    "transactionType" "LeaveTransactionType" NOT NULL,
    "amount" DECIMAL(5,2) NOT NULL,
    "balanceAfter" DECIMAL(5,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_balance_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "leaveYear" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "durationType" "LeaveDurationType" NOT NULL DEFAULT 'FULL_DAY',
    "chargeableDays" DECIMAL(4,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "attachmentUrl" TEXT,
    "attachmentName" TEXT,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "cancellationReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_approvals" (
    "id" TEXT NOT NULL,
    "leaveRequestId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "comments" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "holidays_organizationId_year_idx" ON "holidays"("organizationId", "year");

-- CreateIndex
CREATE INDEX "holidays_organizationId_date_idx" ON "holidays"("organizationId", "date");

-- CreateIndex
CREATE INDEX "holidays_branchId_idx" ON "holidays"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_organizationId_branchId_date_key" ON "holidays"("organizationId", "branchId", "date");

-- CreateIndex
CREATE INDEX "leave_types_organizationId_idx" ON "leave_types"("organizationId");

-- CreateIndex
CREATE INDEX "leave_types_isActive_idx" ON "leave_types"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_organizationId_code_key" ON "leave_types"("organizationId", "code");

-- CreateIndex
CREATE INDEX "leave_policies_organizationId_idx" ON "leave_policies"("organizationId");

-- CreateIndex
CREATE INDEX "leave_policies_leaveTypeId_idx" ON "leave_policies"("leaveTypeId");

-- CreateIndex
CREATE INDEX "leave_policies_isActive_idx" ON "leave_policies"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "leave_policies_organizationId_code_key" ON "leave_policies"("organizationId", "code");

-- CreateIndex
CREATE INDEX "employee_leave_policy_assignments_organizationId_idx" ON "employee_leave_policy_assignments"("organizationId");

-- CreateIndex
CREATE INDEX "employee_leave_policy_assignments_employeeId_idx" ON "employee_leave_policy_assignments"("employeeId");

-- CreateIndex
CREATE INDEX "employee_leave_policy_assignments_leavePolicyId_idx" ON "employee_leave_policy_assignments"("leavePolicyId");

-- CreateIndex
CREATE UNIQUE INDEX "employee_leave_policy_assignments_employeeId_leavePolicyId__key" ON "employee_leave_policy_assignments"("employeeId", "leavePolicyId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "leave_balance_accounts_organizationId_idx" ON "leave_balance_accounts"("organizationId");

-- CreateIndex
CREATE INDEX "leave_balance_accounts_employeeId_leaveYear_idx" ON "leave_balance_accounts"("employeeId", "leaveYear");

-- CreateIndex
CREATE INDEX "leave_balance_accounts_leaveTypeId_idx" ON "leave_balance_accounts"("leaveTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "leave_balance_accounts_organizationId_employeeId_leaveTypeI_key" ON "leave_balance_accounts"("organizationId", "employeeId", "leaveTypeId", "leaveYear");

-- CreateIndex
CREATE UNIQUE INDEX "leave_balance_transactions_idempotencyKey_key" ON "leave_balance_transactions"("idempotencyKey");

-- CreateIndex
CREATE INDEX "leave_balance_transactions_accountId_idx" ON "leave_balance_transactions"("accountId");

-- CreateIndex
CREATE INDEX "leave_balance_transactions_leaveRequestId_idx" ON "leave_balance_transactions"("leaveRequestId");

-- CreateIndex
CREATE INDEX "leave_balance_transactions_transactionType_idx" ON "leave_balance_transactions"("transactionType");

-- CreateIndex
CREATE INDEX "leave_balance_transactions_idempotencyKey_idx" ON "leave_balance_transactions"("idempotencyKey");

-- CreateIndex
CREATE INDEX "leave_balance_transactions_createdAt_idx" ON "leave_balance_transactions"("createdAt");

-- CreateIndex
CREATE INDEX "leave_requests_organizationId_status_idx" ON "leave_requests"("organizationId", "status");

-- CreateIndex
CREATE INDEX "leave_requests_employeeId_startDate_endDate_idx" ON "leave_requests"("employeeId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "leave_requests_status_idx" ON "leave_requests"("status");

-- CreateIndex
CREATE INDEX "leave_requests_startDate_endDate_idx" ON "leave_requests"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "leave_approvals_leaveRequestId_idx" ON "leave_approvals"("leaveRequestId");

-- CreateIndex
CREATE INDEX "leave_approvals_approverId_idx" ON "leave_approvals"("approverId");

-- CreateIndex
CREATE INDEX "attendance_daily_summaries_leaveRequestId_idx" ON "attendance_daily_summaries"("leaveRequestId");

-- AddForeignKey
ALTER TABLE "attendance_daily_summaries" ADD CONSTRAINT "attendance_daily_summaries_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "leave_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_policies" ADD CONSTRAINT "leave_policies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_policies" ADD CONSTRAINT "leave_policies_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_leave_policy_assignments" ADD CONSTRAINT "employee_leave_policy_assignments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_leave_policy_assignments" ADD CONSTRAINT "employee_leave_policy_assignments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_leave_policy_assignments" ADD CONSTRAINT "employee_leave_policy_assignments_leavePolicyId_fkey" FOREIGN KEY ("leavePolicyId") REFERENCES "leave_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balance_accounts" ADD CONSTRAINT "leave_balance_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balance_accounts" ADD CONSTRAINT "leave_balance_accounts_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balance_accounts" ADD CONSTRAINT "leave_balance_accounts_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balance_transactions" ADD CONSTRAINT "leave_balance_transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "leave_balance_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balance_transactions" ADD CONSTRAINT "leave_balance_transactions_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "leave_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balance_transactions" ADD CONSTRAINT "leave_balance_transactions_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_approvals" ADD CONSTRAINT "leave_approvals_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "leave_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_approvals" ADD CONSTRAINT "leave_approvals_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
