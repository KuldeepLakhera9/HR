import { RoleType, AccessScope, ResourceTarget, ACCESS_SCOPES } from '@hrms/types';

export { AccessScope, ResourceTarget, ACCESS_SCOPES };

/**
 * Numeric weight hierarchy for evaluating scope breadth.
 * Higher number = broader data access privileges.
 */
export const SCOPE_HIERARCHY_RANK: Record<AccessScope, number> = {
  GLOBAL: 40,
  ORGANIZATION: 30,
  TEAM: 20,
  SELF: 10,
};

/**
 * Standard default data access scope mappings per application role.
 * - ADMIN: GLOBAL (unrestricted cross-system access)
 * - HR: ORGANIZATION (all entities belonging to current organization)
 * - MANAGER: TEAM (entities belonging to manager's direct reports / department)
 * - EMPLOYEE: SELF (personal records and own self-service identity)
 */
export const ROLE_DEFAULT_SCOPES: Record<RoleType, AccessScope> = {
  ADMIN: 'GLOBAL',
  HR: 'ORGANIZATION',
  MANAGER: 'TEAM',
  EMPLOYEE: 'SELF',
};

/**
 * Contextual metadata passed during access evaluation (e.g. IP, timestamp, tenant parameters)
 */
export interface AccessEvaluationContext {
  requestIp?: string;
  timestamp?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Detailed result of an access control decision for audit logging and diagnostics
 */
export interface AccessEvaluationResult {
  allowed: boolean;
  effectiveScope: AccessScope;
  resource: string;
  action: string;
  reason?: string;
}
