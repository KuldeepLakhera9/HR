-- Optimize multi-tenant workforce and reporting queries (Phase 10 - Step 9)
CREATE INDEX IF NOT EXISTS "employees_organizationId_status_idx" ON "employees"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "employees_organizationId_joiningDate_idx" ON "employees"("organizationId", "joiningDate");
