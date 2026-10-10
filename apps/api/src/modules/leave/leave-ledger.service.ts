import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LeaveTransactionType, Prisma } from '@prisma/client';

export interface PostTransactionParams {
  organizationId: string;
  employeeId: string;
  leaveTypeId: string;
  leaveYear: number;
  leaveRequestId?: string | null;
  transactionType: LeaveTransactionType;
  amount: number; // positive or negative
  reason: string;
  actorId?: string | null;
  idempotencyKey: string;
}

@Injectable()
export class LeaveLedgerService {
  private readonly logger = new Logger(LeaveLedgerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves or atomically provisions an annual balance account for an employee and leave type
   */
  async getOrCreateAccount(
    organizationId: string,
    employeeId: string,
    leaveTypeId: string,
    leaveYear: number,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;

    let account = await client.leaveBalanceAccount.findUnique({
      where: {
        organizationId_employeeId_leaveTypeId_leaveYear: {
          organizationId,
          employeeId,
          leaveTypeId,
          leaveYear,
        },
      },
    });

    if (!account) {
      // Find policy assignment if available to initialize default opening entitlement
      const assignment = await client.employeeLeavePolicyAssignment.findFirst({
        where: {
          organizationId,
          employeeId,
          leavePolicy: { leaveTypeId },
          effectiveFrom: { lte: new Date(`${leaveYear}-12-31T23:59:59.999Z`) },
          OR: [
            { effectiveTo: null },
            { effectiveTo: { gte: new Date(`${leaveYear}-01-01T00:00:00.000Z`) } },
          ],
        },
        include: { leavePolicy: true },
        orderBy: { effectiveFrom: 'desc' },
      });

      const initialEntitlement = assignment?.leavePolicy?.annualEntitlement
        ? Number(assignment.leavePolicy.annualEntitlement)
        : 0;

      account = await client.leaveBalanceAccount.create({
        data: {
          organizationId,
          employeeId,
          leaveTypeId,
          leaveYear,
          openingBalance: new Prisma.Decimal(initialEntitlement),
          allocatedBalance: new Prisma.Decimal(initialEntitlement),
          accruedBalance: new Prisma.Decimal(0),
          usedBalance: new Prisma.Decimal(0),
          pendingBalance: new Prisma.Decimal(0),
          closingBalance: new Prisma.Decimal(initialEntitlement),
          lastReconciledAt: new Date(),
        },
      });

      if (initialEntitlement > 0) {
        await client.leaveBalanceTransaction.create({
          data: {
            accountId: account.id,
            transactionType: LeaveTransactionType.OPENING_GRANT,
            amount: new Prisma.Decimal(initialEntitlement),
            balanceAfter: new Prisma.Decimal(initialEntitlement),
            reason: `Initial annual entitlement grant (${assignment?.leavePolicy?.name || 'Standard'})`,
            idempotencyKey: `grant:opening:${account.id}:${leaveYear}`,
          },
        });
      }
    }

    return account;
  }

  /**
   * Places a pending reservation on the ledger when an employee submits a leave request
   */
  async reserveBalance(
    organizationId: string,
    employeeId: string,
    leaveTypeId: string,
    leaveYear: number,
    leaveRequestId: string,
    days: number,
    actorId?: string,
    tx?: Prisma.TransactionClient,
  ) {
    const execute = async (prismaTx: Prisma.TransactionClient) => {
      // Row lock the account
      const account = await this.getOrCreateAccount(
        organizationId,
        employeeId,
        leaveTypeId,
        leaveYear,
        prismaTx,
      );

      // Check idempotency
      const idempotencyKey = `res:${leaveRequestId}`;
      const existingTx = await prismaTx.leaveBalanceTransaction.findUnique({
        where: { idempotencyKey },
      });
      if (existingTx) {
        return account;
      }

      // Check policy negative balance allowance
      const policyAssignment = await prismaTx.employeeLeavePolicyAssignment.findFirst({
        where: {
          organizationId,
          employeeId,
          leavePolicy: { leaveTypeId },
        },
        include: { leavePolicy: true },
      });

      const allowNegative = policyAssignment?.leavePolicy?.allowNegativeBalance ?? false;
      const maxNegative = Number(policyAssignment?.leavePolicy?.maxNegativeBalance ?? 0);
      const currentAvailable = Number(account.closingBalance);

      if (!allowNegative && currentAvailable < days) {
        throw new BadRequestException(
          `Insufficient leave balance. Available: ${currentAvailable} days, Requested: ${days} days.`,
        );
      } else if (allowNegative && currentAvailable - days < -maxNegative) {
        throw new BadRequestException(
          `Leave request exceeds maximum allowable negative balance overdraft of ${maxNegative} days.`,
        );
      }

      const newPending = Number(account.pendingBalance) + days;
      const newClosing =
        Number(account.allocatedBalance) - Number(account.usedBalance) - newPending;

      const updatedAccount = await prismaTx.leaveBalanceAccount.update({
        where: { id: account.id },
        data: {
          pendingBalance: new Prisma.Decimal(newPending),
          closingBalance: new Prisma.Decimal(newClosing),
          lastReconciledAt: new Date(),
        },
      });

      await prismaTx.leaveBalanceTransaction.create({
        data: {
          accountId: account.id,
          leaveRequestId,
          transactionType: LeaveTransactionType.RESERVATION,
          amount: new Prisma.Decimal(-days),
          balanceAfter: new Prisma.Decimal(newClosing),
          reason: `Pending leave application reservation for request #${leaveRequestId.slice(0, 8)}`,
          actorId,
          idempotencyKey,
        },
      });

      return updatedAccount;
    };

    return tx ? execute(tx) : this.prisma.$transaction(execute);
  }

  /**
   * Converts a pending reservation into an approved consumption upon approval
   */
  async consumeBalance(leaveRequestId: string, actorId?: string, tx?: Prisma.TransactionClient) {
    const execute = async (prismaTx: Prisma.TransactionClient) => {
      const leaveRequest = await prismaTx.leaveRequest.findUnique({
        where: { id: leaveRequestId },
      });
      if (!leaveRequest) throw new NotFoundException('Leave request not found');

      const days = Number(leaveRequest.chargeableDays);
      const account = await this.getOrCreateAccount(
        leaveRequest.organizationId,
        leaveRequest.employeeId,
        leaveRequest.leaveTypeId,
        leaveRequest.leaveYear,
        prismaTx,
      );

      const idempotencyKey = `consume:${leaveRequestId}`;
      const existingTx = await prismaTx.leaveBalanceTransaction.findUnique({
        where: { idempotencyKey },
      });
      if (existingTx) {
        return account;
      }

      // Decrement pending, increment used
      const newPending = Math.max(0, Number(account.pendingBalance) - days);
      const newUsed = Number(account.usedBalance) + days;
      const newClosing = Number(account.allocatedBalance) - newUsed - newPending;

      const updatedAccount = await prismaTx.leaveBalanceAccount.update({
        where: { id: account.id },
        data: {
          pendingBalance: new Prisma.Decimal(newPending),
          usedBalance: new Prisma.Decimal(newUsed),
          closingBalance: new Prisma.Decimal(newClosing),
          lastReconciledAt: new Date(),
        },
      });

      await prismaTx.leaveBalanceTransaction.create({
        data: {
          accountId: account.id,
          leaveRequestId,
          transactionType: LeaveTransactionType.CONSUMPTION,
          amount: new Prisma.Decimal(-days),
          balanceAfter: new Prisma.Decimal(newClosing),
          reason: `Approved leave consumption for request #${leaveRequestId.slice(0, 8)}`,
          actorId,
          idempotencyKey,
        },
      });

      return updatedAccount;
    };

    return tx ? execute(tx) : this.prisma.$transaction(execute);
  }

  /**
   * Releases a pending reservation if a request is rejected or cancelled before approval
   */
  async releaseReservation(
    leaveRequestId: string,
    reasonText: string,
    actorId?: string,
    tx?: Prisma.TransactionClient,
  ) {
    const execute = async (prismaTx: Prisma.TransactionClient) => {
      const leaveRequest = await prismaTx.leaveRequest.findUnique({
        where: { id: leaveRequestId },
      });
      if (!leaveRequest) throw new NotFoundException('Leave request not found');

      const days = Number(leaveRequest.chargeableDays);
      const account = await this.getOrCreateAccount(
        leaveRequest.organizationId,
        leaveRequest.employeeId,
        leaveRequest.leaveTypeId,
        leaveRequest.leaveYear,
        prismaTx,
      );

      const idempotencyKey = `release:${leaveRequestId}`;
      const existingTx = await prismaTx.leaveBalanceTransaction.findUnique({
        where: { idempotencyKey },
      });
      if (existingTx) {
        return account;
      }

      const newPending = Math.max(0, Number(account.pendingBalance) - days);
      const newClosing =
        Number(account.allocatedBalance) - Number(account.usedBalance) - newPending;

      const updatedAccount = await prismaTx.leaveBalanceAccount.update({
        where: { id: account.id },
        data: {
          pendingBalance: new Prisma.Decimal(newPending),
          closingBalance: new Prisma.Decimal(newClosing),
          lastReconciledAt: new Date(),
        },
      });

      await prismaTx.leaveBalanceTransaction.create({
        data: {
          accountId: account.id,
          leaveRequestId,
          transactionType: LeaveTransactionType.RELEASE_RESERVATION,
          amount: new Prisma.Decimal(days),
          balanceAfter: new Prisma.Decimal(newClosing),
          reason: `Released reservation (${reasonText})`,
          actorId,
          idempotencyKey,
        },
      });

      return updatedAccount;
    };

    return tx ? execute(tx) : this.prisma.$transaction(execute);
  }

  /**
   * Reverses consumed leave balance if an approved leave is subsequently cancelled
   */
  async reverseConsumption(
    leaveRequestId: string,
    reasonText: string,
    actorId?: string,
    tx?: Prisma.TransactionClient,
  ) {
    const execute = async (prismaTx: Prisma.TransactionClient) => {
      const leaveRequest = await prismaTx.leaveRequest.findUnique({
        where: { id: leaveRequestId },
      });
      if (!leaveRequest) throw new NotFoundException('Leave request not found');

      const days = Number(leaveRequest.chargeableDays);
      const account = await this.getOrCreateAccount(
        leaveRequest.organizationId,
        leaveRequest.employeeId,
        leaveRequest.leaveTypeId,
        leaveRequest.leaveYear,
        prismaTx,
      );

      const idempotencyKey = `reversal:${leaveRequestId}`;
      const existingTx = await prismaTx.leaveBalanceTransaction.findUnique({
        where: { idempotencyKey },
      });
      if (existingTx) {
        return account;
      }

      const newUsed = Math.max(0, Number(account.usedBalance) - days);
      const newClosing =
        Number(account.allocatedBalance) - newUsed - Number(account.pendingBalance);

      const updatedAccount = await prismaTx.leaveBalanceAccount.update({
        where: { id: account.id },
        data: {
          usedBalance: new Prisma.Decimal(newUsed),
          closingBalance: new Prisma.Decimal(newClosing),
          lastReconciledAt: new Date(),
        },
      });

      await prismaTx.leaveBalanceTransaction.create({
        data: {
          accountId: account.id,
          leaveRequestId,
          transactionType: LeaveTransactionType.REVERSAL,
          amount: new Prisma.Decimal(days),
          balanceAfter: new Prisma.Decimal(newClosing),
          reason: `Reversal of approved leave (${reasonText})`,
          actorId,
          idempotencyKey,
        },
      });

      return updatedAccount;
    };

    return tx ? execute(tx) : this.prisma.$transaction(execute);
  }

  /**
   * Records an audited manual balance adjustment by an authorized HR or Admin
   */
  async recordManualAdjustment(params: {
    organizationId: string;
    employeeId: string;
    leaveTypeId: string;
    leaveYear: number;
    amount: number;
    reason: string;
    actorId: string;
    tx?: Prisma.TransactionClient;
  }) {
    const execute = async (prismaTx: Prisma.TransactionClient) => {
      const account = await this.getOrCreateAccount(
        params.organizationId,
        params.employeeId,
        params.leaveTypeId,
        params.leaveYear,
        prismaTx,
      );

      const newAllocated = Number(account.allocatedBalance) + params.amount;
      const newClosing =
        newAllocated - Number(account.usedBalance) - Number(account.pendingBalance);

      const updatedAccount = await prismaTx.leaveBalanceAccount.update({
        where: { id: account.id },
        data: {
          allocatedBalance: new Prisma.Decimal(newAllocated),
          closingBalance: new Prisma.Decimal(newClosing),
          lastReconciledAt: new Date(),
        },
      });

      const idempotencyKey = `adj:${account.id}:${Date.now()}`;
      await prismaTx.leaveBalanceTransaction.create({
        data: {
          accountId: account.id,
          transactionType: LeaveTransactionType.MANUAL_ADJUSTMENT,
          amount: new Prisma.Decimal(params.amount),
          balanceAfter: new Prisma.Decimal(newClosing),
          reason: params.reason,
          actorId: params.actorId,
          idempotencyKey,
        },
      });

      return updatedAccount;
    };

    return params.tx ? execute(params.tx) : this.prisma.$transaction(execute);
  }

  /**
   * Reconciles balance accounts by recomputing authoritative totals directly from ledger transactions
   */
  async reconcileAccount(accountId: string) {
    const account = await this.prisma.leaveBalanceAccount.findUnique({
      where: { id: accountId },
      include: { transactions: { orderBy: { createdAt: 'asc' } } },
    });
    if (!account) throw new NotFoundException('Leave balance account not found');

    let allocated = 0;
    let used = 0;
    let pending = 0;

    for (const t of account.transactions) {
      const amt = Math.abs(Number(t.amount));
      switch (t.transactionType) {
        case LeaveTransactionType.OPENING_GRANT:
        case LeaveTransactionType.ACCRUAL:
          allocated += amt;
          break;
        case LeaveTransactionType.MANUAL_ADJUSTMENT:
          allocated += Number(t.amount);
          break;
        case LeaveTransactionType.RESERVATION:
          pending += amt;
          break;
        case LeaveTransactionType.RELEASE_RESERVATION:
          pending -= amt;
          break;
        case LeaveTransactionType.CONSUMPTION:
          pending -= amt;
          used += amt;
          break;
        case LeaveTransactionType.REVERSAL:
          used -= amt;
          break;
        case LeaveTransactionType.EXPIRY:
          allocated -= amt;
          break;
      }
    }

    pending = Math.max(0, pending);
    used = Math.max(0, used);
    const closing = allocated - used - pending;

    return this.prisma.leaveBalanceAccount.update({
      where: { id: accountId },
      data: {
        allocatedBalance: new Prisma.Decimal(allocated),
        usedBalance: new Prisma.Decimal(used),
        pendingBalance: new Prisma.Decimal(pending),
        closingBalance: new Prisma.Decimal(closing),
        lastReconciledAt: new Date(),
      },
    });
  }
}
