'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { KPICard, Button } from '@hrms/ui';
import { reportsApi, organizationApi } from '../../../lib/api-client';
import {
  FileText,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
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
  Hourglass,
  Layers,
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
} from 'recharts';

export function RequestAnalyticsTab() {
  const [subView, setSubView] = useState<'UTILIZATION' | 'VOLUMES' | 'TURNAROUND'>('UTILIZATION');
  const [viewMode, setViewMode] = useState<'CHARTS' | 'TABLES'>('CHARTS');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filter States
  const todayStr = new Date().toISOString().split('T')[0];
  const yearStartStr = `${new Date().getFullYear()}-01-01`;
  const [startDate, setStartDate] = useState<string>(yearStartStr);
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [departmentId, setDepartmentId] = useState<string>('ALL');
  const [branchId, setBranchId] = useState<string>('ALL');
  const [requestType, setRequestType] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Metadata Options
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);

  // Data States
  const [utilizationData, setUtilizationData] = useState<any | null>(null);
  const [volumesData, setVolumesData] = useState<any | null>(null);
  const [turnaroundData, setTurnaroundData] = useState<any | null>(null);

  // Load Metadata
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

  // Fetch Utilization
  const fetchUtilization = useCallback(async () => {
    try {
      const res = await reportsApi.getLeaveUtilization({
        startDate,
        endDate,
        departmentId: departmentId !== 'ALL' ? departmentId : undefined,
        branchId: branchId !== 'ALL' ? branchId : undefined,
      });
      setUtilizationData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load leave utilization report');
    }
  }, [startDate, endDate, departmentId, branchId]);

  // Fetch Volumes
  const fetchVolumes = useCallback(async () => {
    try {
      const res = await reportsApi.getRequestVolumes({
        startDate,
        endDate,
        requestType: requestType !== 'ALL' ? requestType : undefined,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        departmentId: departmentId !== 'ALL' ? departmentId : undefined,
        branchId: branchId !== 'ALL' ? branchId : undefined,
      });
      setVolumesData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load request volumes report');
    }
  }, [startDate, endDate, requestType, statusFilter, departmentId, branchId]);

  // Fetch Turnaround & Aging
  const fetchTurnaround = useCallback(async () => {
    try {
      const res = await reportsApi.getApprovalTurnaround({
        startDate,
        endDate,
        requestType: requestType !== 'ALL' ? requestType : undefined,
        departmentId: departmentId !== 'ALL' ? departmentId : undefined,
        branchId: branchId !== 'ALL' ? branchId : undefined,
      });
      setTurnaroundData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load approval turnaround report');
    }
  }, [startDate, endDate, requestType, departmentId, branchId]);

  // Unified Refresh
  const refreshAll = useCallback(
    async (isBg = false) => {
      if (!isBg) setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        if (subView === 'UTILIZATION') await fetchUtilization();
        else if (subView === 'VOLUMES') await fetchVolumes();
        else if (subView === 'TURNAROUND') await fetchTurnaround();
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [subView, fetchUtilization, fetchVolumes, fetchTurnaround],
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
            onClick={() => setSubView('UTILIZATION')}
            className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
              subView === 'UTILIZATION'
                ? 'bg-white text-stone-900 shadow-sm'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Briefcase className="h-4 w-4 text-amber-600" />
            Leave Utilization & Balances
          </button>
          <button
            onClick={() => setSubView('VOLUMES')}
            className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
              subView === 'VOLUMES'
                ? 'bg-white text-stone-900 shadow-sm'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Layers className="h-4 w-4 text-indigo-600" />
            Request Volumes & Outcomes
          </button>
          <button
            onClick={() => setSubView('TURNAROUND')}
            className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
              subView === 'TURNAROUND'
                ? 'bg-white text-stone-900 shadow-sm'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Hourglass className="h-4 w-4 text-emerald-600" />
            Aging & Turnaround Time
          </button>
        </div>

        {/* View Mode Toggle & Refresh */}
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

            {/* Request Type Filter */}
            {subView !== 'UTILIZATION' && (
              <div className="flex items-center gap-1.5">
                <span className="text-stone-500">Type:</span>
                <select
                  value={requestType}
                  onChange={(e) => setRequestType(e.target.value)}
                  className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs text-stone-800 shadow-sm focus:border-amber-500 focus:outline-none"
                >
                  <option value="ALL">All Requests</option>
                  <option value="LEAVE">Leave Requests</option>
                  <option value="WFH">WFH Applications</option>
                  <option value="OFFICIAL_VISIT">Official Visits</option>
                </select>
              </div>
            )}

            {/* Status Filter */}
            {subView === 'VOLUMES' && (
              <div className="flex items-center gap-1.5">
                <span className="text-stone-500">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs text-stone-800 shadow-sm focus:border-amber-500 focus:outline-none"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="SUBMITTED">Pending / Submitted</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
            )}

            {/* Department */}
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

            {/* Branch */}
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
          </div>

          {/* Scope Badge */}
          <div className="flex items-center gap-2">
            {utilizationData?.metadata?.scopeType === 'TEAM' ||
            volumesData?.metadata?.scopeType === 'TEAM' ||
            turnaroundData?.metadata?.scopeType === 'TEAM' ? (
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

      {/* Accounting & Governance Callout Banner */}
      <div className="rounded-xl border border-stone-200 bg-amber-50/50 p-4 text-xs text-stone-700 space-y-1.5">
        <div className="flex items-center gap-2 font-semibold text-amber-900">
          <Info className="h-4 w-4 text-amber-700" />
          Absence Accounting Rules & Turnaround Standards
        </div>
        <p className="text-stone-600 leading-relaxed">
          <strong>Chargeable Days vs Calendar Span:</strong> Chargeable days represent official
          balance deductions. Pending requests reserve balance without posted ledger deduction.
          Cancelled requests reverse reservations and are excluded from approved utilization.
        </p>
        <p className="text-stone-500 text-[11px]">
          <strong>Turnaround Integrity:</strong> Turnaround measures time from submission to final
          authoritative decision. Multi-stage approvals are counted once per completed workflow.
          Calendar time tracks total elapsed time; working-time reflects standard business operating
          hours.
        </p>
      </div>

      {/* Loading & Error States */}
      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-xl border border-stone-200 bg-white">
          <div className="flex flex-col items-center gap-2 text-stone-500 text-sm">
            <RefreshCw className="h-6 w-6 animate-spin text-amber-600" />
            <span>Calculating absence & approval analytics...</span>
          </div>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-red-600 mb-2" />
          <h3 className="text-sm font-semibold text-red-900">Analytics Error</h3>
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
          {/* SUBVIEW 1: LEAVE UTILIZATION & BALANCES                     */}
          {/* ============================================================ */}
          {subView === 'UTILIZATION' && utilizationData && (
            <div className="space-y-6">
              {/* Utilization KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                  title="Approved Chargeable Days"
                  value={`${utilizationData.utilizationSummary?.approvedChargeableDays} days`}
                  description={`${utilizationData.utilizationSummary?.calendarDays} calendar span days`}
                  icon={<CheckCircle2 className="h-5 w-5" />}
                  iconBg="bg-emerald-50 text-emerald-600"
                />
                <KPICard
                  title="Pending Reservations"
                  value={`${utilizationData.utilizationSummary?.pendingChargeableDays} days`}
                  description="Awaiting manager/HR approval"
                  icon={<Hourglass className="h-5 w-5" />}
                  iconBg="bg-amber-50 text-amber-600"
                />
                <KPICard
                  title="Total Closing Balances"
                  value={`${utilizationData.balanceSummary?.totalClosingBalance} days`}
                  description={`Across ${utilizationData.balanceSummary?.totalAccounts} balance accounts`}
                  icon={<Briefcase className="h-5 w-5" />}
                  iconBg="bg-indigo-50 text-indigo-600"
                />
                <KPICard
                  title="Cancelled / Replaced"
                  value={`${utilizationData.utilizationSummary?.cancelledChargeableDays} days`}
                  description="Reversed reservations"
                  icon={<XCircle className="h-5 w-5" />}
                  iconBg="bg-rose-50 text-rose-600"
                />
              </div>

              {/* Authoritative Balances Ledger Card */}
              <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-amber-600" />
                    <h3 className="text-sm font-semibold text-stone-900">
                      Authoritative Leave Balances by Category (Year{' '}
                      {utilizationData.period?.leaveYear})
                    </h3>
                  </div>
                  <span className="text-xs text-stone-500 font-mono">
                    {utilizationData.balanceSummary?.balancesByType?.length || 0} leave types
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {utilizationData.balanceSummary?.balancesByType?.map((b: any) => (
                    <div
                      key={b.leaveTypeId}
                      className="rounded-lg border border-stone-200 bg-stone-50/50 p-4 space-y-2.5"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-stone-900 text-xs">
                          {b.leaveTypeName}
                        </span>
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                          {b.closing} left
                        </span>
                      </div>
                      <div className="space-y-1 text-xs text-stone-600">
                        <div className="flex justify-between">
                          <span>Opening:</span>
                          <span className="font-mono text-stone-800">{b.opening}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Accrued:</span>
                          <span className="font-mono text-emerald-700">+{b.accrued}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Utilized (Deducted):</span>
                          <span className="font-mono text-rose-700">-{b.used}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Pending Reservation:</span>
                          <span className="font-mono text-amber-700">{b.pending}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Leave Type Breakdown */}
              <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-3">
                <h3 className="text-sm font-semibold text-stone-900">
                  Leave Utilization Breakdown by Policy Type
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-stone-200 text-stone-500">
                        <th className="py-2">Leave Type</th>
                        <th className="py-2">Code</th>
                        <th className="py-2">Total Requests</th>
                        <th className="py-2">Approved Days</th>
                        <th className="py-2">Calendar Span</th>
                        <th className="py-2">Working Days</th>
                        <th className="py-2">Pending Count</th>
                        <th className="py-2">Cancelled</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {utilizationData.byLeaveType?.map((t: any) => (
                        <tr key={t.leaveTypeId} className="hover:bg-stone-50">
                          <td className="py-2 font-medium text-stone-900">{t.leaveTypeName}</td>
                          <td className="py-2 font-mono text-stone-500">{t.code}</td>
                          <td className="py-2 text-stone-700">{t.requestCount}</td>
                          <td className="py-2 font-bold text-emerald-700">
                            {t.approvedChargeableDays}
                          </td>
                          <td className="py-2 text-stone-600">{t.calendarDays}</td>
                          <td className="py-2 text-stone-600">{t.workingDays}</td>
                          <td className="py-2 text-amber-600 font-medium">{t.pendingCount}</td>
                          <td className="py-2 text-rose-600">{t.cancelledCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* SUBVIEW 2: UNIFIED REQUEST VOLUMES & OUTCOMES                */}
          {/* ============================================================ */}
          {subView === 'VOLUMES' && volumesData && (
            <div className="space-y-6">
              {/* Overall Volumes KPI */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                  title="Total Workflow Requests"
                  value={volumesData.overallSummary?.totalRequests}
                  description={`${volumesData.overallSummary?.totalPending} awaiting review`}
                  icon={<FileText className="h-5 w-5" />}
                  iconBg="bg-indigo-50 text-indigo-600"
                />
                <KPICard
                  title="Approval Success Rate"
                  value={`${volumesData.overallSummary?.overallApprovalRate}%`}
                  change={{
                    value: `${volumesData.overallSummary?.totalApproved} approved`,
                    trend: 'up',
                    label: 'requests',
                  }}
                  icon={<CheckCircle2 className="h-5 w-5" />}
                  iconBg="bg-emerald-50 text-emerald-600"
                />
                <KPICard
                  title="Total Separations / Rejections"
                  value={volumesData.overallSummary?.totalRejected}
                  description="Denied applications"
                  icon={<XCircle className="h-5 w-5" />}
                  iconBg="bg-rose-50 text-rose-600"
                />
                <KPICard
                  title="Cancellation Rate"
                  value={`${Math.round((volumesData.overallSummary?.totalCancelled / (volumesData.overallSummary?.totalRequests || 1)) * 1000) / 10}%`}
                  description={`${volumesData.overallSummary?.totalCancelled} withdrawn requests`}
                  icon={<AlertTriangle className="h-5 w-5" />}
                  iconBg="bg-amber-50 text-amber-600"
                />
              </div>

              {/* Three Workflow Modalities Comparison */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* 1. Leave Requests */}
                <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-3">
                  <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                    <div className="flex items-center gap-2">
                      <Briefcase className="h-4 w-4 text-emerald-600" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-stone-900">
                        Leave Applications
                      </h4>
                    </div>
                    <span className="font-mono text-xs text-stone-500">
                      {volumesData.leaveMetrics?.total} total
                    </span>
                  </div>
                  <div className="space-y-2 text-xs text-stone-600">
                    <div className="flex justify-between">
                      <span>Approval Rate:</span>
                      <span className="font-semibold text-emerald-700">
                        {volumesData.leaveMetrics?.approvalRate}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Pending:</span>
                      <span className="font-semibold text-amber-700">
                        {volumesData.leaveMetrics?.submitted}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Approved Chargeable Days:</span>
                      <span className="font-semibold text-stone-800">
                        {volumesData.leaveMetrics?.totalChargeableDaysRequested} days
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2. WFH Applications */}
                <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-3">
                  <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                    <div className="flex items-center gap-2">
                      <Home className="h-4 w-4 text-blue-600" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-stone-900">
                        WFH Applications
                      </h4>
                    </div>
                    <span className="font-mono text-xs text-stone-500">
                      {volumesData.wfhMetrics?.total} total
                    </span>
                  </div>
                  <div className="space-y-2 text-xs text-stone-600">
                    <div className="flex justify-between">
                      <span>Approval Rate:</span>
                      <span className="font-semibold text-blue-700">
                        {volumesData.wfhMetrics?.approvalRate}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Pending:</span>
                      <span className="font-semibold text-amber-700">
                        {volumesData.wfhMetrics?.submitted}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Approved WFH Days:</span>
                      <span className="font-semibold text-stone-800">
                        {volumesData.wfhMetrics?.totalApprovedDays} days
                      </span>
                    </div>
                  </div>
                </div>

                {/* 3. Official Visits */}
                <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-3">
                  <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                    <div className="flex items-center gap-2">
                      <Compass className="h-4 w-4 text-purple-600" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-stone-900">
                        Official Visits
                      </h4>
                    </div>
                    <span className="font-mono text-xs text-stone-500">
                      {volumesData.officialVisitMetrics?.total} total
                    </span>
                  </div>
                  <div className="space-y-2 text-xs text-stone-600">
                    <div className="flex justify-between">
                      <span>Approval Rate:</span>
                      <span className="font-semibold text-purple-700">
                        {volumesData.officialVisitMetrics?.approvalRate}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total Duration Days:</span>
                      <span className="font-semibold text-stone-800">
                        {volumesData.officialVisitMetrics?.totalDurationDays} days
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Client Destinations:</span>
                      <span className="font-semibold text-stone-800">
                        {volumesData.officialVisitMetrics?.destinationsCount} verified
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* SUBVIEW 3: PENDING AGING & APPROVAL TURNAROUND               */}
          {/* ============================================================ */}
          {subView === 'TURNAROUND' && turnaroundData && (
            <div className="space-y-6">
              {/* Turnaround KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                  title="Avg Calendar Turnaround"
                  value={`${turnaroundData.turnaroundMetrics?.avgCalendarHours} hrs`}
                  description={`Median: ${turnaroundData.turnaroundMetrics?.medianCalendarHours} hrs • P90: ${turnaroundData.turnaroundMetrics?.p90CalendarHours} hrs`}
                  icon={<Clock className="h-5 w-5" />}
                  iconBg="bg-indigo-50 text-indigo-600"
                />
                <KPICard
                  title="Working-Time Turnaround"
                  value={`${turnaroundData.turnaroundMetrics?.avgWorkingHours} hrs`}
                  description="Standard 8-hour business days"
                  icon={<Briefcase className="h-5 w-5" />}
                  iconBg="bg-emerald-50 text-emerald-600"
                />
                <KPICard
                  title="Pending Requests Aging"
                  value={`${turnaroundData.pendingAging?.avgPendingAgingDays} days`}
                  description={`${turnaroundData.pendingAging?.totalPendingRequests} requests awaiting decision`}
                  icon={<Hourglass className="h-5 w-5" />}
                  iconBg="bg-amber-50 text-amber-600"
                />
                <KPICard
                  title="Fastest / Slowest"
                  value={`${turnaroundData.turnaroundMetrics?.fastestTurnaroundHours}h / ${turnaroundData.turnaroundMetrics?.slowestTurnaroundHours}h`}
                  description="Min to max decision window"
                  icon={<TrendingUp className="h-5 w-5" />}
                  iconBg="bg-rose-50 text-rose-600"
                />
              </div>

              {/* Pending Aging Brackets */}
              <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Hourglass className="h-4 w-4 text-amber-600" />
                    <h3 className="text-sm font-semibold text-stone-900">
                      Pending Request Aging Brackets
                    </h3>
                  </div>
                  <span className="text-xs text-stone-500 font-mono">
                    {turnaroundData.pendingAging?.totalPendingRequests} awaiting review
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 space-y-1">
                    <span className="text-xs font-semibold text-emerald-800">&lt; 24 Hours</span>
                    <p className="text-2xl font-bold text-emerald-900">
                      {turnaroundData.pendingAging?.brackets?.under24Hours}
                    </p>
                    <span className="text-[10px] text-emerald-700">Healthy / on-time</span>
                  </div>

                  <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 space-y-1">
                    <span className="text-xs font-semibold text-amber-800">1 – 3 Days</span>
                    <p className="text-2xl font-bold text-amber-900">
                      {turnaroundData.pendingAging?.brackets?.oneToThreeDays}
                    </p>
                    <span className="text-[10px] text-amber-700">Normal aging</span>
                  </div>

                  <div className="rounded-lg border border-orange-200 bg-orange-50/50 p-4 space-y-1">
                    <span className="text-xs font-semibold text-orange-800">4 – 7 Days</span>
                    <p className="text-2xl font-bold text-orange-900">
                      {turnaroundData.pendingAging?.brackets?.fourToSevenDays}
                    </p>
                    <span className="text-[10px] text-orange-700">Needs attention</span>
                  </div>

                  <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-4 space-y-1">
                    <span className="text-xs font-semibold text-rose-800">&gt; 7 Days</span>
                    <p className="text-2xl font-bold text-rose-900">
                      {turnaroundData.pendingAging?.brackets?.overSevenDays}
                    </p>
                    <span className="text-[10px] text-rose-700">Severely overdue</span>
                  </div>
                </div>
              </div>

              {/* Pending Queue Roster */}
              {turnaroundData.pendingAging?.pendingRoster?.length > 0 && (
                <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-stone-900">
                    Active Pending Queue Awaiting Decision
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-stone-200 text-stone-500">
                          <th className="py-2">Type</th>
                          <th className="py-2">Emp #</th>
                          <th className="py-2">Employee</th>
                          <th className="py-2">Department</th>
                          <th className="py-2">Submitted</th>
                          <th className="py-2">Age (Days)</th>
                          <th className="py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {turnaroundData.pendingAging.pendingRoster.map((item: any) => (
                          <tr key={item.id} className="hover:bg-stone-50">
                            <td className="py-2 font-semibold text-stone-800">
                              {item.requestType}
                            </td>
                            <td className="py-2 font-mono text-stone-500">{item.employeeCode}</td>
                            <td className="py-2 font-medium text-stone-900">{item.displayName}</td>
                            <td className="py-2 text-stone-600">{item.department}</td>
                            <td className="py-2 font-mono text-stone-500">
                              {item.submittedAt.substring(0, 10)}
                            </td>
                            <td className="py-2 font-mono text-stone-800">{item.ageDays} d</td>
                            <td className="py-2">
                              {item.isOverdue ? (
                                <span className="rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                                  Overdue (&gt;3d)
                                </span>
                              ) : (
                                <span className="rounded bg-stone-100 px-2 py-0.5 text-[10px] text-stone-700">
                                  In SLA
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
