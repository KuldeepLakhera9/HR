import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { AccessScope, ResourceTarget, RoleType } from '@hrms/types';
import { AuthenticatedUser } from '../../modules/auth/interfaces/auth.interface';
import {
  ROLE_DEFAULT_SCOPES,
  SCOPE_HIERARCHY_RANK,
  AccessEvaluationContext,
  AccessEvaluationResult,
} from './types';
import { PolicyRegistry } from './policies/policy-registry';

/**
 * Core Access Control and Authorization Service for PeopleOS HRMS.
 *
 * Implements centralized, scope-aware authorization checks adhering to:
 * - Four Primary Roles: ADMIN, HR, MANAGER, EMPLOYEE
 * - Four Data Access Scopes: GLOBAL, ORGANIZATION, TEAM, SELF
 * - Policy Handler Pattern: Delegating to domain-specific ResourcePolicy implementations
 *   without scattered if/else condition ladders.
 */
@Injectable()
export class AccessControlService {
  private readonly logger = new Logger(AccessControlService.name);

  constructor(private readonly policyRegistry: PolicyRegistry) {}

  /**
   * Primary authorization check method.
   *
   * Verifies if a user possesses the required privilege and data scope
   * to perform an action on a target resource.
   *
   * @param user Authenticated user initiating the request
   * @param resource Resource name (e.g. 'LEAVE', 'ATTENDANCE', 'EMPLOYEE', 'USER')
   * @param action Action name in RESOURCE_ACTION format (e.g. 'LEAVE_APPROVE', 'ATTENDANCE_VIEW')
   * @param target Specific target entity instance (or undefined for collection queries)
   * @param context Additional contextual metadata (IP, time, etc.)
   */
  async canAccessResource(
    user: AuthenticatedUser | undefined,
    resource: string,
    action: string,
    target?: ResourceTarget,
    context?: AccessEvaluationContext,
  ): Promise<boolean> {
    const result = await this.evaluateAccess(user, resource, action, target, context);
    return result.allowed;
  }

  /**
   * Strict assertion guard. Throws ForbiddenException if access is not granted.
   */
  async assertAccessResource(
    user: AuthenticatedUser | undefined,
    resource: string,
    action: string,
    target?: ResourceTarget,
    context?: AccessEvaluationContext,
  ): Promise<void> {
    const result = await this.evaluateAccess(user, resource, action, target, context);
    if (!result.allowed) {
      throw new ForbiddenException(
        result.reason ||
          `Access denied: Insufficient scope or privileges to perform action '${action}' on resource '${resource}'.`,
      );
    }
  }

  /**
   * Detailed evaluation producing diagnostic audit result
   */
  async evaluateAccess(
    user: AuthenticatedUser | undefined,
    resource: string,
    action: string,
    target?: ResourceTarget,
    context?: AccessEvaluationContext,
  ): Promise<AccessEvaluationResult> {
    // 1. Guard against unauthenticated requests
    if (!user || !user.id) {
      return {
        allowed: false,
        effectiveScope: 'SELF',
        resource,
        action,
        reason: 'Access denied: Request is unauthenticated or user context is missing.',
      };
    }

    // 2. Guard against inactive/locked accounts
    if (user.status !== 'ACTIVE') {
      return {
        allowed: false,
        effectiveScope: 'SELF',
        resource,
        action,
        reason: `Access denied: User account status is ${user.status}.`,
      };
    }

    const isAdmin = user.roles.includes('ADMIN');

    // 3. Granular permission check
    // Admins bypass basic permission check; other roles must possess the exact permission
    const hasPermission = isAdmin || (user.permissions && user.permissions.includes(action));
    if (!hasPermission) {
      return {
        allowed: false,
        effectiveScope: this.getEffectiveScope(user, resource, action),
        resource,
        action,
        reason: `Access denied: User lacks required permission '${action}'.`,
      };
    }

    // 4. Resolve effective scope
    const effectiveScope = this.getEffectiveScope(user, resource, action);

    // 5. Dispatch to domain policy handler
    const policy = this.policyRegistry.getPolicy(resource);
    const policyAllowed = await policy.canAccess(user, action, target, effectiveScope, context);

    if (!policyAllowed) {
      return {
        allowed: false,
        effectiveScope,
        resource,
        action,
        reason: `Access denied: Operation rejected by policy for resource '${resource}' under '${effectiveScope}' scope.`,
      };
    }

    return {
      allowed: true,
      effectiveScope,
      resource,
      action,
    };
  }

  /**
   * Calculate effective data access scope for a user.
   *
   * Scopes follow hierarchical precedence:
   * GLOBAL (40) > ORGANIZATION (30) > TEAM (20) > SELF (10)
   *
   * When a user has multiple roles, the highest scope granted is applied.
   */
  getEffectiveScope(user: AuthenticatedUser, _resource?: string, _action?: string): AccessScope {
    if (!user || !user.roles || user.roles.length === 0) {
      return 'SELF';
    }

    let highestScope: AccessScope = 'SELF';
    let highestRank = SCOPE_HIERARCHY_RANK.SELF;

    for (const role of user.roles) {
      const scope = ROLE_DEFAULT_SCOPES[role as RoleType] || 'SELF';
      const rank = SCOPE_HIERARCHY_RANK[scope];

      if (rank > highestRank) {
        highestRank = rank;
        highestScope = scope;
      }
    }

    return highestScope;
  }

  /**
   * Generate Prisma-compatible `where` filter criteria based on effective scope.
   *
   * Used by repository queries and list endpoints to ensure database-level
   * multi-tenant and hierarchical isolation.
   */
  buildScopeWhereClause(
    user: AuthenticatedUser,
    resource: string,
    action: string,
    entityUserField: 'userId' | 'id' = 'userId',
  ): Record<string, unknown> {
    const scope = this.getEffectiveScope(user, resource, action);

    switch (scope) {
      case 'GLOBAL':
        // Global administrative access across all records
        return {};

      case 'ORGANIZATION':
        // Scoped strictly to the user's organization
        return {
          organizationId: user.organizationId,
        };

      case 'TEAM':
        // Scoped to own records or department members
        if (user.departmentId) {
          return {
            organizationId: user.organizationId,
            OR: [{ [entityUserField]: user.id }, { departmentId: user.departmentId }],
          };
        }
        return {
          organizationId: user.organizationId,
          [entityUserField]: user.id,
        };

      case 'SELF':
      default:
        // Scoped strictly to personal records
        return {
          organizationId: user.organizationId,
          [entityUserField]: user.id,
        };
    }
  }
}
