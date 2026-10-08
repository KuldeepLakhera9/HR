import { PrismaClient, RoleCode, UserStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding foundational HRMS data...');

  // 1. Create Organization
  const org = await prisma.organization.upsert({
    where: { code: 'PEOPLEOS' },
    update: {},
    create: {
      code: 'PEOPLEOS',
      name: 'PeopleOS Technologies Inc.',
      legalName: 'PeopleOS Solutions Private Limited',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
    },
  });

  // 2. Create Branches
  const hqBranch = await prisma.branch.upsert({
    where: {
      organizationId_code: {
        organizationId: org.id,
        code: 'BLR-HQ',
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      code: 'BLR-HQ',
      name: 'Bengaluru Headquarters',
      city: 'Bengaluru',
      state: 'Karnataka',
      country: 'India',
      geofenceLat: 12.9716,
      geofenceLng: 77.5946,
      geofenceRadiusMeters: 150,
    },
  });

  // 3. Create Departments
  const engineeringDept = await prisma.department.upsert({
    where: {
      organizationId_code: {
        organizationId: org.id,
        code: 'ENG',
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      code: 'ENG',
      name: 'Engineering',
    },
  });

  const hrDept = await prisma.department.upsert({
    where: {
      organizationId_code: {
        organizationId: org.id,
        code: 'HR',
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      code: 'HR',
      name: 'Human Resources',
    },
  });

  // 4. Create Designations
  const devDesignation = await prisma.designation.upsert({
    where: {
      organizationId_code: {
        organizationId: org.id,
        code: 'SE-2',
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      departmentId: engineeringDept.id,
      code: 'SE-2',
      title: 'Senior Software Engineer',
      level: 3,
    },
  });

  // 5. Create System Roles
  const roles: RoleCode[] = [RoleCode.ADMIN, RoleCode.HR, RoleCode.MANAGER, RoleCode.EMPLOYEE];
  for (const roleCode of roles) {
    await prisma.role.upsert({
      where: {
        organizationId_code: {
          organizationId: org.id,
          code: roleCode,
        },
      },
      update: {},
      create: {
        organizationId: org.id,
        code: roleCode,
        name: `${roleCode} Role`,
        description: `Standard system role for ${roleCode}`,
        isSystem: true,
      },
    });
  }

  // 6. Create Seed Users for the 4 Roles
  const usersToSeed = [
    {
      code: 'EMP001',
      email: 'admin@peopleos.local',
      firstName: 'Vikram',
      lastName: 'Aditya',
      role: RoleCode.ADMIN,
      deptId: engineeringDept.id,
      desigId: devDesignation.id,
    },
    {
      code: 'EMP002',
      email: 'hr@peopleos.local',
      firstName: 'Ananya',
      lastName: 'Sharma',
      role: RoleCode.HR,
      deptId: hrDept.id,
      desigId: devDesignation.id,
    },
    {
      code: 'EMP003',
      email: 'manager@peopleos.local',
      firstName: 'Rajesh',
      lastName: 'Kumar',
      role: RoleCode.MANAGER,
      deptId: engineeringDept.id,
      desigId: devDesignation.id,
    },
    {
      code: 'EMP004',
      email: 'employee@peopleos.local',
      firstName: 'Priya',
      lastName: 'Nair',
      role: RoleCode.EMPLOYEE,
      deptId: engineeringDept.id,
      desigId: devDesignation.id,
    },
  ];

  for (const u of usersToSeed) {
    const user = await prisma.user.upsert({
      where: {
        organizationId_email: {
          organizationId: org.id,
          email: u.email,
        },
      },
      update: {
        passwordHash:
          '$argon2id$v=19$m=65536,p=4,t=3$RtLrf7yRIv58OUiRnn+C9Q$boeWAvt1AnaJGPdlZC7HXYBli7iUUUpX+uR22uWVeFI',
      },
      create: {
        organizationId: org.id,
        branchId: hqBranch.id,
        departmentId: u.deptId,
        designationId: u.desigId,
        employeeCode: u.code,
        email: u.email,
        passwordHash:
          '$argon2id$v=19$m=65536,p=4,t=3$RtLrf7yRIv58OUiRnn+C9Q$boeWAvt1AnaJGPdlZC7HXYBli7iUUUpX+uR22uWVeFI',
        firstName: u.firstName,
        lastName: u.lastName,
        status: UserStatus.ACTIVE,
        isActive: true,
        failedLoginAttempts: 0,
      },
    });

    const role = await prisma.role.findFirst({
      where: { organizationId: org.id, code: u.role },
    });

    if (role) {
      await prisma.userRole.upsert({
        where: {
          userId_roleId: {
            userId: user.id,
            roleId: role.id,
          },
        },
        update: {},
        create: {
          userId: user.id,
          roleId: role.id,
          assignedBy: 'SYSTEM_SEED',
        },
      });
    }
  }

  // 7. Seed Granular Permissions (RESOURCE_ACTION Naming Convention)
  const permissionsToSeed = [
    // User Management
    { code: 'USER_VIEW', name: 'View System Users', module: 'USER' },
    { code: 'USER_CREATE', name: 'Create System Users', module: 'USER' },
    { code: 'USER_UPDATE', name: 'Update System Users', module: 'USER' },
    { code: 'USER_DELETE', name: 'Delete System Users', module: 'USER' },

    // Role & Permission Management
    { code: 'ROLE_VIEW', name: 'View Roles & Permissions', module: 'ROLE' },
    { code: 'ROLE_UPDATE', name: 'Modify Roles & Permissions', module: 'ROLE' },

    // Employee Master
    { code: 'EMPLOYEE_VIEW', name: 'View Employee Directory', module: 'EMPLOYEE' },
    { code: 'EMPLOYEE_CREATE', name: 'Create Employee Records', module: 'EMPLOYEE' },
    { code: 'EMPLOYEE_UPDATE', name: 'Update Employee Records', module: 'EMPLOYEE' },
    { code: 'EMPLOYEE_DELETE', name: 'Deactivate Employee Records', module: 'EMPLOYEE' },

    // Attendance Management
    { code: 'ATTENDANCE_VIEW', name: 'View Attendance Records', module: 'ATTENDANCE' },
    { code: 'ATTENDANCE_MARK', name: 'Mark Attendance Punch', module: 'ATTENDANCE' },
    { code: 'ATTENDANCE_UPDATE', name: 'Modify Attendance Logs', module: 'ATTENDANCE' },
    { code: 'ATTENDANCE_APPROVE', name: 'Approve Attendance Adjustments', module: 'ATTENDANCE' },

    // Leave Management
    { code: 'LEAVE_VIEW', name: 'View Leave Requests & Balances', module: 'LEAVE' },
    { code: 'LEAVE_APPLY', name: 'Apply For Leave', module: 'LEAVE' },
    { code: 'LEAVE_APPROVE', name: 'Approve Leave Requests', module: 'LEAVE' },
    { code: 'LEAVE_REJECT', name: 'Reject Leave Requests', module: 'LEAVE' },

    // Official Visits
    { code: 'VISIT_VIEW', name: 'View Official Visits', module: 'VISIT' },
    { code: 'VISIT_APPLY', name: 'Apply For Official Visit', module: 'VISIT' },
    { code: 'VISIT_APPROVE', name: 'Approve Official Visits', module: 'VISIT' },

    // Documents
    { code: 'DOCUMENT_VIEW', name: 'View Documents', module: 'DOCUMENT' },
    { code: 'DOCUMENT_UPLOAD', name: 'Upload Documents', module: 'DOCUMENT' },
    { code: 'DOCUMENT_DELETE', name: 'Delete Documents', module: 'DOCUMENT' },

    // Reports & Analytics
    { code: 'REPORT_VIEW', name: 'View Analytics & MIS Reports', module: 'REPORT' },
    { code: 'REPORT_EXPORT', name: 'Export MIS Reports', module: 'REPORT' },

    // Audit Log
    { code: 'AUDIT_VIEW', name: 'View Audit Trail', module: 'AUDIT' },

    // Organization Structure
    { code: 'ORGANIZATION_VIEW', name: 'View Organization Structure', module: 'ORGANIZATION' },
    { code: 'ORGANIZATION_UPDATE', name: 'Update Organization Structure', module: 'ORGANIZATION' },

    // System Settings
    { code: 'SETTING_VIEW', name: 'View System Settings', module: 'SETTING' },
    { code: 'SETTING_UPDATE', name: 'Update System Settings', module: 'SETTING' },
  ];

  const permissionRecords: Record<string, string> = {};
  for (const perm of permissionsToSeed) {
    const record = await prisma.permission.upsert({
      where: { code: perm.code },
      update: { name: perm.name, module: perm.module },
      create: perm,
    });
    permissionRecords[perm.code] = record.id;
  }

  // 8. Map Permissions to the Exactly Four Application Roles
  const allPermissionCodes = permissionsToSeed.map((p) => p.code);

  const rolePermissionsMap: Record<RoleCode, string[]> = {
    // ADMIN receives all current permissions
    [RoleCode.ADMIN]: allPermissionCodes,

    // HR receives HR-related permissions
    [RoleCode.HR]: [
      'USER_VIEW',
      'ROLE_VIEW',
      'EMPLOYEE_VIEW',
      'EMPLOYEE_CREATE',
      'EMPLOYEE_UPDATE',
      'EMPLOYEE_DELETE',
      'ATTENDANCE_VIEW',
      'ATTENDANCE_MARK',
      'ATTENDANCE_UPDATE',
      'ATTENDANCE_APPROVE',
      'LEAVE_VIEW',
      'LEAVE_APPLY',
      'LEAVE_APPROVE',
      'LEAVE_REJECT',
      'VISIT_VIEW',
      'VISIT_APPLY',
      'VISIT_APPROVE',
      'DOCUMENT_VIEW',
      'DOCUMENT_UPLOAD',
      'DOCUMENT_DELETE',
      'REPORT_VIEW',
      'REPORT_EXPORT',
      'AUDIT_VIEW',
      'ORGANIZATION_VIEW',
      'SETTING_VIEW',
    ],

    // MANAGER receives team-management permissions
    [RoleCode.MANAGER]: [
      'EMPLOYEE_VIEW',
      'ATTENDANCE_VIEW',
      'ATTENDANCE_MARK',
      'ATTENDANCE_APPROVE',
      'LEAVE_VIEW',
      'LEAVE_APPLY',
      'LEAVE_APPROVE',
      'LEAVE_REJECT',
      'VISIT_VIEW',
      'VISIT_APPLY',
      'VISIT_APPROVE',
      'DOCUMENT_VIEW',
      'REPORT_VIEW',
    ],

    // EMPLOYEE receives self-service permissions
    [RoleCode.EMPLOYEE]: [
      'ATTENDANCE_VIEW',
      'ATTENDANCE_MARK',
      'LEAVE_VIEW',
      'LEAVE_APPLY',
      'VISIT_VIEW',
      'VISIT_APPLY',
      'DOCUMENT_VIEW',
    ],
  };

  for (const [roleCode, permCodes] of Object.entries(rolePermissionsMap) as [
    RoleCode,
    string[],
  ][]) {
    const role = await prisma.role.findFirst({
      where: { organizationId: org.id, code: roleCode },
    });

    if (role) {
      for (const permCode of permCodes) {
        const permissionId = permissionRecords[permCode];
        if (permissionId) {
          await prisma.rolePermission.upsert({
            where: {
              roleId_permissionId: {
                roleId: role.id,
                permissionId,
              },
            },
            update: {},
            create: {
              roleId: role.id,
              permissionId,
            },
          });
        }
      }
    }
  }

  // 9. System Settings
  await prisma.systemSetting.upsert({
    where: {
      organizationId_key: {
        organizationId: org.id,
        key: 'ATTENDANCE_GRACE_PERIOD_MINUTES',
      },
    },
    update: {},
    create: {
      organizationId: org.id,
      key: 'ATTENDANCE_GRACE_PERIOD_MINUTES',
      value: '15',
      type: 'NUMBER',
      description: 'Standard grace period allowed after shift start time in minutes',
    },
  });

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
