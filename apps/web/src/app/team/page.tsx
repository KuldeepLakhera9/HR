'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { AppShell } from '../../layouts/AppShell';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Avatar,
  KPICard,
  Button,
} from '@hrms/ui';
import {
  Users,
  Clock,
  CalendarCheck,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Home,
  MapPin,
  CalendarDays,
  FileCheck2,
  Phone,
  Mail,
  Hourglass,
  ArrowRight,
  ShieldAlert,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Eye,
  Building2,
  Briefcase,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';
import { managerApi } from '../../lib/api-client';
import { TeamMemberDetailModal } from '../../components/team/TeamMemberDetailModal';
import { TeamReportsView } from '../../components/team/TeamReportsView';

interface ManagerDashboardData {
  success: boolean;
  timestamp: string;
  targetDate: string;
  timezone: string;
  manager: {
    id: string;
    displayName: string;
    employeeCode: string;
    directReportsCount?: number;
    indirectReportsCount?: number;
  } | null;
  metrics: {
    teamHeadcount: number;
    presentCheckedIn: number;
    notDueYet: number;
    pendingCheckIn: number;
    onApprovedLeave: number;
    onApprovedWfh: number;
    onOfficialVisit: number;
    pendingApprovalsTotal: number;
    actionableExceptionsCount: number;
  };
  pendingBreakdown: {
    leaves: number;
    wfh: number;
    visits: number;
    corrections: number;
    total: number;
  };
  roster: Array<{
    id: string;
    employeeCode: string;
    displayName: string;
    profilePhoto: string | null;
    designation: string;
    department: string;
    workEmail: string | null;
    workPhone: string | null;
    status:
      | 'PRESENT_OFFICE'
      | 'PRESENT_WFH'
      | 'ON_LEAVE'
      | 'ON_WFH'
      | 'ON_VISIT'
      | 'NOT_DUE_YET'
      | 'PENDING_CHECK_IN';
    statusLabel: string;
    firstCheckInTime: string | null;
    lastCheckOutTime: string | null;
    activeSessionDurationMinutes: number;
    shiftName: string;
    shiftTiming: string;
    leaveTypeColor?: string | null;
    leaveTypeName?: string | null;
  }>;
  exceptions: Array<{
    id: string;
    employeeId: string;
    employeeCode: string;
    employeeName: string;
    exceptionType: string;
    severity: string;
    details: string | null;
    date: string;
  }>;
  upcomingAbsences: Array<{
    id: string;
    employeeId: string;
    employeeCode: string;
    employeeName: string;
    leaveTypeName: string;
    leaveTypeColor: string | null;
    startDate: string;
    endDate: string;
    chargeableDays: number;
    reason: string;
  }>;
}

export default function TeamManagerPage() {
  // Top-level View Navigation
  const [activeTab, setActiveTab] = useState<'overview' | 'directory' | 'reports'>('overview');

  // Check URL query param for tab deeplinking
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam === 'reports') {
        setActiveTab('reports');
      } else if (tabParam === 'directory') {
        setActiveTab('directory');
      }
    }
  }, []);

  // Overview Dashboard State
  const [data, setData] = useState<ManagerDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetDate, setTargetDate] = useState<string>('');
  const [filterMode, setFilterMode] = useState<
    'ALL' | 'CHECKED_IN' | 'NOT_CHECKED_IN' | 'ABSENT' | 'REMOTE'
  >('ALL');

  // Directory State
  const [dirSearch, setDirSearch] = useState<string>('');
  const [dirDepartment, setDirDepartment] = useState<string>('');
  const [dirBranch, setDirBranch] = useState<string>('');
  const [dirWorkMode, setDirWorkMode] = useState<string>('');
  const [dirSortBy, setDirSortBy] = useState<string>('displayName');
  const [dirSortOrder, setDirSortOrder] = useState<'asc' | 'desc'>('asc');
  const [dirPage, setDirPage] = useState<number>(1);
  const [dirLimit, setDirLimit] = useState<number>(10);
  const [dirData, setDirData] = useState<any>(null);
  const [dirLoading, setDirLoading] = useState<boolean>(false);

  // Selected Member for Detail Modal
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  // Fetch Manager Dashboard Overview
  const fetchDashboard = useCallback(
    async (isManualRefresh = false) => {
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const res = await managerApi.getDashboardOverview({
          targetDate: targetDate || undefined,
        });

        if (res.data) {
          setData(res.data);
        } else {
          setError(res.message || 'Failed to load manager dashboard.');
        }
      } catch (err: any) {
        setError(err.message || 'An unexpected network error occurred.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [targetDate],
  );

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Fetch Team Directory
  const fetchDirectory = useCallback(async () => {
    setDirLoading(true);
    try {
      const res = await managerApi.getTeamDirectory({
        search: dirSearch || undefined,
        departmentId: dirDepartment || undefined,
        branchId: dirBranch || undefined,
        workMode: dirWorkMode || undefined,
        sortBy: dirSortBy,
        sortOrder: dirSortOrder,
        page: dirPage,
        limit: dirLimit,
      });
      if (res.data) {
        setDirData(res.data);
      }
    } catch (err: any) {
      console.error('Failed to load team directory:', err);
    } finally {
      setDirLoading(false);
    }
  }, [
    dirSearch,
    dirDepartment,
    dirBranch,
    dirWorkMode,
    dirSortBy,
    dirSortOrder,
    dirPage,
    dirLimit,
  ]);

  useEffect(() => {
    if (activeTab === 'directory') {
      fetchDirectory();
    }
  }, [activeTab, fetchDirectory]);

  const filteredRoster = (data?.roster || []).filter((emp) => {
    if (filterMode === 'CHECKED_IN') {
      return emp.status === 'PRESENT_OFFICE' || emp.status === 'PRESENT_WFH';
    }
    if (filterMode === 'NOT_CHECKED_IN') {
      return emp.status === 'PENDING_CHECK_IN' || emp.status === 'NOT_DUE_YET';
    }
    if (filterMode === 'ABSENT') {
      return emp.status === 'ON_LEAVE' || emp.status === 'ON_VISIT';
    }
    if (filterMode === 'REMOTE') {
      return emp.status === 'PRESENT_WFH' || emp.status === 'ON_WFH';
    }
    return true;
  });

  const formatDuration = (mins: number) => {
    if (!mins || mins <= 0) return '-';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const getStatusBadge = (emp: (typeof filteredRoster)[0]) => {
    switch (emp.status) {
      case 'PRESENT_OFFICE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Office (Present)
          </span>
        );
      case 'PRESENT_WFH':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-50 text-cyan-800 border border-cyan-200">
            <Home className="h-3 w-3 text-cyan-600" />
            WFH (Active)
          </span>
        );
      case 'ON_LEAVE':
        return (
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border"
            style={{
              backgroundColor: emp.leaveTypeColor ? `${emp.leaveTypeColor}15` : '#fef3c7',
              borderColor: emp.leaveTypeColor ? `${emp.leaveTypeColor}40` : '#fde68a',
              color: emp.leaveTypeColor || '#92400e',
            }}
          >
            <CalendarCheck className="h-3 w-3" />
            {emp.statusLabel}
          </span>
        );
      case 'ON_WFH':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200">
            <Home className="h-3 w-3 text-indigo-500" />
            Scheduled Remote
          </span>
        );
      case 'ON_VISIT':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-300">
            <MapPin className="h-3 w-3 text-amber-600" />
            Official Duty
          </span>
        );
      case 'NOT_DUE_YET':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-stone-100 text-stone-700 border border-stone-200">
            <Hourglass className="h-3 w-3 text-stone-500" />
            {emp.statusLabel}
          </span>
        );
      case 'PENDING_CHECK_IN':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            Not Checked In
          </span>
        );
    }
  };

  const getAvailabilityBadge = (av: any) => {
    if (!av) return <Badge variant="default">Offline</Badge>;
    switch (av.status) {
      case 'PRESENT_OFFICE':
        return (
          <Badge variant="success" size="sm" className="gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Office (Present)
          </Badge>
        );
      case 'PRESENT_WFH':
        return (
          <Badge variant="info" size="sm" className="gap-1">
            <Home className="w-3 h-3 text-cyan-600" />
            WFH (Active)
          </Badge>
        );
      case 'ON_LEAVE':
        return (
          <Badge variant="purple" size="sm" className="gap-1">
            <CalendarCheck className="w-3 h-3" />
            {av.statusLabel}
          </Badge>
        );
      case 'ON_WFH':
        return (
          <Badge variant="info" size="sm" className="gap-1">
            <Home className="w-3 h-3 text-indigo-500" />
            Remote (Scheduled)
          </Badge>
        );
      case 'ON_VISIT':
        return (
          <Badge variant="primary" size="sm" className="gap-1">
            <MapPin className="w-3 h-3" />
            Official Duty
          </Badge>
        );
      case 'NOT_DUE_YET':
        return (
          <Badge variant="default" size="sm" className="gap-1">
            <Hourglass className="w-3 h-3" />
            Shift Not Due
          </Badge>
        );
      case 'PENDING_CHECK_IN':
      default:
        return (
          <Badge variant="warning" size="sm" className="gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
            Not Checked In
          </Badge>
        );
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header with Title, Navigation Tabs & Date Filter */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-stone-200/80">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-bold text-stone-900 tracking-tight">
                Manager Portal & Team Workspace
              </h1>
              {data?.manager && (
                <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-900 border border-amber-300">
                  {data.manager.displayName}
                </span>
              )}
            </div>
            <p className="text-xs md:text-sm text-stone-500 mt-1">
              Live team headcount, shift schedules, presence monitoring, directory, and approvals.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Primary View Tabs */}
            <div className="flex items-center bg-stone-100 p-1 rounded-xl border border-stone-200">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'overview'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-500 hover:text-stone-900'
                }`}
              >
                Dashboard Overview
              </button>
              <button
                onClick={() => setActiveTab('directory')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'directory'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-500 hover:text-stone-900'
                }`}
              >
                Team Directory
              </button>
              <button
                onClick={() => setActiveTab('reports')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'reports'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-500 hover:text-stone-900'
                }`}
              >
                Team Reports
              </button>
            </div>

            {/* Date filter & Refresh (only on overview tab) */}
            {activeTab === 'overview' && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 bg-white border border-stone-300 rounded-lg px-2.5 py-1 shadow-xs">
                  <CalendarDays className="h-4 w-4 text-stone-400" />
                  <input
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="text-xs text-stone-800 bg-transparent border-0 focus:outline-none"
                    title="Filter by calculation date"
                  />
                  {targetDate && (
                    <button
                      onClick={() => setTargetDate('')}
                      className="text-[10px] text-stone-400 hover:text-stone-700 font-semibold"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchDashboard(true)}
                  disabled={loading || refreshing}
                  className="flex items-center gap-1.5 border-stone-300 hover:bg-stone-50 text-stone-700"
                >
                  <RotateCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">Refresh</span>
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Global Error Banner */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold">Access Restriction or Data Error</h3>
              <p className="text-xs mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 1: DASHBOARD OVERVIEW                                                */}
        {/* ========================================================================= */}
        {activeTab === 'overview' && (
          <>
            {/* 6 High-Impact Operational KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
              <KPICard
                title="Team Headcount"
                value={loading ? '...' : (data?.metrics.teamHeadcount ?? 0)}
                description="Active team members"
                icon={<Users className="h-5 w-5 text-amber-800" />}
                className="bg-white border-stone-200/80 shadow-xs"
              />
              <Link href="/attendance" className="block focus:outline-none">
                <KPICard
                  title="Present Today"
                  value={loading ? '...' : (data?.metrics.presentCheckedIn ?? 0)}
                  description="Checked-in & working"
                  icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                  className="bg-white border-stone-200/80 shadow-xs hover:border-emerald-300 transition-colors"
                />
              </Link>
              <KPICard
                title="Shift Not Due"
                value={loading ? '...' : (data?.metrics.notDueYet ?? 0)}
                description="Upcoming shifts"
                icon={<Hourglass className="h-5 w-5 text-stone-500" />}
                className="bg-white border-stone-200/80 shadow-xs"
              />
              <KPICard
                title="Pending Punch"
                value={loading ? '...' : (data?.metrics.pendingCheckIn ?? 0)}
                description="Shift started, no check-in"
                icon={<Clock className="h-5 w-5 text-rose-600" />}
                className="bg-white border-stone-200/80 shadow-xs"
              />
              <Link href="/leave" className="block focus:outline-none">
                <KPICard
                  title="Approved Absences"
                  value={
                    loading
                      ? '...'
                      : (data?.metrics.onApprovedLeave ?? 0) +
                        (data?.metrics.onApprovedWfh ?? 0) +
                        (data?.metrics.onOfficialVisit ?? 0)
                  }
                  description="Leave, WFH, & Visit"
                  icon={<CalendarCheck className="h-5 w-5 text-amber-600" />}
                  className="bg-white border-stone-200/80 shadow-xs hover:border-amber-300 transition-colors"
                />
              </Link>
              <Link href="/leave" className="block focus:outline-none">
                <KPICard
                  title="Pending Approvals"
                  value={loading ? '...' : (data?.metrics.pendingApprovalsTotal ?? 0)}
                  description="Awaiting your review"
                  icon={<AlertTriangle className="h-5 w-5 text-amber-600" />}
                  className="bg-amber-50/50 border-amber-200 shadow-xs hover:border-amber-400 transition-colors"
                />
              </Link>
            </div>

            {/* Exceptions Banner if any open exceptions exist */}
            {!loading && (data?.exceptions || []).length > 0 && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 flex items-start justify-between gap-3 shadow-xs">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-700 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-amber-900">
                      Action Required: {data?.exceptions.length} Attendance Exception(s)
                    </h3>
                    <p className="text-xs text-amber-800 mt-0.5">
                      Your team members have unhandled attendance anomalies today (late check-ins,
                      missing punches, or outside geofence events) awaiting review.
                    </p>
                  </div>
                </div>
                <Link
                  href="/attendance"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-900 text-white text-xs font-semibold hover:bg-amber-950 transition-colors flex-shrink-0"
                >
                  Resolve Exceptions
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}

            {/* Two-Column Section: Today Roster Table (Left) + Actions & Upcoming (Right) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Today's Team Presence Roster */}
              <div className="lg:col-span-2 space-y-4">
                <Card className="border-stone-200/80 shadow-xs overflow-hidden">
                  <CardHeader className="pb-3 border-b border-stone-150 flex flex-row items-center justify-between gap-2 flex-wrap">
                    <div>
                      <CardTitle className="text-base font-bold text-stone-900 flex items-center gap-2">
                        <Users className="h-4 w-4 text-amber-800" />
                        Today's Team Presence Roster
                      </CardTitle>
                      <CardDescription className="text-xs text-stone-500">
                        Real-time attendance status and shift timing across your reporting
                        subordinates.
                      </CardDescription>
                    </div>

                    {/* Filter Pills */}
                    <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-lg">
                      <button
                        onClick={() => setFilterMode('ALL')}
                        className={`px-2 py-0.5 rounded text-xs font-semibold transition-colors ${
                          filterMode === 'ALL'
                            ? 'bg-white text-stone-900 shadow-xs'
                            : 'text-stone-600 hover:text-stone-900'
                        }`}
                      >
                        All ({data?.roster?.length || 0})
                      </button>
                      <button
                        onClick={() => setFilterMode('CHECKED_IN')}
                        className={`px-2 py-0.5 rounded text-xs font-semibold transition-colors ${
                          filterMode === 'CHECKED_IN'
                            ? 'bg-white text-stone-900 shadow-xs'
                            : 'text-stone-600 hover:text-stone-900'
                        }`}
                      >
                        Present ({data?.metrics.presentCheckedIn || 0})
                      </button>
                      <button
                        onClick={() => setFilterMode('NOT_CHECKED_IN')}
                        className={`px-2 py-0.5 rounded text-xs font-semibold transition-colors ${
                          filterMode === 'NOT_CHECKED_IN'
                            ? 'bg-white text-stone-900 shadow-xs'
                            : 'text-stone-600 hover:text-stone-900'
                        }`}
                      >
                        Not In (
                        {(data?.metrics.pendingCheckIn || 0) + (data?.metrics.notDueYet || 0)})
                      </button>
                      <button
                        onClick={() => setFilterMode('ABSENT')}
                        className={`px-2 py-0.5 rounded text-xs font-semibold transition-colors ${
                          filterMode === 'ABSENT'
                            ? 'bg-white text-stone-900 shadow-xs'
                            : 'text-stone-600 hover:text-stone-900'
                        }`}
                      >
                        Absences (
                        {(data?.metrics.onApprovedLeave || 0) +
                          (data?.metrics.onOfficialVisit || 0)}
                        )
                      </button>
                    </div>
                  </CardHeader>

                  <CardContent className="p-0">
                    {loading ? (
                      <div className="py-12 flex flex-col items-center justify-center gap-2 text-stone-400">
                        <RotateCw className="h-6 w-6 animate-spin text-amber-700" />
                        <p className="text-xs font-medium">Loading live team presence...</p>
                      </div>
                    ) : filteredRoster.length === 0 ? (
                      <div className="py-12 text-center text-stone-500">
                        <Users className="h-8 w-8 text-stone-300 mx-auto mb-2" />
                        <p className="text-sm font-semibold">No team members match this filter.</p>
                        <p className="text-xs text-stone-400 mt-0.5">
                          Try switching to "All" to view your full reporting hierarchy.
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-stone-50 text-stone-500 uppercase tracking-wider text-[11px] border-b border-stone-200">
                            <tr>
                              <th className="px-4 py-3 font-semibold">Team Member</th>
                              <th className="px-3 py-3 font-semibold">Shift Timing</th>
                              <th className="px-3 py-3 font-semibold">Status</th>
                              <th className="px-3 py-3 font-semibold">Punches & Duration</th>
                              <th className="px-3 py-3 font-semibold text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-100">
                            {filteredRoster.map((emp) => (
                              <tr key={emp.id} className="hover:bg-stone-50/60 transition-colors">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-3">
                                    <Avatar
                                      src={emp.profilePhoto}
                                      name={emp.displayName}
                                      size="sm"
                                      className="bg-amber-900 text-white font-bold text-xs"
                                    />
                                    <div className="min-w-0">
                                      <p className="font-semibold text-stone-900 truncate">
                                        {emp.displayName}
                                      </p>
                                      <p className="text-[11px] text-stone-500 truncate">
                                        {emp.employeeCode} &bull; {emp.designation}
                                      </p>
                                    </div>
                                  </div>
                                </td>

                                <td className="px-3 py-3">
                                  <p className="font-medium text-stone-800">{emp.shiftName}</p>
                                  <p className="text-[11px] text-stone-500">{emp.shiftTiming}</p>
                                </td>

                                <td className="px-3 py-3">{getStatusBadge(emp)}</td>

                                <td className="px-3 py-3 text-stone-600">
                                  {emp.firstCheckInTime ? (
                                    <div>
                                      <span className="font-medium text-stone-900">
                                        {emp.firstCheckInTime}
                                      </span>
                                      {emp.lastCheckOutTime && (
                                        <span className="text-stone-400">
                                          {' '}
                                          - {emp.lastCheckOutTime}
                                        </span>
                                      )}
                                      <p className="text-[10px] text-stone-500">
                                        Worked: {formatDuration(emp.activeSessionDurationMinutes)}
                                      </p>
                                    </div>
                                  ) : (
                                    <span className="text-stone-400 italic">No punch yet</span>
                                  )}
                                </td>

                                <td className="px-3 py-3 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      onClick={() => setSelectedMemberId(emp.id)}
                                      className="p-1 rounded hover:bg-stone-100 text-stone-600 hover:text-amber-800 transition-colors"
                                      title="View Detailed Profile"
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                    </button>
                                    {emp.workEmail && (
                                      <a
                                        href={`mailto:${emp.workEmail}`}
                                        className="p-1 rounded hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors"
                                        title={`Email ${emp.displayName}`}
                                      >
                                        <Mail className="h-3.5 w-3.5" />
                                      </a>
                                    )}
                                    {emp.workPhone && (
                                      <a
                                        href={`tel:${emp.workPhone}`}
                                        className="p-1 rounded hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors"
                                        title={`Call ${emp.displayName}`}
                                      >
                                        <Phone className="h-3.5 w-3.5" />
                                      </a>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Right Column: Pending Approvals Queue & Upcoming Absences */}
              <div className="space-y-6">
                {/* Pending Approvals Breakdown Card */}
                <Card className="border-stone-200/80 shadow-xs">
                  <CardHeader className="pb-3 border-b border-stone-150">
                    <CardTitle className="text-sm font-bold text-stone-900 flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <FileCheck2 className="h-4 w-4 text-amber-800" />
                        Pending Approvals Queue
                      </span>
                      <Badge variant="warning" size="sm">
                        {data?.metrics.pendingApprovalsTotal ?? 0} Awaiting
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs text-stone-500">
                      Requests submitted by your team awaiting decision.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-3.5 space-y-2">
                    <Link
                      href="/leave"
                      className="p-2.5 rounded-lg bg-stone-50 hover:bg-amber-50/70 border border-stone-200/70 flex items-center justify-between transition-colors group"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-md bg-amber-100 text-amber-800">
                          <CalendarCheck className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-stone-900">Leave Requests</p>
                          <p className="text-[10px] text-stone-500">Paid, sick, & casual leaves</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant={(data?.pendingBreakdown.leaves ?? 0) > 0 ? 'warning' : 'outline'}
                          size="sm"
                        >
                          {data?.pendingBreakdown.leaves ?? 0}
                        </Badge>
                        <ArrowRight className="h-3.5 w-3.5 text-stone-400 group-hover:text-amber-700 transition-colors" />
                      </div>
                    </Link>

                    <Link
                      href="/wfh"
                      className="p-2.5 rounded-lg bg-stone-50 hover:bg-cyan-50/70 border border-stone-200/70 flex items-center justify-between transition-colors group"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-md bg-cyan-100 text-cyan-800">
                          <Home className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-stone-900">Work From Home</p>
                          <p className="text-[10px] text-stone-500">Remote attendance requests</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant={(data?.pendingBreakdown.wfh ?? 0) > 0 ? 'warning' : 'outline'}
                          size="sm"
                        >
                          {data?.pendingBreakdown.wfh ?? 0}
                        </Badge>
                        <ArrowRight className="h-3.5 w-3.5 text-stone-400 group-hover:text-cyan-700 transition-colors" />
                      </div>
                    </Link>

                    <Link
                      href="/visits"
                      className="p-2.5 rounded-lg bg-stone-50 hover:bg-amber-50/70 border border-stone-200/70 flex items-center justify-between transition-colors group"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-md bg-amber-100 text-amber-900">
                          <MapPin className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-stone-900">
                            Official Duty Visits
                          </p>
                          <p className="text-[10px] text-stone-500">Client and off-site visits</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant={(data?.pendingBreakdown.visits ?? 0) > 0 ? 'warning' : 'outline'}
                          size="sm"
                        >
                          {data?.pendingBreakdown.visits ?? 0}
                        </Badge>
                        <ArrowRight className="h-3.5 w-3.5 text-stone-400 group-hover:text-amber-800 transition-colors" />
                      </div>
                    </Link>

                    <Link
                      href="/attendance"
                      className="p-2.5 rounded-lg bg-stone-50 hover:bg-emerald-50/70 border border-stone-200/70 flex items-center justify-between transition-colors group"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-md bg-emerald-100 text-emerald-800">
                          <Clock className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-stone-900">
                            Attendance Corrections
                          </p>
                          <p className="text-[10px] text-stone-500">Missed punches & adjustments</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Badge
                          variant={
                            (data?.pendingBreakdown.corrections ?? 0) > 0 ? 'warning' : 'outline'
                          }
                          size="sm"
                        >
                          {data?.pendingBreakdown.corrections ?? 0}
                        </Badge>
                        <ArrowRight className="h-3.5 w-3.5 text-stone-400 group-hover:text-emerald-700 transition-colors" />
                      </div>
                    </Link>
                  </CardContent>
                </Card>

                {/* Upcoming Absences Card (Next 7 Days) */}
                <Card className="border-stone-200/80 shadow-xs">
                  <CardHeader className="pb-3 border-b border-stone-150">
                    <CardTitle className="text-sm font-bold text-stone-900 flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-stone-700" />
                      Upcoming Absences (Next 7 Days)
                    </CardTitle>
                    <CardDescription className="text-xs text-stone-500">
                      Approved leaves scheduled across your team.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-3.5">
                    {loading ? (
                      <p className="text-xs text-stone-400 py-3 text-center">Loading schedule...</p>
                    ) : (data?.upcomingAbsences || []).length === 0 ? (
                      <p className="text-xs text-stone-500 py-4 text-center">
                        No approved upcoming absences in the next 7 days. Full team availability
                        expected.
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {data?.upcomingAbsences.map((ab) => (
                          <div
                            key={ab.id}
                            className="p-2.5 rounded-lg bg-stone-50 border border-stone-200/70 flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-stone-900 truncate">
                                {ab.employeeName}
                              </p>
                              <p className="text-[10px] text-stone-500 mt-0.5">
                                {new Date(ab.startDate).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                })}{' '}
                                -{' '}
                                {new Date(ab.endDate).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <span
                                className="inline-block px-2 py-0.5 rounded text-[10px] font-bold border"
                                style={{
                                  backgroundColor: ab.leaveTypeColor
                                    ? `${ab.leaveTypeColor}15`
                                    : '#fef3c7',
                                  borderColor: ab.leaveTypeColor
                                    ? `${ab.leaveTypeColor}40`
                                    : '#fde68a',
                                  color: ab.leaveTypeColor || '#92400e',
                                }}
                              >
                                {ab.leaveTypeName}
                              </span>
                              <p className="text-[10px] font-medium text-stone-600 mt-0.5">
                                {ab.chargeableDays} {ab.chargeableDays === 1 ? 'day' : 'days'}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: TEAM DIRECTORY                                                    */}
        {/* ========================================================================= */}
        {activeTab === 'directory' && (
          <div className="space-y-4">
            {/* Filter and Search Bar */}
            <Card className="border-stone-200/80 shadow-xs">
              <CardContent className="p-4">
                <div className="flex flex-col md:flex-row items-center gap-3">
                  {/* Search Input */}
                  <div className="relative flex-1 w-full">
                    <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search by name, employee code, designation, email..."
                      value={dirSearch}
                      onChange={(e) => {
                        setDirSearch(e.target.value);
                        setDirPage(1);
                      }}
                      className="w-full pl-9 pr-4 py-2 text-xs border border-stone-300 rounded-lg bg-stone-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                    />
                    {dirSearch && (
                      <button
                        onClick={() => {
                          setDirSearch('');
                          setDirPage(1);
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-stone-400 hover:text-stone-600"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Dropdowns */}
                  <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
                    {/* Department */}
                    <select
                      value={dirDepartment}
                      onChange={(e) => {
                        setDirDepartment(e.target.value);
                        setDirPage(1);
                      }}
                      className="text-xs border border-stone-300 rounded-lg px-2.5 py-2 bg-white text-stone-700 focus:outline-none"
                    >
                      <option value="">All Departments</option>
                      {(dirData?.meta?.departments || []).map((d: any) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>

                    {/* Branch */}
                    <select
                      value={dirBranch}
                      onChange={(e) => {
                        setDirBranch(e.target.value);
                        setDirPage(1);
                      }}
                      className="text-xs border border-stone-300 rounded-lg px-2.5 py-2 bg-white text-stone-700 focus:outline-none"
                    >
                      <option value="">All Branches</option>
                      {(dirData?.meta?.branches || []).map((b: any) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>

                    {/* Work Mode */}
                    <select
                      value={dirWorkMode}
                      onChange={(e) => {
                        setDirWorkMode(e.target.value);
                        setDirPage(1);
                      }}
                      className="text-xs border border-stone-300 rounded-lg px-2.5 py-2 bg-white text-stone-700 focus:outline-none"
                    >
                      <option value="">All Work Modes</option>
                      <option value="OFFICE">Office</option>
                      <option value="REMOTE">Remote</option>
                      <option value="HYBRID">Hybrid</option>
                    </select>

                    {/* Sort By */}
                    <select
                      value={`${dirSortBy}-${dirSortOrder}`}
                      onChange={(e) => {
                        const [by, order] = e.target.value.split('-');
                        setDirSortBy(by);
                        setDirSortOrder(order as any);
                        setDirPage(1);
                      }}
                      className="text-xs border border-stone-300 rounded-lg px-2.5 py-2 bg-white text-stone-700 focus:outline-none font-medium"
                    >
                      <option value="displayName-asc">Name (A &rarr; Z)</option>
                      <option value="displayName-desc">Name (Z &rarr; A)</option>
                      <option value="employeeCode-asc">Employee Code</option>
                      <option value="joiningDate-desc">Recently Joined</option>
                      <option value="department-asc">Department</option>
                    </select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Team Directory Table */}
            <Card className="border-stone-200/80 shadow-xs overflow-hidden">
              <CardContent className="p-0">
                {dirLoading ? (
                  <div className="py-16 flex flex-col items-center justify-center gap-2 text-stone-400">
                    <RotateCw className="h-6 w-6 animate-spin text-amber-700" />
                    <p className="text-xs font-medium">Loading team directory...</p>
                  </div>
                ) : !dirData?.items || dirData.items.length === 0 ? (
                  <div className="py-16 text-center text-stone-500">
                    <Users className="h-10 w-10 text-stone-300 mx-auto mb-2" />
                    <p className="text-sm font-semibold">No team members found.</p>
                    <p className="text-xs text-stone-400 mt-1 max-w-sm mx-auto">
                      No subordinates matched your search or filters within your reporting
                      hierarchy.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-stone-50 text-stone-500 uppercase tracking-wider text-[11px] border-b border-stone-200">
                        <tr>
                          <th className="px-5 py-3 font-semibold">Team Member</th>
                          <th className="px-4 py-3 font-semibold">Department & Branch</th>
                          <th className="px-4 py-3 font-semibold">Reporting Manager</th>
                          <th className="px-4 py-3 font-semibold">Today's Availability</th>
                          <th className="px-4 py-3 font-semibold text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {dirData.items.map((emp: any) => (
                          <tr key={emp.id} className="hover:bg-stone-50/70 transition-colors">
                            {/* Member Identity */}
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-3">
                                <Avatar
                                  src={emp.profilePhoto}
                                  name={emp.displayName}
                                  size="md"
                                  className="bg-gradient-to-tr from-amber-700 to-amber-900 text-white font-bold"
                                />
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-stone-900">
                                      {emp.displayName}
                                    </span>
                                    <Badge
                                      variant="outline"
                                      size="sm"
                                      className="font-mono text-[10px]"
                                    >
                                      {emp.employeeCode}
                                    </Badge>
                                  </div>
                                  <p className="text-[11px] text-stone-600 mt-0.5">
                                    {emp.designation}
                                  </p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[10px] text-stone-400">
                                      Joined: {new Date(emp.joiningDate).toLocaleDateString()}
                                    </span>
                                    <Badge
                                      variant="primary"
                                      size="sm"
                                      className="text-[10px] py-0 px-1.5"
                                    >
                                      {emp.workMode}
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Department & Branch */}
                            <td className="px-4 py-3.5 text-stone-700">
                              <div className="font-medium text-stone-900 flex items-center gap-1.5">
                                <Building2 className="w-3.5 h-3.5 text-stone-400" />
                                {emp.department}
                              </div>
                              <div className="text-[11px] text-stone-500 mt-0.5 flex items-center gap-1.5">
                                <MapPin className="w-3 h-3 text-stone-400" />
                                {emp.branch}
                              </div>
                            </td>

                            {/* Reporting Manager */}
                            <td className="px-4 py-3.5 text-stone-600">
                              {emp.reportingManager ? (
                                <div>
                                  <span className="font-medium text-stone-800">
                                    {emp.reportingManager.displayName}
                                  </span>
                                  <span className="text-[10px] text-stone-400 block font-mono">
                                    {emp.reportingManager.employeeCode}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-stone-400 italic">Direct Report</span>
                              )}
                            </td>

                            {/* Today's Availability */}
                            <td className="px-4 py-3.5">
                              <div className="space-y-1">
                                <div>{getAvailabilityBadge(emp.availability)}</div>
                                <div className="text-[10px] text-stone-500">
                                  {emp.availability?.shiftName} ({emp.availability?.shiftTiming})
                                </div>
                              </div>
                            </td>

                            {/* Actions */}
                            <td className="px-4 py-3.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSelectedMemberId(emp.id)}
                                  className="text-xs flex items-center gap-1 border-stone-200 hover:border-amber-400 hover:bg-amber-50/50"
                                >
                                  <Eye className="w-3.5 h-3.5 text-amber-700" />
                                  View Profile
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Server-side Pagination Bar */}
                {dirData?.pagination && dirData.pagination.total > 0 && (
                  <div className="px-5 py-3 bg-stone-50 border-t border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-stone-600">
                    <div>
                      Showing{' '}
                      <span className="font-semibold text-stone-900">
                        {(dirData.pagination.page - 1) * dirData.pagination.limit + 1}
                      </span>{' '}
                      to{' '}
                      <span className="font-semibold text-stone-900">
                        {Math.min(
                          dirData.pagination.page * dirData.pagination.limit,
                          dirData.pagination.total,
                        )}
                      </span>{' '}
                      of{' '}
                      <span className="font-semibold text-stone-900">
                        {dirData.pagination.total}
                      </span>{' '}
                      team members
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={dirData.pagination.page <= 1 || dirLoading}
                        onClick={() => setDirPage((p) => Math.max(1, p - 1))}
                        className="text-xs flex items-center gap-1 px-2.5 py-1"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                        Previous
                      </Button>

                      <span className="text-xs px-2 font-medium">
                        Page {dirData.pagination.page} of {dirData.pagination.totalPages || 1}
                      </span>

                      <Button
                        variant="outline"
                        size="sm"
                        disabled={
                          dirData.pagination.page >= dirData.pagination.totalPages || dirLoading
                        }
                        onClick={() => setDirPage((p) => p + 1)}
                        className="text-xs flex items-center gap-1 px-2.5 py-1"
                      >
                        Next
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Privacy Guarantee Footer */}
            <div className="p-3 bg-stone-100 border border-stone-200 rounded-lg flex items-center gap-2 text-xs text-stone-600">
              <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>
                <strong>Confidentiality Notice:</strong> The directory shows only members within
                your authorized supervisory reporting hierarchy. Sensitive personal medical records,
                identity documents, and compensation details are strictly restricted.
              </span>
            </div>
          </div>
        )}

        {/* Team Reports Tab */}
        {activeTab === 'reports' && <TeamReportsView />}
      </div>

      {/* Authorized Member Detail Modal */}
      <TeamMemberDetailModal
        employeeId={selectedMemberId}
        isOpen={!!selectedMemberId}
        onClose={() => setSelectedMemberId(null)}
      />
    </AppShell>
  );
}
