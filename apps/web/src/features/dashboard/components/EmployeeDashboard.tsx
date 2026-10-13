'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Clock,
  CheckCircle2,
  Calendar,
  Briefcase,
  Bell,
  MapPin,
  LogIn,
  LogOut,
  ChevronRight,
  Smile,
  RefreshCw,
  Home,
  FileText,
  AlertCircle,
  Coffee,
  CalendarDays,
  ShieldCheck,
  Send,
  User,
  ExternalLink,
  Banknote,
} from 'lucide-react';
import { Button, Badge, Card, Skeleton, EmptyState } from '@hrms/ui';
import { employeesApi } from '../../../lib/api-client';
import { EmployeeDashboardResponse } from '@hrms/types';

export const EmployeeDashboard: React.FC = () => {
  const [dashboard, setDashboard] = useState<EmployeeDashboardResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const data = await employeesApi.getMyDashboard();
      setDashboard(data);
    } catch (err: any) {
      setError(
        err?.message ||
          'Failed to load employee dashboard. Please ensure you are logged in with an employee profile.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Format logged minutes to X hrs Y mins
  const formatMinutes = (totalMinutes: number): string => {
    if (!totalMinutes || totalMinutes <= 0) return '0 hrs 0 mins';
    const hrs = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${hrs} hr${hrs === 1 ? '' : 's'} ${mins} min${mins === 1 ? '' : 's'}`;
  };

  // Format ISO time string to 12-hour local time
  const formatTime = (isoString: string | null): string => {
    if (!isoString) return '--:--';
    try {
      return new Date(isoString).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '--:--';
    }
  };

  // Format ISO date string to human readable date
  const formatDate = (isoString: string | null): string => {
    if (!isoString) return '';
    try {
      return new Date(isoString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  // Loading skeleton state
  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Banner Skeleton */}
        <div className="rounded-2xl border border-stone-200/90 bg-white p-6 shadow-xs space-y-4">
          <Skeleton className="h-6 w-48 rounded-full" />
          <Skeleton className="h-8 w-72 rounded-md" />
          <Skeleton className="h-4 w-96 rounded-md" />
        </div>

        {/* Attendance Card Skeleton */}
        <div className="rounded-2xl border border-stone-200/90 bg-white p-6 shadow-xs space-y-4">
          <div className="flex justify-between items-center">
            <Skeleton className="h-12 w-12 rounded-2xl" />
            <Skeleton className="h-10 w-32 rounded-lg" />
          </div>
          <Skeleton className="h-6 w-60 rounded-md" />
          <div className="grid grid-cols-3 gap-4 pt-2">
            <Skeleton className="h-10 rounded-md" />
            <Skeleton className="h-10 rounded-md" />
            <Skeleton className="h-10 rounded-md" />
          </div>
        </div>

        {/* Leave Balances Grid Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>

        {/* Two Column Grid Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
      </div>
    );
  }

  // Error state
  if (error || !dashboard) {
    return (
      <div className="max-w-5xl mx-auto py-12">
        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-8 text-center max-w-lg mx-auto shadow-xs">
          <div className="w-12 h-12 bg-rose-100 text-rose-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-stone-900">Dashboard Unavailable</h2>
          <p className="text-sm text-stone-600 mt-2">{error}</p>
          <div className="mt-6 flex justify-center gap-3">
            <Button
              variant="primary"
              size="sm"
              onClick={() => loadDashboard()}
              leftIcon={<RefreshCw className="h-4 w-4" />}
            >
              Retry
            </Button>
            <Link href="/attendance">
              <Button variant="outline" size="sm">
                Go to Attendance
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const {
    employee,
    attendanceToday,
    leaveBalances,
    pendingRequests,
    upcomingAbsences,
    upcomingHolidays,
    notifications,
  } = dashboard;

  // Determine Attendance Status Presentation
  let attendanceBadgeVariant: 'success' | 'warning' | 'default' | 'outline' = 'default';
  let attendanceStatusText = 'Not Punched Today';
  if (attendanceToday.isCheckedIn) {
    if (attendanceToday.isOnBreak) {
      attendanceBadgeVariant = 'warning';
      attendanceStatusText = 'On Break';
    } else {
      attendanceBadgeVariant = 'success';
      attendanceStatusText = 'Active & Working';
    }
  } else if (attendanceToday.checkOutTime) {
    attendanceBadgeVariant = 'default';
    attendanceStatusText = 'Checked Out';
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* 1. Warm Personal Greeting & Workspace Header */}
      <div className="rounded-2xl border border-stone-200/90 bg-gradient-to-r from-amber-500/10 via-amber-50/40 to-white p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100/90 text-amber-900 mb-2">
              <Smile className="h-3.5 w-3.5 text-amber-700" />
              <span>Good day, {employee.firstName || employee.displayName}!</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900">
              Welcome to your Employee Workspace
            </h1>
            <p className="text-xs sm:text-sm text-stone-600 mt-1 flex flex-wrap items-center gap-2">
              <span className="font-medium text-stone-800">{employee.designation}</span>
              <span>•</span>
              <span>{employee.department}</span>
              <span>•</span>
              <span className="inline-flex items-center gap-1 text-stone-600">
                <MapPin className="h-3 w-3 text-amber-600" />
                {employee.branch}
              </span>
              {employee.manager && (
                <>
                  <span>•</span>
                  <span>
                    Reports to:{' '}
                    <strong className="text-stone-700 font-medium">
                      {employee.manager.displayName}
                    </strong>
                  </span>
                </>
              )}
            </p>
          </div>

          <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 border-t sm:border-t-0 pt-3 sm:pt-0 border-stone-200/60">
            <div className="text-right">
              <span className="text-[11px] font-medium text-stone-500 uppercase tracking-wider block">
                Today&apos;s Date
              </span>
              <span className="text-sm font-bold text-stone-900">
                {new Date().toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => loadDashboard(true)}
              disabled={refreshing}
              leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />}
              className="text-stone-600 hover:text-stone-900 text-xs px-2 h-7"
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
        </div>
      </div>

      {/* 2. Today's Attendance & Shift Status Card */}
      <div className="rounded-2xl border border-stone-200/90 bg-white p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="p-3.5 rounded-2xl bg-amber-50 text-amber-700 shrink-0">
              <Clock className="h-7 w-7" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                Today&apos;s Attendance Status
              </p>
              <div className="flex items-center gap-2.5 mt-1">
                <h3 className="text-xl font-bold text-stone-900">{attendanceStatusText}</h3>
                <Badge variant={attendanceBadgeVariant} size="sm">
                  {attendanceToday.isCheckedIn ? 'ACTIVE' : attendanceToday.status}
                </Badge>
                {attendanceToday.mode && (
                  <Badge variant="outline" size="sm" className="text-[11px]">
                    {attendanceToday.mode === 'OFFICE'
                      ? 'Office'
                      : attendanceToday.mode === 'WFH'
                        ? 'Work From Home'
                        : 'Official Visit'}
                  </Badge>
                )}
              </div>

              {/* Attendance metrics */}
              <div className="flex flex-wrap items-center gap-y-2 gap-x-4 text-xs text-stone-500 mt-2.5">
                <span>
                  Check-in:{' '}
                  <strong className="text-stone-800">
                    {formatTime(attendanceToday.checkInTime)}
                  </strong>
                </span>
                <span>•</span>
                <span>
                  Check-out:{' '}
                  <strong className="text-stone-800">
                    {formatTime(attendanceToday.checkOutTime)}
                  </strong>
                </span>
                <span>•</span>
                <span>
                  Logged Hours:{' '}
                  <strong className="text-amber-700 font-semibold">
                    {formatMinutes(attendanceToday.loggedMinutes)}
                  </strong>
                </span>
                {attendanceToday.shift && (
                  <>
                    <span>•</span>
                    <span className="text-stone-500">
                      Shift:{' '}
                      <strong className="text-stone-700">
                        {attendanceToday.shift.name} ({attendanceToday.shift.startTime} -{' '}
                        {attendanceToday.shift.endTime})
                      </strong>
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Link href="/attendance">
              <Button
                variant={attendanceToday.isCheckedIn ? 'outline' : 'primary'}
                size="md"
                leftIcon={
                  attendanceToday.isCheckedIn ? (
                    <LogOut className="h-4 w-4" />
                  ) : (
                    <LogIn className="h-4 w-4" />
                  )
                }
              >
                {attendanceToday.isCheckedIn ? 'Punch Out / Details' : 'Punch In Now'}
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* 3. Quick Actions Hub */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
        <Link href="/attendance" className="block">
          <div className="p-3 rounded-xl border border-stone-200/90 bg-white hover:border-amber-400 hover:bg-amber-50/30 transition-all text-center group cursor-pointer shadow-2xs">
            <Clock className="h-5 w-5 mx-auto text-amber-700 group-hover:scale-110 transition-transform mb-1.5" />
            <span className="text-xs font-semibold text-stone-800 block">Attendance</span>
            <span className="text-[10px] text-stone-400">Punch & Logs</span>
          </div>
        </Link>
        <Link href="/leave" className="block">
          <div className="p-3 rounded-xl border border-stone-200/90 bg-white hover:border-amber-400 hover:bg-amber-50/30 transition-all text-center group cursor-pointer shadow-2xs">
            <Calendar className="h-5 w-5 mx-auto text-emerald-700 group-hover:scale-110 transition-transform mb-1.5" />
            <span className="text-xs font-semibold text-stone-800 block">Apply Leave</span>
            <span className="text-[10px] text-stone-400">Time-off</span>
          </div>
        </Link>
        <Link href="/payroll/payslips" className="block">
          <div className="p-3 rounded-xl border border-stone-200/90 bg-white hover:border-amber-400 hover:bg-amber-50/30 transition-all text-center group cursor-pointer shadow-2xs">
            <Banknote className="h-5 w-5 mx-auto text-emerald-600 group-hover:scale-110 transition-transform mb-1.5" />
            <span className="text-xs font-semibold text-stone-800 block">Payslips</span>
            <span className="text-[10px] text-stone-400">Salary & Tax</span>
          </div>
        </Link>
        <Link href="/wfh" className="block">
          <div className="p-3 rounded-xl border border-stone-200/90 bg-white hover:border-amber-400 hover:bg-amber-50/30 transition-all text-center group cursor-pointer shadow-2xs">
            <Home className="h-5 w-5 mx-auto text-sky-700 group-hover:scale-110 transition-transform mb-1.5" />
            <span className="text-xs font-semibold text-stone-800 block">WFH</span>
            <span className="text-[10px] text-stone-400">Remote Work</span>
          </div>
        </Link>
        <Link href="/visits" className="block">
          <div className="p-3 rounded-xl border border-stone-200/90 bg-white hover:border-amber-400 hover:bg-amber-50/30 transition-all text-center group cursor-pointer shadow-2xs">
            <Briefcase className="h-5 w-5 mx-auto text-purple-700 group-hover:scale-110 transition-transform mb-1.5" />
            <span className="text-xs font-semibold text-stone-800 block">Official Visit</span>
            <span className="text-[10px] text-stone-400">Outdoor Duty</span>
          </div>
        </Link>
        <Link href="/attendance" className="block">
          <div className="p-3 rounded-xl border border-stone-200/90 bg-white hover:border-amber-400 hover:bg-amber-50/30 transition-all text-center group cursor-pointer shadow-2xs">
            <AlertCircle className="h-5 w-5 mx-auto text-amber-600 group-hover:scale-110 transition-transform mb-1.5" />
            <span className="text-xs font-semibold text-stone-800 block">Correction</span>
            <span className="text-[10px] text-stone-400">Missed Punch</span>
          </div>
        </Link>
        <Link href="/documents" className="block">
          <div className="p-3 rounded-xl border border-stone-200/90 bg-white hover:border-amber-400 hover:bg-amber-50/30 transition-all text-center group cursor-pointer shadow-2xs">
            <FileText className="h-5 w-5 mx-auto text-stone-700 group-hover:scale-110 transition-transform mb-1.5" />
            <span className="text-xs font-semibold text-stone-800 block">Documents</span>
            <span className="text-[10px] text-stone-400">Policies & Files</span>
          </div>
        </Link>
        <Link href="/profile" className="block">
          <div className="p-3 rounded-xl border border-stone-200/90 bg-white hover:border-amber-400 hover:bg-amber-50/30 transition-all text-center group cursor-pointer shadow-2xs">
            <User className="h-5 w-5 mx-auto text-indigo-700 group-hover:scale-110 transition-transform mb-1.5" />
            <span className="text-xs font-semibold text-stone-800 block">Profile</span>
            <span className="text-[10px] text-stone-400">My Details</span>
          </div>
        </Link>
      </div>

      {/* 4. Leave Balances Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-stone-900 uppercase tracking-wider flex items-center gap-2">
            <Calendar className="h-4 w-4 text-amber-700" />
            <span>Leave Balances</span>
          </h2>
          <Link
            href="/leave"
            className="text-xs font-semibold text-amber-800 hover:text-amber-900 hover:underline flex items-center gap-1"
          >
            Apply Leave & View Details <ChevronRight className="h-3 w-3" />
          </Link>
        </div>

        {leaveBalances.length === 0 ? (
          <div className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-center">
            <p className="text-xs text-stone-500">
              No leave balances currently allocated for this year. Please contact HR operations.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {leaveBalances.map((leave) => {
              // Color badges per leave type code
              let colorClass = 'bg-amber-50 text-amber-900 border-amber-200';
              if (leave.code.includes('SICK') || leave.code === 'SL') {
                colorClass = 'bg-emerald-50 text-emerald-900 border-emerald-200';
              } else if (leave.code.includes('PRIV') || leave.code === 'PL') {
                colorClass = 'bg-sky-50 text-sky-900 border-sky-200';
              } else if (leave.code.includes('MAT') || leave.code.includes('PAT')) {
                colorClass = 'bg-purple-50 text-purple-900 border-purple-200';
              }

              return (
                <div
                  key={leave.id}
                  className="p-4 rounded-xl border border-stone-200/90 bg-white shadow-2xs hover:border-amber-300/80 transition-all flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${colorClass}`}
                    >
                      {leave.name}
                    </span>
                    <span className="text-[11px] text-stone-400 font-mono font-medium">
                      {leave.code}
                    </span>
                  </div>

                  <div className="mt-3 flex items-baseline justify-between">
                    <div>
                      <span className="text-2xl font-bold text-stone-900">{leave.available}</span>
                      <span className="text-xs text-stone-400"> / {leave.entitled} days</span>
                    </div>
                    <span className="text-xs text-stone-500 font-medium">{leave.used} used</span>
                  </div>

                  {leave.pending > 0 && (
                    <div className="mt-2 text-[11px] text-amber-700 bg-amber-50/70 px-2 py-0.5 rounded border border-amber-100 flex items-center justify-between">
                      <span>Pending approval:</span>
                      <strong>{leave.pending}d</strong>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Two Column Grid: Pending Personal Requests & Upcoming Absences */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pending Personal Requests Card */}
        <div className="rounded-xl border border-stone-200/90 bg-white p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <h3 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
                <Send className="h-4 w-4 text-amber-700" />
                <span>My Pending Requests</span>
              </h3>
              <Badge variant={pendingRequests.totalCount > 0 ? 'warning' : 'outline'} size="sm">
                {pendingRequests.totalCount} Awaiting Review
              </Badge>
            </div>

            {/* Request Type Breakdown Chips */}
            {pendingRequests.totalCount > 0 && (
              <div className="flex flex-wrap gap-2 pt-3 pb-1">
                {pendingRequests.leaveCount > 0 && (
                  <span className="text-[10px] bg-amber-50 text-amber-800 px-2 py-0.5 rounded-full font-medium">
                    {pendingRequests.leaveCount} Leave
                  </span>
                )}
                {pendingRequests.wfhCount > 0 && (
                  <span className="text-[10px] bg-sky-50 text-sky-800 px-2 py-0.5 rounded-full font-medium">
                    {pendingRequests.wfhCount} WFH
                  </span>
                )}
                {pendingRequests.visitCount > 0 && (
                  <span className="text-[10px] bg-purple-50 text-purple-800 px-2 py-0.5 rounded-full font-medium">
                    {pendingRequests.visitCount} Visit
                  </span>
                )}
                {pendingRequests.correctionCount > 0 && (
                  <span className="text-[10px] bg-rose-50 text-rose-800 px-2 py-0.5 rounded-full font-medium">
                    {pendingRequests.correctionCount} Correction
                  </span>
                )}
              </div>
            )}

            {/* Pending Requests List */}
            <div className="mt-2.5 space-y-2.5">
              {pendingRequests.items.length === 0 ? (
                <div className="py-6 text-center text-xs text-stone-400">
                  <CheckCircle2 className="h-6 w-6 mx-auto text-emerald-600/70 mb-1.5" />
                  All caught up! No requests pending approval.
                </div>
              ) : (
                pendingRequests.items.slice(0, 4).map((item) => (
                  <Link href={item.href} key={item.id} className="block group">
                    <div className="p-3 rounded-lg bg-stone-50/70 hover:bg-amber-50/50 border border-stone-200/70 hover:border-amber-200 transition-all">
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-xs font-bold text-stone-900 group-hover:text-amber-800">
                          {item.title}
                        </span>
                        <Badge variant="warning" size="sm" className="text-[10px] shrink-0">
                          Pending
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center text-[11px] text-stone-500 mt-1">
                        <span>{item.dateRange}</span>
                        <span className="text-[10px] text-stone-400">
                          Applied {formatDate(item.createdAt)}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-stone-100 mt-3 text-right">
            <Link
              href="/leave"
              className="text-xs font-semibold text-amber-800 hover:text-amber-900 inline-flex items-center gap-1"
            >
              View All Submissions <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* Upcoming Approved Absences Card */}
        <div className="rounded-xl border border-stone-200/90 bg-white p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <h3 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-emerald-700" />
                <span>Upcoming Approved Absences</span>
              </h3>
              <Badge variant="outline" size="sm">
                Next 30 Days
              </Badge>
            </div>

            <div className="mt-3.5 space-y-2.5">
              {upcomingAbsences.length === 0 ? (
                <div className="py-6 text-center text-xs text-stone-400">
                  <Calendar className="h-6 w-6 mx-auto text-stone-300 mb-1.5" />
                  No upcoming approved leaves or offsite visits scheduled.
                </div>
              ) : (
                upcomingAbsences.map((absence) => (
                  <Link href={absence.href} key={absence.id} className="block group">
                    <div className="p-3 rounded-lg bg-stone-50/70 hover:bg-emerald-50/40 border border-stone-200/70 hover:border-emerald-200 transition-all">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-stone-900 group-hover:text-emerald-900">
                          {absence.title}
                        </span>
                        <Badge variant="success" size="sm" className="text-[10px]">
                          Approved
                        </Badge>
                      </div>
                      <p className="text-[11px] text-stone-500 mt-1">
                        {formatDate(absence.startDate)} - {formatDate(absence.endDate)} •{' '}
                        <strong className="text-stone-700">{absence.daysCount} Day(s)</strong>
                      </p>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-stone-100 mt-3 text-right">
            <Link
              href="/leave"
              className="text-xs font-semibold text-emerald-800 hover:text-emerald-900 inline-flex items-center gap-1"
            >
              Check Availability Calendar <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* 6. Two Column Grid: Upcoming Holidays & Recent Organization Updates */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Upcoming Holidays */}
        <div className="rounded-xl border border-stone-200/90 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <h3 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-amber-700" />
              <span>Upcoming Holidays</span>
            </h3>
            <span className="text-xs text-stone-400">Official Calendar</span>
          </div>

          <div className="mt-3.5 space-y-2.5">
            {upcomingHolidays.length === 0 ? (
              <div className="py-6 text-center text-xs text-stone-400">
                No upcoming organization holidays in the near schedule.
              </div>
            ) : (
              upcomingHolidays.map((holiday) => (
                <div
                  key={holiday.id}
                  className="p-3 rounded-lg bg-amber-50/30 border border-amber-100/70 flex items-center justify-between"
                >
                  <div>
                    <h4 className="text-xs font-bold text-stone-900">{holiday.name}</h4>
                    <span className="text-[11px] text-stone-500">
                      {holiday.dayOfWeek}, {formatDate(holiday.date)}
                    </span>
                  </div>
                  {holiday.isOptional ? (
                    <Badge variant="outline" size="sm" className="text-[10px]">
                      Optional
                    </Badge>
                  ) : (
                    <Badge variant="default" size="sm" className="text-[10px]">
                      Public Holiday
                    </Badge>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Notifications & Updates */}
        <div className="rounded-xl border border-stone-200/90 bg-white p-5 shadow-2xs">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <h3 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
              <Bell className="h-4 w-4 text-amber-700" />
              <span>Notifications & Updates</span>
            </h3>
            <span className="text-xs text-stone-400">Recent Alerts</span>
          </div>

          <div className="mt-3 divide-y divide-stone-100">
            {notifications.length === 0 ? (
              <div className="py-6 text-center text-xs text-stone-400">
                You are all caught up! No recent alerts or updates.
              </div>
            ) : (
              notifications.map((notif) => (
                <div key={notif.id} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-stone-900">{notif.title}</p>
                    <span className="text-[10px] text-stone-400 shrink-0">
                      {formatDate(notif.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-stone-600 mt-0.5">{notif.message}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
