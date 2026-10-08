'use client';

import React from 'react';
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
} from 'lucide-react';
import { KPICard, Card, Button, Badge, Avatar } from '@hrms/ui';

export const ManagerDashboard: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-stone-900">
            Engineering Team Workspace
          </h1>
          <p className="text-xs md:text-sm text-stone-500 mt-1">
            Supervising 14 squad engineers • Today's presence, approvals and sprint deliverables.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="warning">2 Requests Awaiting Approval</Badge>
        </div>
      </div>

      {/* KPI Row (Requirement 13) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard
          title="My Team"
          value="14"
          description="Direct reports"
          icon={<Users className="h-5 w-5 text-amber-700" />}
          iconBg="bg-amber-100"
        />
        <KPICard
          title="Present Today"
          value="12"
          change={{ value: '10 Office / 2 WFH', trend: 'up' }}
          icon={<CheckCircle className="h-5 w-5 text-emerald-700" />}
          iconBg="bg-emerald-100"
        />
        <KPICard
          title="Absent"
          value="0"
          change={{ value: 'All accounted', trend: 'neutral' }}
          icon={<UserX className="h-5 w-5 text-stone-500" />}
          iconBg="bg-stone-100"
        />
        <KPICard
          title="On Leave"
          value="1"
          change={{ value: 'Casual Leave', trend: 'neutral' }}
          icon={<CalendarDays className="h-5 w-5 text-sky-700" />}
          iconBg="bg-sky-100"
        />
        <KPICard
          title="Pending Approvals"
          value="2"
          change={{ value: 'Action needed', trend: 'down' }}
          icon={<AlertCircle className="h-5 w-5 text-amber-700" />}
          iconBg="bg-amber-100"
        />
      </div>

      {/* Team Attendance Table & Pending Approvals */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Team Attendance (Requirement 13) */}
        <div className="lg:col-span-2 rounded-xl border border-stone-200/90 bg-white p-5">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <div>
              <h3 className="text-sm font-semibold text-stone-900">Direct Reports Attendance</h3>
              <p className="text-xs text-stone-500">Live check-in time and attendance mode</p>
            </div>
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
              85.7% In Office
            </span>
          </div>

          <div className="mt-3 divide-y divide-stone-100">
            {[
              {
                name: 'Priya Nair',
                role: 'Sr. Frontend Engineer',
                status: 'PRESENT',
                mode: 'OFFICIAL_VISIT',
                time: '09:15 AM',
                location: 'Hyderabad Site',
              },
              {
                name: 'Amitabh Roy',
                role: 'Fullstack Engineer',
                status: 'PRESENT',
                mode: 'OFFICE',
                time: '09:28 AM',
                location: 'HQ Bengaluru',
              },
              {
                name: 'Neha Gupta',
                role: 'DevOps Engineer',
                status: 'PRESENT',
                mode: 'WORK_FROM_HOME',
                time: '09:05 AM',
                location: 'Remote (Approved)',
              },
              {
                name: 'Siddharth Rao',
                role: 'Backend Engineer',
                status: 'ON_LEAVE',
                mode: 'OFFICE',
                time: '-',
                location: 'Casual Leave',
              },
              {
                name: 'Kavita Joshi',
                role: 'QA Lead',
                status: 'PRESENT',
                mode: 'OFFICE',
                time: '09:42 AM',
                location: 'HQ Bengaluru',
              },
            ].map((member, i) => (
              <div key={i} className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar
                    name={member.name}
                    size="sm"
                    status={member.status === 'PRESENT' ? 'online' : 'away'}
                  />
                  <div>
                    <p className="text-xs font-semibold text-stone-900">{member.name}</p>
                    <p className="text-[11px] text-stone-500">
                      {member.role} • {member.location}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge
                    variant={
                      member.mode === 'OFFICIAL_VISIT'
                        ? 'purple'
                        : member.mode === 'WORK_FROM_HOME'
                          ? 'info'
                          : member.status === 'ON_LEAVE'
                            ? 'warning'
                            : 'success'
                    }
                    size="sm"
                  >
                    {member.mode === 'OFFICIAL_VISIT'
                      ? 'Official Visit'
                      : member.mode === 'WORK_FROM_HOME'
                        ? 'WFH'
                        : member.status}
                  </Badge>
                  <p className="text-[10px] text-stone-400 mt-0.5">
                    {member.time !== '-' ? `In: ${member.time}` : 'Out of office'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pending Approvals & Quick Actions */}
        <div className="rounded-xl border border-stone-200/90 bg-white p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <h3 className="text-sm font-semibold text-stone-900">Pending Squad Requests</h3>
              <Badge variant="warning" size="sm">
                2 Needs Review
              </Badge>
            </div>

            <div className="mt-3 space-y-3">
              <div className="p-3 rounded-lg border border-stone-200 bg-stone-50/50">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                    Official Visit
                  </span>
                  <span className="text-[10px] text-stone-400">Today, 08:30 AM</span>
                </div>
                <p className="text-xs font-semibold text-stone-900 mt-1.5">Priya Nair</p>
                <p className="text-xs text-stone-600 mt-0.5">
                  Visit to Client DC in Hyderabad for load tests.
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <Button size="sm" className="h-7 text-xs flex-1">
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs flex-1">
                    Reject
                  </Button>
                </div>
              </div>

              <div className="p-3 rounded-lg border border-stone-200 bg-stone-50/50">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-sky-800 bg-sky-100 px-1.5 py-0.5 rounded">
                    WFH Request
                  </span>
                  <span className="text-[10px] text-stone-400">Yesterday</span>
                </div>
                <p className="text-xs font-semibold text-stone-900 mt-1.5">Neha Gupta</p>
                <p className="text-xs text-stone-600 mt-0.5">
                  Oct 10-11: Fiber line maintenance at apartment.
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <Button size="sm" className="h-7 text-xs flex-1">
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs flex-1">
                    Reject
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Team Progress & Recent Team Events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Team Progress */}
        <div className="rounded-xl border border-stone-200/90 bg-white p-5">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <div>
              <h3 className="text-sm font-semibold text-stone-900">Sprint & Capability Progress</h3>
              <p className="text-xs text-stone-500">Key milestones for current engineering cycle</p>
            </div>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-4 space-y-4">
            {[
              { track: 'Core API Modularization', progress: 85, status: 'On Track' },
              { track: 'PostgreSQL Migration & Sharding Prep', progress: 70, status: 'On Track' },
              { track: 'Offline Sync & Attendance Cache', progress: 45, status: 'In Review' },
            ].map((p, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-stone-800">{p.track}</span>
                  <span className="text-amber-700 font-semibold">{p.progress}%</span>
                </div>
                <div className="w-full bg-stone-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-amber-600 h-2 rounded-full"
                    style={{ width: `${p.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Team Events & Schedule */}
        <div className="rounded-xl border border-stone-200/90 bg-white p-5">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <div>
              <h3 className="text-sm font-semibold text-stone-900">Upcoming Team Events</h3>
              <p className="text-xs text-stone-500">Planned leaves and outdoor official visits</p>
            </div>
          </div>
          <div className="mt-3 space-y-3">
            {[
              {
                event: 'Siddharth Rao - Privilege Leave (2 Days)',
                date: 'Oct 14 - Oct 15',
                badge: 'Leave',
              },
              {
                event: 'Priya Nair - DC Architecture Review (Hyderabad)',
                date: 'Oct 18',
                badge: 'Visit',
              },
              { event: 'Quarterly Sprint Retrospective & Demo', date: 'Oct 24', badge: 'Meeting' },
            ].map((ev, i) => (
              <div
                key={i}
                className="p-3 rounded-lg bg-stone-50/70 flex items-center justify-between"
              >
                <div>
                  <p className="text-xs font-medium text-stone-900">{ev.event}</p>
                  <p className="text-[11px] text-stone-500 mt-0.5">{ev.date}</p>
                </div>
                <Badge variant="outline" size="sm">
                  {ev.badge}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
