import { Module, Global } from '@nestjs/common';
import { HIERARCHY_RESOLVER_TOKEN } from './hierarchy/hierarchy-resolver.interface';
import { DefaultHierarchyResolver } from './hierarchy/default-hierarchy-resolver';
import { DefaultScopePolicy } from './policies/default-scope.policy';
import { LeavePolicy } from './policies/leave.policy';
import { AttendancePolicy } from './policies/attendance.policy';
import { EmployeePolicy } from './policies/employee.policy';
import { PolicyRegistry } from './policies/policy-registry';
import { AccessControlService } from './access-control.service';

/**
 * Global Authorization Module for PeopleOS HRMS.
 *
 * Provides centralized, scope-aware data access control across all domain modules.
 */
@Global()
@Module({
  providers: [
    {
      provide: HIERARCHY_RESOLVER_TOKEN,
      useClass: DefaultHierarchyResolver,
    },
    DefaultScopePolicy,
    LeavePolicy,
    AttendancePolicy,
    EmployeePolicy,
    PolicyRegistry,
    AccessControlService,
  ],
  exports: [AccessControlService, PolicyRegistry, HIERARCHY_RESOLVER_TOKEN],
})
export class AuthorizationModule {}
