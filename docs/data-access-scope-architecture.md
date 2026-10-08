# PeopleOS HRMS — Data Access Scope & Policy Architecture

**Phase:** Phase 2 — Step 6 (Data Access Scope Foundation)  
**Status:** Approved & Implemented  
**Author:** Lead Software Architect & Security Engineering Team

---

## 1. Executive Summary

In enterprise human resource management systems, role-based authorization (RBAC) determines **what actions** a user may perform (e.g., `LEAVE_APPROVE`, `ATTENDANCE_VIEW`), while data access scope determines **which records** the user may perform those actions upon (e.g., self only, own direct reports, entire branch/organization, or cross-tenant global).

Phase 2 Step 6 introduces the **Data Access Scope Foundation** into PeopleOS. This layer decouples business authorization logic from controllers and avoids scattered `if/else` condition ladders by establishing a unified, policy-driven contract:

```typescript
canAccessResource(user, resource, action, target);
```

---

## 2. Core Concepts: Roles vs. Access Scopes

### 2.1 The Four Primary Application Roles

PeopleOS strictly maintains exactly four visible application roles:

- **`ADMIN`**: Enterprise super-administrator.
- **`HR`**: Human resource professionals managing company-wide talent and compliance.
- **`MANAGER`**: People managers responsible for team supervision and approvals.
- **`EMPLOYEE`**: Individual contributors utilizing self-service operations.

### 2.2 The Four Data Access Scopes

| Scope              | Numeric Rank | Description                                                                                          | Default Primary Role Mapping |
| :----------------- | :----------: | :--------------------------------------------------------------------------------------------------- | :--------------------------- |
| **`GLOBAL`**       |     `40`     | Unrestricted visibility across all tenants and organizational entities.                              | `ADMIN`                      |
| **`ORGANIZATION`** |     `30`     | Access strictly confined to all entities within the user's assigned organization (`organizationId`). | `HR`                         |
| **`TEAM`**         |     `20`     | Access confined to team members, supervisees, and department colleagues within the organization.     | `MANAGER`                    |
| **`SELF`**         |     `10`     | Access strictly limited to the user's personal identity and records (`userId === user.id`).          | `EMPLOYEE`                   |

### 2.3 Scope Hierarchy & Precedence

When evaluating users with multiple assigned roles (e.g., a Team Lead who is both an `EMPLOYEE` and a `MANAGER`), the system calculates the **Effective Scope** by taking the maximum precedence:

$$\text{EffectiveScope} = \max_{\text{role} \in \text{user.roles}} (\text{RANK}(\text{ROLE\_DEFAULT\_SCOPES}[\text{role}]))$$

---

## 3. Architecture Blueprint

```
+------------------------------------------------------------------------+
|                      Controller / Service Layer                        |
|                                                                        |
|  accessControlService.canAccessResource(user, resource, action, target)|
+------------------------------------------------------------------------+
                                    |
                                    v
+------------------------------------------------------------------------+
|                          AccessControlService                          |
|                                                                        |
|  1. Verify User State (Active, Not Suspended)                          |
|  2. Granular Permission Check (action in user.permissions or ADMIN)     |
|  3. Resolve Effective Scope (GLOBAL > ORGANIZATION > TEAM > SELF)      |
|  4. Dispatch to Policy Handler via PolicyRegistry                      |
+------------------------------------------------------------------------+
                                    |
                                    v
+------------------------------------------------------------------------+
|                             PolicyRegistry                             |
|                                                                        |
|  - Maps 'LEAVE'       -> LeavePolicy                                   |
|  - Maps 'ATTENDANCE'  -> AttendancePolicy                              |
|  - Maps 'EMPLOYEE'    -> EmployeePolicy                                |
|  - Unregistered       -> DefaultScopePolicy                            |
+------------------------------------------------------------------------+
              |                                            |
              v                                            v
+---------------------------+                +---------------------------+
|  Domain Resource Policy   |                |    DefaultScopePolicy     |
|  (e.g., LeavePolicy)      |                |                           |
|                           |                |  - GLOBAL boundary        |
|  - Anti-self-approval     |                |  - Org multi-tenant check |
|  - Delegate scope check   |                |  - Team hierarchy check   |
|    to DefaultScopePolicy  |                |  - Self identity check    |
+---------------------------+                +---------------------------+
                                                           |
                                                           v
                                             +---------------------------+
                                             |     HierarchyResolver     |
                                             |                           |
                                             | Phase 2: Direct report /  |
                                             |          department       |
                                             | Phase 3: Recursive tree   |
                                             +---------------------------+
```

---

## 4. Reusable Policy Abstraction (No Scattered If/Else)

### 4.1 Resource Policy Interface

Each policy implements [`ResourcePolicy<T>`](file:///c:/Kuldeep's%20Work/Projects/HR/apps/api/src/common/authorization/policies/resource-policy.interface.ts):

```typescript
export interface ResourcePolicy<T extends ResourceTarget = ResourceTarget> {
  readonly resource: string;
  canAccess(
    user: AuthenticatedUser,
    action: string,
    target?: T,
    effectiveScope?: AccessScope,
    context?: AccessEvaluationContext,
  ): Promise<boolean>;
}
```

### 4.2 Universal Default Scope Policy

[`DefaultScopePolicy`](file:///c:/Kuldeep's%20Work/Projects/HR/apps/api/src/common/authorization/policies/default-scope.policy.ts) provides standard tenant and hierarchy boundary enforcement:

- **`GLOBAL`**: Always `true`.
- **`ORGANIZATION`**: Verifies `!target.organizationId || target.organizationId === user.organizationId`.
- **`TEAM`**: Verifies organization match AND (`target.userId === user.id` OR `hierarchyResolver.isTeamMember(...)`).
- **`SELF`**: Verifies organization match AND `target.userId === user.id`.

### 4.3 Domain Resource Policies

Domain policies handle action-specific business rules before delegating scope evaluation:

1. **`LeavePolicy`**:
   - `LEAVE_APPROVE` / `LEAVE_REJECT`: Enforces **anti-self-approval** (`target.userId !== user.id`). A manager cannot approve their own leave application.
   - `LEAVE_APPLY`: Employees can apply for themselves; HR/Admin can apply on behalf of employees.
2. **`AttendancePolicy`**:
   - `ATTENDANCE_MARK`: Employees mark their own attendance; HR/Admin can regularize or mark on behalf of staff.
   - `ATTENDANCE_APPROVE`: Managers approve team attendance regularizations.
3. **`EmployeePolicy`**:
   - `EMPLOYEE_CREATE` / `EMPLOYEE_DELETE`: Requires at least `ORGANIZATION` scope (`HR` or `ADMIN` only).
   - `EMPLOYEE_UPDATE`: `HR`/`ADMIN` org-wide; `EMPLOYEE` updates personal profile.

---

## 5. Extensible Hierarchy Resolver

To ensure clean separation between Phase 2 (Foundation) and Phase 3 (Employee Management), the system injects [`HierarchyResolver`](file:///c:/Kuldeep's%20Work/Projects/HR/apps/api/src/common/authorization/hierarchy/hierarchy-resolver.interface.ts):

```typescript
export interface HierarchyResolver {
  isTeamMember(
    managerId: string,
    target: ResourceTarget,
    managerDepartmentId?: string | null,
  ): Promise<boolean> | boolean;
}
```

### Phase 2 Implementation (`DefaultHierarchyResolver`)

- Direct supervisor check: `target.managerId === managerId`.
- Direct department match: `target.departmentId === managerDepartmentId`.
- Self match: `target.userId === managerId`.

### Future Phase 3 Enhancement (`EmployeeHierarchyResolver`)

When the full employee organizational chart and reporting lines are constructed in Phase 3, an `EmployeeHierarchyResolver` can query recursive reporting paths (e.g. `reportsToId` adjacency trees or closure tables) and be registered under `HIERARCHY_RESOLVER_TOKEN` with **zero code modifications to any policy or service**.

---

## 6. Database-Level Query Scoping (`buildScopeWhereClause`)

In addition to individual entity evaluation, [`AccessControlService`](file:///c:/Kuldeep's%20Work/Projects/HR/apps/api/src/common/authorization/access-control.service.ts) generates Prisma `where` criteria for collection and search queries:

```typescript
const whereScope = this.accessControlService.buildScopeWhereClause(user, 'LEAVE', 'LEAVE_VIEW');
const leaves = await this.prisma.leave.findMany({
  where: {
    ...whereScope,
    status: 'PENDING',
  },
});
```

Generated Prisma Where Conditions:

- `GLOBAL` $\rightarrow$ `{}`
- `ORGANIZATION` $\rightarrow$ `{ organizationId: user.organizationId }`
- `TEAM` $\rightarrow$ `{ organizationId: user.organizationId, OR: [{ userId: user.id }, { departmentId: user.departmentId }] }`
- `SELF` $\rightarrow$ `{ organizationId: user.organizationId, userId: user.id }`

---

## 7. Verification & Automated Test Coverage

The test suite in [`access-control.service.spec.ts`](file:///c:/Kuldeep's%20Work/Projects/HR/apps/api/src/common/authorization/access-control.service.spec.ts) provides 100% scenario coverage across 30 dedicated assertions:

- **Admin (GLOBAL)**: Cross-organization access, global approval.
- **HR (ORGANIZATION)**: Same-organization access allowed, foreign-organization access denied.
- **Manager (TEAM)**: Direct report and department access allowed, outside department denied, anti-self-approval rule enforced.
- **Employee (SELF)**: Personal records allowed, peer records blocked, self-attendance allowed, peer-attendance blocked, leave approval blocked.
- **Security Boundaries**: Unauthenticated rejection, inactive account rejection, missing permission rejection, `assertAccessResource` throwing `ForbiddenException`.
- **Prisma Where Clauses**: Generated correctly for all 4 scopes.
