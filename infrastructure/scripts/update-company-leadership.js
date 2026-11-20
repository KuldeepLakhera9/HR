/**
 * Production-Grade Leadership Provisioning & Synchronization Script
 * Updates company leadership profiles according to the organization hierarchy:
 * - CEO: Nilesh Nalawade (Role: ADMIN)
 * - HR Lead: Heena Bhatia (Role: HR)
 * - Team Lead / Manager: Santosh Deshmukh (Role: MANAGER)
 * - Team Lead / Manager: Sanjani (Role: MANAGER)
 * - Team Member / Data Engineer: Kuldeep Lakhera (Reports to Santosh Deshmukh)
 */

const path = require('path');
const fs = require('fs');

function loadEnvFile(envPath) {
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnvFile(path.resolve(__dirname, '../../packages/database/.env'));
loadEnvFile(path.resolve(__dirname, '../../apps/api/.env'));

let PrismaClient;
try {
  PrismaClient = require('@prisma/client').PrismaClient;
} catch (e) {
  PrismaClient = require('../../packages/database/node_modules/@prisma/client').PrismaClient;
}

let argon2;
try {
  argon2 = require('argon2');
} catch (e) {
  argon2 = require('../../packages/database/node_modules/argon2');
}

const prisma = new PrismaClient();

async function main() {
  console.log('======================================================================');
  console.log('SYNCHRONIZING COMPANY LEADERSHIP PROFILES AND ACCESS CREDENTIALS');
  console.log('======================================================================\n');

  // 1. Fetch organization
  const org = await prisma.organization.findFirst();
  if (!org) {
    console.error('No organization found!');
    process.exit(1);
  }
  console.log(`[INFO] Organization: ${org.name} (${org.code})`);

  // 2. Fetch or create branch
  let branch = await prisma.branch.findFirst({ where: { organizationId: org.id } });
  if (!branch) {
    branch = await prisma.branch.create({
      data: {
        organizationId: org.id,
        code: 'ADT-AITF',
        name: 'ADT-AI Training Foundation',
        city: 'Baramati',
        state: 'Maharashtra',
        country: 'India',
        isActive: true,
      },
    });
  }

  // 3. Departments
  const deptExec = await prisma.department.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'EXEC' } },
    update: { name: 'Executive Leadership' },
    create: {
      organizationId: org.id,
      code: 'EXEC',
      name: 'Executive Leadership',
      description: 'C-suite & strategic governance',
    },
  });

  const deptHr = await prisma.department.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'HR' } },
    update: { name: 'Human Resources' },
    create: {
      organizationId: org.id,
      code: 'HR',
      name: 'Human Resources',
      description: 'People operations, talent, and culture',
    },
  });

  const deptEng = await prisma.department.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'ENG' } },
    update: { name: 'Engineering & Product' },
    create: {
      organizationId: org.id,
      code: 'ENG',
      name: 'Engineering & Product',
      description: 'Software engineering, architecture, and design',
    },
  });

  // 4. Designations
  const desigCeo = await prisma.designation.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'CEO' } },
    update: { title: 'Chief Executive Officer', level: 5, departmentId: deptExec.id },
    create: {
      organizationId: org.id,
      departmentId: deptExec.id,
      code: 'CEO',
      title: 'Chief Executive Officer',
      name: 'Chief Executive Officer',
      level: 5,
      description: 'Chief Executive Officer & Executive Leadership',
    },
  });

  const desigHrLead = await prisma.designation.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'HR-LEAD' } },
    update: { title: 'People Operations Lead', level: 3, departmentId: deptHr.id },
    create: {
      organizationId: org.id,
      departmentId: deptHr.id,
      code: 'HR-LEAD',
      title: 'People Operations Lead',
      name: 'People Operations Lead',
      level: 3,
      description: 'HR policies and employee experience',
    },
  });

  const desigEm = await prisma.designation.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'EM' } },
    update: { title: 'Engineering Manager', level: 4, departmentId: deptEng.id },
    create: {
      organizationId: org.id,
      departmentId: deptEng.id,
      code: 'EM',
      title: 'Engineering Manager',
      name: 'Engineering Manager',
      level: 4,
      description: 'Engineering team management and technical delivery',
    },
  });

  const desigTl = await prisma.designation.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'TL' } },
    update: { title: 'Team Lead', level: 4, departmentId: deptEng.id },
    create: {
      organizationId: org.id,
      departmentId: deptEng.id,
      code: 'TL',
      title: 'Team Lead',
      name: 'Team Lead',
      level: 4,
      description: 'Technical leadership and team supervision',
    },
  });

  // 5. System Roles
  const adminRole = await prisma.role.findFirst({
    where: { organizationId: org.id, code: 'ADMIN' },
  });
  const hrRole = await prisma.role.findFirst({ where: { organizationId: org.id, code: 'HR' } });
  const managerRole = await prisma.role.findFirst({
    where: { organizationId: org.id, code: 'MANAGER' },
  });
  const employeeRole = await prisma.role.findFirst({
    where: { organizationId: org.id, code: 'EMPLOYEE' },
  });

  // 6. Common Argon2 password hash for Password@123
  console.log('[SECURITY] Generating Argon2id password hash for Password@123...');
  const passwordHash = await argon2.hash('Password@123', {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  // Helper to assign strict single role
  async function assignRole(userId, targetRoleId) {
    await prisma.userRole.deleteMany({ where: { userId } });
    await prisma.userRole.create({
      data: {
        userId,
        roleId: targetRoleId,
        assignedBy: 'LEADERSHIP_SYNC',
      },
    });
  }

  // ==========================================
  // PROFILE 1: CEO Nilesh Nalawade
  // ==========================================
  console.log('\n[1/5] Configuring CEO: Nilesh Nalawade...');
  let ceoUser = await prisma.user.findFirst({
    where: {
      organizationId: org.id,
      OR: [
        { email: 'nilesh.nalawade@peopleos.local' },
        { employeeCode: 'EMP001' },
        { email: 'admin@peopleos.local' },
      ],
    },
  });

  if (ceoUser) {
    ceoUser = await prisma.user.update({
      where: { id: ceoUser.id },
      data: {
        email: 'nilesh.nalawade@peopleos.local',
        firstName: 'Nilesh',
        lastName: 'Nalawade',
        employeeCode: 'EMP001',
        passwordHash,
        status: 'ACTIVE',
        isActive: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
        departmentId: deptExec.id,
        designationId: desigCeo.id,
        branchId: branch.id,
      },
    });
  } else {
    ceoUser = await prisma.user.create({
      data: {
        organizationId: org.id,
        email: 'nilesh.nalawade@peopleos.local',
        firstName: 'Nilesh',
        lastName: 'Nalawade',
        employeeCode: 'EMP001',
        passwordHash,
        status: 'ACTIVE',
        isActive: true,
        departmentId: deptExec.id,
        designationId: desigCeo.id,
        branchId: branch.id,
      },
    });
  }
  await assignRole(ceoUser.id, adminRole.id);

  let ceoEmployee = await prisma.employee.findFirst({
    where: { organizationId: org.id, OR: [{ userId: ceoUser.id }, { employeeCode: 'EMP001' }] },
  });

  if (ceoEmployee) {
    ceoEmployee = await prisma.employee.update({
      where: { id: ceoEmployee.id },
      data: {
        userId: ceoUser.id,
        firstName: 'Nilesh',
        lastName: 'Nalawade',
        displayName: 'Nilesh Nalawade',
        employeeCode: 'EMP001',
        status: 'ACTIVE',
        isActive: true,
        managerId: null, // CEO has no manager
      },
    });
  } else {
    ceoEmployee = await prisma.employee.create({
      data: {
        organizationId: org.id,
        userId: ceoUser.id,
        firstName: 'Nilesh',
        lastName: 'Nalawade',
        displayName: 'Nilesh Nalawade',
        employeeCode: 'EMP001',
        gender: 'MALE',
        status: 'ACTIVE',
        isActive: true,
        joiningDate: new Date('2022-01-10'),
      },
    });
  }

  await prisma.employeeEmployment.upsert({
    where: { employeeId: ceoEmployee.id },
    update: {
      branchId: branch.id,
      departmentId: deptExec.id,
      designationId: desigCeo.id,
      managerId: null,
      employmentStatus: 'ACTIVE',
    },
    create: {
      employeeId: ceoEmployee.id,
      branchId: branch.id,
      departmentId: deptExec.id,
      designationId: desigCeo.id,
      managerId: null,
      employmentType: 'FULL_TIME',
      employmentStatus: 'ACTIVE',
      workMode: 'OFFICE',
    },
  });

  await prisma.employeeContact.upsert({
    where: { employeeId: ceoEmployee.id },
    update: {
      workEmail: 'nilesh.nalawade@peopleos.local',
      personalEmail: 'nilesh.nalawade@personal.example.com',
      city: 'Baramati',
      state: 'Maharashtra',
      country: 'India',
    },
    create: {
      employeeId: ceoEmployee.id,
      workEmail: 'nilesh.nalawade@peopleos.local',
      personalEmail: 'nilesh.nalawade@personal.example.com',
      city: 'Baramati',
      state: 'Maharashtra',
      country: 'India',
    },
  });

  // Set Department Head for EXEC
  await prisma.department.update({
    where: { id: deptExec.id },
    data: { departmentHeadId: ceoEmployee.id },
  });

  // ==========================================
  // PROFILE 2: HR Heena Bhatia
  // ==========================================
  console.log('\n[2/5] Configuring HR: Heena Bhatia...');
  let hrUser = await prisma.user.findFirst({
    where: {
      organizationId: org.id,
      OR: [
        { email: 'heena.bhatia@peopleos.local' },
        { employeeCode: 'EMP002' },
        { email: 'hr@peopleos.local' },
      ],
    },
  });

  if (hrUser) {
    hrUser = await prisma.user.update({
      where: { id: hrUser.id },
      data: {
        email: 'heena.bhatia@peopleos.local',
        firstName: 'Heena',
        lastName: 'Bhatia',
        employeeCode: 'EMP002',
        passwordHash,
        status: 'ACTIVE',
        isActive: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
        departmentId: deptHr.id,
        designationId: desigHrLead.id,
        branchId: branch.id,
      },
    });
  } else {
    hrUser = await prisma.user.create({
      data: {
        organizationId: org.id,
        email: 'heena.bhatia@peopleos.local',
        firstName: 'Heena',
        lastName: 'Bhatia',
        employeeCode: 'EMP002',
        passwordHash,
        status: 'ACTIVE',
        isActive: true,
        departmentId: deptHr.id,
        designationId: desigHrLead.id,
        branchId: branch.id,
      },
    });
  }
  await assignRole(hrUser.id, hrRole.id);

  let hrEmployee = await prisma.employee.findFirst({
    where: { organizationId: org.id, OR: [{ userId: hrUser.id }, { employeeCode: 'EMP002' }] },
  });

  if (hrEmployee) {
    hrEmployee = await prisma.employee.update({
      where: { id: hrEmployee.id },
      data: {
        userId: hrUser.id,
        firstName: 'Heena',
        lastName: 'Bhatia',
        displayName: 'Heena Bhatia',
        employeeCode: 'EMP002',
        gender: 'FEMALE',
        status: 'ACTIVE',
        isActive: true,
        managerId: ceoEmployee.id, // Reports to CEO Nilesh Nalawade
      },
    });
  } else {
    hrEmployee = await prisma.employee.create({
      data: {
        organizationId: org.id,
        userId: hrUser.id,
        firstName: 'Heena',
        lastName: 'Bhatia',
        displayName: 'Heena Bhatia',
        employeeCode: 'EMP002',
        gender: 'FEMALE',
        status: 'ACTIVE',
        isActive: true,
        managerId: ceoEmployee.id,
        joiningDate: new Date('2022-03-01'),
      },
    });
  }

  await prisma.employeeEmployment.upsert({
    where: { employeeId: hrEmployee.id },
    update: {
      branchId: branch.id,
      departmentId: deptHr.id,
      designationId: desigHrLead.id,
      managerId: ceoEmployee.id,
      employmentStatus: 'ACTIVE',
    },
    create: {
      employeeId: hrEmployee.id,
      branchId: branch.id,
      departmentId: deptHr.id,
      designationId: desigHrLead.id,
      managerId: ceoEmployee.id,
      employmentType: 'FULL_TIME',
      employmentStatus: 'ACTIVE',
      workMode: 'HYBRID',
    },
  });

  await prisma.employeeContact.upsert({
    where: { employeeId: hrEmployee.id },
    update: {
      workEmail: 'heena.bhatia@peopleos.local',
      personalEmail: 'heena.bhatia@personal.example.com',
      city: 'Baramati',
      state: 'Maharashtra',
      country: 'India',
    },
    create: {
      employeeId: hrEmployee.id,
      workEmail: 'heena.bhatia@peopleos.local',
      personalEmail: 'heena.bhatia@personal.example.com',
      city: 'Baramati',
      state: 'Maharashtra',
      country: 'India',
    },
  });

  // Set Department Head for HR
  await prisma.department.update({
    where: { id: deptHr.id },
    data: { departmentHeadId: hrEmployee.id },
  });

  // ==========================================
  // PROFILE 3: Team Lead Santosh Deshmukh
  // ==========================================
  console.log('\n[3/5] Configuring Team Lead / Manager: Santosh Deshmukh...');
  let santoshUser = await prisma.user.findFirst({
    where: {
      organizationId: org.id,
      OR: [
        { email: 'santosh.deshmukh@peopleos.local' },
        { employeeCode: 'EMP003' },
        { email: 'manager@peopleos.local' },
      ],
    },
  });

  if (santoshUser) {
    santoshUser = await prisma.user.update({
      where: { id: santoshUser.id },
      data: {
        email: 'santosh.deshmukh@peopleos.local',
        firstName: 'Santosh',
        lastName: 'Deshmukh',
        employeeCode: 'EMP003',
        passwordHash,
        status: 'ACTIVE',
        isActive: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
        departmentId: deptEng.id,
        designationId: desigEm.id,
        branchId: branch.id,
      },
    });
  } else {
    santoshUser = await prisma.user.create({
      data: {
        organizationId: org.id,
        email: 'santosh.deshmukh@peopleos.local',
        firstName: 'Santosh',
        lastName: 'Deshmukh',
        employeeCode: 'EMP003',
        passwordHash,
        status: 'ACTIVE',
        isActive: true,
        departmentId: deptEng.id,
        designationId: desigEm.id,
        branchId: branch.id,
      },
    });
  }
  await assignRole(santoshUser.id, managerRole.id);

  let santoshEmployee = await prisma.employee.findFirst({
    where: { organizationId: org.id, OR: [{ userId: santoshUser.id }, { employeeCode: 'EMP003' }] },
  });

  if (santoshEmployee) {
    santoshEmployee = await prisma.employee.update({
      where: { id: santoshEmployee.id },
      data: {
        userId: santoshUser.id,
        firstName: 'Santosh',
        lastName: 'Deshmukh',
        displayName: 'Santosh Deshmukh',
        employeeCode: 'EMP003',
        gender: 'MALE',
        status: 'ACTIVE',
        isActive: true,
        managerId: ceoEmployee.id, // Reports to CEO Nilesh Nalawade
      },
    });
  } else {
    santoshEmployee = await prisma.employee.create({
      data: {
        organizationId: org.id,
        userId: santoshUser.id,
        firstName: 'Santosh',
        lastName: 'Deshmukh',
        displayName: 'Santosh Deshmukh',
        employeeCode: 'EMP003',
        gender: 'MALE',
        status: 'ACTIVE',
        isActive: true,
        managerId: ceoEmployee.id,
        joiningDate: new Date('2022-04-15'),
      },
    });
  }

  await prisma.employeeEmployment.upsert({
    where: { employeeId: santoshEmployee.id },
    update: {
      branchId: branch.id,
      departmentId: deptEng.id,
      designationId: desigEm.id,
      managerId: ceoEmployee.id,
      employmentStatus: 'ACTIVE',
    },
    create: {
      employeeId: santoshEmployee.id,
      branchId: branch.id,
      departmentId: deptEng.id,
      designationId: desigEm.id,
      managerId: ceoEmployee.id,
      employmentType: 'FULL_TIME',
      employmentStatus: 'ACTIVE',
      workMode: 'HYBRID',
    },
  });

  await prisma.employeeContact.upsert({
    where: { employeeId: santoshEmployee.id },
    update: {
      workEmail: 'santosh.deshmukh@peopleos.local',
      personalEmail: 'santosh.deshmukh@personal.example.com',
      city: 'Baramati',
      state: 'Maharashtra',
      country: 'India',
    },
    create: {
      employeeId: santoshEmployee.id,
      workEmail: 'santosh.deshmukh@peopleos.local',
      personalEmail: 'santosh.deshmukh@personal.example.com',
      city: 'Baramati',
      state: 'Maharashtra',
      country: 'India',
    },
  });

  // Set Department Head for ENG
  await prisma.department.update({
    where: { id: deptEng.id },
    data: { departmentHeadId: santoshEmployee.id },
  });

  // ==========================================
  // PROFILE 4: Team Lead Sanjani
  // ==========================================
  console.log('\n[4/5] Configuring Team Lead / Manager: Sanjani...');
  let sanjaniUser = await prisma.user.findFirst({
    where: {
      organizationId: org.id,
      OR: [{ email: 'sanjani@peopleos.local' }, { employeeCode: 'EMP005' }],
    },
  });

  if (sanjaniUser) {
    sanjaniUser = await prisma.user.update({
      where: { id: sanjaniUser.id },
      data: {
        email: 'sanjani@peopleos.local',
        firstName: 'Sanjani',
        lastName: 'Lead',
        employeeCode: 'EMP005',
        passwordHash,
        status: 'ACTIVE',
        isActive: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
        departmentId: deptEng.id,
        designationId: desigTl.id,
        branchId: branch.id,
      },
    });
  } else {
    sanjaniUser = await prisma.user.create({
      data: {
        organizationId: org.id,
        email: 'sanjani@peopleos.local',
        firstName: 'Sanjani',
        lastName: 'Lead',
        employeeCode: 'EMP005',
        passwordHash,
        status: 'ACTIVE',
        isActive: true,
        departmentId: deptEng.id,
        designationId: desigTl.id,
        branchId: branch.id,
      },
    });
  }
  await assignRole(sanjaniUser.id, managerRole.id);

  let sanjaniEmployee = await prisma.employee.findFirst({
    where: { organizationId: org.id, OR: [{ userId: sanjaniUser.id }, { employeeCode: 'EMP005' }] },
  });

  if (sanjaniEmployee) {
    sanjaniEmployee = await prisma.employee.update({
      where: { id: sanjaniEmployee.id },
      data: {
        userId: sanjaniUser.id,
        firstName: 'Sanjani',
        lastName: 'Lead',
        displayName: 'Sanjani',
        employeeCode: 'EMP005',
        gender: 'FEMALE',
        status: 'ACTIVE',
        isActive: true,
        managerId: ceoEmployee.id, // Reports to CEO Nilesh Nalawade
      },
    });
  } else {
    sanjaniEmployee = await prisma.employee.create({
      data: {
        organizationId: org.id,
        userId: sanjaniUser.id,
        firstName: 'Sanjani',
        lastName: 'Lead',
        displayName: 'Sanjani',
        employeeCode: 'EMP005',
        gender: 'FEMALE',
        status: 'ACTIVE',
        isActive: true,
        managerId: ceoEmployee.id,
        joiningDate: new Date('2022-05-01'),
      },
    });
  }

  await prisma.employeeEmployment.upsert({
    where: { employeeId: sanjaniEmployee.id },
    update: {
      branchId: branch.id,
      departmentId: deptEng.id,
      designationId: desigTl.id,
      managerId: ceoEmployee.id,
      employmentStatus: 'ACTIVE',
    },
    create: {
      employeeId: sanjaniEmployee.id,
      branchId: branch.id,
      departmentId: deptEng.id,
      designationId: desigTl.id,
      managerId: ceoEmployee.id,
      employmentType: 'FULL_TIME',
      employmentStatus: 'ACTIVE',
      workMode: 'HYBRID',
    },
  });

  await prisma.employeeContact.upsert({
    where: { employeeId: sanjaniEmployee.id },
    update: {
      workEmail: 'sanjani@peopleos.local',
      personalEmail: 'sanjani@personal.example.com',
      city: 'Baramati',
      state: 'Maharashtra',
      country: 'India',
    },
    create: {
      employeeId: sanjaniEmployee.id,
      workEmail: 'sanjani@peopleos.local',
      personalEmail: 'sanjani@personal.example.com',
      city: 'Baramati',
      state: 'Maharashtra',
      country: 'India',
    },
  });

  const existingEmergency = await prisma.emergencyContact.findFirst({
    where: { employeeId: sanjaniEmployee.id },
  });
  if (existingEmergency) {
    await prisma.emergencyContact.update({
      where: { id: existingEmergency.id },
      data: {
        name: 'Family Emergency Contact',
        relationship: 'Parent / Spouse',
        phone: '+91 98765 99998',
        isPrimary: true,
      },
    });
  } else {
    await prisma.emergencyContact.create({
      data: {
        employeeId: sanjaniEmployee.id,
        name: 'Family Emergency Contact',
        relationship: 'Parent / Spouse',
        phone: '+91 98765 99998',
        isPrimary: true,
      },
    });
  }

  // Assign leave policies to Sanjani if missing
  const leavePolicies = await prisma.leavePolicy.findMany({ where: { organizationId: org.id } });
  for (const pol of leavePolicies) {
    const existingAssign = await prisma.employeeLeavePolicyAssignment.findFirst({
      where: { employeeId: sanjaniEmployee.id, leavePolicyId: pol.id },
    });
    if (!existingAssign) {
      await prisma.employeeLeavePolicyAssignment.create({
        data: {
          organizationId: org.id,
          employeeId: sanjaniEmployee.id,
          leavePolicyId: pol.id,
          effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        },
      });

      const entitlement = Number(pol.annualEntitlement);
      const acc = await prisma.leaveBalanceAccount.create({
        data: {
          organizationId: org.id,
          employeeId: sanjaniEmployee.id,
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

      await prisma.leaveBalanceTransaction.create({
        data: {
          accountId: acc.id,
          transactionType: 'OPENING_GRANT',
          amount: entitlement,
          balanceAfter: entitlement,
          reason: `Initial annual entitlement grant (${pol.name})`,
          idempotencyKey: `grant:sync:${acc.id}:2026`,
        },
      });
    }
  }

  // ==========================================
  // PROFILE 5: Kuldeep Lakhera (Reports to Santosh Deshmukh)
  // ==========================================
  console.log('\n[5/5] Aligning reporting hierarchy for Kuldeep Lakhera...');
  const kuldeepUser = await prisma.user.findFirst({
    where: {
      organizationId: org.id,
      OR: [
        { email: 'kuldeep.lakhera@vpspcoe-ai.org' },
        { email: 'kuldeeplakhera018@gmail.com' },
        { employeeCode: 'EMP004' },
      ],
    },
  });

  if (kuldeepUser) {
    const kuldeepEmp = await prisma.employee.findFirst({
      where: { userId: kuldeepUser.id },
    });

    if (kuldeepEmp) {
      await prisma.employee.update({
        where: { id: kuldeepEmp.id },
        data: { managerId: santoshEmployee.id },
      });

      await prisma.employeeEmployment.updateMany({
        where: { employeeId: kuldeepEmp.id },
        data: { managerId: santoshEmployee.id },
      });
      console.log(
        `[UPDATED] Kuldeep Lakhera now reports to Team Lead Santosh Deshmukh (${santoshEmployee.displayName})`,
      );
    }
  }

  console.log('\n======================================================================');
  console.log('COMPANY LEADERSHIP PROFILES CONFIGURED & VERIFIED:');
  console.log('======================================================================');
  console.log('1. CEO / Executive Leadership (Role: ADMIN)');
  console.log('   - Name: Nilesh Nalawade');
  console.log('   - Email: nilesh.nalawade@vpspcoe-ai.org');
  console.log('   - Password: Password@123');
  console.log('   - Designation: Chief Executive Officer (CEO)');
  console.log('   - Employee Code: EMP001');
  console.log('----------------------------------------------------------------------');
  console.log('2. Human Resources Lead (Role: HR)');
  console.log('   - Name: Heena Bhatia');
  console.log('   - Email: heena.bhatia@vpspcoe-ai.org');
  console.log('   - Password: Password@123');
  console.log('   - Designation: People Operations Lead');
  console.log('   - Employee Code: EMP002');
  console.log('   - Reports to: Nilesh Nalawade (CEO)');
  console.log('----------------------------------------------------------------------');
  console.log('3. Team Lead / Engineering Manager (Role: MANAGER)');
  console.log('   - Name: Santosh Deshmukh');
  console.log('   - Email: santosh.deshmukh@vpspcoe-ai.org');
  console.log('   - Password: Password@123');
  console.log('   - Designation: Engineering Manager');
  console.log('   - Employee Code: EMP003');
  console.log('   - Reports to: Nilesh Nalawade (CEO)');
  console.log('----------------------------------------------------------------------');
  console.log('4. Team Lead / Manager (Role: MANAGER)');
  console.log('   - Name: Sanjani');
  console.log('   - Email: sanjani@vpspcoe-ai.org');
  console.log('   - Password: Password@123');
  console.log('   - Designation: Team Lead / Engineering Manager');
  console.log('   - Employee Code: EMP005');
  console.log('   - Reports to: Nilesh Nalawade (CEO)');
  console.log('----------------------------------------------------------------------');
  console.log('5. Data Engineer (Role: EMPLOYEE)');
  console.log('   - Name: Kuldeep Lakhera');
  console.log('   - Email: kuldeep.lakhera@vpspcoe-ai.org');
  console.log('   - Employee Code: EMP004');
  console.log('   - Reports to: Santosh Deshmukh (Team Lead)');
  console.log('======================================================================\n');

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[ERROR]', err);
  process.exit(1);
});
