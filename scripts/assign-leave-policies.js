const path = require('path');
const { PrismaClient } = require(path.join(__dirname, '../packages/database/dist'));
const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.findFirst();
  if (!org) return;

  const employees = await prisma.employee.findMany({ where: { organizationId: org.id } });
  const policies = await prisma.leavePolicy.findMany({ where: { organizationId: org.id } });

  console.log('Total employees:', employees.length, 'Total policies:', policies.length);

  for (const emp of employees) {
    for (const pol of policies) {
      const existing = await prisma.employeeLeavePolicyAssignment.findFirst({
        where: {
          employeeId: emp.id,
          leavePolicyId: pol.id,
        },
      });

      if (!existing) {
        await prisma.employeeLeavePolicyAssignment.create({
          data: {
            organizationId: org.id,
            employeeId: emp.id,
            leavePolicyId: pol.id,
            effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
          },
        });
        console.log(`Assigned policy ${pol.code} to ${emp.employeeCode}`);
      }

      // Also ensure leave balance account exists
      const existingAcc = await prisma.leaveBalanceAccount.findFirst({
        where: {
          employeeId: emp.id,
          leaveTypeId: pol.leaveTypeId,
          leaveYear: 2026,
        },
      });

      if (!existingAcc) {
        const entitlement = Number(pol.annualEntitlement);
        await prisma.leaveBalanceAccount.create({
          data: {
            organizationId: org.id,
            employeeId: emp.id,
            leaveTypeId: pol.leaveTypeId,
            leaveYear: 2026,
            openingBalance: entitlement,
            allocated: entitlement,
            accrued: entitlement,
            used: 0,
            pending: 0,
            carriedForward: 0,
            currentBalance: entitlement,
            version: 1,
          },
        });
        console.log(`Created leave balance account for ${emp.employeeCode} (${pol.code})`);
      }
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect();
  });
