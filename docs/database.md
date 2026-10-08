# PeopleOS HRMS — Database Architecture

## 1. Engine & ORM

- **Database**: PostgreSQL 16
- **ORM**: Prisma ORM
- **Location**: `packages/database/prisma/schema.prisma`

## 2. Foundational Entities (Phase 1)

1. `Organization`: Top-level tenant container
2. `Branch`: Physical site with GPS coordinates (`geofenceLat`, `geofenceLng`, `geofenceRadiusMeters`)
3. `Department`: Hierarchical department structure with parent-child support
4. `Designation`: Job titles, role bands and seniority levels
5. `User`: Employee credentials, contact info, and status
6. `Role`: Minimal 4 core system roles (`ADMIN`, `HR`, `MANAGER`, `EMPLOYEE`)
7. `Permission`: Fine-grained privileges (e.g. `leave:approve`, `attendance:manage`)
8. `UserRole`: Many-to-many user-to-role associations
9. `RolePermission`: Many-to-many role-to-permission mapping
10. `AuditLog`: Immutable action records (Actor, Entity, Diffs, IP, Agent)
11. `SystemSetting`: Key-value configuration for attendance grace period, rules

## 3. Conventions

- Timestamps: `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt`
- Soft Deletes: `deletedAt DateTime?` on organization, branch, department, designation, and user
- UUID Primary Keys for all records
- Indexes on foreign keys and frequently queried filter columns
