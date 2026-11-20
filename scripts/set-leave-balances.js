const path = require('path');
const { PrismaClient } = require(path.join(__dirname, '../packages/database/dist'));
const prisma = new PrismaClient();

async function main() {
  const quotas = {
    CL: 24,
  };

  const targetCodes = ['EMP004', 'EMP006'];

  for (const code of targetCodes) {
    const emp = await prisma.employee.findFirst({ where: { employeeCode: code } });
    if (!emp) continue;

    for (const [typeCode, days] of Object.entries(quotas)) {
      const leaveType = await prisma.leaveType.findFirst({
        where: { organizationId: emp.organizationId, code: typeCode },
      });
      if (!leaveType) continue;

      await prisma.leaveBalanceAccount.upsert({
        where: {
          organizationId_employeeId_leaveTypeId_leaveYear: {
            organizationId: emp.organizationId,
            employeeId: emp.id,
            leaveTypeId: leaveType.id,
            leaveYear: 2026,
          },
        },
        create: {
          organizationId: emp.organizationId,
          employeeId: emp.id,
          leaveTypeId: leaveType.id,
          leaveYear: 2026,
          openingBalance: days,
          allocatedBalance: days,
          accruedBalance: days,
          usedBalance: 0,
          pendingBalance: 0,
          closingBalance: days,
        },
        update: {
          openingBalance: days,
          allocatedBalance: days,
          accruedBalance: days,
          closingBalance: days,
        },
      });
      console.log(`Updated ${code} ${typeCode} balance to ${days} days`);
    }
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect();
  });
