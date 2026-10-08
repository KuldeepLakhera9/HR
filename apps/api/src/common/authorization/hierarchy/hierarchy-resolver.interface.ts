import { ResourceTarget } from '@hrms/types';

export const HIERARCHY_RESOLVER_TOKEN = 'HIERARCHY_RESOLVER_TOKEN';

/**
 * Abstraction interface for verifying management and organizational hierarchy relationships.
 *
 * In Phase 2 (Foundation), this resolves direct manager assignment and department matching.
 * In Phase 3 (Employee Management), a recursive tree resolver (traversing reporting chains,
 * project matrix teams, and recursive sub-departments) will implement this exact contract
 * without modifying any policy handlers or authorization consumers.
 */
export interface HierarchyResolver {
  /**
   * Determine if a target entity belongs to the team of the given manager.
   *
   * @param managerId The User ID of the manager
   * @param target The target resource containing ownership or organizational attributes
   * @param managerDepartmentId Optional department ID of the manager
   */
  isTeamMember(
    managerId: string,
    target: ResourceTarget,
    managerDepartmentId?: string | null,
  ): Promise<boolean> | boolean;
}
