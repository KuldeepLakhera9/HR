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
} from 'lucide-react';
import { managerApi } from '../../lib/api-client';

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
    details: any;
    date: string;
    createdAt: string;
  }>;
  upcomingAbsences: Array<{
    id: string;
    employeeId: string;
    employeeCode: string;
    employeeName: string;
    leaveTypeName: string;
    leaveTypeColor?: string | null;
    startDate: string;
    endDate: string;
    chargeableDays: number;
    reason: string;
  }>;
}

export default function TeamPage() {
  const [data, setData] = useState<ManagerDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetDate, setTargetDate] = useState<string>('');
  const [filterMode, setFilterMode] = useState<
    'ALL' | 'CHECKED_IN' | 'NOT_CHECKED_IN' | 'ABSENT' | 'REMOTE'
  >('ALL');

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

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header with Title, Date Filter & Live Refresh */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-stone-200/80">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-bold text-stone-900 tracking-tight">
                Manager Portal & Team Overview
              </h1>
              {data?.manager && (
                <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-900 border border-amber-300">
                  {data.manager.displayName}
                </span>
              )}
            </div>
            <p className="text-xs md:text-sm text-stone-500 mt-1">
              Live team headcount, shift schedules, presence monitoring, and actionable approval
              queues.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-1.5 bg-white border border-stone-300 rounded-lg px-2.5 py-1 shadow-sm">
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
        </div>

        {/* Error State */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs font-semibold">Failed to load team data</p>
              <p className="text-xs text-rose-700 mt-0.5">{error}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => fetchDashboard(true)}
              className="text-xs"
            >
              Retry
            </Button>
          </div>
        )}

        {/* Actionable Exceptions Alert Banner */}
        {data && data.metrics.actionableExceptionsCount > 0 && (
          <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-300/80 flex items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-800">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-semibold text-amber-950">
                  {data.metrics.actionableExceptionsCount} Attendance Exception(s) Require Manager
                  Review
                </p>
                <p className="text-[11px] text-amber-800/80">
                  Late arrivals, missing punches, or outside-geofence attempts flagged today.
                </p>
              </div>
            </div>
            <Link
              href="/attendance"
              className="text-xs font-semibold text-amber-900 hover:text-amber-950 hover:underline flex items-center gap-1"
            >
              Resolve in Attendance Hub <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}

        {/* KPI Cards Row (6 Cards linked to filtered views) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
          <KPICard
            title="Team Headcount"
            value={loading ? '-' : String(data?.metrics.teamHeadcount || 0)}
            description="Active reports"
            icon={<Users className="h-4 w-4 text-stone-700" />}
          />
          <Link href="/attendance" className="block transition-transform hover:-translate-y-0.5">
            <KPICard
              title="Present Today"
              value={loading ? '-' : String(data?.metrics.presentCheckedIn || 0)}
              description="Checked-in & on duty"
              icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            />
          </Link>
          <KPICard
            title="Shift Not Due"
            value={loading ? '-' : String(data?.metrics.notDueYet || 0)}
            description="Shift not yet started"
            icon={<Hourglass className="h-4 w-4 text-sky-600" />}
          />
          <KPICard
            title="Pending Punch"
            value={loading ? '-' : String(data?.metrics.pendingCheckIn || 0)}
            description="Overdue check-in"
            icon={<Clock className="h-4 w-4 text-rose-600" />}
          />
          <Link href="/leave" className="block transition-transform hover:-translate-y-0.5">
            <KPICard
              title="Approved Absences"
              value={
                loading
                  ? '-'
                  : String(
                      (data?.metrics.onApprovedLeave || 0) +
                        (data?.metrics.onApprovedWfh || 0) +
                        (data?.metrics.onOfficialVisit || 0),
                    )
              }
              description="Leave, WFH & Visits"
              icon={<CalendarCheck className="h-4 w-4 text-amber-700" />}
            />
          </Link>
          <Link href="/leave" className="block transition-transform hover:-translate-y-0.5">
            <KPICard
              title="Pending Approvals"
              value={loading ? '-' : String(data?.metrics.pendingApprovalsTotal || 0)}
              description="Action required"
              icon={<FileCheck2 className="h-4 w-4 text-purple-700" />}
            />
          </Link>
        </div>

        {/* Main 2-Column Section: Presence Roster & Approval / Upcoming Panels */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column (2 Cols): Team Presence Roster */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="border-stone-200/80 shadow-xs">
              <CardHeader className="pb-3 border-b border-stone-150">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base font-bold text-stone-900">
                      Team Presence & Shift Status
                    </CardTitle>
                    <CardDescription className="text-xs text-stone-500">
                      Real-time shift schedules, check-in timestamps, and today&apos;s active work
                      sessions.
                    </CardDescription>
                  </div>

                  {/* Filter Pills */}
                  <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                    <button
                      onClick={() => setFilterMode('ALL')}
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors ${
                        filterMode === 'ALL'
                          ? 'bg-stone-900 text-white'
                          : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                      }`}
                    >
                      All ({data?.roster.length || 0})
                    </button>
                    <button
                      onClick={() => setFilterMode('CHECKED_IN')}
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors ${
                        filterMode === 'CHECKED_IN'
                          ? 'bg-emerald-800 text-white'
                          : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                      }`}
                    >
                      Present ({data?.metrics.presentCheckedIn || 0})
                    </button>
                    <button
                      onClick={() => setFilterMode('NOT_CHECKED_IN')}
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors ${
                        filterMode === 'NOT_CHECKED_IN'
                          ? 'bg-rose-800 text-white'
                          : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                      }`}
                    >
                      Not In ({data?.metrics.pendingCheckIn || 0})
                    </button>
                    <button
                      onClick={() => setFilterMode('ABSENT')}
                      className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors ${
                        filterMode === 'ABSENT'
                          ? 'bg-amber-800 text-white'
                          : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                      }`}
                    >
                      Absences (
                      {(data?.metrics.onApprovedLeave || 0) + (data?.metrics.onOfficialVisit || 0)})
                    </button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                {loading ? (
                  <div className="p-8 text-center text-xs text-stone-400">
                    <RotateCw className="h-5 w-5 animate-spin mx-auto mb-2 text-amber-600" />
                    Calculating authorized team metrics...
                  </div>
                ) : filteredRoster.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-xs font-semibold text-stone-600">
                      No team members found for this filter
                    </p>
                    <p className="text-[11px] text-stone-400 mt-1">
                      {data?.roster.length === 0
                        ? 'No direct or indirect reporting employees are currently assigned to your team.'
                        : 'Adjust the filter above to view team members.'}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-stone-150">
                    {filteredRoster.map((emp) => (
                      <div
                        key={emp.id}
                        className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-stone-50/60 transition-colors"
                      >
                        {/* Member Identity */}
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar
                            src={emp.profilePhoto || undefined}
                            name={emp.displayName}
                            size="md"
                            className="bg-gradient-to-tr from-amber-600 to-amber-800 text-white font-bold text-xs"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-stone-900 truncate">
                                {emp.displayName}
                              </span>
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-stone-100 text-stone-600 border border-stone-200">
                                {emp.employeeCode}
                              </span>
                            </div>
                            <p className="text-[11px] text-stone-500 truncate mt-0.5">
                              {emp.designation} • {emp.department}
                            </p>
                            <p className="text-[10px] text-stone-400 mt-0.5">
                              Shift: {emp.shiftName} ({emp.shiftTiming})
                            </p>
                          </div>
                        </div>

                        {/* Status & Timing */}
                        <div className="flex flex-wrap sm:flex-col items-start sm:items-end gap-1.5 flex-shrink-0">
                          {getStatusBadge(emp)}
                          <div className="flex items-center gap-3 text-[10px] text-stone-500 mt-1">
                            {emp.firstCheckInTime && (
                              <span>
                                In:{' '}
                                <strong className="text-stone-800">{emp.firstCheckInTime}</strong>
                              </span>
                            )}
                            {emp.lastCheckOutTime && (
                              <span>
                                Out:{' '}
                                <strong className="text-stone-800">{emp.lastCheckOutTime}</strong>
                              </span>
                            )}
                            {emp.activeSessionDurationMinutes > 0 && (
                              <span>
                                Work:{' '}
                                <strong className="text-stone-800">
                                  {formatDuration(emp.activeSessionDurationMinutes)}
                                </strong>
                              </span>
                            )}
                          </div>
                          {/* Contact Shortcuts */}
                          <div className="flex items-center gap-2 mt-0.5">
                            {emp.workEmail && (
                              <a
                                href={`mailto:${emp.workEmail}`}
                                className="text-stone-400 hover:text-stone-700"
                                title={`Email: ${emp.workEmail}`}
                              >
                                <Mail className="h-3 w-3" />
                              </a>
                            )}
                            {emp.workPhone && (
                              <a
                                href={`tel:${emp.workPhone}`}
                                className="text-stone-400 hover:text-stone-700"
                                title={`Phone: ${emp.workPhone}`}
                              >
                                <Phone className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column (1 Col): Pending Approvals Breakdown & Upcoming Absences */}
          <div className="space-y-6">
            {/* Pending Approvals Card */}
            <Card className="border-stone-200/80 shadow-xs">
              <CardHeader className="pb-3 border-b border-stone-150">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold text-stone-900 flex items-center gap-2">
                    <FileCheck2 className="h-4 w-4 text-amber-700" />
                    Pending Approvals Inbox
                  </CardTitle>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                    {data?.pendingBreakdown.total || 0} Total
                  </span>
                </div>
                <CardDescription className="text-xs text-stone-500">
                  Requests submitted by your reporting subordinates.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-3.5 space-y-2">
                <Link
                  href="/leave"
                  className="flex items-center justify-between p-2.5 rounded-lg border border-stone-200 hover:border-amber-400 hover:bg-amber-50/40 transition-all group"
                >
                  <div className="flex items-center gap-2.5">
                    <CalendarCheck className="h-4 w-4 text-amber-700" />
                    <div>
                      <p className="text-xs font-semibold text-stone-900">Leave Requests</p>
                      <p className="text-[10px] text-stone-500">Vacation, sick & casual leave</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-stone-100 group-hover:bg-amber-200 text-stone-800">
                    {data?.pendingBreakdown.leaves || 0}
                  </span>
                </Link>

                <Link
                  href="/wfh"
                  className="flex items-center justify-between p-2.5 rounded-lg border border-stone-200 hover:border-amber-400 hover:bg-amber-50/40 transition-all group"
                >
                  <div className="flex items-center gap-2.5">
                    <Home className="h-4 w-4 text-cyan-700" />
                    <div>
                      <p className="text-xs font-semibold text-stone-900">WFH Requests</p>
                      <p className="text-[10px] text-stone-500">Remote working schedule</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-stone-100 group-hover:bg-cyan-200 text-stone-800">
                    {data?.pendingBreakdown.wfh || 0}
                  </span>
                </Link>

                <Link
                  href="/visits"
                  className="flex items-center justify-between p-2.5 rounded-lg border border-stone-200 hover:border-amber-400 hover:bg-amber-50/40 transition-all group"
                >
                  <div className="flex items-center gap-2.5">
                    <MapPin className="h-4 w-4 text-amber-700" />
                    <div>
                      <p className="text-xs font-semibold text-stone-900">Official Visits</p>
                      <p className="text-[10px] text-stone-500">Field duty & client location</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-stone-100 group-hover:bg-amber-200 text-stone-800">
                    {data?.pendingBreakdown.visits || 0}
                  </span>
                </Link>

                <Link
                  href="/attendance"
                  className="flex items-center justify-between p-2.5 rounded-lg border border-stone-200 hover:border-amber-400 hover:bg-amber-50/40 transition-all group"
                >
                  <div className="flex items-center gap-2.5">
                    <Clock className="h-4 w-4 text-purple-700" />
                    <div>
                      <p className="text-xs font-semibold text-stone-900">Attendance Corrections</p>
                      <p className="text-[10px] text-stone-500">Missed punches & time fixes</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-stone-100 group-hover:bg-purple-200 text-stone-800">
                    {data?.pendingBreakdown.corrections || 0}
                  </span>
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
                              borderColor: ab.leaveTypeColor ? `${ab.leaveTypeColor}40` : '#fde68a',
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
      </div>
    </AppShell>
  );
}
