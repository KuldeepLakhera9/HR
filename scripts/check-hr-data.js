const path = require('path');
const { PrismaClient } = require(path.join(__dirname, '../packages/database/dist'));
const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.findFirst();
  console.log('Org:', org ? `${org.name} (${org.id})` : 'None');

  const employees = await prisma.employee.findMany({
    include: {
      user: true,
      department: true,
      designationRel: true,
    },
    orderBy: { employeeCode: 'asc' },
  });
  console.log(`\nFound ${employees.length} employees:`);
  for (const emp of employees) {
    console.log(
      `- [${emp.employeeCode}] ${emp.firstName} ${emp.lastName} | Email: ${emp.email} | Dept: ${emp.department?.name} | Role: ${emp.user?.role} | Avatar: ${emp.avatarUrl || emp.user?.avatarUrl || 'NONE'}`,
    );
  }

  const attCount = await prisma.attendanceRecord.count();
  console.log(`\nTotal Attendance Records: ${attCount}`);

  // Sample attendance dates
  const sampleAtt = await prisma.attendanceRecord.findMany({
    take: 5,
    orderBy: { date: 'desc' },
    include: { employee: { select: { employeeCode: true, firstName: true } } },
  });
  console.log('Recent Attendance Sample:');
  for (const a of sampleAtt) {
    console.log(
      `  ${a.date} | ${a.employee.employeeCode} (${a.employee.firstName}) | Status: ${a.status} | TotalWorkMinutes: ${a.totalWorkMinutes}`,
    );
  }

  // Documents
  const docCount = await prisma.employeeDocument.count();
  console.log(`\nTotal Employee Documents: ${docCount}`);
  const docs = await prisma.employeeDocument.findMany({
    include: { employee: { select: { employeeCode: true, firstName: true, lastName: true } } },
    take: 10,
  });
  for (const d of docs) {
    console.log(
      `- Doc: ${d.documentType} | Title: ${d.title} | File: ${d.fileUrl} | Employee: ${d.employee.employeeCode} (${d.employee.firstName})`,
    );
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect();
  });
