import { Injectable } from '@nestjs/common';
import { ResourceTarget, AccessScope } from '@hrms/types';
import { AuthenticatedUser } from '../../../modules/auth/interfaces/auth.interface';
import { ResourcePolicy } from './resource-policy.interface';
import { DefaultScopePolicy } from './default-scope.policy';
import { AccessEvaluationContext } from '../types';

/**
 * Domain authorization policy for ATTENDANCE operations.
 *
 * Implements business authorization rules:
 * - ATTENDANCE_MARK: SELF can clock-in/out for own user account. HR/Admin can mark on behalf of others.
 * - ATTENDANCE_UPDATE / ATTENDANCE_APPROVE: Managers update/approve for team; HR/Admin org-wide/global.
 * - ATTENDANCE_VIEW: Evaluated through standard data scope boundaries.
 */
@Injectable()
export class AttendancePolicy implements ResourcePolicy<ResourceTarget> {
  readonly resource = 'ATTENDANCE';

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

    // 1. Clock-in / Mark attendance rules
    if (action === 'ATTENDANCE_MARK') {
      if (!target) {
        return true;
      }

      // Self clock-in
      if (target.userId === user.id || target.id === user.id) {
        return Boolean(!target.organizationId || target.organizationId === user.organizationId);
      }

      // Marking attendance on behalf of others requires ORGANIZATION or GLOBAL scope (HR/Admin)
      if (effectiveScope === 'GLOBAL') {
        return true;
      }

      if (effectiveScope === 'ORGANIZATION') {
        return Boolean(!target.organizationId || target.organizationId === user.organizationId);
      }

      return false;
    }

    // 2. Attendance Approval / Regularization rules
    if (action === 'ATTENDANCE_APPROVE' || action === 'ATTENDANCE_UPDATE') {
      // SELF scope cannot approve attendance regularizations
      if (effectiveScope === 'SELF') {
        return false;
      }

      return await this.defaultScopePolicy.canAccess(user, action, target, effectiveScope, context);
    }

    // 3. Other attendance actions (e.g. ATTENDANCE_VIEW) follow default scope
    return await this.defaultScopePolicy.canAccess(user, action, target, effectiveScope, context);
  }
}
