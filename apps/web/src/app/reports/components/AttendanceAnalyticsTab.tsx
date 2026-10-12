'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { KPICard, Button } from '@hrms/ui';
import { reportsApi, organizationApi } from '../../../lib/api-client';
import {
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Building2,
  MapPin,
  RefreshCw,
  Table as TableIcon,
  BarChart3,
  Filter,
  Info,
  ShieldAlert,
  ShieldCheck,
  Briefcase,
  Home,
  Compass,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
} from 'recharts';

export function AttendanceAnalyticsTab() {
  const [subView, setSubView] = useState<'WEEKLY' | 'DAILY' | 'EXCEPTIONS'>('WEEKLY');
  const [viewMode, setViewMode] = useState<'CHARTS' | 'TABLES'>('CHARTS');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filter States
  const todayStr = new Date().toISOString().split('T')[0];
  const [startDate, setStartDate] = useState<string>(
    new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  );
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [departmentId, setDepartmentId] = useState<string>('ALL');
  const [branchId, setBranchId] = useState<string>('ALL');

  // Exceptions Specific Filters
  const [exceptionStatus, setExceptionStatus] = useState<string>('OPEN');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [exceptionTypeFilter, setExceptionTypeFilter] = useState<string>('ALL');
  const [exceptionsPage, setExceptionsPage] = useState<number>(1);
  const [dailyPage, setDailyPage] = useState<number>(1);
  const pageSize = 20;

  // Organization Metadata Options
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);

  // Data States
  const [weeklyData, setWeeklyData] = useState<any | null>(null);
  const [dailyData, setDailyData] = useState<any | null>(null);
  const [exceptionsData, setExceptionsData] = useState<any | null>(null);

  // Load Organization Filter Options
  useEffect(() => {
    async function loadOptions() {
      try {
        const [depts, brs] = await Promise.all([
          organizationApi.getDepartments().catch(() => []),
          organizationApi.getBranches().catch(() => []),
        ]);
        if (Array.isArray(depts)) setDepartments(depts);
        if (Array.isArray(brs)) setBranches(brs);
      } catch {
        // Fallback gracefully
      }
    }
    loadOptions();
  }, []);

  // Fetch Weekly Report
  const fetchWeekly = useCallback(async () => {
    try {
      const res = await reportsApi.getWeeklyAttendance({
        startDate,
        endDate,
        departmentId: departmentId !== 'ALL' ? departmentId : undefined,
        branchId: branchId !== 'ALL' ? branchId : undefined,
      });
      setWeeklyData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load weekly attendance report');
    }
  }, [startDate, endDate, departmentId, branchId]);

  // Fetch Daily Report
  const fetchDaily = useCallback(async () => {
    try {
      const res = await reportsApi.getDailyAttendance({
        startDate,
        endDate,
        departmentId: departmentId !== 'ALL' ? departmentId : undefined,
        branchId: branchId !== 'ALL' ? branchId : undefined,
        page: dailyPage,
        limit: pageSize,
      });
      setDailyData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load daily attendance report');
    }
  }, [startDate, endDate, departmentId, branchId, dailyPage]);

  // Fetch Exceptions Report
  const fetchExceptions = useCallback(async () => {
    try {
      const res = await reportsApi.getAttendanceExceptions({
        startDate,
        endDate,
        status: exceptionStatus !== 'ALL' ? exceptionStatus : undefined,
        severity: severityFilter !== 'ALL' ? severityFilter : undefined,
        exceptionType: exceptionTypeFilter !== 'ALL' ? exceptionTypeFilter : undefined,
        departmentId: departmentId !== 'ALL' ? departmentId : undefined,
        branchId: branchId !== 'ALL' ? branchId : undefined,
        page: exceptionsPage,
        limit: pageSize,
      });
      setExceptionsData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load attendance exceptions report');
    }
  }, [
    startDate,
    endDate,
    exceptionStatus,
    severityFilter,
    exceptionTypeFilter,
    departmentId,
    branchId,
    exceptionsPage,
  ]);

  // Unified Refresh
  const refreshAll = useCallback(
    async (isBg = false) => {
      if (!isBg) setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        if (subView === 'WEEKLY') await fetchWeekly();
        else if (subView === 'DAILY') await fetchDaily();
        else if (subView === 'EXCEPTIONS') await fetchExceptions();
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [subView, fetchWeekly, fetchDaily, fetchExceptions],
  );

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  return (
    <div className="space-y-6">
      {/* Sub-view Navigation & View Mode */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="inline-flex rounded-lg border border-stone-200 bg-stone-100 p-1">
          <button
            onClick={() => setSubView('WEEKLY')}
            className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
              subView === 'WEEKLY'
                ? 'bg-white text-stone-900 shadow-sm'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Calendar className="h-4 w-4 text-amber-600" />
            Weekly Attendance & Shifts
          </button>
          <button
            onClick={() => setSubView('DAILY')}
            className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
              subView === 'DAILY'
                ? 'bg-white text-stone-900 shadow-sm'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Clock className="h-4 w-4 text-indigo-600" />
            Daily Log & Modes
          </button>
          <button
            onClick={() => setSubView('EXCEPTIONS')}
            className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
              subView === 'EXCEPTIONS'
                ? 'bg-white text-stone-900 shadow-sm'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <AlertTriangle className="h-4 w-4 text-rose-600" />
            Exception Reports
          </button>
        </div>

        {/* View Mode & Refresh */}
        <div className="flex items-center gap-2">
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
              Visual
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
            onClick={() => refreshAll(true)}
            disabled={loading || refreshing}
            leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-4">
        <div className="flex flex-col sm:flex-row flex-wrap items-center justify-between gap-3 text-xs text-stone-600">
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <span className="font-semibold text-stone-700 flex items-center gap-1">
              <Filter className="h-3.5 w-3.5 text-stone-500" /> Filters:
            </span>

            {/* Date Range */}
            <div className="flex items-center gap-1.5">
              <span className="text-stone-500">Period:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs text-stone-800 shadow-sm"
              />
              <span className="text-stone-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs text-stone-800 shadow-sm"
              />
            </div>

            {/* Department Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-stone-500">Dept:</span>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs text-stone-800 shadow-sm focus:border-amber-500 focus:outline-none"
              >
                <option value="ALL">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Branch Filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-stone-500">Branch:</span>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs text-stone-800 shadow-sm focus:border-amber-500 focus:outline-none"
              >
                <option value="ALL">All Branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Exceptions Status Filter */}
            {subView === 'EXCEPTIONS' && (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="text-stone-500">Status:</span>
                  <select
                    value={exceptionStatus}
                    onChange={(e) => setExceptionStatus(e.target.value)}
                    className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs text-stone-800 shadow-sm focus:border-amber-500 focus:outline-none"
                  >
                    <option value="OPEN">Open Only</option>
                    <option value="RESOLVED">Resolved Only</option>
                    <option value="DISMISSED">Dismissed</option>
                    <option value="ALL">All Statuses</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-stone-500">Severity:</span>
                  <select
                    value={severityFilter}
                    onChange={(e) => setSeverityFilter(e.target.value)}
                    className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs text-stone-800 shadow-sm"
                  >
                    <option value="ALL">All Severities</option>
                    <option value="HIGH">High Severity</option>
                    <option value="MEDIUM">Medium Severity</option>
                    <option value="LOW">Low Severity</option>
                  </select>
                </div>
              </>
            )}
          </div>

          {/* Scope Badge */}
          <div className="flex items-center gap-2">
            {weeklyData?.metadata?.scopeType === 'TEAM' ||
            dailyData?.metadata?.scopeType === 'TEAM' ||
            exceptionsData?.metadata?.scopeType === 'TEAM' ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                <ShieldCheck className="h-3 w-3" /> Manager Scope Active
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-stone-200 px-2.5 py-0.5 text-[11px] font-semibold text-stone-700">
                <Building2 className="h-3 w-3" /> Organization Scope
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Governance & Policy Notice */}
      <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-4 text-xs text-stone-700 space-y-1.5">
        <div className="flex items-center gap-2 font-semibold text-stone-900">
          <Info className="h-4 w-4 text-amber-600" />
          Attendance Rate Calculation & Data Integrity Standard
        </div>
        <p className="text-stone-600 leading-relaxed">
          <strong>Approved Denominator Rule:</strong> Attendance rate uses scheduled working days (
          <code className="text-stone-800 font-mono">
            Present + Late + Half-Day + Absent + On-Leave + Incomplete
          </code>
          ). Non-working days (<code className="text-stone-800 font-mono">Week-Off</code> and{' '}
          <code className="text-stone-800 font-mono">Holiday</code>) are strictly excluded from the
          denominator. Half-days are credited as 0.5 equivalent.
        </p>
        <p className="text-stone-500 text-[11px]">
          <strong>Exception Segregation:</strong> Incomplete records represent unclosed attendance
          sessions and are segregated from confirmed policy exceptions (late-arrival, outside
          geofence, missing checkout).
        </p>
      </div>

      {/* Loading & Error States */}
      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-xl border border-stone-200 bg-white">
          <div className="flex flex-col items-center gap-2 text-stone-500 text-sm">
            <RefreshCw className="h-6 w-6 animate-spin text-amber-600" />
            <span>Calculating attendance analytics...</span>
          </div>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-red-600 mb-2" />
          <h3 className="text-sm font-semibold text-red-900">Reporting Error</h3>
          <p className="text-xs text-red-700 mt-1">{error}</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-4 border-red-300 text-red-800 hover:bg-red-100"
            onClick={() => refreshAll()}
          >
            Try Again
          </Button>
        </div>
      ) : (
        <>
          {/* ============================================================ */}
          {/* SUBVIEW 1: WEEKLY ATTENDANCE & SHIFTS                       */}
          {/* ============================================================ */}
          {subView === 'WEEKLY' && weeklyData && (
            <div className="space-y-6">
              {/* Weekly KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                  title="Weekly Attendance Rate"
                  value={`${weeklyData.summary?.weeklyAttendanceRate}%`}
                  change={{
                    value: `${weeklyData.summary?.totalScheduledDays} scheduled`,
                    trend: weeklyData.summary?.weeklyAttendanceRate >= 90 ? 'up' : 'down',
                    label: 'working days',
                  }}
                  icon={<Calendar className="h-5 w-5" />}
                  iconBg="bg-amber-50 text-amber-600"
                />
                <KPICard
                  title="On-Time Arrival Rate"
                  value={`${weeklyData.summary?.onTimeRate}%`}
                  description={`${weeklyData.summary?.totalLateCount} late arrivals flagged`}
                  icon={<Clock className="h-5 w-5" />}
                  iconBg="bg-emerald-50 text-emerald-600"
                />
                <KPICard
                  title="Total Working Hours"
                  value={`${weeklyData.summary?.totalWorkHours} hrs`}
                  description={`+${weeklyData.summary?.totalOvertimeHours} hrs overtime`}
                  icon={<TrendingUp className="h-5 w-5" />}
                  iconBg="bg-indigo-50 text-indigo-600"
                />
                <KPICard
                  title="Approved Leaves / Offs"
                  value={weeklyData.summary?.totalLeaveDays}
                  description={`${weeklyData.summary?.totalWeekOffDays} weekly offs observed`}
                  icon={<Briefcase className="h-5 w-5" />}
                  iconBg="bg-rose-50 text-rose-600"
                />
              </div>

              {viewMode === 'CHARTS' ? (
                <>
                  {/* Day-of-Week Chart */}
                  <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-amber-600" />
                        <h3 className="text-sm font-semibold text-stone-900">
                          Day-of-Week Attendance Distribution (7-Day Matrix)
                        </h3>
                      </div>
                      <span className="text-xs text-stone-500 font-mono">
                        {weeklyData.period?.startDate} to {weeklyData.period?.endDate}
                      </span>
                    </div>

                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={weeklyData.byDayOfWeek}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                          <XAxis dataKey="dayName" fontSize={11} stroke="#78716c" />
                          <YAxis fontSize={11} stroke="#78716c" />
                          <Tooltip />
                          <Legend />
                          <Bar
                            dataKey="present"
                            name="Present (On-Time)"
                            fill="#059669"
                            stackId="a"
                          />
                          <Bar dataKey="late" name="Late Arrival" fill="#d97706" stackId="a" />
                          <Bar dataKey="halfDay" name="Half Day" fill="#ca8a04" stackId="a" />
                          <Bar dataKey="absent" name="Absent" fill="#dc2626" stackId="a" />
                          <Bar dataKey="onLeave" name="On Leave" fill="#6366f1" stackId="a" />
                          <Bar dataKey="weekOff" name="Week Off" fill="#d6d3d1" stackId="a" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Shift Breakdown */}
                  {weeklyData.byShift?.length > 0 && (
                    <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-4">
                      <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-indigo-600" />
                          <h3 className="text-sm font-semibold text-stone-900">
                            Performance by Shift Configuration
                          </h3>
                        </div>
                        <span className="text-xs text-stone-500">
                          {weeklyData.byShift.length} shifts active
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {weeklyData.byShift.map((s: any) => (
                          <div
                            key={s.shiftId}
                            className="rounded-lg border border-stone-200 bg-stone-50/50 p-4 space-y-2"
                          >
                            <div className="flex justify-between items-center">
                              <span className="font-semibold text-stone-900 text-xs">
                                {s.shiftName}
                              </span>
                              <span className="rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-mono text-indigo-800">
                                {s.shiftCode}
                              </span>
                            </div>
                            <p className="text-[11px] text-stone-500 font-mono">{s.timings}</p>
                            <div className="pt-2 border-t border-stone-200 flex justify-between text-xs">
                              <span className="text-stone-600">Rate:</span>
                              <span className="font-bold text-amber-700">{s.attendanceRate}%</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-stone-600">Work Hours:</span>
                              <span className="font-medium text-stone-800">
                                {s.totalWorkHours} hrs
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                /* Accessible Tables View */
                <div className="space-y-6">
                  {/* Day of Week Table */}
                  <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-3">
                    <h3 className="text-sm font-semibold text-stone-900">
                      Day-of-Week Summary (Accessible View)
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-stone-200 text-stone-500">
                            <th className="py-2">Date</th>
                            <th className="py-2">Day</th>
                            <th className="py-2">Present</th>
                            <th className="py-2">Late</th>
                            <th className="py-2">Half-Day</th>
                            <th className="py-2">Absent</th>
                            <th className="py-2">Leave</th>
                            <th className="py-2">Week-Off</th>
                            <th className="py-2">Hours</th>
                            <th className="py-2">Rate</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                          {weeklyData.byDayOfWeek?.map((d: any) => (
                            <tr key={d.date} className="hover:bg-stone-50">
                              <td className="py-2 font-mono text-stone-800">{d.date}</td>
                              <td className="py-2 font-medium text-stone-900">{d.dayName}</td>
                              <td className="py-2 text-emerald-600 font-medium">{d.present}</td>
                              <td className="py-2 text-amber-600">{d.late}</td>
                              <td className="py-2 text-yellow-600">{d.halfDay}</td>
                              <td className="py-2 text-rose-600 font-medium">{d.absent}</td>
                              <td className="py-2 text-indigo-600">{d.onLeave}</td>
                              <td className="py-2 text-stone-400">{d.weekOff}</td>
                              <td className="py-2 text-stone-700">{d.totalWorkHours} hrs</td>
                              <td className="py-2 font-semibold text-amber-700">
                                {d.attendanceRate}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Shift Table */}
                  <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-3">
                    <h3 className="text-sm font-semibold text-stone-900">
                      Shift Performance (Accessible View)
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-stone-200 text-stone-500">
                            <th className="py-2">Shift Code</th>
                            <th className="py-2">Name</th>
                            <th className="py-2">Timings</th>
                            <th className="py-2">Scheduled</th>
                            <th className="py-2">Present</th>
                            <th className="py-2">Late</th>
                            <th className="py-2">Work Hours</th>
                            <th className="py-2">Rate</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                          {weeklyData.byShift?.map((s: any) => (
                            <tr key={s.shiftId} className="hover:bg-stone-50">
                              <td className="py-2 font-mono font-medium text-indigo-700">
                                {s.shiftCode}
                              </td>
                              <td className="py-2 text-stone-900">{s.shiftName}</td>
                              <td className="py-2 font-mono text-stone-500">{s.timings}</td>
                              <td className="py-2 text-stone-700">{s.scheduled}</td>
                              <td className="py-2 text-emerald-600 font-medium">{s.present}</td>
                              <td className="py-2 text-amber-600">{s.late}</td>
                              <td className="py-2 text-stone-700">{s.totalWorkHours} hrs</td>
                              <td className="py-2 font-semibold text-amber-700">
                                {s.attendanceRate}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* SUBVIEW 2: DAILY ATTENDANCE & WORK MODES                     */}
          {/* ============================================================ */}
          {subView === 'DAILY' && dailyData && (
            <div className="space-y-6">
              {/* Daily KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                  title="Present & Attended"
                  value={dailyData.summary?.headcount?.present + dailyData.summary?.headcount?.late}
                  change={{
                    value: `${dailyData.summary?.workingHours?.attendanceRate}%`,
                    trend: 'up',
                    label: 'rate',
                  }}
                  icon={<CheckCircle2 className="h-5 w-5" />}
                  iconBg="bg-emerald-50 text-emerald-600"
                />
                <KPICard
                  title="Late Arrivals"
                  value={dailyData.summary?.headcount?.late}
                  description={`Avg late: ${dailyData.summary?.workingHours?.avgLateMinutes} mins`}
                  icon={<Clock className="h-5 w-5" />}
                  iconBg="bg-amber-50 text-amber-600"
                />
                <KPICard
                  title="Approved Leaves"
                  value={dailyData.summary?.headcount?.onLeave}
                  description={`${dailyData.summary?.headcount?.absent} unapproved absences`}
                  icon={<Briefcase className="h-5 w-5" />}
                  iconBg="bg-indigo-50 text-indigo-600"
                />
                <KPICard
                  title="Work Modes Breakdown"
                  value={`${dailyData.summary?.byMode?.office} Office`}
                  description={`${dailyData.summary?.byMode?.workFromHome} WFH • ${dailyData.summary?.byMode?.officialVisit} Visit`}
                  icon={<Home className="h-5 w-5" />}
                  iconBg="bg-blue-50 text-blue-600"
                />
              </div>

              {/* Daily Records Roster */}
              <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-indigo-600" />
                    <h3 className="text-sm font-semibold text-stone-900">
                      Daily Attendance Roster ({dailyData.pagination?.total || 0} Records)
                    </h3>
                  </div>
                  <span className="text-xs text-stone-500 font-mono">
                    Page {dailyData.pagination?.page} of {dailyData.pagination?.totalPages}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-stone-200 text-stone-500">
                        <th className="py-2">Date</th>
                        <th className="py-2">Emp #</th>
                        <th className="py-2">Name</th>
                        <th className="py-2">Dept</th>
                        <th className="py-2">Shift</th>
                        <th className="py-2">Check In</th>
                        <th className="py-2">Check Out</th>
                        <th className="py-2">Hours</th>
                        <th className="py-2">Mode</th>
                        <th className="py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {dailyData.records?.map((r: any) => (
                        <tr key={r.id} className="hover:bg-stone-50">
                          <td className="py-2 font-mono text-stone-600">{r.date}</td>
                          <td className="py-2 font-mono text-stone-500">
                            {r.employee?.employeeCode}
                          </td>
                          <td className="py-2 font-medium text-stone-900">
                            {r.employee?.displayName}
                          </td>
                          <td className="py-2 text-stone-600">{r.employee?.department}</td>
                          <td className="py-2 text-stone-500">{r.shift?.code || '—'}</td>
                          <td className="py-2 font-mono text-stone-700">
                            {r.firstCheckIn ? r.firstCheckIn.substring(11, 16) : '—'}
                          </td>
                          <td className="py-2 font-mono text-stone-700">
                            {r.lastCheckOut ? r.lastCheckOut.substring(11, 16) : '—'}
                          </td>
                          <td className="py-2 font-medium text-stone-800">
                            {r.workHoursFormatted}
                          </td>
                          <td className="py-2">
                            {r.attendanceMode === 'WFH' ? (
                              <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                                <Home className="h-3 w-3" /> WFH
                              </span>
                            ) : r.attendanceMode === 'OFFICIAL_VISIT' ? (
                              <span className="inline-flex items-center gap-1 rounded bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                                <Compass className="h-3 w-3" /> Visit
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded bg-stone-100 px-2 py-0.5 text-[10px] text-stone-700">
                                Office
                              </span>
                            )}
                          </td>
                          <td className="py-2">
                            <span
                              className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                                r.status === 'PRESENT'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : r.status === 'LATE'
                                    ? 'bg-amber-50 text-amber-700'
                                    : r.status === 'ON_LEAVE'
                                      ? 'bg-indigo-50 text-indigo-700'
                                      : r.status === 'ABSENT'
                                        ? 'bg-rose-50 text-rose-700'
                                        : 'bg-stone-100 text-stone-600'
                              }`}
                            >
                              {r.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {(dailyData.pagination?.totalPages || 0) > 1 && (
                  <div className="flex items-center justify-between border-t border-stone-100 pt-3 text-xs">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={dailyPage <= 1}
                      onClick={() => setDailyPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <span className="text-stone-500">
                      Page {dailyPage} of {dailyData.pagination.totalPages}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={dailyPage >= dailyData.pagination.totalPages}
                      onClick={() => setDailyPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* SUBVIEW 3: ATTENDANCE EXCEPTION REPORTS                      */}
          {/* ============================================================ */}
          {subView === 'EXCEPTIONS' && exceptionsData && (
            <div className="space-y-6">
              {/* Exceptions KPI Overview */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                  title="Total Exceptions Flagged"
                  value={exceptionsData.summary?.totalExceptions}
                  description={`${exceptionsData.summary?.highSeverityCount} high severity cases`}
                  icon={<AlertTriangle className="h-5 w-5" />}
                  iconBg="bg-rose-50 text-rose-600"
                />
                <KPICard
                  title="Open Action Items"
                  value={exceptionsData.summary?.openExceptions}
                  change={{
                    value: `${exceptionsData.summary?.openExceptions}`,
                    trend: exceptionsData.summary?.openExceptions > 0 ? 'down' : 'neutral',
                    label: 'pending review',
                  }}
                  icon={<Clock className="h-5 w-5" />}
                  iconBg="bg-amber-50 text-amber-600"
                />
                <KPICard
                  title="Resolved & Regularized"
                  value={exceptionsData.summary?.resolvedExceptions}
                  description={`${exceptionsData.summary?.dismissedExceptions} dismissed`}
                  icon={<CheckCircle2 className="h-5 w-5" />}
                  iconBg="bg-emerald-50 text-emerald-600"
                />
                <KPICard
                  title="Unfinalized Sessions"
                  value={exceptionsData.summary?.unfinalizedIncompleteSessionsCount}
                  description="Incomplete daily records"
                  icon={<Info className="h-5 w-5" />}
                  iconBg="bg-stone-50 text-stone-600"
                />
              </div>

              {/* Exception Types Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* By Type */}
                <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                    Exceptions by Category
                  </h4>
                  <div className="space-y-2.5">
                    {exceptionsData.breakdowns?.byType?.map((t: any) => (
                      <div key={t.type} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-medium text-stone-800">
                            {t.type.replace(/_/g, ' ')}
                          </span>
                          <span className="font-semibold text-rose-700">
                            {t.count} ({t.percentage}%)
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-stone-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-rose-600 rounded-full"
                            style={{ width: `${t.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* By Severity */}
                <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                    Severity Distribution
                  </h4>
                  <div className="space-y-2.5">
                    {exceptionsData.breakdowns?.bySeverity?.map((s: any) => (
                      <div key={s.severity} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-medium text-stone-800">{s.severity} Severity</span>
                          <span className="font-semibold text-stone-700">
                            {s.count} ({s.percentage}%)
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-stone-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              s.severity === 'HIGH'
                                ? 'bg-red-600'
                                : s.severity === 'MEDIUM'
                                  ? 'bg-amber-500'
                                  : 'bg-stone-400'
                            }`}
                            style={{ width: `${s.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Exceptions Table */}
              <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-3">
                <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-rose-600" />
                    <h3 className="text-sm font-semibold text-stone-900">
                      Attendance Exceptions Roster ({exceptionsData.pagination?.total || 0} Records)
                    </h3>
                  </div>
                  <span className="text-xs text-stone-500 font-mono">
                    Page {exceptionsData.pagination?.page} of{' '}
                    {exceptionsData.pagination?.totalPages}
                  </span>
                </div>

                <div className="overflow-x-auto min-h-[220px]">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-stone-200 text-stone-500">
                        <th className="py-2">Date</th>
                        <th className="py-2">Emp #</th>
                        <th className="py-2">Employee</th>
                        <th className="py-2">Department</th>
                        <th className="py-2">Exception Type</th>
                        <th className="py-2">Severity</th>
                        <th className="py-2">Status</th>
                        <th className="py-2">Resolution Note</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {exceptionsData.items?.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-stone-400">
                            No exceptions recorded in this period.
                          </td>
                        </tr>
                      ) : (
                        exceptionsData.items?.map((item: any) => (
                          <tr key={item.id} className="hover:bg-stone-50">
                            <td className="py-2 font-mono text-stone-600">{item.date}</td>
                            <td className="py-2 font-mono text-stone-500">
                              {item.employee?.employeeCode}
                            </td>
                            <td className="py-2 font-medium text-stone-900">
                              {item.employee?.displayName}
                            </td>
                            <td className="py-2 text-stone-600">{item.employee?.department}</td>
                            <td className="py-2">
                              <span className="font-semibold text-stone-800">
                                {item.exceptionType.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="py-2">
                              <span
                                className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                                  item.severity === 'HIGH'
                                    ? 'bg-rose-100 text-rose-800'
                                    : item.severity === 'MEDIUM'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-stone-100 text-stone-700'
                                }`}
                              >
                                {item.severity}
                              </span>
                            </td>
                            <td className="py-2">
                              <span
                                className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                                  item.status === 'OPEN'
                                    ? 'bg-amber-50 text-amber-700'
                                    : item.status === 'RESOLVED'
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : 'bg-stone-100 text-stone-600'
                                }`}
                              >
                                {item.status}
                              </span>
                            </td>
                            <td className="py-2 text-stone-500 max-w-[200px] truncate">
                              {item.resolutionNotes || '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {(exceptionsData.pagination?.totalPages || 0) > 1 && (
                  <div className="flex items-center justify-between border-t border-stone-100 pt-3 text-xs">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={exceptionsPage <= 1}
                      onClick={() => setExceptionsPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <span className="text-stone-500">
                      Page {exceptionsPage} of {exceptionsData.pagination.totalPages}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={exceptionsPage >= exceptionsData.pagination.totalPages}
                      onClick={() => setExceptionsPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
