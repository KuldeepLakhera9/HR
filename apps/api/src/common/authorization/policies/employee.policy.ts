import { Injectable } from '@nestjs/common';
import { ResourceTarget, AccessScope } from '@hrms/types';
import { AuthenticatedUser } from '../../../modules/auth/interfaces/auth.interface';
import { ResourcePolicy } from './resource-policy.interface';
import { DefaultScopePolicy } from './default-scope.policy';
import { AccessEvaluationContext } from '../types';

/**
 * Domain authorization policy for EMPLOYEE operations.
 *
 * Implements business authorization rules:
 * - EMPLOYEE_VIEW: Standard data scopes (SELF views own, MANAGER views team, HR views org, ADMIN views all).
 * - EMPLOYEE_CREATE / EMPLOYEE_DELETE: Requires ORGANIZATION or GLOBAL scope (HR / Admin only).
 * - EMPLOYEE_UPDATE: HR / Admin org-wide/globally. SELF can update own profile.
 */
@Injectable()
export class EmployeePolicy implements ResourcePolicy<ResourceTarget> {
  readonly resource = 'EMPLOYEE';

  constructor(private readonly defaultScopePolicy: DefaultScopePolicy) {}

  async canAccess(
    user: AuthenticatedUser,
    action: string,
    target?: ResourceTarget,
    effectiveScope: AccessScope = 'SELF',
    context?: AccessEvaluationContext,
  ): Promise<boolean> {
    if (!user) {
      return false;
    }

    // 1. Create and Delete employee records
    if (action === 'EMPLOYEE_CREATE' || action === 'EMPLOYEE_DELETE') {
      if (effectiveScope === 'GLOBAL') {
        return true;
      }

      if (effectiveScope === 'ORGANIZATION') {
        if (!target) return true;
        return !target.organizationId || target.organizationId === user.organizationId;
      }

      // Neither MANAGER nor EMPLOYEE can create or delete employees
      return false;
    }

    // 2. Update employee records
    if (action === 'EMPLOYEE_UPDATE') {
      if (effectiveScope === 'GLOBAL') {
        return true;
      }

      if (effectiveScope === 'ORGANIZATION') {
        if (!target) return true;
        return !target.organizationId || target.organizationId === user.organizationId;
      }

      // Self-service profile updates
      if (effectiveScope === 'SELF' || effectiveScope === 'TEAM') {
        if (!target) return false;
        const isSelf =
          (target.userId && target.userId === user.id) || (target.id && target.id === user.id);
        return Boolean(
          isSelf && (!target.organizationId || target.organizationId === user.organizationId),
        );
      }

      return false;
    }

    // 3. View employee records (EMPLOYEE_VIEW)
    return await this.defaultScopePolicy.canAccess(user, action, target, effectiveScope, context);
  }
}
