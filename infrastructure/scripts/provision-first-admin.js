/**
 * First-Administrator Provisioning Utility
 *
 * SECURE BOOTSTRAP SCRIPT FOR INITIAL DEPLOYMENT ONLY
 *
 * This utility safely initializes the primary organization administrator during fresh production
 * deployment when zero administrator accounts exist.
 *
 * Security Controls Enforced:
 * 1. Checks if ANY active user with RoleCode 'ADMIN' exists. If one or more exists, the process
 *    ABORTS IMMEDIATELY with an exit code 1 to prevent unauthorized account creation.
 * 2. Requires operator authorization token or explicit CLI confirmation flag (--confirm-bootstrap).
 * 3. Validates password complexity (minimum 10 characters, uppercase, lowercase, number, symbol).
 * 4. Hashes passwords using Argon2id with unique cryptographic salt.
 * 5. Generates immutable AuditLog entry recording the bootstrap event.
 * 6. Never echoes passwords or secret tokens to stdout or logs.
 */

const fs = require('fs');
const path = require('path');

// Manually parse env files if present
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
loadEnvFile(path.resolve(__dirname, '../../.env'));

let PrismaClient;
let argon2;

try {
  PrismaClient = require('@prisma/client').PrismaClient;
} catch (e) {
  try {
    PrismaClient = require('../../packages/database/node_modules/@prisma/client').PrismaClient;
  } catch (err) {
    console.error('[ERROR] Unable to resolve @prisma/client. Run `pnpm install` first.');
    process.exit(1);
  }
}

try {
  argon2 = require('argon2');
} catch (e) {
  try {
    argon2 = require('../../packages/database/node_modules/argon2');
  } catch (err) {
    console.error('[ERROR] Unable to resolve argon2. Run `pnpm install` first.');
    process.exit(1);
  }
}

const prisma = new PrismaClient();

function validatePasswordComplexity(password) {
  if (!password || password.length < 10) {
    return 'Password must be at least 10 characters long';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter (A-Z)';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter (a-z)';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number (0-9)';
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return 'Password must contain at least one special symbol';
  }
  return null;
}

async function main() {
  console.log('------------------------------------------------------------');
  console.log('HRMS INITIAL FIRST-ADMINISTRATOR PROVISIONING PROTOCOL');
  console.log('------------------------------------------------------------');

  const args = process.argv.slice(2);
  const isConfirmed =
    args.includes('--confirm-bootstrap') || process.env.ADMIN_BOOTSTRAP_CONFIRMED === 'true';

  if (!isConfirmed) {
    console.error('[SECURITY BLOCKED] Provisioning requires explicit operator authorization flag.');
    console.error('Usage: node provision-first-admin.js --confirm-bootstrap');
    console.error('Or set environment variable ADMIN_BOOTSTRAP_CONFIRMED=true');
    process.exit(1);
  }

  // 1. Verify that ZERO active administrators exist in the database
  const existingAdminCount = await prisma.userRole.count({
    where: {
      role: {
        code: 'ADMIN',
      },
      user: {
        isActive: true,
        status: 'ACTIVE',
      },
    },
  });

  if (existingAdminCount > 0) {
    console.error(
      `[SECURITY ERROR] Access Denied: Found ${existingAdminCount} active administrator account(s) in the database.`,
    );
    console.error('The first-administrator bootstrap process is permanently LOCKED.');
    console.error(
      'Additional administrators must be created through the authenticated HRMS management console.',
    );
    process.exit(1);
  }

  // 2. Obtain administrator details from environment or arguments
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@peopleos.local';
  const rawPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD || 'AdminSecure#2026';
  const firstName = process.env.BOOTSTRAP_ADMIN_FIRST_NAME || 'Super';
  const lastName = process.env.BOOTSTRAP_ADMIN_LAST_NAME || 'Administrator';
  const employeeCode = process.env.BOOTSTRAP_ADMIN_EMP_CODE || 'ADM001';
  const orgCode = process.env.BOOTSTRAP_ORG_CODE || 'PEOPLEOS';

  const pwdError = validatePasswordComplexity(rawPassword);
  if (pwdError) {
    console.error(`[SECURITY ERROR] Administrator password fails policy: ${pwdError}`);
    process.exit(1);
  }

  // 3. Ensure organization exists
  let org = await prisma.organization.findUnique({
    where: { code: orgCode },
  });

  if (!org) {
    console.log(`[INFO] Creating default organization record for code: ${orgCode}...`);
    org = await prisma.organization.create({
      data: {
        code: orgCode,
        name: 'Enterprise Organization',
        timezone: 'Asia/Kolkata',
        currency: 'INR',
        country: 'India',
      },
    });
  }

  // 4. Ensure ADMIN role exists
  let adminRole = await prisma.role.findFirst({
    where: {
      organizationId: org.id,
      code: 'ADMIN',
    },
  });

  if (!adminRole) {
    console.log('[INFO] Creating ADMIN system role...');
    adminRole = await prisma.role.create({
      data: {
        organizationId: org.id,
        code: 'ADMIN',
        name: 'System Administrator',
        description: 'Full administrative access and governance',
        isSystem: true,
      },
    });
  }

  // 5. Hash password with Argon2id
  console.log('[INFO] Generating secure Argon2id cryptographic password hash...');
  const passwordHash = await argon2.hash(rawPassword, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  // 6. Create User within a database transaction
  console.log(`[INFO] Provisioning administrator account for: ${email}...`);
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: {
        organizationId_email: {
          organizationId: org.id,
          email,
        },
      },
      update: {
        passwordHash,
        firstName,
        lastName,
        isActive: true,
        status: 'ACTIVE',
        failedLoginAttempts: 0,
      },
      create: {
        organizationId: org.id,
        email,
        passwordHash,
        firstName,
        lastName,
        employeeCode,
        isActive: true,
        status: 'ACTIVE',
        failedLoginAttempts: 0,
      },
    });

    await tx.userRole.upsert({
      where: {
        userId_roleId: {
          userId: user.id,
          roleId: adminRole.id,
        },
      },
      update: {},
      create: {
        userId: user.id,
        roleId: adminRole.id,
        assignedBy: 'OPERATOR_INITIAL_BOOTSTRAP',
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: org.id,
        action: 'BOOTSTRAP_FIRST_ADMIN_PROVISIONED',
        entityType: 'User',
        entityId: user.id,
        description: `Initial administrator provisioned via authorized CLI bootstrap utility: ${email}`,
        status: 'SUCCESS',
        ipAddress: '127.0.0.1',
        userAgent: 'CLI_PROVISION_SCRIPT',
      },
    });

    return user;
  });

  console.log('------------------------------------------------------------');
  console.log('[SUCCESS] First Administrator Provisioning Complete!');
  console.log(`- User ID: ${result.id}`);
  console.log(`- Email: ${result.email}`);
  console.log(`- Organization: ${org.name} (${org.code})`);
  console.log(`- Role: ADMIN (Assigned)`);
  console.log(`- Audit Log ID recorded.`);
  console.log('[SECURITY NOTICE] Bootstrap protocol is now permanently locked.');
  console.log('------------------------------------------------------------');
}

main()
  .catch((err) => {
    console.error('[FATAL ERROR] Provisioning failed:', err.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
