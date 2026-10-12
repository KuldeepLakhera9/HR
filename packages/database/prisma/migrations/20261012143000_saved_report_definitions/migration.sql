-- CreateTable
CREATE TABLE "saved_report_definitions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "filterConfig" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_report_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_report_definitions_organizationId_userId_idx" ON "saved_report_definitions"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "saved_report_definitions_reportKey_idx" ON "saved_report_definitions"("reportKey");

-- AddForeignKey
ALTER TABLE "saved_report_definitions" ADD CONSTRAINT "saved_report_definitions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_report_definitions" ADD CONSTRAINT "saved_report_definitions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
