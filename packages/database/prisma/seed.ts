import {
  PrismaClient,
  RoleCode,
  UserStatus,
  EmploymentType,
  EmploymentStatus,
  WorkMode,
  Gender,
  EmployeeHistoryEventType,
} from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding foundational Phase 3 HRMS data...');

  // 1. Create Organization
  const org = await prisma.organization.upsert({
    where: { code: 'PEOPLEOS' },
    update: {
      name: 'PeopleOS Technologies Inc.',
      legalName: 'PeopleOS Solutions Private Limited',
      email: 'contact@peopleos.local',
      phone: '+91 80 4123 4567',
      website: 'https://peopleos.local',
      addressLine1: 'Prestige Tech Cloud, Phase 2',
      addressLine2: 'Bellary Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      country: 'India',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
    },
    create: {
      code: 'PEOPLEOS',
      name: 'PeopleOS Technologies Inc.',
      legalName: 'PeopleOS Solutions Private Limited',
      email: 'contact@peopleos.local',
      phone: '+91 80 4123 4567',
      website: 'https://peopleos.local',
      addressLine1: 'Prestige Tech Cloud, Phase 2',
      addressLine2: 'Bellary Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      country: 'India',
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
    update: {
      latitude: 12.9716,
      longitude: 77.5946,
      geofenceLat: 12.9716,
      geofenceLng: 77.5946,
    },
    create: {
      organizationId: org.id,
      code: 'BLR-HQ',
      name: 'Bengaluru Headquarters',
      addressLine1: 'Prestige Tech Cloud, Tower 3',
      city: 'Bengaluru',
      state: 'Karnataka',
      country: 'India',
      postalCode: '560001',
      latitude: 12.9716,
      longitude: 77.5946,
      geofenceLat: 12.9716,
      geofenceLng: 77.5946,
      geofenceRadiusMeters: 150,
    },
  });

  const mumBranch = await prisma.branch.upsert({
    where: {
      organizationId_code: {
        organizationId: org.id,
        code: 'MUM-01',
      },
    },
    update: {
      latitude: 19.076,
      longitude: 72.8777,
      geofenceLat: 19.076,
      geofenceLng: 72.8777,
    },
    create: {
      organizationId: org.id,
      code: 'MUM-01',
      name: 'Mumbai Tech Park',
      addressLine1: 'Nesco IT Park, Western Express Hwy',
      city: 'Mumbai',
      state: 'Maharashtra',
      country: 'India',
      postalCode: '400063',
      latitude: 19.076,
      longitude: 72.8777,
      geofenceLat: 19.076,
      geofenceLng: 72.8777,
      geofenceRadiusMeters: 100,
    },
  });

  const delBranch = await prisma.branch.upsert({
    where: {
      organizationId_code: {
        organizationId: org.id,
        code: 'DEL-01',
      },
    },
    update: {
      latitude: 28.4595,
      longitude: 77.0266,
      geofenceLat: 28.4595,
      geofenceLng: 77.0266,
    },
    create: {
      organizationId: org.id,
      code: 'DEL-01',
      name: 'Delhi NCR Hub',
      addressLine1: 'Cyber City, DLF Phase 2',
      city: 'Gurugram',
      state: 'Haryana',
      country: 'India',
      postalCode: '122002',
      latitude: 28.4595,
      longitude: 77.0266,
      geofenceLat: 28.4595,
      geofenceLng: 77.0266,
      geofenceRadiusMeters: 120,
    },
  });

  // 3. Create Departments
  const departmentsData = [
    { code: 'EXEC', name: 'Executive Leadership', description: 'C-suite & strategic governance' },
    { code: 'HR', name: 'Human Resources', description: 'People operations, talent, and culture' },
    {
      code: 'ENG',
      name: 'Engineering & Product',
      description: 'Software engineering, architecture, and design',
    },
    {
      code: 'OPS',
      name: 'Operations & Facilities',
      description: 'Infrastructure, workplace, and procurement',
    },
    {
      code: 'FIN',
      name: 'Finance & Accounts',
      description: 'Financial planning, accounting, and compliance',
    },
  ];

  const deptMap: Record<string, string> = {};
  for (const dept of departmentsData) {
    const record = await prisma.department.upsert({
      where: {
        organizationId_code: {
          organizationId: org.id,
          code: dept.code,
        },
      },
      update: {
        description: dept.description,
      },
      create: {
        organizationId: org.id,
        code: dept.code,
        name: dept.name,
        description: dept.description,
      },
    });
    deptMap[dept.code] = record.id;
  }

  // 4. Create Designations
  const designationsData = [
    {
      code: 'CTO',
      title: 'Chief Technology Officer',
      level: 5,
      deptCode: 'EXEC',
      desc: 'Executive leadership of technology',
    },
    {
      code: 'HR-LEAD',
      title: 'People Operations Lead',
      level: 3,
      deptCode: 'HR',
      desc: 'HR policies and employee experience',
    },
    {
      code: 'EM',
      title: 'Engineering Manager',
      level: 4,
      deptCode: 'ENG',
      desc: 'Engineering team and technical execution',
    },
    {
      code: 'SR-SWE',
      title: 'Senior Software Engineer',
      level: 3,
      deptCode: 'ENG',
      desc: 'Senior frontend and backend engineering',
    },
    {
      code: 'SWE',
      title: 'Software Engineer',
      level: 2,
      deptCode: 'ENG',
      desc: 'Full-stack software development',
    },
    {
      code: 'OPS-LEAD',
      title: 'Operations Lead',
      level: 3,
      deptCode: 'OPS',
      desc: 'Workplace and logistical leadership',
    },
    {
      code: 'FIN-LEAD',
      title: 'Finance Controller',
      level: 3,
      deptCode: 'FIN',
      desc: 'Accounts, taxation, and payroll audit',
    },
  ];

  const desigMap: Record<string, string> = {};
  for (const desig of designationsData) {
    const record = await prisma.designation.upsert({
      where: {
        organizationId_code: {
          organizationId: org.id,
          code: desig.code,
        },
      },
      update: {
        title: desig.title,
        name: desig.title,
        level: desig.level,
        description: desig.desc,
      },
      create: {
        organizationId: org.id,
        departmentId: deptMap[desig.deptCode],
        code: desig.code,
        title: desig.title,
        name: desig.title,
        level: desig.level,
        description: desig.desc,
      },
    });
    desigMap[desig.code] = record.id;
  }

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

  // 6. Seed Granular Permissions (Phase 3 Expanded)
  const permissionsToSeed = [
    // User Management
    { code: 'USER_VIEW', name: 'View System Users', module: 'USER' },
    { code: 'USER_CREATE', name: 'Create System Users', module: 'USER' },
    { code: 'USER_UPDATE', name: 'Update System Users', module: 'USER' },
    { code: 'USER_DELETE', name: 'Delete System Users', module: 'USER' },

    // Role & Permission Management
    { code: 'ROLE_VIEW', name: 'View Roles & Permissions', module: 'ROLE' },
    { code: 'ROLE_UPDATE', name: 'Modify Roles & Permissions', module: 'ROLE' },

    // Organization Structure
    { code: 'ORGANIZATION_VIEW', name: 'View Organization Structure', module: 'ORGANIZATION' },
    { code: 'ORGANIZATION_UPDATE', name: 'Update Organization Details', module: 'ORGANIZATION' },
    { code: 'BRANCH_VIEW', name: 'View Branches', module: 'BRANCH' },
    { code: 'BRANCH_CREATE', name: 'Create Branch', module: 'BRANCH' },
    { code: 'BRANCH_UPDATE', name: 'Update Branch', module: 'BRANCH' },
    { code: 'BRANCH_DELETE', name: 'Deactivate Branch', module: 'BRANCH' },
    { code: 'DEPARTMENT_VIEW', name: 'View Departments', module: 'DEPARTMENT' },
    { code: 'DEPARTMENT_CREATE', name: 'Create Department', module: 'DEPARTMENT' },
    { code: 'DEPARTMENT_UPDATE', name: 'Update Department', module: 'DEPARTMENT' },
    { code: 'DEPARTMENT_DELETE', name: 'Deactivate Department', module: 'DEPARTMENT' },
    { code: 'DESIGNATION_VIEW', name: 'View Designations', module: 'DESIGNATION' },
    { code: 'DESIGNATION_CREATE', name: 'Create Designation', module: 'DESIGNATION' },
    { code: 'DESIGNATION_UPDATE', name: 'Update Designation', module: 'DESIGNATION' },
    { code: 'DESIGNATION_DELETE', name: 'Deactivate Designation', module: 'DESIGNATION' },

    // Employee Master
    { code: 'EMPLOYEE_VIEW', name: 'View Employee Directory', module: 'EMPLOYEE' },
    { code: 'EMPLOYEE_CREATE', name: 'Create Employee Records', module: 'EMPLOYEE' },
    { code: 'EMPLOYEE_UPDATE', name: 'Update Employee Records', module: 'EMPLOYEE' },
    { code: 'EMPLOYEE_DELETE', name: 'Deactivate Employee Records', module: 'EMPLOYEE' },
    { code: 'EMPLOYEE_IMPORT', name: 'Bulk Import Employees', module: 'EMPLOYEE' },
    { code: 'EMPLOYEE_EXPORT', name: 'Export Employee Directory', module: 'EMPLOYEE' },
    { code: 'EMPLOYEE_HISTORY_VIEW', name: 'View Employee History', module: 'EMPLOYEE' },
    { code: 'ORG_CHART_VIEW', name: 'View Organization Chart', module: 'EMPLOYEE' },

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

  // 7. Map Permissions to the Exactly Four Application Roles
  const allPermissionCodes = permissionsToSeed.map((p) => p.code);

  const rolePermissionsMap: Record<RoleCode, string[]> = {
    // ADMIN receives full access to all operations
    [RoleCode.ADMIN]: allPermissionCodes,

    // HR receives complete employee and organization operational management
    [RoleCode.HR]: [
      'USER_VIEW',
      'ROLE_VIEW',
      'ORGANIZATION_VIEW',
      'ORGANIZATION_UPDATE',
      'BRANCH_VIEW',
      'BRANCH_CREATE',
      'BRANCH_UPDATE',
      'BRANCH_DELETE',
      'DEPARTMENT_VIEW',
      'DEPARTMENT_CREATE',
      'DEPARTMENT_UPDATE',
      'DEPARTMENT_DELETE',
      'DESIGNATION_VIEW',
      'DESIGNATION_CREATE',
      'DESIGNATION_UPDATE',
      'DESIGNATION_DELETE',
      'EMPLOYEE_VIEW',
      'EMPLOYEE_CREATE',
      'EMPLOYEE_UPDATE',
      'EMPLOYEE_DELETE',
      'EMPLOYEE_IMPORT',
      'EMPLOYEE_EXPORT',
      'EMPLOYEE_HISTORY_VIEW',
      'ORG_CHART_VIEW',
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
      'SETTING_VIEW',
    ],

    // MANAGER receives team visibility, approval rights, and org chart
    [RoleCode.MANAGER]: [
      'EMPLOYEE_VIEW',
      'EMPLOYEE_HISTORY_VIEW',
      'ORG_CHART_VIEW',
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

    // EMPLOYEE receives self-service and org chart visibility
    [RoleCode.EMPLOYEE]: [
      'EMPLOYEE_VIEW',
      'ORG_CHART_VIEW',
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

  // 8. Seed Employees & Users with Normalized Hierarchy (Director -> Manager -> Employees)
  const seedPeople = [
    {
      code: 'EMP001',
      email: 'admin@peopleos.local',
      firstName: 'Vikram',
      lastName: 'Aditya',
      role: RoleCode.ADMIN,
      deptCode: 'EXEC',
      desigCode: 'CTO',
      branchCode: 'BLR-HQ',
      managerCode: null,
      gender: Gender.MALE,
      status: EmploymentStatus.ACTIVE,
      workMode: WorkMode.OFFICE,
      employmentType: EmploymentType.FULL_TIME,
      joiningDate: new Date('2022-01-10'),
      phone: '+91 98765 00001',
      dob: new Date('1984-06-15'),
      city: 'Bengaluru',
      state: 'Karnataka',
    },
    {
      code: 'EMP002',
      email: 'hr@peopleos.local',
      firstName: 'Ananya',
      lastName: 'Sharma',
      role: RoleCode.HR,
      deptCode: 'HR',
      desigCode: 'HR-LEAD',
      branchCode: 'BLR-HQ',
      managerCode: 'EMP001',
      gender: Gender.FEMALE,
      status: EmploymentStatus.ACTIVE,
      workMode: WorkMode.HYBRID,
      employmentType: EmploymentType.FULL_TIME,
      joiningDate: new Date('2022-03-01'),
      phone: '+91 98765 00002',
      dob: new Date('1990-09-22'),
      city: 'Bengaluru',
      state: 'Karnataka',
    },
    {
      code: 'EMP003',
      email: 'manager@peopleos.local',
      firstName: 'Rajesh',
      lastName: 'Kumar',
      role: RoleCode.MANAGER,
      deptCode: 'ENG',
      desigCode: 'EM',
      branchCode: 'BLR-HQ',
      managerCode: 'EMP001',
      gender: Gender.MALE,
      status: EmploymentStatus.ACTIVE,
      workMode: WorkMode.HYBRID,
      employmentType: EmploymentType.FULL_TIME,
      joiningDate: new Date('2022-04-15'),
      phone: '+91 98765 00003',
      dob: new Date('1987-11-05'),
      city: 'Bengaluru',
      state: 'Karnataka',
    },
    {
      code: 'EMP004',
      email: 'employee@peopleos.local',
      firstName: 'Priya',
      lastName: 'Nair',
      role: RoleCode.EMPLOYEE,
      deptCode: 'ENG',
      desigCode: 'SR-SWE',
      branchCode: 'BLR-HQ',
      managerCode: 'EMP003',
      gender: Gender.FEMALE,
      status: EmploymentStatus.ACTIVE,
      workMode: WorkMode.HYBRID,
      employmentType: EmploymentType.FULL_TIME,
      joiningDate: new Date('2023-01-10'),
      phone: '+91 98765 00004',
      dob: new Date('1994-03-18'),
      city: 'Bengaluru',
      state: 'Karnataka',
    },
    {
      code: 'EMP005',
      email: 'amitabh.roy@peopleos.local',
      firstName: 'Amitabh',
      lastName: 'Roy',
      role: RoleCode.EMPLOYEE,
      deptCode: 'ENG',
      desigCode: 'SWE',
      branchCode: 'MUM-01',
      managerCode: 'EMP003',
      gender: Gender.MALE,
      status: EmploymentStatus.ACTIVE,
      workMode: WorkMode.REMOTE,
      employmentType: EmploymentType.FULL_TIME,
      joiningDate: new Date('2023-05-15'),
      phone: '+91 98765 00005',
      dob: new Date('1996-08-30'),
      city: 'Mumbai',
      state: 'Maharashtra',
    },
    {
      code: 'EMP006',
      email: 'neha.gupta@peopleos.local',
      firstName: 'Neha',
      lastName: 'Gupta',
      role: RoleCode.EMPLOYEE,
      deptCode: 'ENG',
      desigCode: 'SWE',
      branchCode: 'BLR-HQ',
      managerCode: 'EMP003',
      gender: Gender.FEMALE,
      status: EmploymentStatus.PROBATION,
      workMode: WorkMode.OFFICE,
      employmentType: EmploymentType.FULL_TIME,
      joiningDate: new Date('2024-01-15'),
      phone: '+91 98765 00006',
      dob: new Date('1997-12-10'),
      city: 'Bengaluru',
      state: 'Karnataka',
    },
    {
      code: 'EMP007',
      email: 'karan.m@peopleos.local',
      firstName: 'Karan',
      lastName: 'Mehra',
      role: RoleCode.MANAGER,
      deptCode: 'OPS',
      desigCode: 'OPS-LEAD',
      branchCode: 'DEL-01',
      managerCode: 'EMP001',
      gender: Gender.MALE,
      status: EmploymentStatus.ACTIVE,
      workMode: WorkMode.OFFICE,
      employmentType: EmploymentType.FULL_TIME,
      joiningDate: new Date('2022-08-01'),
      phone: '+91 98765 00007',
      dob: new Date('1989-02-14'),
      city: 'Gurugram',
      state: 'Haryana',
    },
    {
      code: 'EMP008',
      email: 'sneha.patel@peopleos.local',
      firstName: 'Sneha',
      lastName: 'Patel',
      role: RoleCode.EMPLOYEE,
      deptCode: 'OPS',
      desigCode: 'OPS-LEAD',
      branchCode: 'DEL-01',
      managerCode: 'EMP007',
      gender: Gender.FEMALE,
      status: EmploymentStatus.ACTIVE,
      workMode: WorkMode.OFFICE,
      employmentType: EmploymentType.FULL_TIME,
      joiningDate: new Date('2023-09-01'),
      phone: '+91 98765 00008',
      dob: new Date('1995-07-04'),
      city: 'Gurugram',
      state: 'Haryana',
    },
  ];

  // Hash: Password@123 (matching documentation and login page quick-fill)
  const passwordHash = await argon2.hash('Password@123');

  const employeeRecordMap: Record<string, string> = {};
  const branchMap: Record<string, string> = {
    'BLR-HQ': hqBranch.id,
    'MUM-01': mumBranch.id,
    'DEL-01': delBranch.id,
  };

  // Step 8a: Create Users and Base Employees
  for (const person of seedPeople) {
    const branchId = branchMap[person.branchCode];
    const deptId = deptMap[person.deptCode];
    const desigId = desigMap[person.desigCode];

    // 1. User Account
    const user = await prisma.user.upsert({
      where: {
        organizationId_email: {
          organizationId: org.id,
          email: person.email,
        },
      },
      update: {
        passwordHash,
        firstName: person.firstName,
        lastName: person.lastName,
        branchId,
        departmentId: deptId,
        designationId: desigId,
      },
      create: {
        organizationId: org.id,
        branchId,
        departmentId: deptId,
        designationId: desigId,
        employeeCode: person.code,
        email: person.email,
        passwordHash,
        firstName: person.firstName,
        lastName: person.lastName,
        phone: person.phone,
        status: UserStatus.ACTIVE,
        isActive: true,
        failedLoginAttempts: 0,
      },
    });

    // 2. Role assignment
    const role = await prisma.role.findFirst({
      where: { organizationId: org.id, code: person.role },
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

    // 3. Employee Normalized Record
    const employee = await prisma.employee.upsert({
      where: {
        organizationId_employeeCode: {
          organizationId: org.id,
          employeeCode: person.code,
        },
      },
      update: {
        userId: user.id,
        firstName: person.firstName,
        lastName: person.lastName,
        displayName: `${person.firstName} ${person.lastName}`,
        gender: person.gender,
        status: person.status,
        joiningDate: person.joiningDate,
      },
      create: {
        userId: user.id,
        organizationId: org.id,
        employeeCode: person.code,
        firstName: person.firstName,
        lastName: person.lastName,
        displayName: `${person.firstName} ${person.lastName}`,
        dateOfBirth: person.dob,
        gender: person.gender,
        status: person.status,
        joiningDate: person.joiningDate,
        isActive: true,
      },
    });

    employeeRecordMap[person.code] = employee.id;

    // 4. Employee Contact
    await prisma.employeeContact.upsert({
      where: { employeeId: employee.id },
      update: {
        workEmail: person.email,
        phone: person.phone,
        city: person.city,
        state: person.state,
      },
      create: {
        employeeId: employee.id,
        workEmail: person.email,
        personalEmail: `${person.firstName.toLowerCase()}.${person.lastName.toLowerCase()}@personal.example.com`,
        phone: person.phone,
        city: person.city,
        state: person.state,
        country: 'India',
        postalCode: '560001',
      },
    });

    // 5. Emergency Contact
    const existingEmergency = await prisma.emergencyContact.findFirst({
      where: { employeeId: employee.id, isPrimary: true },
    });
    if (!existingEmergency) {
      await prisma.emergencyContact.create({
        data: {
          employeeId: employee.id,
          name: `${person.firstName} Family Contact`,
          relationship: 'Spouse / Parent',
          phone: '+91 98765 99999',
          isPrimary: true,
          address: `${person.city}, ${person.state}`,
        },
      });
    }

    // 6. Documents Metadata
    const existingDoc = await prisma.employeeDocumentMetadata.findFirst({
      where: { employeeId: employee.id, documentType: 'GOVT_ID' },
    });
    if (!existingDoc) {
      await prisma.employeeDocumentMetadata.create({
        data: {
          employeeId: employee.id,
          documentType: 'GOVT_ID',
          documentName: 'Aadhaar / National ID Card',
          documentNumber: `XXXX-XXXX-${person.code.slice(-4)}`,
          isVerified: true,
          verifiedAt: new Date(),
        },
      });
    }
  }

  // Step 8b: Wire Manager Relationships & Employments in Second Pass
  for (const person of seedPeople) {
    const employeeId = employeeRecordMap[person.code];
    const branchId = branchMap[person.branchCode];
    const deptId = deptMap[person.deptCode];
    const desigId = desigMap[person.desigCode];
    const managerId = person.managerCode ? employeeRecordMap[person.managerCode] : null;

    await prisma.employeeEmployment.upsert({
      where: { employeeId },
      update: {
        branchId,
        departmentId: deptId,
        designationId: desigId,
        managerId,
        employmentType: person.employmentType,
        employmentStatus: person.status,
        workMode: person.workMode,
      },
      create: {
        employeeId,
        branchId,
        departmentId: deptId,
        designationId: desigId,
        managerId,
        employmentType: person.employmentType,
        employmentStatus: person.status,
        workMode: person.workMode,
        joiningDate: person.joiningDate,
        noticePeriodDays: 30,
      },
    });

    // Initial Join History Record
    const existingHistory = await prisma.employeeHistory.findFirst({
      where: { employeeId, eventType: EmployeeHistoryEventType.JOINED },
    });
    if (!existingHistory) {
      await prisma.employeeHistory.create({
        data: {
          employeeId,
          eventType: EmployeeHistoryEventType.JOINED,
          previousValue: null,
          newValue: person.status,
          metadata: {
            department: person.deptCode,
            designation: person.desigCode,
            branch: person.branchCode,
          },
        },
      });
    }
  }

  // Set Department Heads
  await prisma.department.update({
    where: { id: deptMap['ENG'] },
    data: { departmentHeadId: employeeRecordMap['EMP003'] }, // Rajesh Kumar
  });
  await prisma.department.update({
    where: { id: deptMap['HR'] },
    data: { departmentHeadId: employeeRecordMap['EMP002'] }, // Ananya Sharma
  });
  await prisma.department.update({
    where: { id: deptMap['OPS'] },
    data: { departmentHeadId: employeeRecordMap['EMP007'] }, // Karan Mehra
  });

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

  // 10. Default Primary Office Location (Development & Staging Test Geofence)
  await prisma.officeLocation.upsert({
    where: {
      organizationId_name: {
        organizationId: org.id,
        name: 'AIC-ADT Baramati',
      },
    },
    update: {
      latitude: 18.17441,
      longitude: 74.614057,
      geofenceRadiusMeters: 100,
      timezone: 'Asia/Kolkata',
      code: 'AIC-ADT-01',
      address: 'Atal Incubation Centre, Agricultural Development Trust, Shardanagar, Baramati',
      isActive: true,
    },
    create: {
      organizationId: org.id,
      name: 'AIC-ADT Baramati',
      code: 'AIC-ADT-01',
      address: 'Atal Incubation Centre, Agricultural Development Trust, Shardanagar, Baramati',
      latitude: 18.17441,
      longitude: 74.614057,
      geofenceRadiusMeters: 100,
      timezone: 'Asia/Kolkata',
      isActive: true,
    },
  });

  // 11. Phase 6: Development-Only Sample Leave Management Fixtures
  // [DEV-ONLY / SAMPLE] Configures sample leave types, policies, holidays, and opening balances
  const clType = await prisma.leaveType.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'CL' } },
    update: { name: 'Casual Leave (Sample)', color: '#d97706', allowHalfDay: true },
    create: {
      organizationId: org.id,
      code: 'CL',
      name: 'Casual Leave (Sample)',
      description:
        'Sample casual leave policy for personal appointments and short unplanned absences',
      color: '#d97706',
      isPaid: true,
      allowHalfDay: true,
      requiresDoc: false,
      docThresholdDays: 3,
      isActive: true,
    },
  });

  const slType = await prisma.leaveType.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'SL' } },
    update: { name: 'Sick Leave (Sample)', color: '#dc2626', allowHalfDay: true },
    create: {
      organizationId: org.id,
      code: 'SL',
      name: 'Sick Leave (Sample)',
      description: 'Sample sick leave policy for illness, recovery, and medical care',
      color: '#dc2626',
      isPaid: true,
      allowHalfDay: true,
      requiresDoc: true,
      docThresholdDays: 2,
      isActive: true,
    },
  });

  const plType = await prisma.leaveType.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'PL' } },
    update: { name: 'Privilege / Earned Leave (Sample)', color: '#2563eb', allowHalfDay: false },
    create: {
      organizationId: org.id,
      code: 'PL',
      name: 'Privilege / Earned Leave (Sample)',
      description: 'Sample earned leave policy for planned vacations and extended time off',
      color: '#2563eb',
      isPaid: true,
      allowHalfDay: false,
      requiresDoc: false,
      docThresholdDays: 5,
      isActive: true,
    },
  });

  const clPolicy = await prisma.leavePolicy.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'POL-CL-DEV' } },
    update: { annualEntitlement: 12.0 },
    create: {
      organizationId: org.id,
      leaveTypeId: clType.id,
      code: 'POL-CL-DEV',
      name: 'Standard Casual Leave (12 Days Sample)',
      description: '12 days annual entitlement granted at start of leave year',
      annualEntitlement: 12.0,
      accrualFrequency: 'ANNUAL',
      carryForwardLimit: 0.0,
      maxConsecutiveDays: 3,
      minNoticeDays: 0,
      countWeekendsAsLeave: false,
      countHolidaysAsLeave: false,
      allowNegativeBalance: false,
      isActive: true,
    },
  });

  const slPolicy = await prisma.leavePolicy.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'POL-SL-DEV' } },
    update: { annualEntitlement: 10.0 },
    create: {
      organizationId: org.id,
      leaveTypeId: slType.id,
      code: 'POL-SL-DEV',
      name: 'Standard Sick Leave (10 Days Sample)',
      description: '10 days annual entitlement for medical recovery',
      annualEntitlement: 10.0,
      accrualFrequency: 'ANNUAL',
      carryForwardLimit: 5.0,
      maxConsecutiveDays: 14,
      minNoticeDays: 0,
      countWeekendsAsLeave: false,
      countHolidaysAsLeave: false,
      allowNegativeBalance: false,
      isActive: true,
    },
  });

  const plPolicy = await prisma.leavePolicy.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'POL-PL-DEV' } },
    update: { annualEntitlement: 15.0 },
    create: {
      organizationId: org.id,
      leaveTypeId: plType.id,
      code: 'POL-PL-DEV',
      name: 'Standard Earned Leave (15 Days Sample)',
      description: '15 days annual entitlement with 3-day advance notice',
      annualEntitlement: 15.0,
      accrualFrequency: 'ANNUAL',
      carryForwardLimit: 30.0,
      maxConsecutiveDays: 20,
      minNoticeDays: 3,
      countWeekendsAsLeave: false,
      countHolidaysAsLeave: false,
      allowNegativeBalance: false,
      isActive: true,
    },
  });

  // Sample Gazetted Holidays for 2026
  const sampleHolidays = [
    { name: 'Republic Day', date: '2026-01-26' },
    { name: 'Independence Day', date: '2026-08-15' },
    { name: 'Gandhi Jayanti', date: '2026-10-02' },
    { name: 'Diwali (Deepavali)', date: '2026-10-20' },
  ];

  for (const h of sampleHolidays) {
    const d = new Date(`${h.date}T00:00:00.000Z`);
    const existing = await prisma.holiday.findFirst({
      where: {
        organizationId: org.id,
        branchId: null,
        date: d,
      },
    });

    if (existing) {
      await prisma.holiday.update({
        where: { id: existing.id },
        data: { name: h.name },
      });
    } else {
      await prisma.holiday.create({
        data: {
          organizationId: org.id,
          branchId: null,
          name: h.name,
          date: d,
          year: 2026,
          isOptional: false,
        },
      });
    }
  }

  // Assign policies to all active seed employees and initialize balance ledger
  const allEmployees = await prisma.employee.findMany({ where: { organizationId: org.id } });
  const samplePolicies = [clPolicy, slPolicy, plPolicy];

  for (const emp of allEmployees) {
    for (const pol of samplePolicies) {
      await prisma.employeeLeavePolicyAssignment.upsert({
        where: {
          employeeId_leavePolicyId_effectiveFrom: {
            employeeId: emp.id,
            leavePolicyId: pol.id,
            effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
          },
        },
        update: {},
        create: {
          organizationId: org.id,
          employeeId: emp.id,
          leavePolicyId: pol.id,
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        },
      });

      const entitlement = Number(pol.annualEntitlement);
      const acc = await prisma.leaveBalanceAccount.upsert({
        where: {
          organizationId_employeeId_leaveTypeId_leaveYear: {
            organizationId: org.id,
            employeeId: emp.id,
            leaveTypeId: pol.leaveTypeId,
            leaveYear: 2026,
          },
        },
        update: {},
        create: {
          organizationId: org.id,
          employeeId: emp.id,
          leaveTypeId: pol.leaveTypeId,
          leaveYear: 2026,
          openingBalance: entitlement,
          allocatedBalance: entitlement,
          accruedBalance: 0,
          usedBalance: 0,
          pendingBalance: 0,
          closingBalance: entitlement,
          lastReconciledAt: new Date(),
        },
      });

      const idempotencyKey = `grant:seed:${acc.id}:2026`;
      await prisma.leaveBalanceTransaction.upsert({
        where: { idempotencyKey },
        update: {},
        create: {
          accountId: acc.id,
          transactionType: 'OPENING_GRANT',
          amount: entitlement,
          balanceAfter: entitlement,
          reason: `Initial annual entitlement grant (${pol.name})`,
          idempotencyKey,
        },
      });
    }
  }

  console.log(
    'Phase 3 foundational seeding and Phase 6 leave sample fixtures completed successfully!',
  );
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
