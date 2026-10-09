/**
 * Explicit Integration Interface for external/adjacent Leave module.
 * Adheres to rule: "Use explicit integration interfaces for unavailable leave functionality; do not invent leave data."
 */
export interface LeaveIntegrationService {
  checkOverlappingLeave(
    employeeId: string,
    organizationId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{ hasOverlap: boolean; reason?: string }>;
}

export class DefaultLeaveIntegrationService implements LeaveIntegrationService {
  /**
   * Evaluates if employee holds active approved/pending leave requests overlapping the requested window.
   * If leave application module is unavailable or not yet provisioned, gracefully returns hasOverlap: false
   * without fabricating fake leave records.
   */
  async checkOverlappingLeave(
    employeeId: string,
    organizationId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{ hasOverlap: boolean; reason?: string }> {
    // Explicit contract stub: Leave request application workflow is not yet implemented in HRMS.
    // When leave requests table is provisioned, this interface will query active leave applications.
    return { hasOverlap: false };
  }
}
