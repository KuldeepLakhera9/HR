import { IsOptional, IsString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryReconciliationDto {
  @ApiPropertyOptional({
    description: 'Filter reconciliation checks by domain',
    enum: ['ALL', 'WORKFORCE', 'ATTENDANCE', 'LEAVE', 'REQUESTS', 'PERFORMANCE'],
    default: 'ALL',
  })
  @IsOptional()
  @IsIn(['ALL', 'WORKFORCE', 'ATTENDANCE', 'LEAVE', 'REQUESTS', 'PERFORMANCE'])
  domain?: 'ALL' | 'WORKFORCE' | 'ATTENDANCE' | 'LEAVE' | 'REQUESTS' | 'PERFORMANCE' = 'ALL';

  @ApiPropertyOptional({
    description: 'Filter by discrepancy severity',
    enum: ['ALL', 'CRITICAL', 'WARNING', 'INFO'],
    default: 'ALL',
  })
  @IsOptional()
  @IsIn(['ALL', 'CRITICAL', 'WARNING', 'INFO'])
  severity?: 'ALL' | 'CRITICAL' | 'WARNING' | 'INFO' = 'ALL';
}

export interface ReconciliationDiscrepancy {
  id: string;
  domain: 'WORKFORCE' | 'ATTENDANCE' | 'LEAVE' | 'REQUESTS' | 'PERFORMANCE';
  checkCode: string;
  checkName: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  recordReference: string;
  entityId: string;
  description: string;
  expectedValue: string | number;
  actualValue: string | number;
  detectedAt: string;
  suggestedRemediation: string;
}

export interface ReconciliationReportResult {
  organizationId: string;
  executedAt: string;
  totalChecksEvaluated: number;
  totalDiscrepanciesFound: number;
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL_DISCREPANCIES';
  summaryByDomain: Record<
    string,
    { total: number; critical: number; warning: number; info: number }
  >;
  discrepancies: ReconciliationDiscrepancy[];
}
