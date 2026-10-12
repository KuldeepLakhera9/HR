'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ChartCard, KPICard, Button } from '@hrms/ui';
import { reportsApi, organizationApi } from '../../../lib/api-client';
import {
  Users,
  UserPlus,
  UserMinus,
  TrendingUp,
  Building2,
  MapPin,
  Briefcase,
  Layers,
  Calendar,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Table as TableIcon,
  BarChart3,
  ArrowRight,
  Filter,
  Info,
  Clock,
  CheckCircle2,
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

export function WorkforceAnalyticsTab() {
  const [subView, setSubView] = useState<'HEADCOUNT' | 'MOVEMENT' | 'TRENDS'>('HEADCOUNT');
  const [viewMode, setViewMode] = useState<'CHARTS' | 'TABLES'>('CHARTS');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filter States
  const todayStr = new Date().toISOString().split('T')[0];
  const [asOfDate, setAsOfDate] = useState<string>(todayStr);
  const [startDate, setStartDate] = useState<string>(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  );
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [trendMonths, setTrendMonths] = useState<number>(6);
  const [departmentId, setDepartmentId] = useState<string>('ALL');
  const [branchId, setBranchId] = useState<string>('ALL');
  const [designationId, setDesignationId] = useState<string>('ALL');
  const [employmentType, setEmploymentType] = useState<string>('ALL');

  // Pagination for movements
  const [joinersPage, setJoinersPage] = useState<number>(1);
  const [exitsPage, setExitsPage] = useState<number>(1);
  const pageSize = 10;

  // Options
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [designations, setDesignations] = useState<Array<{ id: string; title: string }>>([]);

  // Data States
  const [headcountData, setHeadcountData] = useState<any | null>(null);
  const [movementData, setMovementData] = useState<any | null>(null);
  const [trendsData, setTrendsData] = useState<any | null>(null);

  // Load organization filter options
  useEffect(() => {
    async function loadOptions() {
      try {
        const [depts, brs, desigs] = await Promise.all([
          organizationApi.getDepartments().catch(() => []),
          organizationApi.getBranches().catch(() => []),
          organizationApi.getDesignations().catch(() => []),
        ]);
        if (Array.isArray(depts)) setDepartments(depts);
        if (Array.isArray(brs)) setBranches(brs);
        if (Array.isArray(desigs)) setDesignations(desigs);
      } catch {
        // Silently handle
      }
    }
    loadOptions();
  }, []);

  // Fetch Headcount Data
  const fetchHeadcount = useCallback(async () => {
    try {
      const res = await reportsApi.getWorkforceHeadcount({
        asOfDate,
        departmentId: departmentId !== 'ALL' ? departmentId : undefined,
        branchId: branchId !== 'ALL' ? branchId : undefined,
        designationId: designationId !== 'ALL' ? designationId : undefined,
        employmentType: employmentType !== 'ALL' ? employmentType : undefined,
      });
      setHeadcountData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load headcount report');
    }
  }, [asOfDate, departmentId, branchId, designationId, employmentType]);

  // Fetch Movement Data
  const fetchMovement = useCallback(async () => {
    try {
      const res = await reportsApi.getWorkforceMovement({
        startDate,
        endDate,
        departmentId: departmentId !== 'ALL' ? departmentId : undefined,
        branchId: branchId !== 'ALL' ? branchId : undefined,
        page: joinersPage,
        limit: pageSize,
      });
      setMovementData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load workforce movement report');
    }
  }, [startDate, endDate, departmentId, branchId, joinersPage]);

  // Fetch Trends Data
  const fetchTrends = useCallback(async () => {
    try {
      const res = await reportsApi.getWorkforceTrends({
        months: trendMonths,
        departmentId: departmentId !== 'ALL' ? departmentId : undefined,
        branchId: branchId !== 'ALL' ? branchId : undefined,
      });
      setTrendsData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load workforce trends report');
    }
  }, [trendMonths, departmentId, branchId]);

  // Unified Refresh
  const refreshAll = useCallback(
    async (isBg = false) => {
      if (!isBg) setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        if (subView === 'HEADCOUNT') await fetchHeadcount();
        else if (subView === 'MOVEMENT') await fetchMovement();
        else if (subView === 'TRENDS') await fetchTrends();
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [subView, fetchHeadcount, fetchMovement, fetchTrends],
  );

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  return (
    <div className="space-y-6">
      {/* Sub-view Navigation & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Navigation Tabs */}
        <div className="inline-flex rounded-lg border border-stone-200 bg-stone-100 p-1">
          <button
            onClick={() => setSubView('HEADCOUNT')}
            className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
              subView === 'HEADCOUNT'
                ? 'bg-white text-stone-900 shadow-sm'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Users className="h-4 w-4 text-amber-600" />
            Headcount Distributions
          </button>
          <button
            onClick={() => setSubView('MOVEMENT')}
            className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
              subView === 'MOVEMENT'
                ? 'bg-white text-stone-900 shadow-sm'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <TrendingUp className="h-4 w-4 text-indigo-600" />
            Joiners & Exits Movement
          </button>
          <button
            onClick={() => setSubView('TRENDS')}
            className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
              subView === 'TRENDS'
                ? 'bg-white text-stone-900 shadow-sm'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Clock className="h-4 w-4 text-emerald-600" />
            Historical Trends
          </button>
        </div>

        {/* View mode & Refresh */}
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

            {/* As of Date for Headcount */}
            {subView === 'HEADCOUNT' && (
              <div className="flex items-center gap-1.5">
                <span className="text-stone-500">As Of Date:</span>
                <input
                  type="date"
                  value={asOfDate}
                  onChange={(e) => setAsOfDate(e.target.value)}
                  className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs text-stone-800 shadow-sm focus:border-amber-500 focus:outline-none"
                />
              </div>
            )}

            {/* Movement Range */}
            {subView === 'MOVEMENT' && (
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
            )}

            {/* Trends Months */}
            {subView === 'TRENDS' && (
              <div className="flex items-center gap-1.5">
                <span className="text-stone-500">Duration:</span>
                <select
                  value={trendMonths}
                  onChange={(e) => setTrendMonths(Number(e.target.value))}
                  className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs text-stone-800 shadow-sm"
                >
                  <option value={3}>Last 3 Months</option>
                  <option value={6}>Last 6 Months</option>
                  <option value={12}>Last 12 Months</option>
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

            {/* Employment Type for Headcount */}
            {subView === 'HEADCOUNT' && (
              <div className="flex items-center gap-1.5">
                <span className="text-stone-500">Type:</span>
                <select
                  value={employmentType}
                  onChange={(e) => setEmploymentType(e.target.value)}
                  className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs text-stone-800 shadow-sm focus:border-amber-500 focus:outline-none"
                >
                  <option value="ALL">All Employment Types</option>
                  <option value="FULL_TIME">Full Time</option>
                  <option value="PART_TIME">Part Time</option>
                  <option value="CONTRACT">Contract</option>
                  <option value="INTERN">Intern</option>
                  <option value="PROBATION">Probation</option>
                </select>
              </div>
            )}
          </div>

          {/* Scope Badge */}
          <div className="flex items-center gap-2">
            {headcountData?.metadata?.scopeType === 'TEAM' ||
            movementData?.metadata?.scopeType === 'TEAM' ? (
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

      {/* Historical Limitations & Governance Banner */}
      <div className="rounded-xl border border-stone-200 bg-amber-50/50 p-4 text-xs text-stone-700 space-y-2">
        <div className="flex items-center gap-2 font-semibold text-amber-900">
          <Info className="h-4 w-4 text-amber-700" />
          Employment Status & Historical Reporting Governance Policy
        </div>
        <p className="text-stone-600 leading-relaxed">
          <strong>Point-in-Time Rules:</strong> Active headcount reflects employees whose joining
          date precedes or matches the reference date, with status in{' '}
          <code className="text-amber-800 font-mono">ACTIVE</code>,{' '}
          <code className="text-amber-800 font-mono">PROBATION</code>, or{' '}
          <code className="text-amber-800 font-mono">ON_NOTICE</code>, and where exit date is absent
          or strictly after the reference date. Future joiners are excluded until arrival; future
          exits on notice remain counted until finalized separation.
        </p>
        <p className="text-stone-500 text-[11px]">
          <strong>Audit Disclosure:</strong> Historical assignments are tracked via verified
          discrete event logs (<code className="font-mono">EmployeeHistory</code>). Retrospective
          snapshots reflect documented event milestones rather than synthetic interpolation. Small
          cohorts (&lt; 5) are masked for manager views in compliance with workforce privacy
          policies.
        </p>
      </div>

      {/* Loading & Error States */}
      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-xl border border-stone-200 bg-white">
          <div className="flex flex-col items-center gap-2 text-stone-500 text-sm">
            <RefreshCw className="h-6 w-6 animate-spin text-amber-600" />
            <span>Calculating workforce analytics...</span>
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
          {/* SUBVIEW 1: HEADCOUNT DISTRIBUTIONS                          */}
          {/* ============================================================ */}
          {subView === 'HEADCOUNT' && headcountData && (
            <div className="space-y-6">
              {/* KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                  title="Total Active Headcount"
                  value={headcountData.totalActiveHeadcount}
                  description={`As of ${headcountData.asOfDate}`}
                  icon={<Users className="h-5 w-5" />}
                  iconBg="bg-amber-50 text-amber-600"
                />
                <KPICard
                  title="Departments Represented"
                  value={headcountData.byDepartment?.length || 0}
                  description="Configured units"
                  icon={<Building2 className="h-5 w-5" />}
                  iconBg="bg-indigo-50 text-indigo-600"
                />
                <KPICard
                  title="Branches / Locations"
                  value={headcountData.byBranch?.length || 0}
                  description="Operating branches"
                  icon={<MapPin className="h-5 w-5" />}
                  iconBg="bg-emerald-50 text-emerald-600"
                />
                <KPICard
                  title="Designations"
                  value={headcountData.byDesignation?.length || 0}
                  description="Approved roles"
                  icon={<Briefcase className="h-5 w-5" />}
                  iconBg="bg-rose-50 text-rose-600"
                />
              </div>

              {viewMode === 'CHARTS' ? (
                <>
                  {/* Department & Branch Distributions */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Department Distribution */}
                    <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-4">
                      <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-amber-600" />
                          <h3 className="text-sm font-semibold text-stone-900">
                            Headcount by Department
                          </h3>
                        </div>
                        <span className="text-xs text-stone-500 font-mono">
                          {headcountData.byDepartment?.length} depts
                        </span>
                      </div>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={headcountData.byDepartment} layout="vertical">
                            <CartesianGrid
                              strokeDasharray="3 3"
                              horizontal={false}
                              stroke="#f0f0f0"
                            />
                            <XAxis type="number" fontSize={11} stroke="#78716c" />
                            <YAxis
                              type="category"
                              dataKey="name"
                              fontSize={11}
                              width={120}
                              stroke="#78716c"
                            />
                            <Tooltip
                              formatter={(value: any, _name: any, item: any) => [
                                `${value} (${item.payload.percentage}%)`,
                                'Headcount',
                              ]}
                            />
                            <Bar dataKey="count" fill="#d97706" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Branch Distribution */}
                    <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-4">
                      <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-emerald-600" />
                          <h3 className="text-sm font-semibold text-stone-900">
                            Headcount by Branch
                          </h3>
                        </div>
                        <span className="text-xs text-stone-500 font-mono">
                          {headcountData.byBranch?.length} branches
                        </span>
                      </div>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={headcountData.byBranch} layout="vertical">
                            <CartesianGrid
                              strokeDasharray="3 3"
                              horizontal={false}
                              stroke="#f0f0f0"
                            />
                            <XAxis type="number" fontSize={11} stroke="#78716c" />
                            <YAxis
                              type="category"
                              dataKey="name"
                              fontSize={11}
                              width={120}
                              stroke="#78716c"
                            />
                            <Tooltip
                              formatter={(value: any, _name: any, item: any) => [
                                `${value} (${item.payload.percentage}%)`,
                                'Headcount',
                              ]}
                            />
                            <Bar dataKey="count" fill="#059669" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* Employment Category & Work Mode */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Employment Type */}
                    <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                        Employment Category
                      </h4>
                      <div className="space-y-2.5">
                        {headcountData.byEmploymentType?.map((item: any) => (
                          <div key={item.type} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="font-medium text-stone-800">{item.type}</span>
                              <span className="font-semibold text-amber-700">
                                {item.count} ({item.percentage}%)
                              </span>
                            </div>
                            <div className="h-1.5 w-full bg-stone-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-amber-600 rounded-full"
                                style={{ width: `${item.percentage}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Work Mode */}
                    <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                        Work Arrangement
                      </h4>
                      <div className="space-y-2.5">
                        {headcountData.byWorkMode?.map((item: any) => (
                          <div key={item.mode} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="font-medium text-stone-800">{item.mode}</span>
                              <span className="font-semibold text-indigo-700">
                                {item.count} ({item.percentage}%)
                              </span>
                            </div>
                            <div className="h-1.5 w-full bg-stone-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-indigo-600 rounded-full"
                                style={{ width: `${item.percentage}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Gender Breakdown */}
                    <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                        Demographic Distribution
                      </h4>
                      <div className="space-y-2.5">
                        {headcountData.byGender?.map((item: any) => (
                          <div key={item.gender} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="font-medium text-stone-800">{item.gender}</span>
                              <span className="font-semibold text-emerald-700">
                                {item.count} ({item.percentage}%)
                              </span>
                            </div>
                            <div className="h-1.5 w-full bg-stone-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-600 rounded-full"
                                style={{ width: `${item.percentage}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                /* ACCESSIBLE TABLES VIEW */
                <div className="space-y-6">
                  {/* Department Table */}
                  <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-3">
                    <h3 className="text-sm font-semibold text-stone-900">
                      Department Distribution (Accessible View)
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-stone-200 text-stone-500">
                            <th className="py-2">Department Name</th>
                            <th className="py-2">Active Headcount</th>
                            <th className="py-2">Share %</th>
                            <th className="py-2">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                          {headcountData.byDepartment?.map((row: any) => (
                            <tr key={row.id} className="hover:bg-stone-50">
                              <td className="py-2 font-medium text-stone-800">{row.name}</td>
                              <td className="py-2 text-stone-700">{row.count}</td>
                              <td className="py-2 font-semibold text-amber-700">
                                {row.percentage}%
                              </td>
                              <td className="py-2">
                                {row.isSuppressed ? (
                                  <span className="rounded bg-stone-100 px-2 py-0.5 text-[10px] text-stone-600">
                                    Protected Cohort (&lt;5)
                                  </span>
                                ) : (
                                  <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700 font-medium">
                                    Disclosed
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Branch Table */}
                  <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-3">
                    <h3 className="text-sm font-semibold text-stone-900">
                      Branch Distribution (Accessible View)
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-stone-200 text-stone-500">
                            <th className="py-2">Branch Name</th>
                            <th className="py-2">Active Headcount</th>
                            <th className="py-2">Share %</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                          {headcountData.byBranch?.map((row: any) => (
                            <tr key={row.id} className="hover:bg-stone-50">
                              <td className="py-2 font-medium text-stone-800">{row.name}</td>
                              <td className="py-2 text-stone-700">{row.count}</td>
                              <td className="py-2 font-semibold text-emerald-700">
                                {row.percentage}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Designation Table */}
                  <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-3">
                    <h3 className="text-sm font-semibold text-stone-900">
                      Top Designation Distribution (Accessible View)
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-stone-200 text-stone-500">
                            <th className="py-2">Designation / Role</th>
                            <th className="py-2">Active Headcount</th>
                            <th className="py-2">Share %</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                          {headcountData.byDesignation?.slice(0, 15).map((row: any) => (
                            <tr key={row.id} className="hover:bg-stone-50">
                              <td className="py-2 font-medium text-stone-800">{row.name}</td>
                              <td className="py-2 text-stone-700">{row.count}</td>
                              <td className="py-2 font-semibold text-indigo-700">
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
            </div>
          )}

          {/* ============================================================ */}
          {/* SUBVIEW 2: MOVEMENT & ATTRITION REPORT                      */}
          {/* ============================================================ */}
          {subView === 'MOVEMENT' && movementData && (
            <div className="space-y-6">
              {/* Movement KPI Overview */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                  title="Opening Headcount"
                  value={movementData.metrics?.openingHeadcount || 0}
                  description={`At ${movementData.period?.startDate}`}
                  icon={<Calendar className="h-5 w-5" />}
                  iconBg="bg-stone-50 text-stone-600"
                />
                <KPICard
                  title="New Joiners"
                  value={movementData.metrics?.joinersCount || 0}
                  change={{
                    value: `+${movementData.metrics?.joinersCount || 0}`,
                    trend: 'up',
                    label: 'Period additions',
                  }}
                  icon={<UserPlus className="h-5 w-5" />}
                  iconBg="bg-emerald-50 text-emerald-600"
                />
                <KPICard
                  title="Exits / Separations"
                  value={movementData.metrics?.exitsCount || 0}
                  change={{
                    value: `-${movementData.metrics?.exitsCount || 0}`,
                    trend: 'down',
                    label: 'Period departures',
                  }}
                  icon={<UserMinus className="h-5 w-5" />}
                  iconBg="bg-rose-50 text-rose-600"
                />
                <KPICard
                  title="Net Change & Attrition"
                  value={`${movementData.metrics?.netChange >= 0 ? '+' : ''}${movementData.metrics?.netChange}`}
                  change={{
                    value: `${movementData.metrics?.annualizedAttritionRate}%`,
                    trend: movementData.metrics?.netChange >= 0 ? 'up' : 'down',
                    label: 'Ann. Attrition',
                  }}
                  icon={<TrendingUp className="h-5 w-5" />}
                  iconBg="bg-indigo-50 text-indigo-600"
                />
              </div>

              {/* Roster Tabs / Tables */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Joiners Table */}
                <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-3">
                  <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                    <div className="flex items-center gap-2">
                      <UserPlus className="h-4 w-4 text-emerald-600" />
                      <h3 className="text-sm font-semibold text-stone-900">
                        Joiners Roster ({movementData.joiners?.total || 0})
                      </h3>
                    </div>
                    <span className="text-xs text-stone-500 font-mono">
                      Page {movementData.joiners?.page} of{' '}
                      {Math.ceil((movementData.joiners?.total || 1) / pageSize) || 1}
                    </span>
                  </div>

                  <div className="overflow-x-auto min-h-[220px]">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-stone-200 text-stone-500">
                          <th className="py-2">Emp #</th>
                          <th className="py-2">Name</th>
                          <th className="py-2">Department</th>
                          <th className="py-2">Date Joined</th>
                          <th className="py-2">Type</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {movementData.joiners?.items?.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-6 text-center text-stone-400">
                              No joiners in selected period.
                            </td>
                          </tr>
                        ) : (
                          movementData.joiners?.items?.map((item: any) => (
                            <tr key={item.id} className="hover:bg-stone-50">
                              <td className="py-2 font-mono text-stone-600">
                                {item.employeeNumber}
                              </td>
                              <td className="py-2 font-medium text-stone-800">{item.fullName}</td>
                              <td className="py-2 text-stone-600">{item.department}</td>
                              <td className="py-2 text-stone-600">{item.joiningDate}</td>
                              <td className="py-2">
                                <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700 font-medium">
                                  {item.employmentType}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Joiners Pagination */}
                  {(movementData.joiners?.total || 0) > pageSize && (
                    <div className="flex items-center justify-between border-t border-stone-100 pt-3 text-xs">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={joinersPage <= 1}
                        onClick={() => setJoinersPage((p) => Math.max(1, p - 1))}
                      >
                        Previous
                      </Button>
                      <span className="text-stone-500">Page {joinersPage}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          joinersPage >= Math.ceil((movementData.joiners?.total || 0) / pageSize)
                        }
                        onClick={() => setJoinersPage((p) => p + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </div>

                {/* Exits Table */}
                <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-3">
                  <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                    <div className="flex items-center gap-2">
                      <UserMinus className="h-4 w-4 text-rose-600" />
                      <h3 className="text-sm font-semibold text-stone-900">
                        Exits Roster ({movementData.exits?.total || 0})
                      </h3>
                    </div>
                    <span className="text-xs text-stone-500 font-mono">
                      Page {movementData.exits?.page} of{' '}
                      {Math.ceil((movementData.exits?.total || 1) / pageSize) || 1}
                    </span>
                  </div>

                  <div className="overflow-x-auto min-h-[220px]">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-stone-200 text-stone-500">
                          <th className="py-2">Emp #</th>
                          <th className="py-2">Name</th>
                          <th className="py-2">Department</th>
                          <th className="py-2">Exit Date</th>
                          <th className="py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {movementData.exits?.items?.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-6 text-center text-stone-400">
                              No departures in selected period.
                            </td>
                          </tr>
                        ) : (
                          movementData.exits?.items?.map((item: any) => (
                            <tr key={item.id} className="hover:bg-stone-50">
                              <td className="py-2 font-mono text-stone-600">
                                {item.employeeNumber}
                              </td>
                              <td className="py-2 font-medium text-stone-800">{item.fullName}</td>
                              <td className="py-2 text-stone-600">{item.department}</td>
                              <td className="py-2 text-stone-600">{item.exitDate}</td>
                              <td className="py-2">
                                <span className="rounded bg-rose-50 px-2 py-0.5 text-[10px] text-rose-700 font-medium">
                                  {item.status}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Exits Pagination */}
                  {(movementData.exits?.total || 0) > pageSize && (
                    <div className="flex items-center justify-between border-t border-stone-100 pt-3 text-xs">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={exitsPage <= 1}
                        onClick={() => setExitsPage((p) => Math.max(1, p - 1))}
                      >
                        Previous
                      </Button>
                      <span className="text-stone-500">Page {exitsPage}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          exitsPage >= Math.ceil((movementData.exits?.total || 0) / pageSize)
                        }
                        onClick={() => setExitsPage((p) => p + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* SUBVIEW 3: HISTORICAL WORKFORCE TRENDS                       */}
          {/* ============================================================ */}
          {subView === 'TRENDS' && trendsData && (
            <div className="space-y-6">
              {/* Trends Line / Bar Chart */}
              <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-amber-600" />
                    <h3 className="text-sm font-semibold text-stone-900">
                      Monthly Closing Headcount & Attrition Trend ({trendsData.monthsCount} Months)
                    </h3>
                  </div>
                  <span className="text-xs text-stone-500">Monthly Event Trajectory</span>
                </div>

                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendsData.series}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis dataKey="period" fontSize={11} stroke="#78716c" />
                      <YAxis yAxisId="left" fontSize={11} stroke="#78716c" />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        fontSize={11}
                        stroke="#dc2626"
                        unit="%"
                      />
                      <Tooltip />
                      <Legend />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="closingHeadcount"
                        name="Closing Headcount"
                        stroke="#d97706"
                        strokeWidth={2.5}
                        dot={{ r: 4 }}
                      />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="joiners"
                        name="Joiners"
                        stroke="#059669"
                        strokeWidth={1.5}
                        strokeDasharray="3 3"
                      />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="exits"
                        name="Exits"
                        stroke="#e11d48"
                        strokeWidth={1.5}
                        strokeDasharray="3 3"
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="attritionRate"
                        name="Attrition %"
                        stroke="#dc2626"
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Monthly Breakdown Table */}
              <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-3">
                <h3 className="text-sm font-semibold text-stone-900">
                  Monthly Trajectory Data (Accessible View)
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-stone-200 text-stone-500">
                        <th className="py-2">Month</th>
                        <th className="py-2">Opening</th>
                        <th className="py-2">Joiners</th>
                        <th className="py-2">Exits</th>
                        <th className="py-2">Net Change</th>
                        <th className="py-2">Closing Headcount</th>
                        <th className="py-2">Monthly Attrition</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {trendsData.series?.map((m: any) => (
                        <tr key={m.period} className="hover:bg-stone-50">
                          <td className="py-2 font-mono font-medium text-stone-800">{m.period}</td>
                          <td className="py-2 text-stone-600">{m.openingHeadcount}</td>
                          <td className="py-2 text-emerald-600 font-semibold">+{m.joiners}</td>
                          <td className="py-2 text-rose-600 font-semibold">-{m.exits}</td>
                          <td className="py-2 font-medium">
                            <span
                              className={
                                m.netChange > 0
                                  ? 'text-emerald-700 font-bold'
                                  : m.netChange < 0
                                    ? 'text-rose-700 font-bold'
                                    : 'text-stone-600'
                              }
                            >
                              {m.netChange > 0 ? `+${m.netChange}` : m.netChange}
                            </span>
                          </td>
                          <td className="py-2 font-bold text-amber-800">{m.closingHeadcount}</td>
                          <td className="py-2 text-stone-700">{m.attritionRate}%</td>
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
    </div>
  );
}
