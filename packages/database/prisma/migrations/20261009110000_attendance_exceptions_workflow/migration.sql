-- AlterEnum
ALTER TYPE "AttendanceExceptionType" ADD VALUE 'LATE_ARRIVAL';
ALTER TYPE "AttendanceExceptionType" ADD VALUE 'EARLY_DEPARTURE';
ALTER TYPE "AttendanceExceptionType" ADD VALUE 'INVALID_STATE';
ALTER TYPE "AttendanceExceptionType" ADD VALUE 'PENDING_CORRECTION';
ALTER TYPE "AttendanceExceptionType" ADD VALUE 'SUSPICIOUS_REPEATED_ATTEMPTS';

-- AlterTable
ALTER TABLE "attendance_exceptions" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'OPEN';
ALTER TABLE "attendance_exceptions" ADD COLUMN "resolutionNotes" TEXT;
ALTER TABLE "attendance_exceptions" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "attendance_exceptions_idempotencyKey_key" ON "attendance_exceptions"("idempotencyKey");

-- CreateIndex
CREATE INDEX "attendance_exceptions_status_idx" ON "attendance_exceptions"("status");

-- CreateIndex
CREATE INDEX "attendance_exceptions_idempotencyKey_idx" ON "attendance_exceptions"("idempotencyKey");
