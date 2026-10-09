'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  KPICard,
  Badge,
  Button,
  Input,
  Dialog,
  LoadingState,
  ErrorState,
  EmptyState,
} from '@hrms/ui';
import {
  Briefcase,
  Home,
  Users,
  CheckCircle2,
  Clock,
  AlertTriangle,
  AlertCircle,
  MapPin,
  Calendar,
  Filter,
  Search,
  RefreshCw,
  Eye,
  Building,
  UserCheck,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  FileCheck2,
  FileText,
  Ban,
  XCircle,
  Compass,
} from 'lucide-react';
import { attendanceApi, organizationApi } from '../../../lib/api-client';
import { useAuth } from '../../../context/AuthContext';

interface FieldAndRemoteOverviewDashboardProps {
  initialDate?: string;
  isManagerView?: boolean;
}

export const FieldAndRemoteOverviewDashboard: React.FC<FieldAndRemoteOverviewDashboardProps> = ({
  initialDate,
  isManagerView = false,
}) => {
  const { user } = useAuth();
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Filter States
  const [selectedDate, setSelectedDate] = useState<string>(initialDate || todayStr);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');
  const [selectedManagerId, setSelectedManagerId] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [activityTab, setActivityTab] = useState<
    'field' | 'wfh' | 'pending' | 'exceptions' | 'completed'
  >('field');

  // Metadata dropdowns
  const [branches, setBranches] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);

  // Overview Data State
  const [overviewData, setOverviewData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Detail Modal State
  const [detailModal, setDetailModal] = useState<{
    isOpen: boolean;
    type: 'visit' | 'wfh' | 'exception';
    data: any;
  }>({
    isOpen: false,
    type: 'visit',
    data: null,
  });

  // Load organization filter metadata
  useEffect(() => {
    let isMounted = true;
    async function loadMeta() {
      try {
        const [branchesRes, deptsRes] = await Promise.all([
          organizationApi.getBranches().catch(() => []),
          organizationApi.getDepartments().catch(() => []),
        ]);
        if (isMounted) {
          setBranches(Array.isArray(branchesRes) ? branchesRes : (branchesRes as any)?.data || []);
          setDepartments(Array.isArray(deptsRes) ? deptsRes : (deptsRes as any)?.data || []);
        }
      } catch {
        // Fallback silently if metadata unavailable
      }
    }
    loadMeta();
    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch Remote & Field Overview
  const fetchOverview = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await attendanceApi.getRemoteFieldOverview({
        date: selectedDate,
        branchId: selectedBranchId || undefined,
        departmentId: selectedDeptId || undefined,
        managerId: selectedManagerId || undefined,
        status: selectedStatus !== 'ALL' ? selectedStatus : undefined,
        search: searchQuery.trim() || undefined,
      });
      setOverviewData(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to retrieve field and remote work overview.');
    } finally {
      setIsLoading(false);
    }
  }, [
    selectedDate,
    selectedBranchId,
    selectedDeptId,
    selectedManagerId,
    selectedStatus,
    searchQuery,
  ]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  // Helpers
  const recon = overviewData?.requestsVsAttendance;
  const visits = overviewData?.visitsByStatus;
  const fieldAct = overviewData?.todayFieldActivity;
  const wfh = overviewData?.wfhRequests;
  const pending = overviewData?.pendingApprovals;
  const exceptions = overviewData?.exceptions;
  const completed = overviewData?.completedVisits;
  const modes = overviewData?.attendanceModes;

  // Filtered Field Duties by Search
  const filteredFieldDuties = useMemo(() => {
    if (!fieldAct?.duties) return [];
    if (!searchQuery.trim()) return fieldAct.duties;
    const q = searchQuery.toLowerCase();
    return fieldAct.duties.filter(
      (d: any) =>
        d.employee?.displayName?.toLowerCase().includes(q) ||
        d.employee?.employeeCode?.toLowerCase().includes(q) ||
        d.title?.toLowerCase().includes(q) ||
        d.purpose?.toLowerCase().includes(q),
    );
  }, [fieldAct?.duties, searchQuery]);

  // Filtered WFH Duties by Search
  const filteredWfhDuties = useMemo(() => {
    if (!wfh?.duties) return [];
    if (!searchQuery.trim()) return wfh.duties;
    const q = searchQuery.toLowerCase();
    return wfh.duties.filter(
      (d: any) =>
        d.employee?.displayName?.toLowerCase().includes(q) ||
        d.employee?.employeeCode?.toLowerCase().includes(q) ||
        d.reason?.toLowerCase().includes(q),
    );
  }, [wfh?.duties, searchQuery]);

  return (
    <div className="space-y-6">
      {/* 1. Header & Filters Toolbar */}
      <Card className="p-4 sm:p-5 border-stone-200 bg-white shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-amber-500/10 text-amber-700">
                <Compass className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-stone-900 tracking-tight">
                  {isManagerView
                    ? 'Team Field & Remote Work Overview'
                    : 'Field & Remote Attendance Overview'}
                </h2>
                <p className="text-xs text-stone-500">
                  Real-time monitor of official visits, work from home authorization, and actual
                  field check-ins.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Date Shortcuts & Refresh */}
          <div className="flex items-center gap-2 self-start lg:self-auto">
            <div className="inline-flex rounded-lg border border-stone-200 p-0.5 bg-stone-50 text-xs">
              <button
                type="button"
                onClick={() => setSelectedDate(todayStr)}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  selectedDate === todayStr
                    ? 'bg-white shadow-xs text-stone-900 font-semibold'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => {
                  const y = new Date();
                  y.setDate(y.getDate() - 1);
                  setSelectedDate(y.toISOString().split('T')[0]);
                }}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  selectedDate !== todayStr
                    ? 'bg-white shadow-xs text-stone-900 font-semibold'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Custom Date
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={fetchOverview}
              disabled={isLoading}
              className="gap-1.5 text-xs text-stone-700 border-stone-300"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="mt-4 pt-4 border-t border-stone-150 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Date Picker */}
          <div>
            <label className="block text-[11px] font-semibold text-stone-600 uppercase tracking-wider mb-1">
              Working Date
            </label>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-xs h-9"
            />
          </div>

          {/* Branch Filter */}
          {!isManagerView && (
            <div>
              <label className="block text-[11px] font-semibold text-stone-600 uppercase tracking-wider mb-1">
                Branch
              </label>
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="w-full h-9 text-xs px-2.5 rounded-lg border border-stone-300 bg-white text-stone-800 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              >
                <option value="">All Branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Department Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-stone-600 uppercase tracking-wider mb-1">
              Department
            </label>
            <select
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
              className="w-full h-9 text-xs px-2.5 rounded-lg border border-stone-300 bg-white text-stone-800 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[11px] font-semibold text-stone-600 uppercase tracking-wider mb-1">
              Status Filter
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full h-9 text-xs px-2.5 rounded-lg border border-stone-300 bg-white text-stone-800 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="APPROVED">Approved / Scheduled</option>
              <option value="SUBMITTED">Pending Approval</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          {/* Search Term */}
          <div>
            <label className="block text-[11px] font-semibold text-stone-600 uppercase tracking-wider mb-1">
              Search Employee / Keyword
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-stone-400" />
              <Input
                type="text"
                placeholder="Name, code, or purpose..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 text-xs h-9"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Main Content States */}
      {isLoading ? (
        <div className="py-12 flex justify-center">
          <LoadingState message="Loading field & remote work overview..." />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={fetchOverview} />
      ) : (
        <>
          {/* 2. RECONCILIATION BANNER: REQUESTS VS ACTUAL ATTENDANCE */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/10 via-stone-50 to-emerald-500/10 border border-amber-200/80 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-amber-700 shrink-0" />
                <div>
                  <h3 className="text-sm font-bold text-stone-900">
                    Attendance Reconciliation: Requests vs. Checked-In Attendance
                  </h3>
                  <p className="text-xs text-stone-600">
                    {recon?.reconciliationMessage ||
                      'Approved requests represent administrative authorizations only. Attendance is credited exclusively upon recorded punch events.'}
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="text-xs bg-white text-stone-700 shrink-0">
                Authoritative Date: {selectedDate}
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
              {/* Field Duty Authorized */}
              <div className="p-3 bg-white rounded-lg border border-amber-200/70 shadow-xs">
                <div className="flex items-center justify-between text-xs text-stone-500 mb-1">
                  <span className="flex items-center gap-1 font-semibold text-stone-700">
                    <Briefcase className="w-3.5 h-3.5 text-amber-600" />
                    Field Duty Requests
                  </span>
                  <Badge variant="default" className="text-[10px] py-0 px-1.5">
                    Authorized
                  </Badge>
                </div>
                <div className="text-xl font-bold text-stone-900">
                  {recon?.fieldDuty?.authorizedRequests ?? 0}
                </div>
                <div className="text-[11px] text-stone-500 mt-1 flex items-center justify-between">
                  <span>Scheduled for today</span>
                  <span className="text-amber-700 font-medium">Permitted</span>
                </div>
              </div>

              {/* Field Duty Punched */}
              <div className="p-3 bg-white rounded-lg border border-emerald-200 shadow-xs">
                <div className="flex items-center justify-between text-xs text-stone-500 mb-1">
                  <span className="flex items-center gap-1 font-semibold text-emerald-800">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Field Checked-In
                  </span>
                  <Badge variant="success" className="text-[10px] py-0 px-1.5">
                    Attended
                  </Badge>
                </div>
                <div className="text-xl font-bold text-emerald-700">
                  {recon?.fieldDuty?.actualCheckedInAttendance ?? 0}
                </div>
                <div className="text-[11px] text-stone-500 mt-1 flex items-center justify-between">
                  <span>Active right now: {recon?.fieldDuty?.activeNow ?? 0}</span>
                  <span className="text-rose-600 font-medium">
                    Gap: {recon?.fieldDuty?.notCheckedInYet ?? 0} unpunched
                  </span>
                </div>
              </div>

              {/* WFH Authorized */}
              <div className="p-3 bg-white rounded-lg border border-amber-200/70 shadow-xs">
                <div className="flex items-center justify-between text-xs text-stone-500 mb-1">
                  <span className="flex items-center gap-1 font-semibold text-stone-700">
                    <Home className="w-3.5 h-3.5 text-sky-600" />
                    Remote WFH Requests
                  </span>
                  <Badge variant="default" className="text-[10px] py-0 px-1.5">
                    Authorized
                  </Badge>
                </div>
                <div className="text-xl font-bold text-stone-900">
                  {recon?.workFromHome?.authorizedRequests ?? 0}
                </div>
                <div className="text-[11px] text-stone-500 mt-1 flex items-center justify-between">
                  <span>Scheduled for today</span>
                  <span className="text-sky-700 font-medium">Permitted</span>
                </div>
              </div>

              {/* WFH Punched */}
              <div className="p-3 bg-white rounded-lg border border-emerald-200 shadow-xs">
                <div className="flex items-center justify-between text-xs text-stone-500 mb-1">
                  <span className="flex items-center gap-1 font-semibold text-emerald-800">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    WFH Checked-In
                  </span>
                  <Badge variant="success" className="text-[10px] py-0 px-1.5">
                    Attended
                  </Badge>
                </div>
                <div className="text-xl font-bold text-emerald-700">
                  {recon?.workFromHome?.actualCheckedInAttendance ?? 0}
                </div>
                <div className="text-[11px] text-stone-500 mt-1 flex items-center justify-between">
                  <span>Active right now: {recon?.workFromHome?.activeNow ?? 0}</span>
                  <span className="text-rose-600 font-medium">
                    Gap: {recon?.workFromHome?.notCheckedInYet ?? 0} unpunched
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. KEY KPI SUMMARY TILES */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Total Visits in Window */}
            <Card className="p-3.5 bg-white border-stone-200">
              <span className="text-[11px] font-semibold text-stone-500 block mb-1">
                Total Visits
              </span>
              <span className="text-2xl font-bold text-stone-900">{visits?.total ?? 0}</span>
              <span className="text-[11px] text-stone-400 block mt-0.5">All statuses</span>
            </Card>

            {/* Visits Approved */}
            <Card className="p-3.5 bg-white border-stone-200">
              <span className="text-[11px] font-semibold text-emerald-700 block mb-1">
                Approved Visits
              </span>
              <span className="text-2xl font-bold text-emerald-700">{visits?.APPROVED ?? 0}</span>
              <span className="text-[11px] text-stone-400 block mt-0.5">Field duty authorized</span>
            </Card>

            {/* Total WFH Requests */}
            <Card className="p-3.5 bg-white border-stone-200">
              <span className="text-[11px] font-semibold text-stone-500 block mb-1">
                WFH Requests
              </span>
              <span className="text-2xl font-bold text-stone-900">{wfh?.byStatus?.total ?? 0}</span>
              <span className="text-[11px] text-stone-400 block mt-0.5">
                Approved: {wfh?.byStatus?.APPROVED ?? 0}
              </span>
            </Card>

            {/* Pending Approvals */}
            <Card className="p-3.5 bg-amber-50/50 border-amber-200">
              <span className="text-[11px] font-semibold text-amber-800 block mb-1">
                Pending Approvals
              </span>
              <span className="text-2xl font-bold text-amber-700">
                {pending?.totalPending ?? 0}
              </span>
              <span className="text-[11px] text-amber-600 block mt-0.5">
                Visits: {pending?.visitsCount ?? 0} | WFH: {pending?.wfhCount ?? 0}
              </span>
            </Card>

            {/* Unresolved Exceptions */}
            <Card className="p-3.5 bg-rose-50/40 border-rose-200">
              <span className="text-[11px] font-semibold text-rose-800 block mb-1">Exceptions</span>
              <span className="text-2xl font-bold text-rose-700">
                {exceptions?.unresolved ?? 0}
              </span>
              <span className="text-[11px] text-rose-600 block mt-0.5">
                Total logged: {exceptions?.total ?? 0}
              </span>
            </Card>

            {/* Completed Visits */}
            <Card className="p-3.5 bg-white border-stone-200">
              <span className="text-[11px] font-semibold text-stone-500 block mb-1">
                Completed Visits
              </span>
              <span className="text-2xl font-bold text-stone-900">{completed?.total ?? 0}</span>
              <span className="text-[11px] text-stone-400 block mt-0.5">Concluded duties</span>
            </Card>
          </div>

          {/* 4. ATTENDANCE MODES BREAKDOWN BAR */}
          <Card className="p-4 bg-white border-stone-200 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-sm font-bold text-stone-900">
                  Actual Attendance Modes Distribution for {selectedDate}
                </h3>
                <p className="text-xs text-stone-500">
                  Counts of validated check-in punch sessions across modalities.
                </p>
              </div>
              <span className="text-xs font-semibold text-stone-600">
                Total Check-Ins: {modes?.total ?? 0}
              </span>
            </div>

            {/* Proportion Bar */}
            <div className="w-full h-3.5 bg-stone-100 rounded-full overflow-hidden flex shadow-inner">
              <div
                style={{
                  width: `${modes?.total > 0 ? ((modes.office || 0) / modes.total) * 100 : 0}%`,
                }}
                className="bg-stone-700 transition-all duration-300"
                title={`Office: ${modes?.office || 0}`}
              />
              <div
                style={{
                  width: `${modes?.total > 0 ? ((modes.officialVisit || 0) / modes.total) * 100 : 0}%`,
                }}
                className="bg-amber-500 transition-all duration-300"
                title={`Official Visit: ${modes?.officialVisit || 0}`}
              />
              <div
                style={{
                  width: `${modes?.total > 0 ? ((modes.workFromHome || 0) / modes.total) * 100 : 0}%`,
                }}
                className="bg-sky-500 transition-all duration-300"
                title={`WFH: ${modes?.workFromHome || 0}`}
              />
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-5 mt-3 text-xs text-stone-600">
              <span className="flex items-center gap-1.5 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-stone-700 inline-block" />
                Office Mode: <strong>{modes?.office || 0}</strong> (
                {modes?.total > 0 ? Math.round(((modes.office || 0) / modes.total) * 100) : 0}%)
              </span>
              <span className="flex items-center gap-1.5 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                Field Visit Mode: <strong>{modes?.officialVisit || 0}</strong> (
                {modes?.total > 0
                  ? Math.round(((modes.officialVisit || 0) / modes.total) * 100)
                  : 0}
                %)
              </span>
              <span className="flex items-center gap-1.5 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-500 inline-block" />
                Work From Home Mode: <strong>{modes?.workFromHome || 0}</strong> (
                {modes?.total > 0 ? Math.round(((modes.workFromHome || 0) / modes.total) * 100) : 0}
                %)
              </span>
            </div>
          </Card>

          {/* 5. TABBED SECTION: DETAILED ACTIVITY TABLES & QUEUES */}
          <Card className="border-stone-200 bg-white shadow-xs overflow-hidden">
            <div className="border-b border-stone-200 px-4 pt-3 flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                onClick={() => setActivityTab('field')}
                className={`pb-2.5 px-3 font-semibold transition-colors border-b-2 flex items-center gap-1.5 cursor-pointer ${
                  activityTab === 'field'
                    ? 'border-amber-600 text-amber-800'
                    : 'border-transparent text-stone-500 hover:text-stone-900'
                }`}
              >
                <Briefcase className="w-3.5 h-3.5" />
                Today&apos;s Field Activity ({fieldAct?.approvedVisitsToday ?? 0})
              </button>
              <button
                type="button"
                onClick={() => setActivityTab('wfh')}
                className={`pb-2.5 px-3 font-semibold transition-colors border-b-2 flex items-center gap-1.5 cursor-pointer ${
                  activityTab === 'wfh'
                    ? 'border-amber-600 text-amber-800'
                    : 'border-transparent text-stone-500 hover:text-stone-900'
                }`}
              >
                <Home className="w-3.5 h-3.5" />
                Today&apos;s Remote WFH ({wfh?.approvedWfhToday ?? 0})
              </button>
              <button
                type="button"
                onClick={() => setActivityTab('pending')}
                className={`pb-2.5 px-3 font-semibold transition-colors border-b-2 flex items-center gap-1.5 cursor-pointer ${
                  activityTab === 'pending'
                    ? 'border-amber-600 text-amber-800'
                    : 'border-transparent text-stone-500 hover:text-stone-900'
                }`}
              >
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                Pending Approvals ({pending?.totalPending ?? 0})
              </button>
              <button
                type="button"
                onClick={() => setActivityTab('exceptions')}
                className={`pb-2.5 px-3 font-semibold transition-colors border-b-2 flex items-center gap-1.5 cursor-pointer ${
                  activityTab === 'exceptions'
                    ? 'border-amber-600 text-amber-800'
                    : 'border-transparent text-stone-500 hover:text-stone-900'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                Exceptions ({exceptions?.total ?? 0})
              </button>
              <button
                type="button"
                onClick={() => setActivityTab('completed')}
                className={`pb-2.5 px-3 font-semibold transition-colors border-b-2 flex items-center gap-1.5 cursor-pointer ${
                  activityTab === 'completed'
                    ? 'border-amber-600 text-amber-800'
                    : 'border-transparent text-stone-500 hover:text-stone-900'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Completed Visits ({completed?.total ?? 0})
              </button>
            </div>

            <div className="p-4">
              {/* TAB 1: TODAY'S FIELD ACTIVITY */}
              {activityTab === 'field' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs text-stone-500">
                    <span>
                      Scheduled field duties for <strong>{selectedDate}</strong>
                    </span>
                    <span>
                      Punched: <strong>{fieldAct?.fieldCheckedInToday ?? 0}</strong> /{' '}
                      {fieldAct?.approvedVisitsToday ?? 0}
                    </span>
                  </div>

                  {filteredFieldDuties.length === 0 ? (
                    <EmptyState
                      title="No Field Duties Scheduled"
                      description="No employees have an approved official visit active on this date."
                      icon={<Briefcase className="w-8 h-8 text-stone-400" />}
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-stone-50 text-stone-600 uppercase text-[10px] tracking-wider border-b border-stone-200">
                          <tr>
                            <th className="py-2.5 px-3">Employee</th>
                            <th className="py-2.5 px-3">Visit Title / Purpose</th>
                            <th className="py-2.5 px-3">Destinations</th>
                            <th className="py-2.5 px-3">Attendance Status</th>
                            <th className="py-2.5 px-3">Punch Info</th>
                            <th className="py-2.5 px-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-150">
                          {filteredFieldDuties.map((duty: any) => (
                            <tr key={duty.id} className="hover:bg-stone-50/70 transition-colors">
                              <td className="py-3 px-3">
                                <div className="font-semibold text-stone-900">
                                  {duty.employee?.displayName ||
                                    `${duty.employee?.firstName} ${duty.employee?.lastName}`}
                                </div>
                                <div className="text-[11px] text-stone-400">
                                  {duty.employee?.employeeCode}
                                </div>
                              </td>
                              <td className="py-3 px-3 max-w-xs">
                                <div className="font-medium text-stone-800 truncate">
                                  {duty.title}
                                </div>
                                <div className="text-[11px] text-stone-500 truncate">
                                  {duty.purpose}
                                </div>
                              </td>
                              <td className="py-3 px-3">
                                <div className="flex flex-col gap-0.5">
                                  {duty.destinations?.slice(0, 2).map((dst: any) => (
                                    <span
                                      key={dst.id}
                                      className="flex items-center gap-1 text-[11px] text-stone-600"
                                    >
                                      <MapPin className="w-3 h-3 text-amber-600 shrink-0" />
                                      {dst.destinationName} ({dst.radiusMeters}m)
                                    </span>
                                  ))}
                                  {(duty.destinations?.length || 0) > 2 && (
                                    <span className="text-[10px] text-stone-400">
                                      +{duty.destinations.length - 2} more stops
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-3">
                                {duty.attendanceStatus === 'CHECKED_IN' ? (
                                  <Badge
                                    variant="success"
                                    className="gap-1 bg-emerald-50 text-emerald-800 border-emerald-200"
                                  >
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                    Checked In (Field)
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="warning"
                                    className="gap-1 bg-amber-50 text-amber-800 border-amber-200"
                                  >
                                    <Clock className="w-3 h-3 text-amber-600" />
                                    Authorized (Unpunched)
                                  </Badge>
                                )}
                              </td>
                              <td className="py-3 px-3 text-stone-600 text-[11px]">
                                {duty.session ? (
                                  <div>
                                    <span>
                                      In:{' '}
                                      {new Date(duty.session.checkInTime).toLocaleTimeString([], {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}
                                    </span>
                                    {duty.session.checkOutTime && (
                                      <span className="block text-stone-400">
                                        Out:{' '}
                                        {new Date(duty.session.checkOutTime).toLocaleTimeString(
                                          [],
                                          { hour: '2-digit', minute: '2-digit' },
                                        )}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-stone-400 italic">No punch recorded</span>
                                )}
                              </td>
                              <td className="py-3 px-3 text-right">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    setDetailModal({ isOpen: true, type: 'visit', data: duty })
                                  }
                                  className="text-xs h-7 px-2"
                                >
                                  <Eye className="w-3 h-3 mr-1" />
                                  Details
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: TODAY'S WFH */}
              {activityTab === 'wfh' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs text-stone-500">
                    <span>
                      Scheduled remote work for <strong>{selectedDate}</strong>
                    </span>
                    <span>
                      Punched: <strong>{wfh?.wfhCheckedInToday ?? 0}</strong> /{' '}
                      {wfh?.approvedWfhToday ?? 0}
                    </span>
                  </div>

                  {filteredWfhDuties.length === 0 ? (
                    <EmptyState
                      title="No Remote WFH Scheduled"
                      description="No employees have an approved WFH request active on this date."
                      icon={<Home className="w-8 h-8 text-stone-400" />}
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-stone-50 text-stone-600 uppercase text-[10px] tracking-wider border-b border-stone-200">
                          <tr>
                            <th className="py-2.5 px-3">Employee</th>
                            <th className="py-2.5 px-3">Duration Portion</th>
                            <th className="py-2.5 px-3">Reason</th>
                            <th className="py-2.5 px-3">Attendance Status</th>
                            <th className="py-2.5 px-3">Punch Info</th>
                            <th className="py-2.5 px-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-150">
                          {filteredWfhDuties.map((duty: any) => (
                            <tr key={duty.id} className="hover:bg-stone-50/70 transition-colors">
                              <td className="py-3 px-3">
                                <div className="font-semibold text-stone-900">
                                  {duty.employee?.displayName ||
                                    `${duty.employee?.firstName} ${duty.employee?.lastName}`}
                                </div>
                                <div className="text-[11px] text-stone-400">
                                  {duty.employee?.employeeCode}
                                </div>
                              </td>
                              <td className="py-3 px-3">
                                <Badge variant="default" className="text-[11px]">
                                  {duty.durationType}
                                </Badge>
                              </td>
                              <td className="py-3 px-3 max-w-xs text-stone-600 truncate">
                                {duty.reason}
                              </td>
                              <td className="py-3 px-3">
                                {duty.attendanceStatus === 'CHECKED_IN' ? (
                                  <Badge
                                    variant="success"
                                    className="gap-1 bg-emerald-50 text-emerald-800 border-emerald-200"
                                  >
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                    Checked In (Remote)
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="warning"
                                    className="gap-1 bg-amber-50 text-amber-800 border-amber-200"
                                  >
                                    <Clock className="w-3 h-3 text-amber-600" />
                                    Authorized (Unpunched)
                                  </Badge>
                                )}
                              </td>
                              <td className="py-3 px-3 text-stone-600 text-[11px]">
                                {duty.session ? (
                                  <span>
                                    In:{' '}
                                    {new Date(duty.session.checkInTime).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                ) : (
                                  <span className="text-stone-400 italic">No punch recorded</span>
                                )}
                              </td>
                              <td className="py-3 px-3 text-right">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    setDetailModal({ isOpen: true, type: 'wfh', data: duty })
                                  }
                                  className="text-xs h-7 px-2"
                                >
                                  <Eye className="w-3 h-3 mr-1" />
                                  Details
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: PENDING APPROVALS */}
              {activityTab === 'pending' && (
                <div className="space-y-4">
                  <div className="text-xs text-stone-500">
                    Requests waiting for reviewer decision ({pending?.totalPending ?? 0} total)
                  </div>

                  {pending?.totalPending === 0 ? (
                    <EmptyState
                      title="No Pending Approvals"
                      description="All official visit, WFH, and attendance correction requests have been decided."
                      icon={<FileCheck2 className="w-8 h-8 text-stone-400" />}
                    />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Visits Pending */}
                      <Card className="p-4 border-stone-200">
                        <div className="flex items-center justify-between mb-3 pb-2 border-b border-stone-150">
                          <h4 className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                            <Briefcase className="w-4 h-4 text-amber-600" />
                            Pending Official Visits ({pending?.visitsCount ?? 0})
                          </h4>
                        </div>
                        {pending?.visits?.length === 0 ? (
                          <p className="text-xs text-stone-400 italic py-2">No pending visits.</p>
                        ) : (
                          <div className="space-y-2">
                            {pending?.visits?.map((v: any) => (
                              <div
                                key={v.id}
                                className="p-2.5 rounded-lg border border-stone-200 text-xs space-y-1"
                              >
                                <div className="flex items-center justify-between font-semibold">
                                  <span>{v.employee?.displayName || v.employee?.firstName}</span>
                                  <span className="text-[10px] text-stone-400">
                                    {new Date(v.startDate).toLocaleDateString()}
                                  </span>
                                </div>
                                <p className="text-stone-600 truncate">{v.title}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </Card>

                      {/* WFH Pending */}
                      <Card className="p-4 border-stone-200">
                        <div className="flex items-center justify-between mb-3 pb-2 border-b border-stone-150">
                          <h4 className="text-xs font-bold text-stone-900 flex items-center gap-1.5">
                            <Home className="w-4 h-4 text-sky-600" />
                            Pending WFH Requests ({pending?.wfhCount ?? 0})
                          </h4>
                        </div>
                        {pending?.wfh?.length === 0 ? (
                          <p className="text-xs text-stone-400 italic py-2">
                            No pending WFH requests.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {pending?.wfh?.map((w: any) => (
                              <div
                                key={w.id}
                                className="p-2.5 rounded-lg border border-stone-200 text-xs space-y-1"
                              >
                                <div className="flex items-center justify-between font-semibold">
                                  <span>{w.employee?.displayName || w.employee?.firstName}</span>
                                  <span className="text-[10px] text-stone-400">
                                    {new Date(w.startDate).toLocaleDateString()}
                                  </span>
                                </div>
                                <p className="text-stone-600 truncate">{w.reason}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </Card>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: EXCEPTIONS */}
              {activityTab === 'exceptions' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs text-stone-500">
                    <span>
                      Attendance exceptions recorded for <strong>{selectedDate}</strong>
                    </span>
                    <span className="text-rose-600 font-semibold">
                      Unresolved: {exceptions?.unresolved ?? 0}
                    </span>
                  </div>

                  {exceptions?.total === 0 ? (
                    <EmptyState
                      title="No Attendance Exceptions"
                      description="No geofence, missing checkout, or outside shift window exceptions on this date."
                      icon={<ShieldCheck className="w-8 h-8 text-emerald-500" />}
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-stone-50 text-stone-600 uppercase text-[10px] tracking-wider border-b border-stone-200">
                          <tr>
                            <th className="py-2.5 px-3">Employee</th>
                            <th className="py-2.5 px-3">Exception Type</th>
                            <th className="py-2.5 px-3">Severity</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3">Recorded At</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-150">
                          {exceptions?.recent?.map((ex: any) => (
                            <tr key={ex.id} className="hover:bg-stone-50/70 transition-colors">
                              <td className="py-3 px-3 font-semibold text-stone-900">
                                {ex.employee?.displayName || ex.employee?.firstName}
                              </td>
                              <td className="py-3 px-3 font-medium text-stone-700">
                                {ex.exceptionType}
                              </td>
                              <td className="py-3 px-3">
                                <Badge
                                  variant={ex.severity === 'HIGH' ? 'danger' : 'warning'}
                                  className="text-[10px]"
                                >
                                  {ex.severity}
                                </Badge>
                              </td>
                              <td className="py-3 px-3">
                                {ex.resolved ? (
                                  <Badge variant="success" className="text-[10px]">
                                    Resolved
                                  </Badge>
                                ) : (
                                  <Badge variant="danger" className="text-[10px]">
                                    Unresolved
                                  </Badge>
                                )}
                              </td>
                              <td className="py-3 px-3 text-stone-500 text-[11px]">
                                {new Date(ex.createdAt).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 5: COMPLETED VISITS */}
              {activityTab === 'completed' && (
                <div className="space-y-4">
                  <div className="text-xs text-stone-500">
                    Concluded official visits with verified field execution ({completed?.total ?? 0}{' '}
                    total)
                  </div>

                  {completed?.total === 0 ? (
                    <EmptyState
                      title="No Completed Visits"
                      description="No official visits have concluded in the active filter timeframe."
                      icon={<CheckCircle2 className="w-8 h-8 text-stone-400" />}
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-stone-50 text-stone-600 uppercase text-[10px] tracking-wider border-b border-stone-200">
                          <tr>
                            <th className="py-2.5 px-3">Employee</th>
                            <th className="py-2.5 px-3">Title / Purpose</th>
                            <th className="py-2.5 px-3">Dates</th>
                            <th className="py-2.5 px-3">Duration Days</th>
                            <th className="py-2.5 px-3">Destinations</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-150">
                          {completed?.recent?.map((v: any) => (
                            <tr key={v.id} className="hover:bg-stone-50/70 transition-colors">
                              <td className="py-3 px-3 font-semibold text-stone-900">
                                {v.employee?.displayName || v.employee?.firstName}
                              </td>
                              <td className="py-3 px-3 max-w-xs truncate text-stone-700">
                                {v.title}
                              </td>
                              <td className="py-3 px-3 text-stone-600 text-[11px]">
                                {new Date(v.startDate).toLocaleDateString()} —{' '}
                                {new Date(v.endDate).toLocaleDateString()}
                              </td>
                              <td className="py-3 px-3 text-stone-800 font-medium">
                                {v.expectedDurationDays}d
                              </td>
                              <td className="py-3 px-3 text-stone-600">
                                {v.destinations?.length || 0} stops
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        </>
      )}

      {/* Detail Inspection Dialog */}
      <Dialog
        isOpen={detailModal.isOpen}
        onClose={() => setDetailModal({ isOpen: false, type: 'visit', data: null })}
        title={
          detailModal.type === 'visit'
            ? 'Official Visit Duty Details'
            : 'Work From Home Request Details'
        }
        maxWidth="md"
      >
        {detailModal.data && (
          <div className="space-y-4 pt-2 text-xs">
            <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 space-y-1">
              <div className="font-semibold text-stone-900 text-sm">
                {detailModal.data.employee?.displayName || detailModal.data.employee?.firstName}
              </div>
              <div className="text-stone-500 text-xs">
                Code: {detailModal.data.employee?.employeeCode}
              </div>
            </div>

            {detailModal.type === 'visit' && (
              <>
                <div>
                  <span className="font-semibold text-stone-700 block mb-1">Title & Purpose</span>
                  <p className="font-medium text-stone-900">{detailModal.data.title}</p>
                  <p className="text-stone-600 text-[11px] mt-0.5">{detailModal.data.purpose}</p>
                </div>

                <div>
                  <span className="font-semibold text-stone-700 block mb-1">Authorized Stops</span>
                  <div className="space-y-1.5">
                    {detailModal.data.destinations?.map((d: any) => (
                      <div
                        key={d.id}
                        className="p-2 rounded bg-stone-50 border border-stone-200 text-[11px]"
                      >
                        <strong>{d.destinationName}</strong> — {d.address || 'No street address'}{' '}
                        (Geofence: {d.radiusMeters}m)
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {detailModal.type === 'wfh' && (
              <div>
                <span className="font-semibold text-stone-700 block mb-1">
                  Reason / Explanation
                </span>
                <p className="text-stone-700 p-2.5 bg-stone-50 rounded border border-stone-200">
                  {detailModal.data.reason}
                </p>
              </div>
            )}

            <div className="pt-2 flex justify-end border-t border-stone-200">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDetailModal({ isOpen: false, type: 'visit', data: null })}
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
};
