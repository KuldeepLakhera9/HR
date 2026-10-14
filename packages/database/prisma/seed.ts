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
  console.log('Resetting and seeding clean HRMS data...');

  // 0. Clean all existing operational, employee, and user data
  console.log('Truncating existing operational, employee, and authentication data...');
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

    // HR receives workforce, leave, payroll, organization and settings capabilities
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
      'VISIT_VIEW',
      'VISIT_APPLY',
      'VISIT_APPROVE',
      'WFH_VIEW',
      'WFH_APPLY',
      'WFH_APPROVE',
      'DOCUMENT_VIEW',
      'DOCUMENT_MANAGE',
      'REPORT_VIEW',
      'REPORT_EXPORT',
      'PROFILE_CHANGE_REVIEW',
      'PAYROLL_VIEW',
      'PAYROLL_MANAGE',
      'PAYROLL_COMPENSATION',
      'PAYROLL_EXECUTE',
      'PAYROLL_APPROVE',
      'PAYROLL_PUBLISH',
      'PAYSLIP_VIEW_SELF',
      'PAYROLL_EXPORT',
      'PERFORMANCE_VIEW',
      'GOAL_MANAGE',
      'REVIEW_CYCLE_MANAGE',
      'APPRAISAL_EXECUTE',
      'SETTING_VIEW',
    ],

    // MANAGER receives team visibility, approval rights, org view and performance
    [RoleCode.MANAGER]: [
      'ORGANIZATION_VIEW',
      'BRANCH_VIEW',
      'DEPARTMENT_VIEW',
      'DESIGNATION_VIEW',
      'EMPLOYEE_VIEW',
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
      'WFH_VIEW',
      'WFH_APPLY',
      'WFH_APPROVE',
      'DOCUMENT_VIEW',
      'REPORT_VIEW',
      'PAYSLIP_VIEW_SELF',
      'PERFORMANCE_VIEW',
      'GOAL_MANAGE',
    ],

    // EMPLOYEE receives self-service and org chart visibility
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
      'VISIT_VIEW',
      'VISIT_APPLY',
      'WFH_VIEW',
      'WFH_APPLY',
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

  // 8. Exactly 3 Foundational Accounts: 1 Admin, 1 HR, 1 Manager
  const seedPeople = [
    {
      code: 'EMP001',
      email: 'admin@peopleos.local',
      firstName: 'Admin',
      lastName: 'User',
      role: RoleCode.ADMIN,
      deptCode: 'EXEC',
      desigCode: 'CTO',
      branchCode: 'ADT-AITF',
      managerCode: null,
      gender: Gender.MALE,
      status: EmploymentStatus.ACTIVE,
      workMode: WorkMode.OFFICE,
      employmentType: EmploymentType.FULL_TIME,
      joiningDate: new Date('2022-01-10'),
      phone: '+91 98765 00001',
      dob: new Date('1985-01-01'),
      city: 'Baramati',
      state: 'Maharashtra',
    },
    {
      code: 'EMP002',
      email: 'hr@peopleos.local',
      firstName: 'HR',
      lastName: 'Manager',
      role: RoleCode.HR,
      deptCode: 'HR',
      desigCode: 'HR-LEAD',
      branchCode: 'ADT-AITF',
      managerCode: 'EMP001',
      gender: Gender.FEMALE,
      status: EmploymentStatus.ACTIVE,
      workMode: WorkMode.HYBRID,
      employmentType: EmploymentType.FULL_TIME,
      joiningDate: new Date('2022-03-01'),
      phone: '+91 98765 00002',
      dob: new Date('1990-05-15'),
      city: 'Baramati',
      state: 'Maharashtra',
    },
    {
      code: 'EMP003',
      email: 'manager@peopleos.local',
      firstName: 'Team',
      lastName: 'Manager',
      role: RoleCode.MANAGER,
      deptCode: 'ENG',
      desigCode: 'EM',
      branchCode: 'ADT-AITF',
      managerCode: 'EMP001',
      gender: Gender.MALE,
      status: EmploymentStatus.ACTIVE,
      workMode: WorkMode.HYBRID,
      employmentType: EmploymentType.FULL_TIME,
      joiningDate: new Date('2022-04-15'),
      phone: '+91 98765 00003',
      dob: new Date('1988-08-20'),
      city: 'Baramati',
      state: 'Maharashtra',
    },
  ];

  // Argon2id hash for Password@123
  const passwordHash = await argon2.hash('Password@123');

  const employeeRecordMap: Record<string, string> = {};
  const branchMap: Record<string, string> = {
    'ADT-AITF': adtBranch.id,
  };

  // Step 8a: Create Users and Base Employees
  for (const person of seedPeople) {
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

    // 2. Strict single role assignment (Admin has ADMIN only, HR has HR only, Manager has MANAGER only)
    const role = await prisma.role.findFirst({
      where: { organizationId: org.id, code: person.role },
    });
    if (role) {
      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: role.id,
          assignedBy: 'SYSTEM_SEED',
        },
      });
    }

    // 3. Employee Normalized Record
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
        isActive: true,
      },
    });

    employeeRecordMap[person.code] = employee.id;

    // 4. Employee Contact
    await prisma.employeeContact.create({
      data: {
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

    // 6. Documents Metadata
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

  // Step 8b: Wire Manager Relationships & Employments
  for (const person of seedPeople) {
    const employeeId = employeeRecordMap[person.code];
    const branchId = branchMap[person.branchCode];
    const deptId = deptMap[person.deptCode];
    const desigId = desigMap[person.desigCode];
    const managerId = person.managerCode ? employeeRecordMap[person.managerCode] : null;

    // Update managerId on Employee table
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

    // Initial Join History Record
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
  if (deptMap['ENG'] && employeeRecordMap['EMP003']) {
    await prisma.department.update({
      where: { id: deptMap['ENG'] },
      data: { departmentHeadId: employeeRecordMap['EMP003'] }, // Team Manager
    });
  }
  if (deptMap['HR'] && employeeRecordMap['EMP002']) {
    await prisma.department.update({
      where: { id: deptMap['HR'] },
      data: { departmentHeadId: employeeRecordMap['EMP002'] }, // HR Manager
    });
  }
  if (deptMap['EXEC'] && employeeRecordMap['EMP001']) {
    await prisma.department.update({
      where: { id: deptMap['EXEC'] },
      data: { departmentHeadId: employeeRecordMap['EMP001'] }, // Admin User
    });
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

  // 10. Default Primary Office Location
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

  // 11. Standard Leave Types & Policies
  const clType = await prisma.leaveType.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'CL' } },
    update: { name: 'Casual Leave', color: '#d97706', allowHalfDay: true },
    create: {
      organizationId: org.id,
      code: 'CL',
      name: 'Casual Leave',
      description: 'Casual leave for personal appointments and short unplanned absences',
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
    update: { name: 'Sick Leave', color: '#dc2626', allowHalfDay: true },
    create: {
      organizationId: org.id,
      code: 'SL',
      name: 'Sick Leave',
      description: 'Sick leave for medical care, recovery, and illness',
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
    update: { name: 'Privilege / Earned Leave', color: '#2563eb', allowHalfDay: false },
    create: {
      organizationId: org.id,
      code: 'PL',
      name: 'Privilege / Earned Leave',
      description: 'Earned leave policy for planned vacations and time off',
      color: '#2563eb',
      isPaid: true,
      allowHalfDay: false,
      requiresDoc: false,
      docThresholdDays: 5,
      isActive: true,
    },
  });

  const clPolicy = await prisma.leavePolicy.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'POL-CL' } },
    update: { annualEntitlement: 12.0 },
    create: {
      organizationId: org.id,
      leaveTypeId: clType.id,
      code: 'POL-CL',
      name: 'Standard Casual Leave (12 Days)',
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
    where: { organizationId_code: { organizationId: org.id, code: 'POL-SL' } },
    update: { annualEntitlement: 10.0 },
    create: {
      organizationId: org.id,
      leaveTypeId: slType.id,
      code: 'POL-SL',
      name: 'Standard Sick Leave (10 Days)',
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
    where: { organizationId_code: { organizationId: org.id, code: 'POL-PL' } },
    update: { annualEntitlement: 15.0 },
    create: {
      organizationId: org.id,
      leaveTypeId: plType.id,
      code: 'POL-PL',
      name: 'Standard Earned Leave (15 Days)',
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

  // Assign policies to all 3 foundational employees and initialize opening ledger
  const allEmployees = await prisma.employee.findMany({ where: { organizationId: org.id } });
  const samplePolicies = [clPolicy, slPolicy, plPolicy];

  for (const emp of allEmployees) {
    for (const pol of samplePolicies) {
      await prisma.employeeLeavePolicyAssignment.create({
        data: {
          organizationId: org.id,
          employeeId: emp.id,
          leavePolicyId: pol.id,
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        },
      });

      const entitlement = Number(pol.annualEntitlement);
      const acc = await prisma.leaveBalanceAccount.create({
        data: {
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
      await prisma.leaveBalanceTransaction.create({
        data: {
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

  console.log('------------------------------------------------------------');
  console.log('CLEAN HRMS SEED COMPLETED SUCCESSFULLY:');
  console.log('1. Admin Account:');
  console.log('   - Email: admin@peopleos.local');
  console.log('   - Password: Password@123');
  console.log('   - Role: ADMIN (EMP001)');
  console.log('2. HR Account:');
  console.log('   - Email: hr@peopleos.local');
  console.log('   - Password: Password@123');
  console.log('   - Role: HR (EMP002)');
  console.log('3. Manager Account:');
  console.log('   - Email: manager@peopleos.local');
  console.log('   - Password: Password@123');
  console.log('   - Role: MANAGER (EMP003)');
  console.log('------------------------------------------------------------');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
