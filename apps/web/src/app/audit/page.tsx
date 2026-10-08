'use client';

import React from 'react';
import { AppShell } from '../../layouts/AppShell';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  DataTable,
} from '@hrms/ui';
import { ShieldAlert, FileText, CheckCircle2 } from 'lucide-react';

export default function AuditLogsPage() {
  const auditLogs = [
    {
      id: '1',
      action: 'USER_LOGIN_SUCCESS',
      resource: 'AuthService',
      performedBy: 'vikram.aditya@peopleos.local',
      ipAddress: '192.168.1.104',
      timestamp: '2026-10-08 11:42:15',
      status: 'SUCCESS',
    },
    {
      id: '2',
      action: 'ORGANIZATION_POLICY_UPDATED',
      resource: 'SystemSetting',
      performedBy: 'vikram.aditya@peopleos.local',
      ipAddress: '192.168.1.104',
      timestamp: '2026-10-08 10:15:00',
      status: 'SUCCESS',
    },
    {
      id: '3',
      action: 'EMPLOYEE_ROLE_ASSIGNED',
      resource: 'UserRole',
      performedBy: 'ananya.sharma@peopleos.local',
      ipAddress: '192.168.1.112',
      timestamp: '2026-10-08 09:30:22',
      status: 'SUCCESS',
    },
    {
      id: '4',
      action: 'DATABASE_BACKUP_COMPLETED',
      resource: 'PostgresEngine',
      performedBy: 'SYSTEM_DAEMON',
      ipAddress: '127.0.0.1',
      timestamp: '2026-10-08 04:00:00',
      status: 'SUCCESS',
    },
    {
      id: '5',
      action: 'ATTENDANCE_RADIUS_OVERRIDE_ATTEMPT',
      resource: 'AttendanceService',
      performedBy: 'unknown@peopleos.local',
      ipAddress: '192.168.1.199',
      timestamp: '2026-10-07 18:22:11',
      status: 'FLAGGED',
    },
  ];

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-stone-900">System Audit Logs</h1>
          <p className="text-xs md:text-sm text-stone-500 mt-1">
            Immutable security telemetry and administrative activity logs for compliance and
            forensics.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Activity Trail</CardTitle>
            <CardDescription>Recent audited events across the self-hosted cluster</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={[
                {
                  key: 'action',
                  header: 'Action / Event',
                  render: (row) => (
                    <span className="font-mono text-xs font-semibold text-stone-900">
                      {row.action}
                    </span>
                  ),
                },
                { key: 'resource', header: 'Resource' },
                { key: 'performedBy', header: 'Initiated By' },
                {
                  key: 'ipAddress',
                  header: 'IP Address',
                  render: (row) => (
                    <span className="font-mono text-xs text-stone-500">{row.ipAddress}</span>
                  ),
                },
                { key: 'timestamp', header: 'Timestamp' },
                {
                  key: 'status',
                  header: 'Result',
                  render: (row) => (
                    <Badge variant={row.status === 'SUCCESS' ? 'success' : 'danger'} size="sm">
                      {row.status}
                    </Badge>
                  ),
                },
              ]}
              data={auditLogs}
            />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
