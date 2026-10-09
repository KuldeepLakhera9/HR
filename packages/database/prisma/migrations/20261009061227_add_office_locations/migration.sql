-- AlterTable
ALTER TABLE "attendance_events" ADD COLUMN     "officeLocationId" TEXT;

-- CreateTable
CREATE TABLE "office_locations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "address" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "geofenceRadiusMeters" INTEGER NOT NULL DEFAULT 100,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "office_locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "office_locations_organizationId_idx" ON "office_locations"("organizationId");

-- CreateIndex
CREATE INDEX "office_locations_branchId_idx" ON "office_locations"("branchId");

-- CreateIndex
CREATE INDEX "office_locations_isActive_idx" ON "office_locations"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "office_locations_organizationId_name_key" ON "office_locations"("organizationId", "name");

-- CreateIndex
CREATE INDEX "attendance_events_branchId_idx" ON "attendance_events"("branchId");

-- CreateIndex
CREATE INDEX "attendance_events_officeLocationId_idx" ON "attendance_events"("officeLocationId");

-- AddForeignKey
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_officeLocationId_fkey" FOREIGN KEY ("officeLocationId") REFERENCES "office_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_locations" ADD CONSTRAINT "office_locations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_locations" ADD CONSTRAINT "office_locations_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
