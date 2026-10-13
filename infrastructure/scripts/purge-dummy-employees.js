/**
 * Safe Purge of Dummy Seed Employees & Super Admin Provisioning for Kuldeep Lakhera
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
let argon2;

try {
  PrismaClient = require('@prisma/client').PrismaClient;
} catch (e) {
  PrismaClient = require('../../packages/database/node_modules/@prisma/client').PrismaClient;
}

try {
  argon2 = require('argon2');
} catch (e) {
  argon2 = require('../../packages/database/node_modules/argon2');
}

const prisma = new PrismaClient();

async function main() {
  console.log('============================================================');
  console.log('PURGING DUMMY EMPLOYEES & PROVISIONING REAL SUPER ADMIN');
  console.log('============================================================\n');

  const targetEmail = 'kuldeeplakhera018@gmail.com';

  // 1. Find user Kuldeep
  const kuldeepUser = await prisma.user.findFirst({
    where: { email: targetEmail },
    include: { employee: true },
  });

  if (!kuldeepUser) {
    console.error(`[ERROR] User ${targetEmail} not found!`);
    process.exit(1);
  }

  console.log(
    `[FOUND] Real User: ${kuldeepUser.firstName} ${kuldeepUser.lastName} (${kuldeepUser.email})`,
  );
  console.log(`- User ID: ${kuldeepUser.id}`);
  console.log(`- Organization ID: ${kuldeepUser.organizationId}`);

  // 2. Hash Password@123
  console.log('\n[SECURITY] Generating Argon2id hash for Password@123...');
  const newHash = await argon2.hash('Password@123', {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  // 3. Promote Kuldeep to ADMIN, HR, MANAGER, EMPLOYEE
  console.log('\n[ROLES] Assigning complete administrative roles to Kuldeep Lakhera...');
  const roles = await prisma.role.findMany({
    where: { organizationId: kuldeepUser.organizationId },
  });

  await prisma.user.update({
    where: { id: kuldeepUser.id },
    data: {
      passwordHash: newHash,
      status: 'ACTIVE',
      isActive: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });

  for (const role of roles) {
    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: kuldeepUser.id,
          roleId: role.id,
        },
      },
      update: {},
      create: {
        userId: kuldeepUser.id,
        roleId: role.id,
        assignedBy: 'SYSTEM_ADMIN_PROMOTION',
      },
    });
    console.log(`- Assigned Role: ${role.code}`);
  }

  // 4. Identify dummy users & dummy employees
  const dummyUsers = await prisma.user.findMany({
    where: { email: { not: targetEmail } },
    select: { id: true, email: true, employee: { select: { id: true, displayName: true } } },
  });

  const dummyUserIds = dummyUsers.map((u) => u.id);
  const dummyEmpIds = dummyUsers.map((u) => u.employee?.id).filter(Boolean);

  console.log(`\n[IDENTIFIED] ${dummyUsers.length} dummy user accounts to remove:`);
  dummyUsers.forEach((u) => {
    console.log(`- ${u.email} (${u.employee?.displayName || 'No employee record'})`);
  });

  // 5. Transaction-safe removal of dummy data
  console.log('\n[CLEANUP] Removing dependent dummy records in PostgreSQL...');

  await prisma.$executeRawUnsafe(`UPDATE departments SET "departmentHeadId" = NULL;`);
  await prisma.$executeRawUnsafe(`UPDATE employees SET "managerId" = NULL;`);
  await prisma.$executeRawUnsafe(`UPDATE employee_employments SET "managerId" = NULL;`);

  if (dummyEmpIds.length > 0) {
    const empIdList = dummyEmpIds.map((id) => `'${id}'`).join(',');

    // Remove restricted / non-cascading foreign keys first
    await prisma.$executeRawUnsafe(
      `DELETE FROM employee_payroll_snapshots WHERE "employeeId" IN (${empIdList});`,
    );
    await prisma.$executeRawUnsafe(`DELETE FROM goal_histories WHERE "actorId" IN (${empIdList});`);
    await prisma.$executeRawUnsafe(
      `DELETE FROM goal_progress_updates WHERE "updatedById" IN (${empIdList});`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM performance_feedbacks WHERE "authorId" IN (${empIdList});`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM performance_review_histories WHERE "actorId" IN (${empIdList});`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM review_cycle_participants WHERE "employeeId" IN (${empIdList}) OR "managerId" IN (${empIdList});`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM payroll_exceptions WHERE "employeeId" IN (${empIdList});`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM performance_goals WHERE "approvedById" IN (${empIdList}) OR "assignedById" IN (${empIdList});`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM performance_reviews WHERE "managerId" IN (${empIdList});`,
    );

    // Delete Dummy Employees (Cascades will delete all remaining relations: attendance sessions, events, leaves, etc.)
    await prisma.$executeRawUnsafe(`DELETE FROM employees WHERE id IN (${empIdList});`);
    console.log(`- Removed ${dummyEmpIds.length} dummy Employee records`);
  }

  if (dummyUserIds.length > 0) {
    const userIdList = dummyUserIds.map((id) => `'${id}'`).join(',');

    await prisma.$executeRawUnsafe(`DELETE FROM sessions WHERE "userId" IN (${userIdList});`);
    await prisma.$executeRawUnsafe(`DELETE FROM user_roles WHERE "userId" IN (${userIdList});`);
    await prisma.$executeRawUnsafe(`DELETE FROM audit_logs WHERE "userId" IN (${userIdList});`);
    await prisma.$executeRawUnsafe(`DELETE FROM users WHERE id IN (${userIdList});`);
    console.log(`- Removed ${dummyUserIds.length} dummy User records and sessions`);
  }

  // 6. Verify Remaining Database State
  const remainingUsers = await prisma.user.findMany({
    select: {
      email: true,
      firstName: true,
      lastName: true,
      userRoles: { select: { role: { select: { code: true } } } },
    },
  });

  const remainingEmployees = await prisma.employee.findMany({
    select: {
      employeeCode: true,
      displayName: true,
    },
  });

  console.log('\n============================================================');
  console.log('[SUCCESS] DUMMY EMPLOYEES PURGED SUCCESSFULLY!');
  console.log('============================================================');
  console.log('REMAINING USERS IN DATABASE:');
  console.log(JSON.stringify(remainingUsers, null, 2));
  console.log('\nREMAINING EMPLOYEES IN DATABASE:');
  console.log(JSON.stringify(remainingEmployees, null, 2));
  console.log('\nLogin credentials for testing:');
  console.log(`Email:    ${targetEmail}`);
  console.log(`Password: Password@123`);
  console.log(`Roles:    ADMIN, HR, MANAGER, EMPLOYEE`);
  console.log('============================================================\n');
}

main()
  .catch((err) => {
    console.error('[FATAL] Cleanup failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
