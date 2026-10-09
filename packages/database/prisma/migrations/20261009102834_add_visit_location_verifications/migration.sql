-- CreateTable
CREATE TABLE "visit_location_verifications" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "destinationId" TEXT,
    "outcome" TEXT NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isException" BOOLEAN NOT NULL DEFAULT false,
    "exceptionReason" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracyMeters" DOUBLE PRECISION,
    "distanceMeters" DOUBLE PRECISION,
    "allowedRadiusMeters" INTEGER,
    "deviceInfo" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_location_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "visit_location_verifications_visitId_idx" ON "visit_location_verifications"("visitId");

-- CreateIndex
CREATE INDEX "visit_location_verifications_employeeId_idx" ON "visit_location_verifications"("employeeId");

-- CreateIndex
CREATE INDEX "visit_location_verifications_organizationId_idx" ON "visit_location_verifications"("organizationId");

-- CreateIndex
CREATE INDEX "visit_location_verifications_outcome_idx" ON "visit_location_verifications"("outcome");

-- CreateIndex
CREATE INDEX "visit_location_verifications_createdAt_idx" ON "visit_location_verifications"("createdAt");

-- AddForeignKey
ALTER TABLE "visit_location_verifications" ADD CONSTRAINT "visit_location_verifications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_location_verifications" ADD CONSTRAINT "visit_location_verifications_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "official_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_location_verifications" ADD CONSTRAINT "visit_location_verifications_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_location_verifications" ADD CONSTRAINT "visit_location_verifications_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "visit_destinations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
