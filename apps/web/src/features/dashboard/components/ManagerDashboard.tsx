'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Users,
  CheckCircle,
  UserX,
  CalendarDays,
  Clock,
  Briefcase,
  AlertCircle,
  ChevronRight,
  TrendingUp,
  RefreshCw,
  Home,
  MapPin,
  ArrowRight,
} from 'lucide-react';
import { KPICard, Card, Button, Badge, Avatar, Skeleton } from '@hrms/ui';
import { managerApi } from '../../../lib/api-client';

export const ManagerDashboard: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await managerApi.getDashboardOverview();
      setData(res?.data || res);
    } catch (err: any) {
      setError(err?.message || 'Failed to load manager team metrics');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const metrics = data?.metrics;
  const teamHeadcount = metrics?.teamHeadcount ?? 0;
  const presentCheckedIn = metrics?.presentCheckedIn ?? 0;
  const onApprovedLeave = metrics?.onApprovedLeave ?? 0;
  const onApprovedWfh = metrics?.onApprovedWfh ?? 0;
  const onOfficialVisit = metrics?.onOfficialVisit ?? 0;
  const pendingApprovalsTotal = metrics?.pendingApprovalsTotal ?? 0;
  const actionableExceptionsCount = metrics?.actionableExceptionsCount ?? 0;
  const roster: any[] = data?.roster || [];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-stone-900">
            Manager Team Workspace
          </h1>
          <p className="text-xs md:text-sm text-stone-500 mt-1">
            Supervising {teamHeadcount} direct reports • Today's presence, pending approvals, and
            team availability.
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
          <Link href="/team">
            <Button size="sm" variant="outline">
              Team Portal
            </Button>
          </Link>
          <Link href="/requests">
            <Badge variant={pendingApprovalsTotal > 0 ? 'warning' : 'success'}>
              {pendingApprovalsTotal} Requests Awaiting Approval
            </Badge>
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl border border-rose-200 bg-rose-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-rose-900">Team telemetry warning</p>
              <p className="text-xs text-rose-700 mt-0.5">{error}</p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={loadData}>
            Retry
          </Button>
        </div>
      )}

      {/* KPI Row */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="p-5 rounded-xl border border-stone-200 bg-white space-y-3">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-12" />
              <Skeleton className="h-3 w-28" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <KPICard
            title="My Team"
            value={String(teamHeadcount)}
            description="Reporting hierarchy"
            icon={<Users className="h-5 w-5 text-amber-700" />}
            iconBg="bg-amber-100"
          />
          <KPICard
            title="Present Today"
            value={String(presentCheckedIn)}
            change={{
              value: `${onApprovedWfh} WFH / ${onOfficialVisit} Visit`,
              trend: presentCheckedIn > 0 ? 'up' : 'neutral',
            }}
            icon={<CheckCircle className="h-5 w-5 text-emerald-700" />}
            iconBg="bg-emerald-100"
          />
          <KPICard
            title="On Leave"
            value={String(onApprovedLeave)}
            change={{ value: 'Approved leaves', trend: 'neutral' }}
            icon={<CalendarDays className="h-5 w-5 text-sky-700" />}
            iconBg="bg-sky-100"
          />
          <KPICard
            title="Pending Approvals"
            value={String(pendingApprovalsTotal)}
            change={{
              value: pendingApprovalsTotal > 0 ? 'Action required' : 'All clear',
              trend: pendingApprovalsTotal > 0 ? 'down' : 'neutral',
            }}
            icon={<AlertCircle className="h-5 w-5 text-amber-700" />}
            iconBg="bg-amber-100"
          />
          <KPICard
            title="Exceptions"
            value={String(actionableExceptionsCount)}
            change={{
              value: actionableExceptionsCount > 0 ? 'Attendance flags' : 'No alerts',
              trend: actionableExceptionsCount > 0 ? 'down' : 'neutral',
            }}
            icon={<UserX className="h-5 w-5 text-rose-700" />}
            iconBg="bg-rose-100"
          />
        </div>
      )}

      {/* Team Attendance Table & Pending Approvals */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Team Attendance */}
        <div className="lg:col-span-2 rounded-xl border border-stone-200/90 bg-white p-5">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <div>
              <h3 className="text-sm font-semibold text-stone-900">Direct Reports Attendance</h3>
              <p className="text-xs text-stone-500">Live presence and shift status from database</p>
            </div>
            <Link
              href="/team"
              className="text-xs font-semibold text-amber-700 hover:text-amber-800 flex items-center gap-1"
            >
              View Full Team &rarr;
            </Link>
          </div>

          <div className="mt-3 divide-y divide-stone-100">
            {roster.length > 0 ? (
              roster.slice(0, 6).map((member, i) => (
                <div key={member.id || i} className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar
                      name={member.displayName || 'Member'}
                      size="sm"
                      status={
                        member.status === 'PRESENT_OFFICE' || member.status === 'PRESENT_WFH'
                          ? 'online'
                          : 'away'
                      }
                    />
                    <div>
                      <p className="text-xs font-semibold text-stone-900">{member.displayName}</p>
                      <p className="text-[11px] text-stone-500">
                        {member.designation || member.employeeCode} •{' '}
                        {member.department || 'Department'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge
                      variant={
                        member.status === 'ON_VISIT'
                          ? 'purple'
                          : member.status === 'PRESENT_WFH' || member.status === 'ON_WFH'
                            ? 'info'
                            : member.status === 'ON_LEAVE'
                              ? 'warning'
                              : member.status === 'PRESENT_OFFICE'
                                ? 'success'
                                : 'default'
                      }
                      size="sm"
                    >
                      {member.statusLabel || member.status}
                    </Badge>
                    <p className="text-[10px] text-stone-400 mt-0.5">
                      {member.firstCheckInTime
                        ? `In: ${new Date(member.firstCheckInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                        : member.shiftName || 'Standard Shift'}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-stone-400 py-6 text-center">
                {isLoading
                  ? 'Loading team presence...'
                  : 'No direct reports currently assigned to this manager profile'}
              </p>
            )}
          </div>
        </div>

        {/* Quick Links & Approvals */}
        <div className="rounded-xl border border-stone-200/90 bg-white p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <h3 className="text-sm font-semibold text-stone-900">Pending Actions</h3>
              <Badge variant={pendingApprovalsTotal > 0 ? 'warning' : 'default'} size="sm">
                {pendingApprovalsTotal} In Queue
              </Badge>
            </div>

            <div className="mt-3 space-y-3">
              <div className="p-3.5 rounded-lg border border-amber-200/80 bg-amber-50/50">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-amber-900">
                    Unified Requests Inbox
                  </span>
                  <span className="text-[10px] text-amber-700">
                    {pendingApprovalsTotal} Pending
                  </span>
                </div>
                <p className="text-xs text-stone-600 mt-1">
                  Leave, work from home, and official visit requests submitted by your team members.
                </p>
                <Link href="/requests" className="mt-3 block">
                  <Button size="sm" className="w-full h-8 text-xs">
                    Open Approvals Queue
                  </Button>
                </Link>
              </div>

              <div className="p-3.5 rounded-lg border border-stone-200 bg-stone-50/70">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-stone-900">
                    Performance Reviews
                  </span>
                  <Link
                    href="/team?tab=reviews"
                    className="text-[11px] text-amber-700 hover:text-amber-800 font-medium"
                  >
                    Review Cycle
                  </Link>
                </div>
                <p className="text-xs text-stone-500 mt-1">
                  Manager appraisals and development feedback for direct reports.
                </p>
                <Link href="/team?tab=reviews" className="mt-3 block">
                  <Button size="sm" variant="outline" className="w-full h-8 text-xs">
                    Evaluate Subordinates
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-stone-100 mt-4">
            <Link
              href="/team?tab=reports"
              className="text-xs font-semibold text-stone-700 hover:text-stone-900 flex items-center justify-between"
            >
              <span>Download Team Attendance Report</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
