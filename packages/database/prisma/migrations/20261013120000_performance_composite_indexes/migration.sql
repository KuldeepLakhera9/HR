-- AlterTable/Index
-- Phase 15 Performance and Scalability: Tenant Composite Indexes

CREATE INDEX IF NOT EXISTS "audit_logs_organizationId_createdAt_idx" ON "audit_logs"("organizationId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "attendance_sessions_organizationId_date_idx" ON "attendance_sessions"("organizationId", "date");
