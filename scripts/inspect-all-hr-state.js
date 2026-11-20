const path = require('path');
const { PrismaClient } = require(path.join(__dirname, '../packages/database/dist'));
const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.findFirst();
  console.log('Organization:', org.name, org.id);

  const employees = await prisma.employee.findMany({
    include: {
      employment: {
        include: {
          department: true,
          designation: true,
          branch: true,
        },
      },
      user: true,
      documents: true,
    },
    orderBy: { employeeCode: 'asc' },
  });

  console.log(`\n=== EMPLOYEES (${employees.length}) ===`);
  for (const emp of employees) {
    console.log(
      `[${emp.employeeCode}] ${emp.displayName} (${emp.id}) | Dept: ${emp.employment?.department?.name || 'None'} | Photo: ${emp.profilePhoto ? 'YES' : 'NO'} | UserAvatar: ${emp.user?.avatarUrl ? 'YES' : 'NO'} | Docs: ${emp.documents.length}`,
    );
  }

  const docs = await prisma.employeeDocumentMetadata.findMany({
    include: {
      employee: {
        select: { employeeCode: true, displayName: true },
      },
    },
  });
  console.log(`\n=== DOCUMENTS (${docs.length}) ===`);
  for (const d of docs) {
    console.log(
      `Doc: [${d.employee.employeeCode}] ${d.documentType} - ${d.documentName} | Verified: ${d.isVerified} | File: ${d.fileUrl}`,
    );
  }

  const attSummaries = await prisma.attendanceDailySummary.count();
  const attSessions = await prisma.attendanceSession.count();
  const attEvents = await prisma.attendanceEvent.count();
  console.log(`\n=== ATTENDANCE ===`);
  console.log(`Daily Summaries: ${attSummaries}`);
  console.log(`Sessions: ${attSessions}`);
  console.log(`Events: ${attEvents}`);

  // Breakdown per employee
  const attByEmp = await prisma.attendanceDailySummary.groupBy({
    by: ['employeeId'],
    _count: { id: true },
  });
  for (const item of attByEmp) {
    const emp = employees.find((e) => e.id === item.employeeId);
    console.log(
      `- ${emp?.employeeCode || item.employeeId} (${emp?.displayName}): ${item._count.id} attendance days`,
    );
  }

  // Check Office locations
  const offices = await prisma.officeLocation.findMany();
  console.log(`\n=== OFFICE LOCATIONS (${offices.length}) ===`);
  for (const o of offices) {
    console.log(
      `- ${o.name} (${o.code}) | ID: ${o.id} | Center: ${o.latitude}, ${o.longitude} | Radius: ${o.radiusMeters}m`,
    );
  }

  // Check Shifts
  const shifts = await prisma.shift.findMany();
  console.log(`\n=== SHIFTS (${shifts.length}) ===`);
  for (const s of shifts) {
    console.log(`- ${s.name} (${s.code}) | ID: ${s.id} | ${s.startTime} - ${s.endTime}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
