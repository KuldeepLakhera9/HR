-- AlterTable
ALTER TABLE "payroll_runs" ADD COLUMN "totalEmployerCost" DECIMAL(14,2) NOT NULL DEFAULT 0.0;
ALTER TABLE "payroll_runs" ADD COLUMN "createdById" TEXT;

-- CreateIndex
CREATE INDEX "payroll_runs_createdById_idx" ON "payroll_runs"("createdById");

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
