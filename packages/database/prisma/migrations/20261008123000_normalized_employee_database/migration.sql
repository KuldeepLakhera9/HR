-- AlterTable
-- Add unique constraint to workEmail on employee_contacts to prevent duplicate work email
CREATE UNIQUE INDEX "employee_contacts_workEmail_key" ON "employee_contacts"("workEmail");

-- Create additional performance indexes
CREATE INDEX "employees_joiningDate_idx" ON "employees"("joiningDate");
CREATE INDEX "employee_employments_joiningDate_idx" ON "employee_employments"("joiningDate");
CREATE INDEX "employee_contacts_phone_idx" ON "employee_contacts"("phone");
CREATE INDEX "emergency_contacts_isPrimary_idx" ON "emergency_contacts"("isPrimary");
CREATE INDEX "employee_history_performedById_idx" ON "employee_history"("performedById");
CREATE INDEX "employee_documents_metadata_isVerified_idx" ON "employee_documents_metadata"("isVerified");

-- Add check constraint to prevent self-manager
ALTER TABLE "employee_employments" ADD CONSTRAINT "employee_employments_prevent_self_manager" CHECK ("managerId" IS NULL OR "managerId" != "employeeId");

-- Add trigger function to detect and prevent circular manager hierarchies
CREATE OR REPLACE FUNCTION check_circular_manager()
RETURNS TRIGGER AS $$
DECLARE
  current_mgr TEXT;
  visited_ids TEXT[];
BEGIN
  IF NEW."managerId" IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW."managerId" = NEW."employeeId" THEN
    RAISE EXCEPTION 'Self manager relationship is prohibited: employee cannot be their own manager';
  END IF;

  current_mgr := NEW."managerId";
  visited_ids := ARRAY[NEW."employeeId"];

  WHILE current_mgr IS NOT NULL LOOP
    IF current_mgr = ANY(visited_ids) THEN
      RAISE EXCEPTION 'Circular manager hierarchy detected: employee cannot be managed by their own direct or indirect report';
    END IF;

    visited_ids := array_append(visited_ids, current_mgr);

    SELECT "managerId" INTO current_mgr
    FROM "employee_employments"
    WHERE "employeeId" = current_mgr;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_circular_manager ON "employee_employments";
CREATE TRIGGER trg_check_circular_manager
BEFORE INSERT OR UPDATE OF "managerId", "employeeId" ON "employee_employments"
FOR EACH ROW
EXECUTE FUNCTION check_circular_manager();
