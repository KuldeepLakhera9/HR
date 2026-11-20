const path = require('path');
const { PrismaClient } = require(path.join(__dirname, '../packages/database/dist'));
const prisma = new PrismaClient();

async function seedPayroll() {
  const org = await prisma.organization.findFirst();
  if (!org) {
    console.log('No organization found');
    return;
  }

  const componentsData = [
    {
      code: 'BASIC',
      name: 'Basic Salary',
      type: 'EARNING',
      calculationType: 'PERCENTAGE_OF_GROSS',
      isTaxable: true,
      isStatutory: true,
      displayOrder: 1,
    },
    {
      code: 'HRA',
      name: 'House Rent Allowance',
      type: 'EARNING',
      calculationType: 'PERCENTAGE_OF_BASIC',
      formula: '0.40 * BASIC',
      isTaxable: true,
      isStatutory: false,
      displayOrder: 2,
    },
    {
      code: 'SPECIAL_ALLOWANCE',
      name: 'Special Allowance',
      type: 'EARNING',
      calculationType: 'FLAT_AMOUNT',
      isTaxable: true,
      isStatutory: false,
      displayOrder: 3,
    },
    {
      code: 'EPF',
      name: 'Employee Provident Fund',
      type: 'DEDUCTION',
      calculationType: 'PERCENTAGE_OF_BASIC',
      formula: '0.12 * BASIC',
      isTaxable: false,
      isStatutory: true,
      displayOrder: 4,
    },
    {
      code: 'PT',
      name: 'Professional Tax',
      type: 'DEDUCTION',
      calculationType: 'FLAT_AMOUNT',
      isTaxable: false,
      isStatutory: true,
      displayOrder: 5,
    },
    {
      code: 'TDS',
      name: 'Tax Deducted at Source (TDS)',
      type: 'DEDUCTION',
      calculationType: 'FLAT_AMOUNT',
      isTaxable: false,
      isStatutory: true,
      displayOrder: 6,
    },
  ];

  const createdComponents = [];
  for (const c of componentsData) {
    const comp = await prisma.salaryComponent.upsert({
      where: { organizationId_code: { organizationId: org.id, code: c.code } },
      create: { ...c, organizationId: org.id },
      update: { ...c },
    });
    createdComponents.push(comp);
  }
  console.log('Seeded components count:', createdComponents.length);

  // Seed default Structure
  const structure = await prisma.salaryStructure.upsert({
    where: {
      organizationId_code_version: { organizationId: org.id, code: 'ADT-CORP-STD', version: 1 },
    },
    create: {
      organizationId: org.id,
      code: 'ADT-CORP-STD',
      name: 'ADT Corporate Standard Structure',
      description: 'Default executive compensation structure for ADT-AI Training Foundation',
      version: 1,
      currency: 'INR',
      isActive: true,
    },
    update: { isActive: true },
  });

  const basicComp = createdComponents.find((c) => c.code === 'BASIC');
  const hraComp = createdComponents.find((c) => c.code === 'HRA');
  const saComp = createdComponents.find((c) => c.code === 'SPECIAL_ALLOWANCE');
  const epfComp = createdComponents.find((c) => c.code === 'EPF');
  const ptComp = createdComponents.find((c) => c.code === 'PT');

  const items = [
    {
      componentId: basicComp.id,
      calculationType: 'PERCENTAGE_OF_GROSS',
      amountOrPercentage: 50.0,
      displayOrder: 1,
    },
    {
      componentId: hraComp.id,
      calculationType: 'PERCENTAGE_OF_BASIC',
      amountOrPercentage: 40.0,
      displayOrder: 2,
    },
    {
      componentId: saComp.id,
      calculationType: 'FLAT_AMOUNT',
      amountOrPercentage: 15000.0,
      displayOrder: 3,
    },
    {
      componentId: epfComp.id,
      calculationType: 'PERCENTAGE_OF_BASIC',
      amountOrPercentage: 12.0,
      displayOrder: 4,
    },
    {
      componentId: ptComp.id,
      calculationType: 'FLAT_AMOUNT',
      amountOrPercentage: 200.0,
      displayOrder: 5,
    },
  ];

  for (const item of items) {
    await prisma.salaryStructureItem.upsert({
      where: {
        structureId_componentId: { structureId: structure.id, componentId: item.componentId },
      },
      create: { structureId: structure.id, ...item },
      update: { amountOrPercentage: item.amountOrPercentage },
    });
  }
  console.log('Structure items configured');

  // Seed November 2026 Payroll Period
  const period = await prisma.payrollPeriod.upsert({
    where: { organizationId_year_month: { organizationId: org.id, year: 2026, month: 11 } },
    create: {
      organizationId: org.id,
      year: 2026,
      month: 11,
      startDate: new Date('2026-11-01T00:00:00.000Z'),
      endDate: new Date('2026-11-30T23:59:59.999Z'),
      totalDays: 30,
      status: 'OPEN',
    },
    update: { status: 'OPEN' },
  });
  console.log('Seeded Payroll Period:', period.id);

  // Assign this salary structure as active compensation for employees
  const employees = await prisma.employee.findMany({ where: { organizationId: org.id } });
  for (const emp of employees) {
    const existingComp = await prisma.employeeCompensation.findFirst({
      where: { employeeId: emp.id, organizationId: org.id },
    });
    if (!existingComp) {
      await prisma.employeeCompensation.create({
        data: {
          employeeId: emp.id,
          organizationId: org.id,
          structureId: structure.id,
          ctcAnnual: 600000.0,
          grossMonthly: 50000.0,
          effectiveFrom: new Date('2026-11-01T00:00:00.000Z'),
          status: 'APPROVED',
          approvedAt: new Date(),
          items: {
            create: [
              { componentId: basicComp.id, monthlyAmount: 25000.0, annualAmount: 300000.0 },
              { componentId: hraComp.id, monthlyAmount: 10000.0, annualAmount: 120000.0 },
              { componentId: saComp.id, monthlyAmount: 15000.0, annualAmount: 180000.0 },
              { componentId: epfComp.id, monthlyAmount: 3000.0, annualAmount: 36000.0 },
              { componentId: ptComp.id, monthlyAmount: 200.0, annualAmount: 2400.0 },
            ],
          },
        },
      });
    }
  }
  console.log('Approved compensations assigned for', employees.length, 'employees');
}

seedPayroll()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    return prisma.$disconnect();
  });
