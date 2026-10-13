'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Users,
  CheckCircle2,
  CalendarDays,
  UserX,
  Building,
  ShieldCheck,
  TrendingUp,
  Activity,
  RefreshCw,
  AlertCircle,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { KPICard, ChartCard, ActivityItem, Button, Skeleton } from '@hrms/ui';
import { reportsApi } from '../../../lib/api-client';
import { AttendanceTrendChart } from './charts/AttendanceTrendChart';
import { DepartmentDistributionChart } from './charts/DepartmentDistributionChart';

export const AdminDashboard: React.FC = () => {
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
      setError(err?.message || 'Failed to load executive dashboard data');
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
  const branchCount = data?.branchBreakdown?.length ?? 0;
  const deptCount = data?.departmentBreakdown?.length ?? 0;

  // Format attendance trends
  const trendData = data?.attendanceTrend?.map((t: any) => ({
    day: t.date ? t.date.slice(5) : 'Day',
    present: t.presentCount ?? 0,
    leave: t.leaveCount ?? 0,
    absent: t.absentCount ?? 0,
  }));

  // Format department distribution
  const deptDistributionData = data?.departmentBreakdown?.map((d: any) => ({
    department: d.departmentName || 'Unknown',
    count: d.headcount ?? 0,
  }));

  return (
    <div className="space-y-6">
      {/* Top Banner / Welcome */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-stone-900">
            System Administration & Overview
          </h1>
          <p className="text-xs md:text-sm text-stone-500 mt-1">
            Real-time organization health, access governance and operational telemetry.
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
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            System Live
          </span>
          <span className="text-xs text-stone-400">|</span>
          <span className="text-xs font-medium text-stone-600">{branchCount} Branches Active</span>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl border border-rose-200 bg-rose-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-rose-900">
                Dashboard telemetry synchronization warning
              </p>
              <p className="text-xs text-rose-700 mt-0.5">{error}</p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={loadData}>
            Retry
          </Button>
        </div>
      )}

      {/* Primary KPI Row */}
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
              value: `+${periodJoiners} this month`,
              trend: periodJoiners > 0 ? 'up' : 'neutral',
            }}
            icon={<Users className="h-5 w-5 text-amber-700" />}
            iconBg="bg-amber-100"
          />
          <KPICard
            title="Avg Attendance Rate"
            value={`${attendanceRate}%`}
            change={{ value: 'Real-time telemetry', trend: attendanceRate >= 85 ? 'up' : 'down' }}
            icon={<CheckCircle2 className="h-5 w-5 text-emerald-700" />}
            iconBg="bg-emerald-100"
          />
          <KPICard
            title="New Joiners (Period)"
            value={String(periodJoiners)}
            change={{ value: `${periodExits} exits recorded`, trend: 'neutral' }}
            icon={<CalendarDays className="h-5 w-5 text-sky-700" />}
            iconBg="bg-sky-100"
          />
          <KPICard
            title="Pending Approvals"
            value={String(pendingApprovals)}
            change={{
              value: pendingApprovals > 0 ? 'Requires attention' : 'All clear',
              trend: pendingApprovals > 0 ? 'down' : 'neutral',
            }}
            icon={<UserX className="h-5 w-5 text-rose-700" />}
            iconBg="bg-rose-100"
          />
        </div>
      )}

      {/* Organization Overview & Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Active Branches"
          value={`${branchCount} Locations`}
          description={
            data?.branchBreakdown
              ?.map((b: any) => b.branchName)
              .slice(0, 3)
              .join(', ') || 'HQ & Regional Offices'
          }
        />
        <KPICard
          title="Departments"
          value={`${deptCount} Units`}
          description={
            data?.departmentBreakdown
              ?.map((d: any) => d.departmentName)
              .slice(0, 3)
              .join(', ') || 'All business units'
          }
        />
        <KPICard
          title="Data Freshness"
          value={
            summary?.dataFreshnessTimestamp
              ? new Date(summary.dataFreshnessTimestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'Live'
          }
          description="Synchronized with database"
          change={{ value: 'Healthy', trend: 'neutral' }}
        />
        <KPICard
          title="Audit System"
          value="Operational"
          description="Security & audit trail active"
          change={{ value: 'Protected', trend: 'neutral' }}
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="Attendance Overview (Weekly)"
          subtitle="Real-time check-in vs approved leave trend across all branches"
        >
          <AttendanceTrendChart data={trendData} />
        </ChartCard>

        <ChartCard
          title="Department Distribution"
          subtitle="Headcount allocation across company business units"
        >
          <DepartmentDistributionChart data={deptDistributionData} />
        </ChartCard>
      </div>

      {/* Organization Summary & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Department Summary */}
        <div className="lg:col-span-2 rounded-xl border border-stone-200/90 bg-white p-5">
          <div className="flex items-center justify-between pb-4 border-b border-stone-100">
            <div>
              <h3 className="text-sm font-semibold text-stone-900">
                Department Performance Summary
              </h3>
              <p className="text-xs text-stone-500">
                Headcount and organization share from database
              </p>
            </div>
            <Link
              href="/organization"
              className="text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-md transition-colors flex items-center gap-1"
            >
              {deptCount} Departments
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {data?.departmentBreakdown && data.departmentBreakdown.length > 0 ? (
              data.departmentBreakdown.map((dept: any, i: number) => (
                <div
                  key={dept.departmentId || i}
                  className="flex items-center justify-between p-3 rounded-lg bg-stone-50/70 hover:bg-stone-50 transition-colors"
                >
                  <div>
                    <p className="text-xs font-semibold text-stone-800">{dept.departmentName}</p>
                    <p className="text-[11px] text-stone-500">{dept.headcount} team members</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-stone-900">{dept.percentage}% of org</p>
                    <div className="w-24 bg-stone-200 rounded-full h-1.5 mt-1 overflow-hidden">
                      <div
                        className="bg-amber-600 h-1.5 rounded-full"
                        style={{ width: `${Math.min(100, dept.percentage)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-stone-400 py-4 text-center">No department records found</p>
            )}
          </div>
        </div>

        {/* Quick Links / Navigation Feed */}
        <div className="rounded-xl border border-stone-200/90 bg-white p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <h3 className="text-sm font-semibold text-stone-900">Management Portals</h3>
              <Activity className="h-4 w-4 text-stone-400" />
            </div>
            <div className="mt-3 divide-y divide-stone-100">
              <Link
                href="/employees"
                className="py-3 flex items-center justify-between hover:bg-stone-50/80 px-2 rounded-lg transition-colors group"
              >
                <div>
                  <p className="text-xs font-semibold text-stone-900 group-hover:text-amber-700 transition-colors">
                    Employee Directory
                  </p>
                  <p className="text-[11px] text-stone-500">
                    Manage onboardings, lifecycle and contracts
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-stone-400 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <Link
                href="/payroll"
                className="py-3 flex items-center justify-between hover:bg-stone-50/80 px-2 rounded-lg transition-colors group"
              >
                <div>
                  <p className="text-xs font-semibold text-stone-900 group-hover:text-amber-700 transition-colors">
                    Payroll Administration
                  </p>
                  <p className="text-[11px] text-stone-500">
                    Run periods, approval gate, locks & payslips
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-stone-400 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <Link
                href="/attendance"
                className="py-3 flex items-center justify-between hover:bg-stone-50/80 px-2 rounded-lg transition-colors group"
              >
                <div>
                  <p className="text-xs font-semibold text-stone-900 group-hover:text-amber-700 transition-colors">
                    Attendance & Time Tracking
                  </p>
                  <p className="text-[11px] text-stone-500">
                    Shifts, daily summaries, geofence policies
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-stone-400 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <Link
                href="/audit"
                className="py-3 flex items-center justify-between hover:bg-stone-50/80 px-2 rounded-lg transition-colors group"
              >
                <div>
                  <p className="text-xs font-semibold text-stone-900 group-hover:text-amber-700 transition-colors">
                    Security Audit Trail
                  </p>
                  <p className="text-[11px] text-stone-500">
                    Tamper-evident system activity and login logs
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-stone-400 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
