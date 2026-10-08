import { Injectable, Inject } from '@nestjs/common';
import { ResourceTarget, AccessScope } from '@hrms/types';
import { AuthenticatedUser } from '../../../modules/auth/interfaces/auth.interface';
import { ResourcePolicy } from './resource-policy.interface';
import {
  HierarchyResolver,
  HIERARCHY_RESOLVER_TOKEN,
} from '../hierarchy/hierarchy-resolver.interface';
import { AccessEvaluationContext } from '../types';

/**
 * Universal scope-based policy handler.
 *
 * Implements the core multi-tenant and hierarchical boundaries:
 * - GLOBAL: Unrestricted access across organizations.
 * - ORGANIZATION: Access strictly confined to user's assigned organization.
 * - TEAM: Access confined to user's organization AND team members / supervisees.
 * - SELF: Access strictly confined to user's own identity and personal records.
 */
@Injectable()
export class DefaultScopePolicy implements ResourcePolicy<ResourceTarget> {
  readonly resource = 'DEFAULT';

  constructor(
    @Inject(HIERARCHY_RESOLVER_TOKEN)
    private readonly hierarchyResolver: HierarchyResolver,
  ) {}

  async canAccess(
    user: AuthenticatedUser,
    _action: string,
    target?: ResourceTarget,
    effectiveScope: AccessScope = 'SELF',
    _context?: AccessEvaluationContext,
  ): Promise<boolean> {
    if (!user) {
      return false;
    }

    // 1. GLOBAL Scope: Unrestricted across all targets
    if (effectiveScope === 'GLOBAL') {
      return true;
    }

    // If no target is provided (e.g. collection-level check), allow within tenant
    if (!target) {
      return true;
    }

    // 2. Organization Boundary Check (Mandatory for ORGANIZATION, TEAM, SELF)
    if (target.organizationId && target.organizationId !== user.organizationId) {
      return false;
    }

    // 3. ORGANIZATION Scope: Allowed for all records within the same organization
    if (effectiveScope === 'ORGANIZATION') {
      return true;
    }

    // 4. TEAM Scope: Allowed for own records OR verified team members
    if (effectiveScope === 'TEAM') {
      // User is the target subject
      if ((target.userId && target.userId === user.id) || (target.id && target.id === user.id)) {
        return true;
      }

      // Check hierarchy / team membership
      return await this.hierarchyResolver.isTeamMember(user.id, target, user.departmentId);
    }

    // 5. SELF Scope: Allowed strictly for the user's personal records
    if (effectiveScope === 'SELF') {
      const isSelf =
        (target.userId && target.userId === user.id) || (target.id && target.id === user.id);

      return Boolean(isSelf);
    }

    return false;
  }
}
