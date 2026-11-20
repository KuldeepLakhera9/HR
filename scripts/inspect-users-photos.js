const path = require('path');
const { PrismaClient } = require(path.join(__dirname, '../packages/database/dist'));
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      avatarUrl: true,
      userRoles: {
        include: { role: true },
      },
      employee: {
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          profilePhoto: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  for (const u of users) {
    const roles = u.userRoles.map((r) => r.role.name || r.role.code).join(', ');
    const emp = u.employee
      ? `${u.employee.employeeCode} - ${u.employee.firstName} ${u.employee.lastName}`
      : 'No Employee';
    const photo = u.avatarUrl || u.employee?.profilePhoto || 'None';
    console.log(`[${roles}] ${u.email} | Emp: ${emp} | Photo: ${photo}`);
  }
}

main().finally(() => prisma.$disconnect());
