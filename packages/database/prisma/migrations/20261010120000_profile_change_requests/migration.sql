-- CreateEnum
CREATE TYPE "ProfileChangeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "profile_change_requests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "currentData" JSONB,
    "reason" TEXT,
    "status" "ProfileChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewerId" TEXT,
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "profile_change_requests_organizationId_status_idx" ON "profile_change_requests"("organizationId", "status");

-- CreateIndex
CREATE INDEX "profile_change_requests_employeeId_idx" ON "profile_change_requests"("employeeId");

-- CreateIndex
CREATE INDEX "profile_change_requests_status_idx" ON "profile_change_requests"("status");

-- CreateIndex
CREATE INDEX "profile_change_requests_submittedAt_idx" ON "profile_change_requests"("submittedAt");

-- AddForeignKey
ALTER TABLE "profile_change_requests" ADD CONSTRAINT "profile_change_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_change_requests" ADD CONSTRAINT "profile_change_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_change_requests" ADD CONSTRAINT "profile_change_requests_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
