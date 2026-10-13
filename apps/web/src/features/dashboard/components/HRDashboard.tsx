'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Users,
  UserCheck,
  UserPlus,
  UserMinus,
  Clock,
  UserX,
  CalendarDays,
  Briefcase,
  AlertCircle,
  FileCheck,
  ChevronRight,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';
import { KPICard, ChartCard, Button, Badge, Skeleton } from '@hrms/ui';
import { reportsApi } from '../../../lib/api-client';
import { AttendanceTrendChart } from './charts/AttendanceTrendChart';
import { EmployeeProgressChart } from './charts/EmployeeProgressChart';

export const HRDashboard: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await reportsApi.getExecutiveDashboard();
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Failed to load HR operations metrics');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const summary = data?.summary;
  const totalEmployees = summary?.activeHeadcount?.value ?? 0;
  const attendanceRate = summary?.attendanceRate?.value ?? 0;
  const periodJoiners = summary?.periodJoiners?.value ?? 0;
  const periodExits = summary?.periodExits?.value ?? 0;
  const pendingApprovals = summary?.pendingApprovalsCount?.value ?? 0;
  const overdueAppraisals = summary?.overdueAppraisalsCount?.value ?? 0;

  // Format attendance trends
  const trendData = data?.attendanceTrend?.map((t: any) => ({
    day: t.date ? t.date.slice(5) : 'Day',
    present: t.presentCount ?? 0,
    leave: t.leaveCount ?? 0,
    absent: t.absentCount ?? 0,
  }));

  return (
    <div className="space-y-6">
      {/* Top Welcome */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-stone-900">
            People Operations & HR Management
          </h1>
          <p className="text-xs md:text-sm text-stone-500 mt-1">
            Workforce roster, attendance status, pending approvals, and employee lifecycle tracks.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />}
            onClick={loadData}
            disabled={isLoading}
          >
            Refresh
          </Button>
          <Link href="/reports">
            <Button size="sm" variant="outline" leftIcon={<FileCheck className="h-4 w-4" />}>
              MIS Reports
            </Button>
          </Link>
          <Link href="/employees">
            <Button size="sm" leftIcon={<UserPlus className="h-4 w-4" />}>
              Employee Directory
            </Button>
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl border border-rose-200 bg-rose-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-rose-900">
                Telemetry synchronization warning
              </p>
              <p className="text-xs text-rose-700 mt-0.5">{error}</p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={loadData}>
            Retry
          </Button>
        </div>
      )}

      {/* Row 1: Employee Roster Metrics */}
      <div>
        <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2.5">
          Workforce Movement
        </p>
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-5 rounded-xl border border-stone-200 bg-white space-y-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              title="Total Active Employees"
              value={String(totalEmployees)}
              change={{
                value: `${data?.departmentBreakdown?.length ?? 0} departments`,
                trend: 'up',
              }}
              icon={<Users className="h-5 w-5 text-amber-700" />}
              iconBg="bg-amber-100"
            />
            <KPICard
              title="Attendance Rate"
              value={`${attendanceRate}%`}
              change={{
                value: 'Company-wide average',
                trend: attendanceRate >= 85 ? 'up' : 'down',
              }}
              icon={<UserCheck className="h-5 w-5 text-emerald-700" />}
              iconBg="bg-emerald-100"
            />
            <KPICard
              title="New Joiners (Month)"
              value={String(periodJoiners)}
              change={{ value: 'Joined this period', trend: periodJoiners > 0 ? 'up' : 'neutral' }}
              icon={<UserPlus className="h-5 w-5 text-sky-700" />}
              iconBg="bg-sky-100"
            />
            <KPICard
              title="Exited Employees"
              value={String(periodExits)}
              change={{ value: 'Notice completed', trend: 'neutral' }}
              icon={<UserMinus className="h-5 w-5 text-stone-600" />}
              iconBg="bg-stone-100"
            />
          </div>
        )}
      </div>

      {/* Row 2: Today's Attendance & Compliance Operations */}
      <div>
        <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2.5">
          Operations & Workflow Queue
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            title="Pending Requests"
            value={String(pendingApprovals)}
            change={{
              value: pendingApprovals > 0 ? 'Awaiting reviews' : 'Queue clear',
              trend: pendingApprovals > 0 ? 'down' : 'neutral',
            }}
            icon={<Clock className="h-5 w-5 text-amber-700" />}
            iconBg="bg-amber-100"
          />
          <KPICard
            title="Performance Appraisals"
            value={String(overdueAppraisals)}
            change={{
              value: overdueAppraisals > 0 ? 'Overdue submissions' : 'On schedule',
              trend: overdueAppraisals > 0 ? 'down' : 'neutral',
            }}
            icon={<AlertCircle className="h-5 w-5 text-rose-700" />}
            iconBg="bg-rose-100"
          />
          <KPICard
            title="Branches Operating"
            value={`${data?.branchBreakdown?.length ?? 0} Branches`}
            change={{ value: 'All locations active', trend: 'neutral' }}
            icon={<CalendarDays className="h-5 w-5 text-sky-700" />}
            iconBg="bg-sky-100"
          />
          <KPICard
            title="Payroll Cycle"
            value="Ready"
            change={{ value: 'Integrated inputs', trend: 'up' }}
            icon={<Briefcase className="h-5 w-5 text-purple-700" />}
            iconBg="bg-purple-100"
          />
        </div>
      </div>

      {/* Charts Section: Attendance Trend & Employee Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="Attendance & Absence Trend"
          subtitle="Real-time daily presence, approved leaves, and absences"
        >
          <AttendanceTrendChart data={trendData} />
        </ChartCard>

        <ChartCard
          title="Employee Progress & Enablement"
          subtitle="Mandatory training modules and onboarding milestones"
        >
          <EmployeeProgressChart />
        </ChartCard>
      </div>

      {/* Pending HR Actions & Department Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Actions */}
        <div className="rounded-xl border border-stone-200/90 bg-white p-5">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <div>
              <h3 className="text-sm font-semibold text-stone-900">
                Pending Operational Workflows
              </h3>
              <p className="text-xs text-stone-500">Cross-module requests and approval queues</p>
            </div>
            <Link href="/requests">
              <Badge variant="warning">{pendingApprovals} In Queue</Badge>
            </Link>
          </div>
          <div className="mt-3 divide-y divide-stone-100">
            <Link
              href="/requests"
              className="py-3 flex items-center justify-between hover:bg-stone-50 px-2 rounded-lg transition-colors group"
            >
              <div>
                <p className="text-xs font-semibold text-stone-900 group-hover:text-amber-700 transition-colors">
                  Leave & WFH Approvals
                </p>
                <p className="text-[11px] text-stone-500">
                  Escalated and executive management requests
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-stone-400 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link
              href="/progress?tab=cycles"
              className="py-3 flex items-center justify-between hover:bg-stone-50 px-2 rounded-lg transition-colors group"
            >
              <div>
                <p className="text-xs font-semibold text-stone-900 group-hover:text-amber-700 transition-colors">
                  Performance Review Cycles
                </p>
                <p className="text-[11px] text-stone-500">
                  Participant stages, scores, and review approvals
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-stone-400 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link
              href="/payroll"
              className="py-3 flex items-center justify-between hover:bg-stone-50 px-2 rounded-lg transition-colors group"
            >
              <div>
                <p className="text-xs font-semibold text-stone-900 group-hover:text-amber-700 transition-colors">
                  Payroll Runs & Exceptions
                </p>
                <p className="text-[11px] text-stone-500">
                  Approval gates, statutory checks, and disbursements
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-stone-400 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
        </div>

        {/* Department Overview */}
        <div className="rounded-xl border border-stone-200/90 bg-white p-5">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <div>
              <h3 className="text-sm font-semibold text-stone-900">Department Workforce Roster</h3>
              <p className="text-xs text-stone-500">Headcount distribution from database records</p>
            </div>
            <Link
              href="/organization"
              className="text-xs font-medium text-amber-700 hover:text-amber-800"
            >
              Manage Org &rarr;
            </Link>
          </div>
          <div className="mt-3 space-y-3">
            {data?.departmentBreakdown && data.departmentBreakdown.length > 0 ? (
              data.departmentBreakdown.map((dept: any, i: number) => (
                <div
                  key={dept.departmentId || i}
                  className="flex items-center justify-between p-3 rounded-lg bg-stone-50/60"
                >
                  <div>
                    <p className="text-xs font-semibold text-stone-800">{dept.departmentName}</p>
                    <p className="text-[11px] text-stone-500">{dept.headcount} Staff members</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                      {dept.percentage}% of org
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-stone-400 py-4 text-center">
                No department distributions found
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
