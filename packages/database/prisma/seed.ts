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
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('=== SEEDING PRODUCTION-LEVEL HRMS ENVIRONMENT (ZERO DUMMY DATA) ===');

  // 0. Clean all existing operational, employee, and user data
  console.log('Truncating existing operational data, mock attendance, and dummy documents...');
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE 
      "sessions",
      "password_reset_tokens",
      "audit_logs",
      "attendance_events",
      "attendance_sessions",
      "attendance_daily_summaries",
      "attendance_correction_requests",
      "attendance_correction_decisions",
      "attendance_exceptions",
      "official_visits",
      "visit_approvals",
      "visit_location_verifications",
      "wfh_requests",
      "wfh_approvals",
      "leave_balance_transactions",
      "leave_balance_accounts",
      "leave_requests",
      "leave_approvals",
      "employee_leave_policy_assignments",
      "profile_change_requests",
      "employee_history",
      "employee_documents_metadata",
      "emergency_contacts",
      "employee_contacts",
      "employee_employments",
      "performance_review_items",
      "performance_reviews",
      "performance_feedbacks",
      "development_plans",
      "review_cycle_participants",
      "performance_goals",
      "goal_progress_updates",
      "goal_histories",
      "performance_competencies",
      "review_cycles",
      "employee_payroll_snapshots",
      "payroll_exceptions",
      "payroll_items",
      "payroll_periods",
      "payroll_adjustments",
      "payroll_approval_histories",
      "payroll_runs",
      "employee_compensation_items",
      "employee_compensations",
      "shift_assignments",
      "employees",
      "user_roles",
      "users",
      "branches"
    CASCADE;
  `);

  // Clean out any physical binary files from local storage
  const storageDirs = [
    path.resolve(process.cwd(), 'storage/documents'),
    path.resolve(process.cwd(), 'apps/api/storage/documents'),
    path.resolve(__dirname, '../../../storage/documents'),
  ];
  for (const sDir of storageDirs) {
    if (fs.existsSync(sDir)) {
      try {
        fs.rmSync(sDir, { recursive: true, force: true });
        fs.mkdirSync(sDir, { recursive: true });
        console.log(`Cleaned physical storage directory: ${sDir}`);
      } catch (err: any) {
        console.warn(`Could not clean storage dir ${sDir}: ${err.message}`);
      }
    }
  }

  // 1. Create Organization: ADT-AI Training Foundation
  const org = await prisma.organization.upsert({
    where: { code: 'PEOPLEOS' },
    update: {
      name: 'ADT-AI Training Foundation',
      legalName: 'Agricultural Development Trust - AI Training Foundation',
      logo: '/adt-logo.jpg',
      email: 'contact@vpspcoe-ai.org',
      phone: '+91 2112 255518',
      website: 'https://vpspcoe-ai.org',
      addressLine1: 'Atal Incubation Centre, Agricultural Development Trust, Sharadanagar',
      addressLine2: 'Malegaon Road',
      city: 'Baramati',
      state: 'Maharashtra',
      country: 'India',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
    },
    create: {
      code: 'PEOPLEOS',
      name: 'ADT-AI Training Foundation',
      legalName: 'Agricultural Development Trust - AI Training Foundation',
      logo: '/adt-logo.jpg',
      email: 'contact@vpspcoe-ai.org',
      phone: '+91 2112 255518',
      website: 'https://vpspcoe-ai.org',
      addressLine1: 'Atal Incubation Centre, Agricultural Development Trust, Sharadanagar',
      addressLine2: 'Malegaon Road',
      city: 'Baramati',
      state: 'Maharashtra',
      country: 'India',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
    },
  });

  // 2. Create Single Official Branch: ADT-AI Training Foundation
  const adtBranch = await prisma.branch.upsert({
    where: {
      organizationId_code: {
        organizationId: org.id,
        code: 'ADT-AITF',
      },
    },
    update: {
      name: 'ADT-AI Training Foundation',
      addressLine1: 'Atal Incubation Centre, Agricultural Development Trust, Sharadanagar',
      city: 'Baramati',
      state: 'Maharashtra',
      country: 'India',
      postalCode: '413115',
      latitude: 18.1531,
      longitude: 74.5786,
      geofenceLat: 18.1531,
      geofenceLng: 74.5786,
      geofenceRadiusMeters: 150,
      isActive: true,
    },
    create: {
      organizationId: org.id,
      code: 'ADT-AITF',
      name: 'ADT-AI Training Foundation',
      addressLine1: 'Atal Incubation Centre, Agricultural Development Trust, Sharadanagar',
      city: 'Baramati',
      state: 'Maharashtra',
      country: 'India',
      postalCode: '413115',
      latitude: 18.1531,
      longitude: 74.5786,
      geofenceLat: 18.1531,
      geofenceLng: 74.5786,
      geofenceRadiusMeters: 150,
      isActive: true,
    },
  });

  // 3. Create Official Departments
  const departmentsData = [
    {
      code: 'EXEC',
      name: 'Executive Leadership',
      description: 'Governance and institutional direction',
    },
    {
      code: 'HR',
      name: 'Human Resources',
      description: 'Talent management, employee relations, and policy',
    },
    {
      code: 'FIN',
      name: 'Finance & Accounts',
      description: 'Financial compliance, accounting, and payroll',
    },
    {
      code: 'ENG',
      name: 'Engineering & Product',
      description: 'Artificial intelligence development and software engineering',
    },
    {
      code: 'OPS',
      name: 'Operations & Facilities',
      description: 'Infrastructure, lab facilities, and operations',
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
        name: dept.name,
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

  // 4. Create Official Designations
  const designationsData = [
    {
      code: 'CEO',
      title: 'Director / Executive Head',
      level: 5,
      deptCode: 'EXEC',
      desc: 'Executive Leadership & Direction',
    },
    {
      code: 'HR-LEAD',
      title: 'HR Manager',
      level: 4,
      deptCode: 'HR',
      desc: 'Head of Human Resources & Operations',
    },
    {
      code: 'FIN-LEAD',
      title: 'Senior Accountant',
      level: 4,
      deptCode: 'FIN',
      desc: 'Finance & Accounts Controller',
    },
    {
      code: 'SR-SWE',
      title: 'Principal AI Engineer',
      level: 4,
      deptCode: 'ENG',
      desc: 'Lead AI & Software Engineering',
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
  const roles: RoleCode[] = [
    RoleCode.ADMIN,
    RoleCode.HR,
    RoleCode.ACCOUNTANT,
    RoleCode.MANAGER,
    RoleCode.EMPLOYEE,
  ];

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

  // 6. Seed Granular Permissions
  const permissionsToSeed = [
    // User Management
    { code: 'USER_VIEW', name: 'View Users', module: 'Users' },
    { code: 'USER_CREATE', name: 'Create Users', module: 'Users' },
    { code: 'USER_UPDATE', name: 'Update Users', module: 'Users' },
    { code: 'USER_DELETE', name: 'Delete Users', module: 'Users' },

    // Role Management
    { code: 'ROLE_VIEW', name: 'View Roles', module: 'Roles' },
    { code: 'ROLE_UPDATE', name: 'Update Roles', module: 'Roles' },

    // Employee Management
    { code: 'EMPLOYEE_VIEW', name: 'View Employees', module: 'Employees' },
    { code: 'EMPLOYEE_CREATE', name: 'Create Employee', module: 'Employees' },
    { code: 'EMPLOYEE_UPDATE', name: 'Update Employee', module: 'Employees' },
    { code: 'EMPLOYEE_DELETE', name: 'Delete Employee', module: 'Employees' },
    { code: 'EMPLOYEE_IMPORT', name: 'Bulk Import Employees', module: 'Employees' },
    { code: 'EMPLOYEE_EXPORT', name: 'Export Employees', module: 'Employees' },
    { code: 'EMPLOYEE_HISTORY_VIEW', name: 'View Employee History', module: 'Employees' },
    { code: 'EMPLOYEE_MANAGE', name: 'Manage Employees', module: 'Employees' },
    { code: 'ORG_CHART_VIEW', name: 'View Org Chart', module: 'Employees' },

    // Organization Structure
    { code: 'ORGANIZATION_VIEW', name: 'View Org Hierarchy', module: 'Organization' },
    { code: 'ORGANIZATION_UPDATE', name: 'Update Org Hierarchy', module: 'Organization' },
    { code: 'ORGANIZATION_MANAGE', name: 'Manage Org Structure', module: 'Organization' },
    { code: 'BRANCH_VIEW', name: 'View Branches', module: 'Organization' },
    { code: 'BRANCH_CREATE', name: 'Create Branch', module: 'Organization' },
    { code: 'BRANCH_UPDATE', name: 'Update Branch', module: 'Organization' },
    { code: 'BRANCH_DELETE', name: 'Delete Branch', module: 'Organization' },
    { code: 'DEPARTMENT_VIEW', name: 'View Departments', module: 'Organization' },
    { code: 'DEPARTMENT_CREATE', name: 'Create Department', module: 'Organization' },
    { code: 'DEPARTMENT_UPDATE', name: 'Update Department', module: 'Organization' },
    { code: 'DEPARTMENT_DELETE', name: 'Delete Department', module: 'Organization' },
    { code: 'DESIGNATION_VIEW', name: 'View Designations', module: 'Organization' },
    { code: 'DESIGNATION_CREATE', name: 'Create Designation', module: 'Organization' },
    { code: 'DESIGNATION_UPDATE', name: 'Update Designation', module: 'Organization' },
    { code: 'DESIGNATION_DELETE', name: 'Delete Designation', module: 'Organization' },

    // Attendance Management
    { code: 'ATTENDANCE_VIEW', name: 'View Attendance Records', module: 'Attendance' },
    { code: 'ATTENDANCE_MARK', name: 'Mark Daily Attendance', module: 'Attendance' },
    {
      code: 'ATTENDANCE_UPDATE',
      name: 'Update Attendance & Geofence Perimeters',
      module: 'Attendance',
    },
    { code: 'ATTENDANCE_CORRECT', name: 'Request Attendance Correction', module: 'Attendance' },
    { code: 'ATTENDANCE_APPROVE', name: 'Approve Attendance Corrections', module: 'Attendance' },
    { code: 'ATTENDANCE_POLICY_MANAGE', name: 'Manage Shift Policies', module: 'Attendance' },

    // Leave Management
    { code: 'LEAVE_VIEW', name: 'View Leave Records', module: 'Leave' },
    { code: 'LEAVE_APPLY', name: 'Apply For Leave', module: 'Leave' },
    { code: 'LEAVE_APPROVE', name: 'Approve Leave Applications', module: 'Leave' },
    { code: 'LEAVE_REJECT', name: 'Reject Leave Applications', module: 'Leave' },
    { code: 'LEAVE_POLICY_MANAGE', name: 'Configure Leave Types & Rules', module: 'Leave' },

    // Performance Management
    { code: 'PERFORMANCE_VIEW', name: 'View Performance Records', module: 'Performance' },
    { code: 'GOAL_MANAGE', name: 'Manage Performance Goals', module: 'Performance' },
    { code: 'REVIEW_CYCLE_MANAGE', name: 'Manage Appraisal Cycles', module: 'Performance' },
    { code: 'APPRAISAL_EXECUTE', name: 'Execute Appraisals', module: 'Performance' },

    // Payroll Management
    { code: 'PAYROLL_VIEW', name: 'View Payroll Records', module: 'Payroll' },
    { code: 'PAYROLL_MANAGE', name: 'Manage Payroll Structures & Settings', module: 'Payroll' },
    { code: 'PAYROLL_COMPENSATION', name: 'Manage Employee Compensations', module: 'Payroll' },
    { code: 'PAYROLL_EXECUTE', name: 'Execute Monthly Payroll Runs', module: 'Payroll' },
    { code: 'PAYROLL_APPROVE', name: 'Approve Monthly Payroll', module: 'Payroll' },
    { code: 'PAYROLL_PUBLISH', name: 'Publish Payslips & Disburse', module: 'Payroll' },
    { code: 'PAYSLIP_VIEW_SELF', name: 'View Personal Payslips', module: 'Payroll' },
    { code: 'PAYROLL_EXPORT', name: 'Export Bank Advice & Summaries', module: 'Payroll' },

    // Visits & WFH
    { code: 'VISIT_VIEW', name: 'View Official Visits', module: 'Visits' },
    { code: 'VISIT_APPLY', name: 'Apply Official Visit', module: 'Visits' },
    { code: 'VISIT_APPROVE', name: 'Approve Official Visit', module: 'Visits' },
    { code: 'WFH_VIEW', name: 'View WFH Requests', module: 'WFH' },
    { code: 'WFH_APPLY', name: 'Apply WFH Request', module: 'WFH' },
    { code: 'WFH_APPROVE', name: 'Approve WFH Request', module: 'WFH' },

    // Reports & Documents
    { code: 'DOCUMENT_VIEW', name: 'View Employee Documents', module: 'Documents' },
    { code: 'DOCUMENT_MANAGE', name: 'Upload & Verify Documents', module: 'Documents' },
    { code: 'REPORT_VIEW', name: 'View Standard Reports', module: 'Reports' },
    { code: 'REPORT_EXPORT', name: 'Export Operational Reports', module: 'Reports' },
    { code: 'AUDIT_VIEW', name: 'View Security Audit Logs', module: 'Audit' },

    // System Settings & Profile
    { code: 'SETTING_VIEW', name: 'View System Settings', module: 'System' },
    { code: 'SETTING_UPDATE', name: 'Update System Settings', module: 'System' },
    { code: 'SYSTEM_SETTINGS', name: 'Manage System Settings', module: 'System' },
    { code: 'PROFILE_CHANGE_REVIEW', name: 'Review Profile Change Requests', module: 'Profile' },
  ];

  const permissionRecords: Record<string, string> = {};
  for (const perm of permissionsToSeed) {
    const p = await prisma.permission.upsert({
      where: { code: perm.code },
      update: { name: perm.name, module: perm.module },
      create: perm,
    });
    permissionRecords[perm.code] = p.id;
  }

  // 7. Role-Permission Mappings
  const rolePermissionsMap: Record<RoleCode, string[]> = {
    // ADMIN receives ALL permissions
    [RoleCode.ADMIN]: permissionsToSeed.map((p) => p.code),

    // HR receives workforce, leave, attendance, documents, reports, and settings
    [RoleCode.HR]: [
      'ORGANIZATION_VIEW',
      'BRANCH_VIEW',
      'DEPARTMENT_VIEW',
      'DESIGNATION_VIEW',
      'EMPLOYEE_VIEW',
      'EMPLOYEE_CREATE',
      'EMPLOYEE_UPDATE',
      'EMPLOYEE_DELETE',
      'EMPLOYEE_IMPORT',
      'EMPLOYEE_EXPORT',
      'EMPLOYEE_HISTORY_VIEW',
      'EMPLOYEE_MANAGE',
      'ORG_CHART_VIEW',
      'ATTENDANCE_VIEW',
      'ATTENDANCE_MARK',
      'ATTENDANCE_UPDATE',
      'ATTENDANCE_CORRECT',
      'ATTENDANCE_APPROVE',
      'ATTENDANCE_POLICY_MANAGE',
      'LEAVE_VIEW',
      'LEAVE_APPLY',
      'LEAVE_APPROVE',
      'LEAVE_REJECT',
      'LEAVE_POLICY_MANAGE',
      'DOCUMENT_VIEW',
      'DOCUMENT_MANAGE',
      'REPORT_VIEW',
      'REPORT_EXPORT',
      'AUDIT_VIEW',
      'SETTING_VIEW',
      'PROFILE_CHANGE_REVIEW',
    ],

    // ACCOUNTANT receives payroll, compensation, bank export, attendance review, and financial reports
    [RoleCode.ACCOUNTANT]: [
      'ORGANIZATION_VIEW',
      'BRANCH_VIEW',
      'DEPARTMENT_VIEW',
      'DESIGNATION_VIEW',
      'EMPLOYEE_VIEW',
      'ORG_CHART_VIEW',
      'ATTENDANCE_VIEW',
      'LEAVE_VIEW',
      'PAYROLL_VIEW',
      'PAYROLL_MANAGE',
      'PAYROLL_COMPENSATION',
      'PAYROLL_EXECUTE',
      'PAYROLL_APPROVE',
      'PAYROLL_PUBLISH',
      'PAYSLIP_VIEW_SELF',
      'PAYROLL_EXPORT',
      'DOCUMENT_VIEW',
      'REPORT_VIEW',
      'REPORT_EXPORT',
    ],

    // MANAGER receives team attendance and leave approval
    [RoleCode.MANAGER]: [
      'ORGANIZATION_VIEW',
      'BRANCH_VIEW',
      'DEPARTMENT_VIEW',
      'DESIGNATION_VIEW',
      'EMPLOYEE_VIEW',
      'ORG_CHART_VIEW',
      'ATTENDANCE_VIEW',
      'ATTENDANCE_MARK',
      'ATTENDANCE_CORRECT',
      'ATTENDANCE_APPROVE',
      'LEAVE_VIEW',
      'LEAVE_APPLY',
      'LEAVE_APPROVE',
      'LEAVE_REJECT',
      'DOCUMENT_VIEW',
      'PAYSLIP_VIEW_SELF',
      'REPORT_VIEW',
    ],

    // EMPLOYEE receives self-service attendance, leaves, documents, payslips
    [RoleCode.EMPLOYEE]: [
      'ORGANIZATION_VIEW',
      'BRANCH_VIEW',
      'DEPARTMENT_VIEW',
      'DESIGNATION_VIEW',
      'EMPLOYEE_VIEW',
      'ORG_CHART_VIEW',
      'ATTENDANCE_VIEW',
      'ATTENDANCE_MARK',
      'ATTENDANCE_CORRECT',
      'LEAVE_VIEW',
      'LEAVE_APPLY',
      'DOCUMENT_VIEW',
      'PAYSLIP_VIEW_SELF',
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

  // 8. Load Real Profile Photo for Kuldeep Lakhera if backed up
  let kuldeepRealPhoto: string | null = null;
  try {
    const photoFile = path.resolve(__dirname, '../../../scripts/kuldeep_photo.txt');
    if (fs.existsSync(photoFile)) {
      kuldeepRealPhoto = fs.readFileSync(photoFile, 'utf8').trim();
    }
  } catch {}

  // 9. Foundational Real Organization Accounts (Only Real Personnel - No Dummy Records)
  const realPeople = [
    {
      code: 'EMP001',
      email: 'nilesh.nalawade@vpspcoe-ai.org',
      firstName: 'Nilesh',
      lastName: 'Nalawade',
      role: RoleCode.ADMIN,
      deptCode: 'EXEC',
      desigCode: 'CEO',
      branchCode: 'ADT-AITF',
      managerCode: null,
      gender: Gender.MALE,
      status: EmploymentStatus.ACTIVE,
      workMode: WorkMode.OFFICE,
      employmentType: EmploymentType.FULL_TIME,
      joiningDate: new Date('2022-01-10'),
      phone: '+91 98765 00001',
      dob: new Date('1980-05-15'),
      city: 'Baramati',
      state: 'Maharashtra',
      profilePhoto: null,
    },
    {
      code: 'EMP002',
      email: 'heena.bhatia@vpspcoe-ai.org',
      firstName: 'Heena',
      lastName: 'Bhatia',
      role: RoleCode.HR,
      deptCode: 'HR',
      desigCode: 'HR-LEAD',
      branchCode: 'ADT-AITF',
      managerCode: 'EMP001',
      gender: Gender.FEMALE,
      status: EmploymentStatus.ACTIVE,
      workMode: WorkMode.OFFICE,
      employmentType: EmploymentType.FULL_TIME,
      joiningDate: new Date('2022-03-01'),
      phone: '+91 98765 00002',
      dob: new Date('1990-08-20'),
      city: 'Baramati',
      state: 'Maharashtra',
      profilePhoto: null,
    },
    {
      code: 'ADTAITF/023',
      email: 'samruddhi.ranmode@vpspcoe-ai.org',
      firstName: 'Samruddhi',
      lastName: 'Ranmode',
      role: RoleCode.ACCOUNTANT,
      deptCode: 'FIN',
      desigCode: 'FIN-LEAD',
      branchCode: 'ADT-AITF',
      managerCode: 'EMP001',
      gender: Gender.FEMALE,
      status: EmploymentStatus.ACTIVE,
      workMode: WorkMode.OFFICE,
      employmentType: EmploymentType.FULL_TIME,
      joiningDate: new Date('2023-01-15'),
      phone: '+91 98765 00023',
      dob: new Date('1995-04-10'),
      city: 'Baramati',
      state: 'Maharashtra',
      profilePhoto: null,
    },
    {
      code: 'EMP004',
      email: 'kuldeep.lakhera@vpspcoe-ai.org',
      firstName: 'Kuldeep',
      lastName: 'Lakhera',
      role: RoleCode.EMPLOYEE,
      deptCode: 'ENG',
      desigCode: 'SR-SWE',
      branchCode: 'ADT-AITF',
      managerCode: 'EMP001',
      gender: Gender.MALE,
      status: EmploymentStatus.ACTIVE,
      workMode: WorkMode.OFFICE,
      employmentType: EmploymentType.FULL_TIME,
      joiningDate: new Date('2022-06-01'),
      phone: '+91 98765 00004',
      dob: new Date('1996-01-01'),
      city: 'Baramati',
      state: 'Maharashtra',
      profilePhoto: kuldeepRealPhoto,
    },
  ];

  // Argon2id hash for Password@123
  const passwordHash = await argon2.hash('Password@123');
  const employeeRecordMap: Record<string, string> = {};
  const branchMap: Record<string, string> = {
    'ADT-AITF': adtBranch.id,
  };

  // Step 9a: Create Clean Users and Base Employees
  for (const person of realPeople) {
    const branchId = branchMap[person.branchCode];
    const deptId = deptMap[person.deptCode];
    const desigId = desigMap[person.desigCode];

    // 1. User Account
    const user = await prisma.user.create({
      data: {
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

    // 2. Strict Role Assignment
    const role = await prisma.role.findFirst({
      where: { organizationId: org.id, code: person.role },
    });
    if (role) {
      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: role.id,
          assignedBy: 'SYSTEM_PROD_INIT',
        },
      });
    }

    // 3. Employee Normalized Record (Zero dummy documents, zero fake data)
    const employee = await prisma.employee.create({
      data: {
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
        profilePhoto: person.profilePhoto,
        isActive: true,
      },
    });

    employeeRecordMap[person.code] = employee.id;

    // 4. Employee Contact
    await prisma.employeeContact.create({
      data: {
        employeeId: employee.id,
        workEmail: person.email,
        phone: person.phone,
        city: person.city,
        state: person.state,
        country: 'India',
        postalCode: '413115',
      },
    });
  }

  // Step 9b: Wire Department Leadership & Employments
  for (const person of realPeople) {
    const employeeId = employeeRecordMap[person.code];
    const branchId = branchMap[person.branchCode];
    const deptId = deptMap[person.deptCode];
    const desigId = desigMap[person.desigCode];
    const managerId = person.managerCode ? employeeRecordMap[person.managerCode] : null;

    if (managerId) {
      await prisma.employee.update({
        where: { id: employeeId },
        data: { managerId },
      });
    }

    await prisma.employeeEmployment.create({
      data: {
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

  // Set Department Heads
  if (deptMap['EXEC'] && employeeRecordMap['EMP001']) {
    await prisma.department.update({
      where: { id: deptMap['EXEC'] },
      data: { departmentHeadId: employeeRecordMap['EMP001'] }, // Nilesh Nalawade
    });
  }
  if (deptMap['HR'] && employeeRecordMap['EMP002']) {
    await prisma.department.update({
      where: { id: deptMap['HR'] },
      data: { departmentHeadId: employeeRecordMap['EMP002'] }, // Heena Bhatia
    });
  }
  if (deptMap['FIN'] && employeeRecordMap['ADTAITF/023']) {
    await prisma.department.update({
      where: { id: deptMap['FIN'] },
      data: { departmentHeadId: employeeRecordMap['ADTAITF/023'] }, // Samruddhi Ranmode
    });
  }
  if (deptMap['ENG'] && employeeRecordMap['EMP004']) {
    await prisma.department.update({
      where: { id: deptMap['ENG'] },
      data: { departmentHeadId: employeeRecordMap['EMP004'] }, // Kuldeep Lakhera
    });
  }

  // 10. Default Primary Office Location (Geofenced at Baramati)
  await prisma.officeLocation.upsert({
    where: {
      organizationId_name: {
        organizationId: org.id,
        name: 'ADT AI Baramati',
      },
    },
    update: {
      latitude: 18.17441,
      longitude: 74.614057,
      geofenceRadiusMeters: 100,
      timezone: 'Asia/Kolkata',
      code: 'ADT-AI-01',
      address: 'ADT AI Training Foundation, Shardanagar, Baramati, Maharashtra 413115',
      isActive: true,
    },
    create: {
      organizationId: org.id,
      name: 'ADT AI Baramati',
      code: 'ADT-AI-01',
      address: 'ADT AI Training Foundation, Shardanagar, Baramati, Maharashtra 413115',
      latitude: 18.17441,
      longitude: 74.614057,
      geofenceRadiusMeters: 100,
      timezone: 'Asia/Kolkata',
      isActive: true,
    },
  });

  // 11. Standard Shift & Attendance Policy
  const attPolicy = await prisma.attendancePolicy.upsert({
    where: {
      organizationId_code_version: {
        organizationId: org.id,
        code: 'STD-OFFICE',
        version: 1,
      },
    },
    update: {
      name: 'Standard Foundation Office Policy',
      standardWorkMinutes: 480,
      halfDayThresholdMinutes: 240,
      fullDayThresholdMinutes: 420,
      gracePeriodMinutes: 15,
      isDefault: true,
    },
    create: {
      organizationId: org.id,
      branchId: adtBranch.id,
      name: 'Standard Foundation Office Policy',
      code: 'STD-OFFICE',
      version: 1,
      description: 'Standard 8-hour working day with 15-minute grace period',
      standardWorkMinutes: 480,
      halfDayThresholdMinutes: 240,
      fullDayThresholdMinutes: 420,
      gracePeriodMinutes: 15,
      isDefault: true,
    },
  });

  const generalShift = await prisma.shift.upsert({
    where: {
      organizationId_code: {
        organizationId: org.id,
        code: 'GS',
      },
    },
    update: {
      name: 'General Shift (09:00 - 18:00)',
      startTime: '09:00',
      endTime: '18:00',
      workDays: [1, 2, 3, 4, 5, 6], // Mon through Sat
      breakDurationMinutes: 60,
    },
    create: {
      organizationId: org.id,
      policyId: attPolicy.id,
      code: 'GS',
      name: 'General Shift (09:00 - 18:00)',
      description: 'Foundation general office shift',
      startTime: '09:00',
      endTime: '18:00',
      workDays: [1, 2, 3, 4, 5, 6],
      breakDurationMinutes: 60,
      color: '#d97706',
    },
  });

  // Assign General Shift to all real personnel
  for (const person of realPeople) {
    const employeeId = employeeRecordMap[person.code];
    await prisma.shiftAssignment.create({
      data: {
        organizationId: org.id,
        employeeId,
        shiftId: generalShift.id,
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
  }

  // 12. Standard Leave Types & Policies (Casual Leave Only - Strictly 24 Days / Year)
  const clType = await prisma.leaveType.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'CL' } },
    update: { name: 'Casual Leave', color: '#d97706', allowHalfDay: true, isActive: true },
    create: {
      organizationId: org.id,
      code: 'CL',
      name: 'Casual Leave',
      description: 'Annual Casual Leave allowance of 24 days per year',
      color: '#d97706',
      isPaid: true,
      allowHalfDay: true,
      requiresDoc: false,
      docThresholdDays: 3,
      isActive: true,
    },
  });

  const clPolicy = await prisma.leavePolicy.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'POL-CL' } },
    update: {
      name: 'Casual Leave (24 Days)',
      annualEntitlement: 24.0,
      description: '24 days annual casual leave per year',
      accrualFrequency: 'ANNUAL',
      isActive: true,
    },
    create: {
      organizationId: org.id,
      leaveTypeId: clType.id,
      code: 'POL-CL',
      name: 'Casual Leave (24 Days)',
      description: '24 days annual casual leave per year',
      annualEntitlement: 24.0,
      accrualFrequency: 'ANNUAL',
      carryForwardLimit: 0.0,
      allowNegativeBalance: false,
      isActive: true,
    },
  });

  // Assign 24 Casual Leaves to all real personnel with clean initial balance
  const activePersonnel = await prisma.employee.findMany({ where: { organizationId: org.id } });
  for (const emp of activePersonnel) {
    await prisma.employeeLeavePolicyAssignment.create({
      data: {
        organizationId: org.id,
        employeeId: emp.id,
        leavePolicyId: clPolicy.id,
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
    });

    const entitlement = Number(clPolicy.annualEntitlement);
    const acc = await prisma.leaveBalanceAccount.create({
      data: {
        organizationId: org.id,
        employeeId: emp.id,
        leaveTypeId: clPolicy.leaveTypeId,
        leaveYear: 2026,
        openingBalance: entitlement,
        allocatedBalance: entitlement,
        accruedBalance: entitlement,
        usedBalance: 0,
        pendingBalance: 0,
        closingBalance: entitlement,
        lastReconciledAt: new Date(),
      },
    });

    await prisma.leaveBalanceTransaction.create({
      data: {
        accountId: acc.id,
        transactionType: 'OPENING_GRANT',
        amount: entitlement,
        balanceAfter: entitlement,
        reason: `Annual Casual Leave entitlement grant (${clPolicy.name})`,
        idempotencyKey: `grant:prod:${acc.id}:2026`,
      },
    });
  }

  // 13. System Settings
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

  console.log('================================================================');
  console.log('PRODUCTION ENVIRONMENT READY (ZERO DUMMY DATA)');
  console.log('================================================================');
  console.log('Operational Records:');
  console.log(' - Attendance Events: 0 (Live punches will record here)');
  console.log(' - Attendance Daily Summaries: 0 (Fresh real records)');
  console.log(' - Documents in Vault: 0 (Real documents to be uploaded manually)');
  console.log(' - Leave Policy: Casual Leave (24 days/year credited)');
  console.log('----------------------------------------------------------------');
  console.log('OFFICIAL FOUNDATION CREDENTIALS:');
  console.log('1. Executive Leadership / Admin:');
  console.log('   Email:    nilesh.nalawade@vpspcoe-ai.org');
  console.log('   Password: Password@123');
  console.log('   Role:     ADMIN (Director / Executive Head)');
  console.log('');
  console.log('2. Human Resources Lead:');
  console.log('   Email:    heena.bhatia@vpspcoe-ai.org');
  console.log('   Password: Password@123');
  console.log('   Role:     HR (HR Manager)');
  console.log('');
  console.log('3. Finance & Accounts:');
  console.log('   Email:    samruddhi.ranmode@vpspcoe-ai.org');
  console.log('   Password: Password@123');
  console.log('   Role:     ACCOUNTANT (Senior Accountant)');
  console.log('');
  console.log('4. Engineering & Product:');
  console.log('   Email:    kuldeep.lakhera@vpspcoe-ai.org');
  console.log('   Password: Password@123');
  console.log('   Role:     EMPLOYEE (Principal AI Engineer)');
  console.log('================================================================');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
