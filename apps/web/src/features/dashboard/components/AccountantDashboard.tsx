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
  Banknote,
  FileSpreadsheet,
  FileCheck,
  CreditCard,
  Layers,
  Scale,
  Receipt,
  FileText,
} from 'lucide-react';
import { KPICard, ChartCard, Button, Badge, Skeleton } from '@hrms/ui';
import { reportsApi, payrollApi } from '../../../lib/api-client';
import { AttendanceTrendChart } from './charts/AttendanceTrendChart';
import { DepartmentDistributionChart } from './charts/DepartmentDistributionChart';

export const AccountantDashboard: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [structuresCount, setStructuresCount] = useState<number>(0);
  const [runsCount, setRunsCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [dashRes, structRes, runsRes] = await Promise.allSettled([
        reportsApi.getExecutiveDashboard(),
        payrollApi.getSalaryStructures({ limit: 10 }),
        payrollApi.getPayrollRuns({ limit: 10 }),
      ]);

      if (dashRes.status === 'fulfilled') {
        setData(dashRes.value);
      } else {
        throw new Error(dashRes.reason?.message || 'Failed to load executive telemetry');
      }

      if (structRes.status === 'fulfilled') {
        const val = structRes.value as any;
        const count =
          val?.data?.total ??
          val?.meta?.total ??
          (Array.isArray(val?.data?.items)
            ? val.data.items.length
            : Array.isArray(val?.data)
              ? val.data.length
              : 0);
        setStructuresCount(count);
      }

      if (runsRes.status === 'fulfilled') {
        const val = runsRes.value as any;
        const count =
          val?.meta?.total ??
          val?.data?.total ??
          (Array.isArray(val?.data?.items)
            ? val.data.items.length
            : Array.isArray(val?.data)
              ? val.data.length
              : 0);
        setRunsCount(count);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load financial & accounts dashboard data');
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
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-stone-900">
              Finance & Accounts Command Center
            </h1>
            <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">
              Finance Portal
            </Badge>
          </div>
          <p className="text-xs md:text-sm text-stone-500 mt-1">
            ADT-AI Training Foundation • Real-time payroll reconciliation, statutory compensation
            governance, and fiscal health.
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
              Financial Reports
            </Button>
          </Link>
          <Link href="/payroll">
            <Button size="sm" leftIcon={<Banknote className="h-4 w-4" />}>
              Process Payroll
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
                Financial telemetry synchronization alert
              </p>
              <p className="text-xs text-rose-700 mt-0.5">{error}</p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={loadData}>
            Retry
          </Button>
        </div>
      )}

      {/* Primary Financial & Workforce KPI Row */}
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
            title="Payroll Eligible Headcount"
            value={String(totalEmployees)}
            change={{
              value: '100% on-roll staff',
              trend: 'up',
            }}
            icon={<Users className="h-5 w-5 text-amber-700" />}
            iconBg="bg-amber-100"
          />
          <KPICard
            title="Avg Monthly Attendance"
            value={`${attendanceRate}%`}
            change={{ value: 'Direct LOP driver', trend: attendanceRate >= 85 ? 'up' : 'down' }}
            icon={<CheckCircle2 className="h-5 w-5 text-emerald-700" />}
            iconBg="bg-emerald-100"
          />
          <KPICard
            title="Salary Structures"
            value={`${structuresCount} Active`}
            change={{ value: 'Statutory CTC sets', trend: 'neutral' }}
            icon={<FileSpreadsheet className="h-5 w-5 text-sky-700" />}
            iconBg="bg-sky-100"
          />
          <KPICard
            title="Payroll Cycles"
            value={`${runsCount} Cycles`}
            change={{ value: 'Current FY 2026-27', trend: 'neutral' }}
            icon={<Banknote className="h-5 w-5 text-purple-700" />}
            iconBg="bg-purple-100"
          />
        </div>
      )}

      {/* Secondary Cost Center & Governance Indicators */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Cost Centers / Branches"
          value={`${branchCount} Locations`}
          description={
            data?.branchBreakdown
              ?.map((b: any) => b.branchName)
              .slice(0, 3)
              .join(', ') || 'Baramati Campus & Regional'
          }
        />
        <KPICard
          title="Departments"
          value={`${deptCount} Units`}
          description={
            data?.departmentBreakdown
              ?.map((d: any) => d.departmentName)
              .slice(0, 3)
              .join(', ') || 'Academic & Operational Units'
          }
        />
        <KPICard
          title="Pending Approvals"
          value={String(pendingApprovals)}
          description="Compensation & expense revisions"
          change={{
            value: pendingApprovals > 0 ? 'Requires attention' : 'All clear',
            trend: pendingApprovals > 0 ? 'down' : 'neutral',
          }}
        />
        <KPICard
          title="Statutory Compliance"
          value="EPF • PT • TDS"
          description="Deduction rules active"
          change={{ value: 'Compliant', trend: 'up' }}
        />
      </div>

      {/* Quick Launch & Action Hub */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link
          href="/payroll"
          className="group block p-5 rounded-xl border border-stone-200/90 bg-white hover:border-amber-500/50 hover:shadow-md transition-all duration-200"
        >
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-lg bg-amber-50 text-amber-700 group-hover:bg-amber-100 transition-colors">
              <Banknote className="h-5 w-5" />
            </div>
            <ArrowRight className="h-4 w-4 text-stone-400 group-hover:text-amber-600 group-hover:translate-x-0.5 transition-all" />
          </div>
          <h3 className="mt-3 text-sm font-semibold text-stone-900 group-hover:text-amber-700 transition-colors">
            Payroll Processing Hub
          </h3>
          <p className="mt-1 text-xs text-stone-500 line-clamp-2">
            Execute monthly runs, inspect calculation breakdowns, and manage lock states.
          </p>
        </Link>

        <Link
          href="/payroll/structures"
          className="group block p-5 rounded-xl border border-stone-200/90 bg-white hover:border-sky-500/50 hover:shadow-md transition-all duration-200"
        >
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-lg bg-sky-50 text-sky-700 group-hover:bg-sky-100 transition-colors">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <ArrowRight className="h-4 w-4 text-stone-400 group-hover:text-sky-600 group-hover:translate-x-0.5 transition-all" />
          </div>
          <h3 className="mt-3 text-sm font-semibold text-stone-900 group-hover:text-sky-700 transition-colors">
            Salary Structures & CTC
          </h3>
          <p className="mt-1 text-xs text-stone-500 line-clamp-2">
            Configure base compensation slabs, allowances, and statutory deduction policies.
          </p>
        </Link>

        <Link
          href="/payroll/payslips"
          className="group block p-5 rounded-xl border border-stone-200/90 bg-white hover:border-emerald-500/50 hover:shadow-md transition-all duration-200"
        >
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-700 group-hover:bg-emerald-100 transition-colors">
              <Receipt className="h-5 w-5" />
            </div>
            <ArrowRight className="h-4 w-4 text-stone-400 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all" />
          </div>
          <h3 className="mt-3 text-sm font-semibold text-stone-900 group-hover:text-emerald-700 transition-colors">
            Payslips & Register
          </h3>
          <p className="mt-1 text-xs text-stone-500 line-clamp-2">
            Inspect generated salary slips, review payment status, and export confidential
            registers.
          </p>
        </Link>

        <Link
          href="/reports"
          className="group block p-5 rounded-xl border border-stone-200/90 bg-white hover:border-purple-500/50 hover:shadow-md transition-all duration-200"
        >
          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-lg bg-purple-50 text-purple-700 group-hover:bg-purple-100 transition-colors">
              <FileCheck className="h-5 w-5" />
            </div>
            <ArrowRight className="h-4 w-4 text-stone-400 group-hover:text-purple-600 group-hover:translate-x-0.5 transition-all" />
          </div>
          <h3 className="mt-3 text-sm font-semibold text-stone-900 group-hover:text-purple-700 transition-colors">
            Financial MIS & Audits
          </h3>
          <p className="mt-1 text-xs text-stone-500 line-clamp-2">
            Access cost center analytics, bank reconciliation advice, and period comparisons.
          </p>
        </Link>
      </div>

      {/* Visual Analytics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="Attendance & Loss-of-Pay (LOP) Telemetry"
          subtitle="Daily check-in vs approved leaves directly governing loss-of-pay salary adjustments"
        >
          <AttendanceTrendChart data={trendData} />
        </ChartCard>

        <ChartCard
          title="Cost Center & Department Distribution"
          subtitle="Workforce allocation across ADT-AI Training Foundation business units"
        >
          <DepartmentDistributionChart data={deptDistributionData} />
        </ChartCard>
      </div>

      {/* Financial Governance & Cost Center Rollup */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Department Cost Centers */}
        <div className="lg:col-span-2 rounded-xl border border-stone-200/90 bg-white p-5">
          <div className="flex items-center justify-between pb-4 border-b border-stone-100">
            <div>
              <h3 className="text-sm font-semibold text-stone-900">
                Departmental Cost Centers & Allocation
              </h3>
              <p className="text-xs text-stone-500">
                Active staff count per cost center from authoritative database
              </p>
            </div>
            <Link
              href="/reports"
              className="text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-md transition-colors flex items-center gap-1"
            >
              Cost Center Report
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {data?.departmentBreakdown && data.departmentBreakdown.length > 0 ? (
              data.departmentBreakdown.map((dept: any, i: number) => (
                <div
                  key={dept.departmentId || i}
                  className="flex items-center justify-between p-3 rounded-lg bg-stone-50/70 border border-stone-100 text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="h-2 w-2 rounded-full bg-amber-500" />
                    <div>
                      <p className="font-semibold text-stone-800">{dept.departmentName}</p>
                      <p className="text-[11px] text-stone-400">
                        Cost Center ID: {dept.departmentId.slice(0, 8)}...
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-medium text-stone-600">{dept.headcount} Staff</span>
                    <span className="font-semibold text-amber-700">{dept.percentage}% of Org</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-stone-400 py-4 text-center">
                No departmental cost center data available.
              </p>
            )}
          </div>
        </div>

        {/* Fiscal Compliance & Statutory Checklist */}
        <div className="rounded-xl border border-stone-200/90 bg-white p-5">
          <div className="flex items-center justify-between pb-4 border-b border-stone-100">
            <div>
              <h3 className="text-sm font-semibold text-stone-900">Statutory Controls</h3>
              <p className="text-xs text-stone-500">Payroll regulatory compliance</p>
            </div>
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-4 space-y-3">
            <div className="p-3 rounded-lg bg-emerald-50/60 border border-emerald-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-900">
                  EPFO / Provident Fund
                </span>
                <Badge
                  variant="outline"
                  className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]"
                >
                  12% Basic
                </Badge>
              </div>
              <p className="text-[11px] text-emerald-700 mt-1">
                Employer & employee statutory contribution matching active.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-sky-50/60 border border-sky-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-sky-900">Professional Tax (PT)</span>
                <Badge
                  variant="outline"
                  className="bg-sky-100 text-sky-800 border-sky-200 text-[10px]"
                >
                  State Slabs
                </Badge>
              </div>
              <p className="text-[11px] text-sky-700 mt-1">
                Maharashtra PT slab computation enabled for all payroll runs.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-amber-50/60 border border-amber-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-900">
                  Income Tax (TDS u/s 192)
                </span>
                <Badge
                  variant="outline"
                  className="bg-amber-100 text-amber-800 border-amber-200 text-[10px]"
                >
                  FY 2026-27
                </Badge>
              </div>
              <p className="text-[11px] text-amber-700 mt-1">
                New tax regime default with declaration exemptions.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-stone-50 border border-stone-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-stone-800">Attendance Auto-LOP</span>
                <Badge
                  variant="outline"
                  className="bg-stone-200 text-stone-700 border-stone-300 text-[10px]"
                >
                  Synchronized
                </Badge>
              </div>
              <p className="text-[11px] text-stone-600 mt-1">
                Loss-of-Pay deduction calculated automatically from check-ins.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
