import { Injectable } from '@nestjs/common';
import { ResourceTarget, AccessScope } from '@hrms/types';
import { AuthenticatedUser } from '../../../modules/auth/interfaces/auth.interface';
import { ResourcePolicy } from './resource-policy.interface';
import { DefaultScopePolicy } from './default-scope.policy';
import { AccessEvaluationContext } from '../types';

/**
 * Domain authorization policy for LEAVE operations.
 *
 * Implements business authorization rules:
 * - LEAVE_APPLY: Allowed for SELF (own leave), or HR/ADMIN on behalf of others.
 * - LEAVE_APPROVE / LEAVE_REJECT: Anti-self-approval rule (users cannot approve their own leaves).
 *   Managers approve for team members; HR for organization members; Admins globally.
 * - LEAVE_VIEW: Evaluated through standard data scope boundaries.
 */
@Injectable()
export class LeavePolicy implements ResourcePolicy<ResourceTarget> {
  readonly resource = 'LEAVE';

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

    // 1. Leave Approval / Rejection business rules
    if (action === 'LEAVE_APPROVE' || action === 'LEAVE_REJECT') {
      // Rule: Anti-self-approval - cannot approve or reject one's own leave
      if (target && (target.userId === user.id || target.id === user.id)) {
        return false;
      }

      // SELF scope cannot approve any leaves
      if (effectiveScope === 'SELF') {
        return false;
      }

      // TEAM scope: can approve for team members
      if (effectiveScope === 'TEAM') {
        return await this.defaultScopePolicy.canAccess(user, action, target, 'TEAM', context);
      }

      // ORGANIZATION scope: can approve for org members
      if (effectiveScope === 'ORGANIZATION') {
        return await this.defaultScopePolicy.canAccess(
          user,
          action,
          target,
          'ORGANIZATION',
          context,
        );
      }

      // GLOBAL scope: can approve any
      return true;
    }

    // 2. Leave Application rules
    if (action === 'LEAVE_APPLY') {
      if (!target) {
        return true;
      }

      // If applying for self: always permitted if organization matches
      if (target.userId === user.id || target.id === user.id) {
        return Boolean(!target.organizationId || target.organizationId === user.organizationId);
      }

      // Applying on behalf of others requires ORGANIZATION or GLOBAL scope (HR / Admin)
      if (effectiveScope === 'GLOBAL') {
        return true;
      }

      if (effectiveScope === 'ORGANIZATION') {
        return Boolean(!target.organizationId || target.organizationId === user.organizationId);
      }

      return false;
    }

    // 3. All other leave actions (e.g. LEAVE_VIEW) follow default scope boundaries
    return await this.defaultScopePolicy.canAccess(user, action, target, effectiveScope, context);
  }
}
