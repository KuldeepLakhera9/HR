import { PrismaClient, RoleCode } from '@prisma/client';

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
      update: {},
      create: {
        organizationId: org.id,
        branchId: hqBranch.id,
        departmentId: u.deptId,
        designationId: u.desigId,
        employeeCode: u.code,
        email: u.email,
        passwordHash: '$2b$10$eO0gWpS3Z0Q9o7Q1Z4gZ.uO6Lh6s7J1J2k3l4m5n6o7p8q9r0s1t2', // dev mock hash
        firstName: u.firstName,
        lastName: u.lastName,
        isActive: true,
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

  // 7. System Settings
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
