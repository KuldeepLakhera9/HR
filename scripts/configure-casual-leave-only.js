const path = require('path');
const { PrismaClient } = require(path.join(__dirname, '../packages/database/dist'));
const prisma = new PrismaClient();

async function main() {
  console.log('--- Configuring Casual Leave (24 Days / Year) Only ---');

  const orgs = await prisma.organization.findMany();
  for (const org of orgs) {
    console.log(`Processing Organization: ${org.name} (${org.id})`);

    // 1. Upsert Casual Leave Type
    const clType = await prisma.leaveType.upsert({
      where: { organizationId_code: { organizationId: org.id, code: 'CL' } },
      update: {
        name: 'Casual Leave',
        color: '#d97706',
        isPaid: true,
        allowHalfDay: true,
        requiresDoc: false,
        isActive: true,
      },
      create: {
        organizationId: org.id,
        code: 'CL',
        name: 'Casual Leave',
        description: 'Annual Casual Leave allowance of 24 days per year',
        color: '#d97706',
        isPaid: true,
        allowHalfDay: true,
        requiresDoc: false,
        isActive: true,
      },
    });
    console.log(`Casual Leave Type configured: ${clType.id}`);

    // 2. Upsert Casual Leave Policy (24 Days)
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
    console.log(
      `Casual Leave Policy configured: ${clPolicy.name} - Entitlement: ${clPolicy.annualEntitlement}`,
    );

    // 3. Find other leave types
    const otherTypes = await prisma.leaveType.findMany({
      where: {
        organizationId: org.id,
        code: { not: 'CL' },
      },
    });
    const otherTypeIds = otherTypes.map((t) => t.id);
    console.log(
      `Found ${otherTypes.length} other leave types to remove/deactivate:`,
      otherTypes.map((t) => t.code),
    );

    if (otherTypeIds.length > 0) {
      // Find other policies
      const otherPolicies = await prisma.leavePolicy.findMany({
        where: {
          organizationId: org.id,
          leaveTypeId: { in: otherTypeIds },
        },
      });
      const otherPolicyIds = otherPolicies.map((p) => p.id);

      // Check for any leave requests on other types
      const otherReqs = await prisma.leaveRequest.count({
        where: { leaveTypeId: { in: otherTypeIds } },
      });
      console.log(`Leave requests on other types: ${otherReqs}`);

      if (otherReqs === 0) {
        // Safe to remove balance accounts and assignments
        const accounts = await prisma.leaveBalanceAccount.findMany({
          where: { leaveTypeId: { in: otherTypeIds } },
          select: { id: true },
        });
        const accountIds = accounts.map((a) => a.id);

        if (accountIds.length > 0) {
          await prisma.leaveBalanceTransaction.deleteMany({
            where: { accountId: { in: accountIds } },
          });
          await prisma.leaveBalanceAccount.deleteMany({
            where: { id: { in: accountIds } },
          });
          console.log(
            `Deleted ${accountIds.length} non-CL leave balance accounts and their transactions.`,
          );
        }

        if (otherPolicyIds.length > 0) {
          await prisma.employeeLeavePolicyAssignment.deleteMany({
            where: { leavePolicyId: { in: otherPolicyIds } },
          });
          await prisma.leavePolicy.deleteMany({
            where: { id: { in: otherPolicyIds } },
          });
          console.log(`Deleted ${otherPolicyIds.length} non-CL leave policies and assignments.`);
        }

        await prisma.leaveType.deleteMany({
          where: { id: { in: otherTypeIds } },
        });
        console.log(`Deleted ${otherTypeIds.length} non-CL leave types.`);
      } else {
        // Deactivate if there are requests
        await prisma.leaveType.updateMany({
          where: { id: { in: otherTypeIds } },
          data: { isActive: false },
        });
        await prisma.leavePolicy.updateMany({
          where: { id: { in: otherPolicyIds } },
          data: { isActive: false },
        });
        console.log(`Deactivated non-CL leave types and policies.`);
      }
    }

    // 4. Assign Casual Leave to all employees and set 24 days balance
    const employees = await prisma.employee.findMany({ where: { organizationId: org.id } });
    console.log(`Assigning 24 Casual Leaves to all ${employees.length} employees...`);

    const currentYear = new Date().getUTCFullYear();

    for (const emp of employees) {
      // Upsert policy assignment
      const existingAssign = await prisma.employeeLeavePolicyAssignment.findFirst({
        where: {
          employeeId: emp.id,
          leavePolicyId: clPolicy.id,
        },
      });

      if (!existingAssign) {
        await prisma.employeeLeavePolicyAssignment.create({
          data: {
            organizationId: org.id,
            employeeId: emp.id,
            leavePolicyId: clPolicy.id,
            effectiveFrom: new Date(`${currentYear}-01-01T00:00:00.000Z`),
          },
        });
      }

      // Upsert balance account
      const existingAcc = await prisma.leaveBalanceAccount.findUnique({
        where: {
          organizationId_employeeId_leaveTypeId_leaveYear: {
            organizationId: org.id,
            employeeId: emp.id,
            leaveTypeId: clType.id,
            leaveYear: currentYear,
          },
        },
      });

      if (existingAcc) {
        const used = Number(existingAcc.usedBalance || 0);
        const pending = Number(existingAcc.pendingBalance || 0);
        const newClosing = Math.max(0, 24.0 - used - pending);

        await prisma.leaveBalanceAccount.update({
          where: { id: existingAcc.id },
          data: {
            openingBalance: 24.0,
            allocatedBalance: 24.0,
            accruedBalance: 24.0,
            closingBalance: newClosing,
            lastReconciledAt: new Date(),
          },
        });
      } else {
        const acc = await prisma.leaveBalanceAccount.create({
          data: {
            organizationId: org.id,
            employeeId: emp.id,
            leaveTypeId: clType.id,
            leaveYear: currentYear,
            openingBalance: 24.0,
            allocatedBalance: 24.0,
            accruedBalance: 24.0,
            usedBalance: 0.0,
            pendingBalance: 0.0,
            closingBalance: 24.0,
            lastReconciledAt: new Date(),
          },
        });

        await prisma.leaveBalanceTransaction.create({
          data: {
            accountId: acc.id,
            transactionType: 'OPENING_GRANT',
            amount: 24.0,
            balanceAfter: 24.0,
            idempotencyKey: `grant:cl24:${acc.id}:${currentYear}`,
            reason: 'Annual Casual Leave Entitlement (24 days/year)',
          },
        });
      }
    }
    console.log(`Successfully assigned 24 Casual Leaves to all employees in ${org.name}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error('Migration failed:', err);
    return prisma.$disconnect();
  });
