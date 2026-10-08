import { ResourceTarget, AccessScope } from '@hrms/types';
import { AuthenticatedUser } from '../../../modules/auth/interfaces/auth.interface';
import { AccessEvaluationContext } from '../types';

/**
 * Standard contract for resource-level authorization policy handlers.
 *
 * Each policy encapsulates access rules for a specific resource type
 * (e.g., 'LEAVE', 'ATTENDANCE', 'EMPLOYEE', 'USER'), evaluating whether
 * a user with a given data access scope may perform an action on a target.
 */
export interface ResourcePolicy<T extends ResourceTarget = ResourceTarget> {
  /**
   * The uppercase resource identifier handled by this policy (e.g. 'LEAVE', 'ATTENDANCE', 'EMPLOYEE')
   * A special identifier 'DEFAULT' handles all unregistered resources.
   */
  readonly resource: string;

  /**
   * Evaluate whether the user has permission to perform the action on the target entity.
   *
   * @param user The authenticated user initiating the request
   * @param action The specific action requested (e.g. 'LEAVE_APPROVE', 'ATTENDANCE_VIEW')
   * @param target The target resource instance (optional for collection-level queries)
   * @param effectiveScope The calculated data access scope granted to the user for this resource
   * @param context Additional contextual metadata (IP, time, etc.)
   */
  canAccess(
    user: AuthenticatedUser,
    action: string,
    target?: T,
    effectiveScope?: AccessScope,
    context?: AccessEvaluationContext,
  ): Promise<boolean>;
}
