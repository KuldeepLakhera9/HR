'use client';

import React from 'react';
import { AppShell } from '../../layouts/AppShell';
import { ChartCard, KPICard, Button } from '@hrms/ui';
import { AttendanceTrendChart } from '../../features/dashboard/components/charts/AttendanceTrendChart';
import { LeaveTrendChart } from '../../features/dashboard/components/charts/LeaveTrendChart';
import { DepartmentDistributionChart } from '../../features/dashboard/components/charts/DepartmentDistributionChart';
import { Download, FileSpreadsheet, BarChart2, Users } from 'lucide-react';
import Link from 'next/link';

export default function ReportsPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-stone-900">
              Workforce Analytics & MIS Reports
            </h1>
            <p className="text-xs md:text-sm text-stone-500 mt-1">
              Consolidated attendance trends, leave patterns, and department resource distribution.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/team?tab=reports">
              <Button
                size="sm"
                variant="outline"
                leftIcon={<Users className="h-4 w-4 text-amber-700" />}
              >
                Manager Team Reports
              </Button>
            </Link>
            <Button size="sm" variant="outline" leftIcon={<FileSpreadsheet className="h-4 w-4" />}>
              Export Attendance MIS
            </Button>
            <Button size="sm" leftIcon={<Download className="h-4 w-4" />}>
              Download Full Report
            </Button>
          </div>
        </div>

        {/* High-Level MIS Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <KPICard
            title="Monthly Attendance"
            value="94.6%"
            change={{ value: '+1.8% vs last month', trend: 'up' }}
          />
          <KPICard
            title="Avg Daily Hours"
            value="8.4 hrs"
            description="Organization target: 8.5 hrs"
          />
          <KPICard
            title="On-Time Arrival"
            value="91.2%"
            description="Within 15-min grace window"
            change={{ value: 'Compliant', trend: 'up' }}
          />
          <KPICard
            title="Annual Attrition"
            value="4.1%"
            description="Low organizational turnover tier"
            change={{ value: 'Healthy', trend: 'neutral' }}
          />
        </div>

        {/* Analytic Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard
            title="Attendance Trend Over Time"
            subtitle="Comparing present staff against leave absences"
          >
            <AttendanceTrendChart />
          </ChartCard>

          <ChartCard
            title="Leave Utilization Trends"
            subtitle="Casual, Sick, and Privilege Leave patterns by month"
          >
            <LeaveTrendChart />
          </ChartCard>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard
            title="Department Distribution"
            subtitle="Resource deployment across organization units"
          >
            <DepartmentDistributionChart />
          </ChartCard>

          <div className="p-5 rounded-xl border border-stone-200 bg-white space-y-4">
            <h3 className="text-sm font-semibold text-stone-900">Standard Scheduled MIS Exports</h3>
            <p className="text-xs text-stone-500">
              Scheduled exports generated on organization datacenter storage.
            </p>
            <div className="space-y-3 pt-2">
              {[
                {
                  name: 'Monthly Payroll Input Roster',
                  format: 'Excel (XLSX)',
                  cycle: '1st of every month',
                },
                {
                  name: 'Weekly Attendance Anomalies Report',
                  format: 'PDF & CSV',
                  cycle: 'Every Monday 06:00 AM',
                },
                {
                  name: 'Outdoor Duty & Geofence Exceptions',
                  format: 'CSV',
                  cycle: 'Daily 11:59 PM',
                },
              ].map((rpt, i) => (
                <div
                  key={i}
                  className="p-3 rounded-lg bg-stone-50 border border-stone-150 flex items-center justify-between"
                >
                  <div>
                    <p className="text-xs font-semibold text-stone-800">{rpt.name}</p>
                    <p className="text-[11px] text-stone-400">
                      {rpt.format} • {rpt.cycle}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-xs">
                    Run Now
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
