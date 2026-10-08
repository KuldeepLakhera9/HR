import { Injectable } from '@nestjs/common';
import { ResourceTarget } from '@hrms/types';
import { HierarchyResolver } from './hierarchy-resolver.interface';

/**
 * Default implementation of HierarchyResolver.
 *
 * Verifies team membership using immediate relational attributes:
 * 1. Target specifies direct managerId matching the evaluating manager.
 * 2. Target belongs to the same department as the evaluating manager.
 * 3. Target is the manager's own record (manager is always part of their own scope).
 *
 * Designed to be swapped or enhanced in the Employee Management Phase with
 * recursive multi-level reporting paths without changing authorization services.
 */
@Injectable()
export class DefaultHierarchyResolver implements HierarchyResolver {
  isTeamMember(
    managerId: string,
    target: ResourceTarget,
    managerDepartmentId?: string | null,
  ): boolean {
    if (!managerId || !target) {
      return false;
    }

    // 1. Target belongs directly to the manager themselves
    if (target.userId === managerId || target.id === managerId) {
      return true;
    }

    // 2. Direct reporting line: target points to manager as immediate supervisor
    if (target.managerId && target.managerId === managerId) {
      return true;
    }

    // 3. Department matching: target is in the manager's assigned department
    if (managerDepartmentId && target.departmentId && target.departmentId === managerDepartmentId) {
      return true;
    }

    return false;
  }
}
