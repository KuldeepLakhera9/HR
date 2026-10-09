-- AlterTable: Add direct managerId hierarchy relationship to employees
ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "managerId" TEXT;

-- CreateIndex for performance and scoped team lookups
CREATE INDEX IF NOT EXISTS "employees_managerId_idx" ON "employees"("managerId");
CREATE INDEX IF NOT EXISTS "employees_organizationId_managerId_idx" ON "employees"("organizationId", "managerId");

-- AddForeignKey for self-referencing hierarchy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employees_managerId_fkey'
  ) THEN
    ALTER TABLE "employees" ADD CONSTRAINT "employees_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Synchronize existing managerId from employee_employments
UPDATE "employees" e
SET "managerId" = ee."managerId"
FROM "employee_employments" ee
WHERE e.id = ee."employeeId" AND ee."managerId" IS NOT NULL;
