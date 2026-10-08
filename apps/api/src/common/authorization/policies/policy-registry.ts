import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ResourceTarget } from '@hrms/types';
import { ResourcePolicy } from './resource-policy.interface';
import { DefaultScopePolicy } from './default-scope.policy';
import { LeavePolicy } from './leave.policy';
import { AttendancePolicy } from './attendance.policy';
import { EmployeePolicy } from './employee.policy';

/**
 * Central registry for domain-specific resource authorization policies.
 *
 * Implements the Strategy / Registry pattern to eliminate scattered if/else
 * branches when evaluating permissions across diverse resources.
 */
@Injectable()
export class PolicyRegistry implements OnModuleInit {
  private readonly logger = new Logger(PolicyRegistry.name);
  private readonly policies = new Map<string, ResourcePolicy<ResourceTarget>>();

  constructor(
    private readonly defaultScopePolicy: DefaultScopePolicy,
    private readonly leavePolicy: LeavePolicy,
    private readonly attendancePolicy: AttendancePolicy,
    private readonly employeePolicy: EmployeePolicy,
  ) {}

  onModuleInit(): void {
    // Register built-in policies
    this.registerPolicy(this.defaultScopePolicy);
    this.registerPolicy(this.leavePolicy);
    this.registerPolicy(this.attendancePolicy);
    this.registerPolicy(this.employeePolicy);
  }

  /**
   * Register a custom or domain resource policy
   */
  registerPolicy(policy: ResourcePolicy<ResourceTarget>): void {
    const key = policy.resource.toUpperCase();
    this.policies.set(key, policy);
    this.logger.debug(`Registered authorization policy for resource: ${key}`);
  }

  /**
   * Retrieve the policy handler for a specific resource,
   * falling back to the universal DefaultScopePolicy if none registered.
   */
  getPolicy(resource: string): ResourcePolicy<ResourceTarget> {
    const key = resource.toUpperCase();
    return this.policies.get(key) || this.defaultScopePolicy;
  }

  /**
   * Check if a dedicated policy is registered for a resource
   */
  hasPolicy(resource: string): boolean {
    return this.policies.has(resource.toUpperCase());
  }
}
