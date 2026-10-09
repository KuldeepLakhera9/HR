-- CreateEnum
CREATE TYPE "AttendanceMode" AS ENUM ('OFFICE', 'OFFICIAL_VISIT', 'WFH');

-- CreateEnum
CREATE TYPE "AttendanceEventType" AS ENUM ('CHECK_IN', 'CHECK_OUT', 'BREAK_START', 'BREAK_END');

-- CreateEnum
CREATE TYPE "GeofenceVerificationStatus" AS ENUM ('VERIFIED', 'OUTSIDE_GEOFENCE', 'LOW_ACCURACY', 'EXEMPT', 'FAILED');

-- CreateEnum
CREATE TYPE "AttendanceDayStatus" AS ENUM ('PRESENT', 'HALF_DAY', 'LATE', 'ABSENT', 'ON_LEAVE', 'HOLIDAY', 'WEEKEND_OFF', 'PENDING');

-- CreateEnum
CREATE TYPE "CorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttendanceExceptionType" AS ENUM ('OUTSIDE_GEOFENCE', 'LOW_GPS_ACCURACY', 'MISSING_CHECKOUT', 'OVERLAPPING_SESSION', 'SUSPICIOUS_TIMING', 'POLICY_VIOLATION');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('OPEN', 'COMPLETED', 'AUTO_CLOSED');

-- CreateTable
CREATE TABLE "attendance_policies" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "standardWorkMinutes" INTEGER NOT NULL DEFAULT 480,
    "halfDayThresholdMinutes" INTEGER NOT NULL DEFAULT 240,
    "fullDayThresholdMinutes" INTEGER NOT NULL DEFAULT 420,
    "gracePeriodMinutes" INTEGER NOT NULL DEFAULT 15,
    "maxCheckInDelayMinutes" INTEGER NOT NULL DEFAULT 120,
    "maxDailyBreakMinutes" INTEGER NOT NULL DEFAULT 60,
    "maxSingleBreakMinutes" INTEGER NOT NULL DEFAULT 45,
    "allowMultipleSessions" BOOLEAN NOT NULL DEFAULT true,
    "overnightShiftAllowed" BOOLEAN NOT NULL DEFAULT false,
    "workingDayStartHour" INTEGER NOT NULL DEFAULT 5,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "geofenceEnforcement" BOOLEAN NOT NULL DEFAULT true,
    "maxGpsAccuracyMeters" INTEGER NOT NULL DEFAULT 100,
    "version" INTEGER NOT NULL DEFAULT 1,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "policyId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isOvernight" BOOLEAN NOT NULL DEFAULT false,
    "workDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "breakDurationMinutes" INTEGER NOT NULL DEFAULT 60,
    "color" TEXT DEFAULT '#3b82f6',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_assignments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "assignedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_sessions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "sessionNumber" INTEGER NOT NULL DEFAULT 1,
    "checkInTime" TIMESTAMP(3) NOT NULL,
    "checkOutTime" TIMESTAMP(3),
    "totalWorkMinutes" INTEGER NOT NULL DEFAULT 0,
    "totalBreakMinutes" INTEGER NOT NULL DEFAULT 0,
    "status" "SessionStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "sessionId" TEXT,
    "eventType" "AttendanceEventType" NOT NULL,
    "eventTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attendanceMode" "AttendanceMode" NOT NULL DEFAULT 'OFFICE',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracyMeters" DOUBLE PRECISION,
    "branchId" TEXT,
    "distanceFromOfficeMeters" DOUBLE PRECISION,
    "geofenceStatus" "GeofenceVerificationStatus" NOT NULL DEFAULT 'VERIFIED',
    "idempotencyKey" TEXT NOT NULL,
    "deviceInfo" TEXT,
    "ipAddress" TEXT,
    "actorUserId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_daily_summaries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "firstCheckIn" TIMESTAMP(3),
    "lastCheckOut" TIMESTAMP(3),
    "totalWorkMinutes" INTEGER NOT NULL DEFAULT 0,
    "totalBreakMinutes" INTEGER NOT NULL DEFAULT 0,
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "earlyExitMinutes" INTEGER NOT NULL DEFAULT 0,
    "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "status" "AttendanceDayStatus" NOT NULL DEFAULT 'PENDING',
    "shiftId" TEXT,
    "policyId" TEXT,
    "isCorrected" BOOLEAN NOT NULL DEFAULT false,
    "correctionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_daily_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_correction_requests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "targetDate" TIMESTAMP(3) NOT NULL,
    "requestedCheckIn" TIMESTAMP(3),
    "requestedCheckOut" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "status" "CorrectionStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_correction_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_correction_decisions" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "decision" "CorrectionStatus" NOT NULL,
    "originalWorkMinutes" INTEGER NOT NULL,
    "correctedWorkMinutes" INTEGER NOT NULL,
    "reviewNotes" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_correction_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_exceptions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "exceptionType" "AttendanceExceptionType" NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "details" JSONB NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_policies_organizationId_idx" ON "attendance_policies"("organizationId");

-- CreateIndex
CREATE INDEX "attendance_policies_branchId_idx" ON "attendance_policies"("branchId");

-- CreateIndex
CREATE INDEX "attendance_policies_effectiveFrom_effectiveTo_idx" ON "attendance_policies"("effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "attendance_policies_isActive_idx" ON "attendance_policies"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_policies_organizationId_code_version_key" ON "attendance_policies"("organizationId", "code", "version");

-- CreateIndex
CREATE INDEX "shifts_organizationId_idx" ON "shifts"("organizationId");

-- CreateIndex
CREATE INDEX "shifts_policyId_idx" ON "shifts"("policyId");

-- CreateIndex
CREATE INDEX "shifts_isActive_idx" ON "shifts"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "shifts_organizationId_code_key" ON "shifts"("organizationId", "code");

-- CreateIndex
CREATE INDEX "shift_assignments_organizationId_idx" ON "shift_assignments"("organizationId");

-- CreateIndex
CREATE INDEX "shift_assignments_employeeId_idx" ON "shift_assignments"("employeeId");

-- CreateIndex
CREATE INDEX "shift_assignments_shiftId_idx" ON "shift_assignments"("shiftId");

-- CreateIndex
CREATE INDEX "shift_assignments_effectiveFrom_effectiveTo_idx" ON "shift_assignments"("effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "attendance_sessions_organizationId_idx" ON "attendance_sessions"("organizationId");

-- CreateIndex
CREATE INDEX "attendance_sessions_employeeId_date_idx" ON "attendance_sessions"("employeeId", "date");

-- CreateIndex
CREATE INDEX "attendance_sessions_status_idx" ON "attendance_sessions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sessions_employeeId_date_sessionNumber_key" ON "attendance_sessions"("employeeId", "date", "sessionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_events_idempotencyKey_key" ON "attendance_events"("idempotencyKey");

-- CreateIndex
CREATE INDEX "attendance_events_organizationId_idx" ON "attendance_events"("organizationId");

-- CreateIndex
CREATE INDEX "attendance_events_employeeId_idx" ON "attendance_events"("employeeId");

-- CreateIndex
CREATE INDEX "attendance_events_sessionId_idx" ON "attendance_events"("sessionId");

-- CreateIndex
CREATE INDEX "attendance_events_eventTimestamp_idx" ON "attendance_events"("eventTimestamp");

-- CreateIndex
CREATE INDEX "attendance_events_idempotencyKey_idx" ON "attendance_events"("idempotencyKey");

-- CreateIndex
CREATE INDEX "attendance_daily_summaries_organizationId_date_idx" ON "attendance_daily_summaries"("organizationId", "date");

-- CreateIndex
CREATE INDEX "attendance_daily_summaries_employeeId_date_idx" ON "attendance_daily_summaries"("employeeId", "date");

-- CreateIndex
CREATE INDEX "attendance_daily_summaries_status_idx" ON "attendance_daily_summaries"("status");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_daily_summaries_organizationId_employeeId_date_key" ON "attendance_daily_summaries"("organizationId", "employeeId", "date");

-- CreateIndex
CREATE INDEX "attendance_correction_requests_organizationId_idx" ON "attendance_correction_requests"("organizationId");

-- CreateIndex
CREATE INDEX "attendance_correction_requests_employeeId_idx" ON "attendance_correction_requests"("employeeId");

-- CreateIndex
CREATE INDEX "attendance_correction_requests_status_idx" ON "attendance_correction_requests"("status");

-- CreateIndex
CREATE INDEX "attendance_correction_requests_targetDate_idx" ON "attendance_correction_requests"("targetDate");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_correction_decisions_requestId_key" ON "attendance_correction_decisions"("requestId");

-- CreateIndex
CREATE INDEX "attendance_correction_decisions_reviewerId_idx" ON "attendance_correction_decisions"("reviewerId");

-- CreateIndex
CREATE INDEX "attendance_correction_decisions_decidedAt_idx" ON "attendance_correction_decisions"("decidedAt");

-- CreateIndex
CREATE INDEX "attendance_exceptions_organizationId_idx" ON "attendance_exceptions"("organizationId");

-- CreateIndex
CREATE INDEX "attendance_exceptions_employeeId_idx" ON "attendance_exceptions"("employeeId");

-- CreateIndex
CREATE INDEX "attendance_exceptions_exceptionType_idx" ON "attendance_exceptions"("exceptionType");

-- CreateIndex
CREATE INDEX "attendance_exceptions_resolved_idx" ON "attendance_exceptions"("resolved");

-- AddForeignKey
ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "attendance_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "attendance_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_daily_summaries" ADD CONSTRAINT "attendance_daily_summaries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_daily_summaries" ADD CONSTRAINT "attendance_daily_summaries_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_daily_summaries" ADD CONSTRAINT "attendance_daily_summaries_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_daily_summaries" ADD CONSTRAINT "attendance_daily_summaries_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "attendance_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_correction_requests" ADD CONSTRAINT "attendance_correction_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_correction_requests" ADD CONSTRAINT "attendance_correction_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_correction_decisions" ADD CONSTRAINT "attendance_correction_decisions_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "attendance_correction_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_correction_decisions" ADD CONSTRAINT "attendance_correction_decisions_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_exceptions" ADD CONSTRAINT "attendance_exceptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_exceptions" ADD CONSTRAINT "attendance_exceptions_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_exceptions" ADD CONSTRAINT "attendance_exceptions_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
