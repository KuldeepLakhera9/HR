-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AttendanceDayStatus" ADD VALUE 'WEEK_OFF';
ALTER TYPE "AttendanceDayStatus" ADD VALUE 'INCOMPLETE';
ALTER TYPE "AttendanceDayStatus" ADD VALUE 'PENDING_REVIEW';
ALTER TYPE "AttendanceDayStatus" ADD VALUE 'NOT_SCHEDULED';
