'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppShell } from '../../layouts/AppShell';
import { ChartCard, KPICard, Button } from '@hrms/ui';
import { reportsApi, organizationApi } from '../../lib/api-client';
import { useAuth } from '../../context/AuthContext';
import { ExecutiveDashboardSummaryDto } from '@hrms/types';
import { WorkforceAnalyticsTab } from './components/WorkforceAnalyticsTab';
import { AttendanceAnalyticsTab } from './components/AttendanceAnalyticsTab';
import {
  Users,
  UserCheck,
  UserMinus,
  Calendar,
  Clock,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Table as TableIcon,
  BarChart3,
  Building2,
  MapPin,
  ShieldCheck,
  ChevronRight,
  Filter,
} from 'lucide-react';
import Link from 'next/link';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

export default function ReportsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [mainTab, setMainTab] = useState<'EXECUTIVE' | 'WORKFORCE' | 'ATTENDANCE'>('EXECUTIVE');

  // Filter States
  const [datePreset, setDatePreset] = useState<'7D' | '30D' | 'MTD' | 'CUSTOM'>('30D');
  const [departmentId, setDepartmentId] = useState<string>('ALL');
  const [branchId, setBranchId] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'CHARTS' | 'TABLES'>('CHARTS');

  // Metadata dropdown options
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);

  // Dashboard Data State
  const [data, setData] = useState<{
    summary: ExecutiveDashboardSummaryDto;
    departmentBreakdown: Array<{
      departmentId: string;
      departmentName: string;
      headcount: number;
      percentage: number;
      isSuppressed: boolean;
    }>;
    branchBreakdown: Array<{
      branchId: string;
      branchName: string;
      headcount: number;
      percentage: number;
    }>;
    attendanceTrend: Array<{
      date: string;
      presentCount: number;
      leaveCount: number;
      absentCount: number;
      attendanceRate: number;
    }>;
    metadata: {
      scopeType: 'ORGANIZATION' | 'TEAM';
      appliedDepartmentId: string | null;
      appliedBranchId: string | null;
      filterEmployeeCount: number;
    };
  } | null>(null);

  // Compute date range from preset
  const computeDateRange = useCallback(() => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    if (datePreset === '7D') {
      const past = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      return { startDate: past, endDate: todayStr, asOfDate: todayStr };
    }
    if (datePreset === 'MTD') {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
        .toISOString()
        .split('T')[0];
      return { startDate: startOfMonth, endDate: todayStr, asOfDate: todayStr };
    }
    // Default 30D
    const past30 = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    return { startDate: past30, endDate: todayStr, asOfDate: todayStr };
  }, [datePreset]);

  // Load department and branch filters once
  useEffect(() => {
    async function loadFilterOptions() {
      try {
        const [deptRes, branchRes] = await Promise.all([
          organizationApi.getDepartments().catch(() => []),
          organizationApi.getBranches().catch(() => []),
        ]);
        if (Array.isArray(deptRes)) setDepartments(deptRes);
        if (Array.isArray(branchRes)) setBranches(branchRes);
      } catch {
        // Fallback silently if options fail
      }
    }
    loadFilterOptions();
  }, []);

  // Fetch Dashboard Summary
  const fetchDashboard = useCallback(
    async (isBackground = false) => {
      if (!isBackground) setLoading(true);
      else setRefreshing(true);
      setError(null);

      try {
        const { startDate, endDate, asOfDate } = computeDateRange();
        const res = await reportsApi.getExecutiveDashboard({
          asOfDate,
          startDate,
          endDate,
          departmentId: departmentId !== 'ALL' ? departmentId : undefined,
          branchId: branchId !== 'ALL' ? branchId : undefined,
        });
        setData(res);
      } catch (err: any) {
        setError(err.message || 'Failed to load executive workforce metrics');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [computeDateRange, departmentId, branchId],
  );

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header & Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-stone-900">
                Executive Workforce Dashboard
              </h1>
              {data?.metadata.scopeType === 'TEAM' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                  <ShieldCheck className="h-3 w-3" /> Team Scope
                </span>
              )}
            </div>
            <p className="text-xs md:text-sm text-stone-500 mt-1">
              Authoritative institutional KPIs, headcount movements, punctuality compliance, and
              review cycle status.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center rounded-lg border border-stone-200 bg-white p-0.5">
              <button
                onClick={() => setViewMode('CHARTS')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  viewMode === 'CHARTS'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                Charts
              </button>
              <button
                onClick={() => setViewMode('TABLES')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  viewMode === 'TABLES'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <TableIcon className="h-3.5 w-3.5" />
                Accessible Tables
              </button>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() => fetchDashboard(true)}
              disabled={loading || refreshing}
              leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />}
            >
              Refresh
            </Button>
          </div>
        </div>

        {/* Primary Reports Navigation Tabs */}
        <div className="flex border-b border-stone-200">
          <button
            onClick={() => setMainTab('EXECUTIVE')}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-all ${
              mainTab === 'EXECUTIVE'
                ? 'border-amber-600 text-amber-900 bg-amber-50/40'
                : 'border-transparent text-stone-600 hover:text-stone-900 hover:border-stone-300'
            }`}
          >
            <BarChart3 className="h-4 w-4 text-amber-600" />
            Executive Overview
          </button>
          <button
            onClick={() => setMainTab('WORKFORCE')}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-all ${
              mainTab === 'WORKFORCE'
                ? 'border-amber-600 text-amber-900 bg-amber-50/40'
                : 'border-transparent text-stone-600 hover:text-stone-900 hover:border-stone-300'
            }`}
          >
            <Users className="h-4 w-4 text-amber-600" />
            Workforce & Headcount Analytics
          </button>
          <button
            onClick={() => setMainTab('ATTENDANCE')}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition-all ${
              mainTab === 'ATTENDANCE'
                ? 'border-amber-600 text-amber-900 bg-amber-50/40'
                : 'border-transparent text-stone-600 hover:text-stone-900 hover:border-stone-300'
            }`}
          >
            <Clock className="h-4 w-4 text-amber-600" />
            Attendance Analytics & Exceptions
          </button>
        </div>

        {mainTab === 'WORKFORCE' ? (
          <WorkforceAnalyticsTab />
        ) : mainTab === 'ATTENDANCE' ? (
          <AttendanceAnalyticsTab />
        ) : (
          <>
            {/* Filter Bar */}
            <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-4">
              <div className="flex flex-col sm:flex-row flex-wrap items-center justify-between gap-3 text-xs text-stone-600">
                <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                  {/* Date Presets */}
                  <div className="flex items-center gap-1 bg-white border border-stone-200 rounded-lg p-1">
                    {(['7D', '30D', 'MTD'] as const).map((preset) => (
                      <button
                        key={preset}
                        onClick={() => setDatePreset(preset)}
                        className={`px-2.5 py-1 font-medium rounded-md text-xs transition-colors ${
                          datePreset === preset
                            ? 'bg-stone-900 text-white'
                            : 'text-stone-600 hover:bg-stone-100'
                        }`}
                      >
                        {preset === '7D'
                          ? 'Last 7 Days'
                          : preset === '30D'
                            ? 'Last 30 Days'
                            : 'This Month'}
                      </button>
                    ))}
                  </div>

                  {/* Department Select */}
                  {departments.length > 0 && (
                    <div className="flex items-center gap-1.5 bg-white border border-stone-200 rounded-lg px-2.5 py-1">
                      <Building2 className="h-3.5 w-3.5 text-stone-400" />
                      <select
                        value={departmentId}
                        onChange={(e) => setDepartmentId(e.target.value)}
                        className="bg-transparent text-xs font-medium text-stone-800 focus:outline-none cursor-pointer"
                      >
                        <option value="ALL">All Departments</option>
                        {departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Branch Select */}
                  {branches.length > 0 && (
                    <div className="flex items-center gap-1.5 bg-white border border-stone-200 rounded-lg px-2.5 py-1">
                      <MapPin className="h-3.5 w-3.5 text-stone-400" />
                      <select
                        value={branchId}
                        onChange={(e) => setBranchId(e.target.value)}
                        className="bg-transparent text-xs font-medium text-stone-800 focus:outline-none cursor-pointer"
                      >
                        <option value="ALL">All Branches</option>
                        {branches.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Freshness & Metadata Indicator */}
                {data && (
                  <div className="text-[11px] text-stone-500 flex items-center gap-3">
                    <span>
                      Timezone: <strong className="text-stone-700">{data.summary.timezone}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Refreshed:{' '}
                      <strong className="text-stone-700">
                        {new Date(data.summary.dataFreshnessTimestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </strong>
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Error Alert */}
            {error && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-rose-600" />
                  <span>{error}</span>
                </div>
                <Button size="sm" variant="outline" onClick={() => fetchDashboard()}>
                  Retry
                </Button>
              </div>
            )}

            {/* Loading State */}
            {loading && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-32 rounded-xl border border-stone-200 bg-white p-5 animate-pulse flex flex-col justify-between"
                  >
                    <div className="h-4 bg-stone-200 rounded w-1/3"></div>
                    <div className="h-8 bg-stone-200 rounded w-1/2"></div>
                    <div className="h-3 bg-stone-100 rounded w-2/3"></div>
                  </div>
                ))}
              </div>
            )}

            {/* Data View */}
            {!loading && data && (
              <>
                {/* Primary KPI Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Card 1: Active Headcount */}
                  <Link href={data.summary.activeHeadcount.drillDownUrl}>
                    <div className="group rounded-xl border border-stone-200 bg-white p-5 hover:border-amber-400 hover:shadow-md transition-all cursor-pointer h-full flex flex-col justify-between">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                          Active Headcount (Snapshot)
                        </span>
                        <span className="p-2 rounded-lg bg-amber-50 text-amber-700 group-hover:bg-amber-100 transition-colors">
                          <Users className="h-4 w-4" />
                        </span>
                      </div>
                      <div className="my-3">
                        <p className="text-2xl md:text-3xl font-bold text-stone-900 tracking-tight">
                          {data.summary.activeHeadcount.formattedValue}
                        </p>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-stone-500">
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                            <UserCheck className="h-3.5 w-3.5" /> +
                            {data.summary.periodJoiners.formattedValue} joiners
                          </span>
                          <span>•</span>
                          <span className="inline-flex items-center gap-1 text-rose-600 font-medium">
                            <UserMinus className="h-3.5 w-3.5" /> -
                            {data.summary.periodExits.formattedValue} exits
                          </span>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-400 group-hover:text-amber-700">
                        <span>View Workforce Roster</span>
                        <ChevronRight className="h-3 w-3" />
                      </div>
                    </div>
                  </Link>

                  {/* Card 2: Attendance Rate */}
                  <Link href={data.summary.attendanceRate.drillDownUrl}>
                    <div className="group rounded-xl border border-stone-200 bg-white p-5 hover:border-amber-400 hover:shadow-md transition-all cursor-pointer h-full flex flex-col justify-between">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                          Attendance Rate
                        </span>
                        <span className="p-2 rounded-lg bg-emerald-50 text-emerald-700 group-hover:bg-emerald-100 transition-colors">
                          <Clock className="h-4 w-4" />
                        </span>
                      </div>
                      <div className="my-3">
                        <p className="text-2xl md:text-3xl font-bold text-stone-900 tracking-tight">
                          {data.summary.attendanceRate.formattedValue}
                        </p>
                        <p className="text-xs text-stone-500 mt-1">
                          Punctuality:{' '}
                          <strong className="text-stone-700">
                            {data.summary.onTimeArrivalRate.formattedValue}
                          </strong>{' '}
                          on-time arrivals
                        </p>
                      </div>
                      <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-400 group-hover:text-amber-700">
                        <span>View Attendance Details</span>
                        <ChevronRight className="h-3 w-3" />
                      </div>
                    </div>
                  </Link>

                  {/* Card 3: Leave Utilization */}
                  <Link href={data.summary.leaveUtilizationRate.drillDownUrl}>
                    <div className="group rounded-xl border border-stone-200 bg-white p-5 hover:border-amber-400 hover:shadow-md transition-all cursor-pointer h-full flex flex-col justify-between">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                          Leave Utilization
                        </span>
                        <span className="p-2 rounded-lg bg-blue-50 text-blue-700 group-hover:bg-blue-100 transition-colors">
                          <Calendar className="h-4 w-4" />
                        </span>
                      </div>
                      <div className="my-3">
                        <p className="text-2xl md:text-3xl font-bold text-stone-900 tracking-tight">
                          {data.summary.leaveUtilizationRate.formattedValue}
                        </p>
                        <p className="text-xs text-stone-500 mt-1">
                          Annual chargeable quota consumed
                        </p>
                      </div>
                      <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-400 group-hover:text-amber-700">
                        <span>View Leave Ledgers</span>
                        <ChevronRight className="h-3 w-3" />
                      </div>
                    </div>
                  </Link>

                  {/* Card 4: Approval Turnaround (TAT) */}
                  <Link href={data.summary.avgApprovalTurnaroundHours.drillDownUrl}>
                    <div className="group rounded-xl border border-stone-200 bg-white p-5 hover:border-amber-400 hover:shadow-md transition-all cursor-pointer h-full flex flex-col justify-between">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                          Approval Turnaround (TAT)
                        </span>
                        <span className="p-2 rounded-lg bg-purple-50 text-purple-700 group-hover:bg-purple-100 transition-colors">
                          <TrendingUp className="h-4 w-4" />
                        </span>
                      </div>
                      <div className="my-3">
                        <p className="text-2xl md:text-3xl font-bold text-stone-900 tracking-tight">
                          {data.summary.avgApprovalTurnaroundHours.formattedValue}
                        </p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-stone-500">
                          <span>
                            Pending:{' '}
                            <strong className="text-stone-800">
                              {data.summary.pendingApprovalsCount.formattedValue}
                            </strong>
                          </span>
                          {Number(data.summary.slaBreachRatio.value || 0) > 0 && (
                            <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-semibold text-rose-700">
                              {data.summary.slaBreachRatio.formattedValue} Breached
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-400 group-hover:text-amber-700">
                        <span>Manage Approvals</span>
                        <ChevronRight className="h-3 w-3" />
                      </div>
                    </div>
                  </Link>

                  {/* Card 5: Review Cycle Completion */}
                  <Link href={data.summary.activeReviewCycleCompletionRate.drillDownUrl}>
                    <div className="group rounded-xl border border-stone-200 bg-white p-5 hover:border-amber-400 hover:shadow-md transition-all cursor-pointer h-full flex flex-col justify-between">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                          Review Cycle Progress
                        </span>
                        <span className="p-2 rounded-lg bg-teal-50 text-teal-700 group-hover:bg-teal-100 transition-colors">
                          <CheckCircle2 className="h-4 w-4" />
                        </span>
                      </div>
                      <div className="my-3">
                        <p className="text-2xl md:text-3xl font-bold text-stone-900 tracking-tight">
                          {data.summary.activeReviewCycleCompletionRate.formattedValue}
                        </p>
                        <p className="text-xs text-stone-500 mt-1">
                          {data.summary.overdueAppraisalsCount.value !== null &&
                          Number(data.summary.overdueAppraisalsCount.value) > 0 ? (
                            <span className="text-amber-700 font-medium">
                              {data.summary.overdueAppraisalsCount.formattedValue} appraisals
                              pending past deadline
                            </span>
                          ) : (
                            'On schedule'
                          )}
                        </p>
                      </div>
                      <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-400 group-hover:text-amber-700">
                        <span>Performance Analytics</span>
                        <ChevronRight className="h-3 w-3" />
                      </div>
                    </div>
                  </Link>

                  {/* Card 6: Annualized Attrition Rate */}
                  <Link href={data.summary.annualizedAttritionRate.drillDownUrl}>
                    <div className="group rounded-xl border border-stone-200 bg-white p-5 hover:border-amber-400 hover:shadow-md transition-all cursor-pointer h-full flex flex-col justify-between">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                          Annualized Attrition
                        </span>
                        <span className="p-2 rounded-lg bg-stone-100 text-stone-700 group-hover:bg-stone-200 transition-colors">
                          <UserMinus className="h-4 w-4" />
                        </span>
                      </div>
                      <div className="my-3">
                        <p className="text-2xl md:text-3xl font-bold text-stone-900 tracking-tight">
                          {data.summary.annualizedAttritionRate.formattedValue}
                        </p>
                        <p className="text-xs text-stone-500 mt-1">
                          Standard turnover health benchmark (&lt;10%)
                        </p>
                      </div>
                      <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-400 group-hover:text-amber-700">
                        <span>Workforce Trends</span>
                        <ChevronRight className="h-3 w-3" />
                      </div>
                    </div>
                  </Link>
                </div>

                {/* Visual Charts vs Accessible Tables */}
                {viewMode === 'CHARTS' ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Attendance Trend Area Chart */}
                    <ChartCard
                      title="Attendance & Absence Trend"
                      subtitle={`Daily headcount rollups over selected ${datePreset} period`}
                    >
                      <div className="w-full h-64">
                        {data.attendanceTrend.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart
                              data={data.attendanceTrend}
                              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                            >
                              <defs>
                                <linearGradient id="execPresent" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#D97706" stopOpacity={0.25} />
                                  <stop offset="95%" stopColor="#D97706" stopOpacity={0.0} />
                                </linearGradient>
                                <linearGradient id="execLeave" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.25} />
                                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0} />
                                </linearGradient>
                              </defs>
                              <CartesianGrid
                                strokeDasharray="3 3"
                                vertical={false}
                                stroke="#F0ECE4"
                              />
                              <XAxis
                                dataKey="date"
                                tickLine={false}
                                axisLine={false}
                                tick={{ fill: '#78716C', fontSize: 10 }}
                                tickFormatter={(val) => val.slice(5)}
                              />
                              <YAxis
                                tickLine={false}
                                axisLine={false}
                                tick={{ fill: '#78716C', fontSize: 10 }}
                              />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: '#FFFFFF',
                                  borderColor: '#E7E2DA',
                                  borderRadius: '8px',
                                  fontSize: '12px',
                                }}
                              />
                              <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                              <Area
                                type="monotone"
                                dataKey="presentCount"
                                name="Present"
                                stroke="#D97706"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#execPresent)"
                              />
                              <Area
                                type="monotone"
                                dataKey="leaveCount"
                                name="On Leave"
                                stroke="#3B82F6"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#execLeave)"
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-full flex items-center justify-center text-xs text-stone-400">
                            No daily attendance records in selected window
                          </div>
                        )}
                      </div>
                    </ChartCard>

                    {/* Department Distribution Bar Chart */}
                    <ChartCard
                      title="Department Headcount Distribution"
                      subtitle="Active employees allocated across business units"
                    >
                      <div className="w-full h-64">
                        {data.departmentBreakdown.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={data.departmentBreakdown}
                              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                            >
                              <CartesianGrid
                                strokeDasharray="3 3"
                                vertical={false}
                                stroke="#F0ECE4"
                              />
                              <XAxis
                                dataKey="departmentName"
                                tickLine={false}
                                axisLine={false}
                                tick={{ fill: '#78716C', fontSize: 10 }}
                              />
                              <YAxis
                                tickLine={false}
                                axisLine={false}
                                tick={{ fill: '#78716C', fontSize: 10 }}
                              />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: '#FFFFFF',
                                  borderColor: '#E7E2DA',
                                  borderRadius: '8px',
                                  fontSize: '12px',
                                }}
                              />
                              <Bar
                                dataKey="headcount"
                                name="Active Employees"
                                fill="#B45309"
                                radius={[4, 4, 0, 0]}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-full flex items-center justify-center text-xs text-stone-400">
                            No department distribution records available
                          </div>
                        )}
                      </div>
                    </ChartCard>
                  </div>
                ) : (
                  /* Accessible Tabular View */
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Attendance Summary Table */}
                    <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-3">
                      <h3 className="text-sm font-semibold text-stone-900">
                        Daily Attendance Log Summary (Accessible View)
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-stone-200 text-stone-500">
                              <th className="py-2">Date</th>
                              <th className="py-2">Present</th>
                              <th className="py-2">On Leave</th>
                              <th className="py-2">Absent</th>
                              <th className="py-2">Rate</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-100">
                            {data.attendanceTrend.slice(-10).map((row) => (
                              <tr key={row.date} className="hover:bg-stone-50">
                                <td className="py-1.5 font-medium text-stone-800">{row.date}</td>
                                <td className="py-1.5 text-stone-600">{row.presentCount}</td>
                                <td className="py-1.5 text-stone-600">{row.leaveCount}</td>
                                <td className="py-1.5 text-stone-600">{row.absentCount}</td>
                                <td className="py-1.5 font-semibold text-amber-700">
                                  {row.attendanceRate}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Department Distribution Table */}
                    <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-3">
                      <h3 className="text-sm font-semibold text-stone-900">
                        Department Headcount Breakdown (Accessible View)
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-stone-200 text-stone-500">
                              <th className="py-2">Department</th>
                              <th className="py-2">Headcount</th>
                              <th className="py-2">Share %</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-100">
                            {data.departmentBreakdown.map((row) => (
                              <tr key={row.departmentId} className="hover:bg-stone-50">
                                <td className="py-1.5 font-medium text-stone-800">
                                  {row.departmentName}
                                  {row.isSuppressed && (
                                    <span className="ml-2 text-[10px] text-stone-400 italic">
                                      (Suppressed &lt; 5)
                                    </span>
                                  )}
                                </td>
                                <td className="py-1.5 text-stone-600">{row.headcount}</td>
                                <td className="py-1.5 font-semibold text-amber-700">
                                  {row.percentage}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
