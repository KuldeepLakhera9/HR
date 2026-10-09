-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "WfhStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "WfhDurationType" AS ENUM ('FULL_DAY', 'FIRST_HALF', 'SECOND_HALF', 'CUSTOM_RANGE');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "attendance_daily_summaries" ADD COLUMN     "officialVisitId" TEXT,
ADD COLUMN     "primaryAttendanceMode" "AttendanceMode" NOT NULL DEFAULT 'OFFICE',
ADD COLUMN     "wfhRequestId" TEXT;

-- AlterTable
ALTER TABLE "attendance_events" ADD COLUMN     "officialVisitId" TEXT,
ADD COLUMN     "wfhRequestId" TEXT;

-- AlterTable
ALTER TABLE "attendance_sessions" ADD COLUMN     "attendanceMode" "AttendanceMode" NOT NULL DEFAULT 'OFFICE',
ADD COLUMN     "officialVisitId" TEXT,
ADD COLUMN     "wfhRequestId" TEXT;

-- CreateTable
CREATE TABLE "official_visits" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "expectedDurationDays" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "status" "VisitStatus" NOT NULL DEFAULT 'SUBMITTED',
    "cancellationReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "official_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_destinations" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "destinationName" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "radiusMeters" INTEGER NOT NULL DEFAULT 200,
    "isGeofenceRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visit_destinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_approvals" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "comments" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wfh_requests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "durationType" "WfhDurationType" NOT NULL DEFAULT 'FULL_DAY',
    "reason" TEXT NOT NULL,
    "status" "WfhStatus" NOT NULL DEFAULT 'SUBMITTED',
    "cancellationReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wfh_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wfh_approvals" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "comments" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wfh_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "official_visits_organizationId_status_idx" ON "official_visits"("organizationId", "status");

-- CreateIndex
CREATE INDEX "official_visits_employeeId_startDate_endDate_idx" ON "official_visits"("employeeId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "official_visits_status_idx" ON "official_visits"("status");

-- CreateIndex
CREATE INDEX "official_visits_startDate_endDate_idx" ON "official_visits"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "visit_destinations_visitId_idx" ON "visit_destinations"("visitId");

-- CreateIndex
CREATE INDEX "visit_approvals_visitId_idx" ON "visit_approvals"("visitId");

-- CreateIndex
CREATE INDEX "visit_approvals_approverId_idx" ON "visit_approvals"("approverId");

-- CreateIndex
CREATE INDEX "wfh_requests_organizationId_status_idx" ON "wfh_requests"("organizationId", "status");

-- CreateIndex
CREATE INDEX "wfh_requests_employeeId_startDate_endDate_idx" ON "wfh_requests"("employeeId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "wfh_requests_status_idx" ON "wfh_requests"("status");

-- CreateIndex
CREATE INDEX "wfh_requests_startDate_endDate_idx" ON "wfh_requests"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "wfh_approvals_requestId_idx" ON "wfh_approvals"("requestId");

-- CreateIndex
CREATE INDEX "wfh_approvals_approverId_idx" ON "wfh_approvals"("approverId");

-- CreateIndex
CREATE INDEX "attendance_daily_summaries_officialVisitId_idx" ON "attendance_daily_summaries"("officialVisitId");

-- CreateIndex
CREATE INDEX "attendance_daily_summaries_wfhRequestId_idx" ON "attendance_daily_summaries"("wfhRequestId");

-- CreateIndex
CREATE INDEX "attendance_daily_summaries_primaryAttendanceMode_idx" ON "attendance_daily_summaries"("primaryAttendanceMode");

-- CreateIndex
CREATE INDEX "attendance_events_officialVisitId_idx" ON "attendance_events"("officialVisitId");

-- CreateIndex
CREATE INDEX "attendance_events_wfhRequestId_idx" ON "attendance_events"("wfhRequestId");

-- CreateIndex
CREATE INDEX "attendance_sessions_officialVisitId_idx" ON "attendance_sessions"("officialVisitId");

-- CreateIndex
CREATE INDEX "attendance_sessions_wfhRequestId_idx" ON "attendance_sessions"("wfhRequestId");

-- CreateIndex
CREATE INDEX "attendance_sessions_attendanceMode_idx" ON "attendance_sessions"("attendanceMode");

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_officialVisitId_fkey" FOREIGN KEY ("officialVisitId") REFERENCES "official_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_wfhRequestId_fkey" FOREIGN KEY ("wfhRequestId") REFERENCES "wfh_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_officialVisitId_fkey" FOREIGN KEY ("officialVisitId") REFERENCES "official_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_wfhRequestId_fkey" FOREIGN KEY ("wfhRequestId") REFERENCES "wfh_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_daily_summaries" ADD CONSTRAINT "attendance_daily_summaries_officialVisitId_fkey" FOREIGN KEY ("officialVisitId") REFERENCES "official_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_daily_summaries" ADD CONSTRAINT "attendance_daily_summaries_wfhRequestId_fkey" FOREIGN KEY ("wfhRequestId") REFERENCES "wfh_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_visits" ADD CONSTRAINT "official_visits_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_visits" ADD CONSTRAINT "official_visits_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "official_visits" ADD CONSTRAINT "official_visits_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_destinations" ADD CONSTRAINT "visit_destinations_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "official_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_approvals" ADD CONSTRAINT "visit_approvals_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "official_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_approvals" ADD CONSTRAINT "visit_approvals_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wfh_requests" ADD CONSTRAINT "wfh_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wfh_requests" ADD CONSTRAINT "wfh_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wfh_requests" ADD CONSTRAINT "wfh_requests_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wfh_approvals" ADD CONSTRAINT "wfh_approvals_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "wfh_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wfh_approvals" ADD CONSTRAINT "wfh_approvals_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
