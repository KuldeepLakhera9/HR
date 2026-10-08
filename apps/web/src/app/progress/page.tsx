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
  KPICard,
  DataTable,
} from '@hrms/ui';
import { TrendingUp, Target, Award, Star } from 'lucide-react';

export default function ProgressPage() {
  const goalTracking = [
    {
      id: '1',
      employee: 'Priya Nair',
      department: 'Engineering',
      cycle: 'Q4 2026',
      goalTitle: 'Next.js 14 App Shell Migration & Design System',
      progress: 92,
      status: 'ON_TRACK',
    },
    {
      id: '2',
      employee: 'Arun Patel',
      department: 'Engineering',
      cycle: 'Q4 2026',
      goalTitle: 'PostgreSQL Connection Pooling & Index Tuning',
      progress: 85,
      status: 'ON_TRACK',
    },
    {
      id: '3',
      employee: 'Neha Sen',
      department: 'Human Resources',
      cycle: 'Q4 2026',
      goalTitle: 'Annual Performance Appraisal Process Automation',
      progress: 60,
      status: 'IN_PROGRESS',
    },
    {
      id: '4',
      employee: 'Rohan Verma',
      department: 'Finance',
      cycle: 'Q4 2026',
      goalTitle: 'Statutory Payroll Deductions Verification',
      progress: 40,
      status: 'NEEDS_ATTENTION',
    },
  ];

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-stone-900">Employee Progress & OKRs</h1>
          <p className="text-xs md:text-sm text-stone-500 mt-1">
            Track performance cycles, objectives, key results, and periodic check-ins.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            title="Active Review Cycle"
            value="Q4 2026"
            description="Closes in 45 days"
            icon={<Target className="h-5 w-5 text-amber-700" />}
          />
          <KPICard
            title="Goal Completion Rate"
            value="78.4%"
            description="Org-wide average"
            change={{ value: '+6.2%', trend: 'up' }}
            icon={<TrendingUp className="h-5 w-5 text-amber-700" />}
          />
          <KPICard
            title="Check-ins Completed"
            value="214"
            description="Out of 284 employees"
            icon={<Award className="h-5 w-5 text-amber-700" />}
          />
          <KPICard
            title="High Performers"
            value="42"
            description="Exceeding expectations"
            icon={<Star className="h-5 w-5 text-amber-700" />}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Current OKR Progress</CardTitle>
            <CardDescription>Quarterly milestones and delivery tracking</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={[
                { key: 'employee', header: 'Team Member' },
                { key: 'department', header: 'Department' },
                { key: 'goalTitle', header: 'Key Objective' },
                {
                  key: 'progress',
                  header: 'Progress',
                  render: (row) => (
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-stone-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-amber-600 h-full rounded-full"
                          style={{ width: `${row.progress}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-stone-700">{row.progress}%</span>
                    </div>
                  ),
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (row) => (
                    <Badge
                      variant={
                        row.status === 'ON_TRACK'
                          ? 'success'
                          : row.status === 'IN_PROGRESS'
                            ? 'info'
                            : 'warning'
                      }
                      size="sm"
                    >
                      {row.status.replace('_', ' ')}
                    </Badge>
                  ),
                },
              ]}
              data={goalTracking}
            />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
