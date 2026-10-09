import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

export const prisma =
  globalThis.prismaGlobal ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = prisma;
}

export * from '@prisma/client';

// Type aliases for Phase 5 convenience
export type VisitLocation = import('@prisma/client').VisitDestination;
export type WFHRequest = import('@prisma/client').WfhRequest;
export type WFHApproval = import('@prisma/client').WfhApproval;
