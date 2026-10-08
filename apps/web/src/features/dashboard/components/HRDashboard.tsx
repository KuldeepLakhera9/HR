'use client';

import React from 'react';
import {
  Users,
  UserCheck,
  UserPlus,
  UserMinus,
  Clock,
  UserX,
  CalendarDays,
  Briefcase,
  AlertCircle,
  FileCheck,
  ChevronRight,
} from 'lucide-react';
import { KPICard, ChartCard, Button, Badge } from '@hrms/ui';
import { AttendanceTrendChart } from './charts/AttendanceTrendChart';
import { EmployeeProgressChart } from './charts/EmployeeProgressChart';

export const HRDashboard: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Top Welcome */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-stone-900">
            People Operations & HR Management
          </h1>
          <p className="text-xs md:text-sm text-stone-500 mt-1">
            Workforce roster, attendance status, pending approvals, and employee lifecycle tracks.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" variant="outline" leftIcon={<FileCheck className="h-4 w-4" />}>
            Generate MIS Report
          </Button>
          <Button size="sm" leftIcon={<UserPlus className="h-4 w-4" />}>
            New Employee
          </Button>
        </div>
      </div>

      {/* Row 1: Employee Roster Metrics (Requirement 12) */}
      <div>
        <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2.5">
          Workforce Movement
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            title="Total Employees"
            value="72"
            change={{ value: '+5.8% YoY', trend: 'up' }}
            icon={<Users className="h-5 w-5 text-amber-700" />}
            iconBg="bg-amber-100"
          />
          <KPICard
            title="Active Employees"
            value="70"
            change={{ value: '2 on probation', trend: 'neutral' }}
            icon={<UserCheck className="h-5 w-5 text-emerald-700" />}
            iconBg="bg-emerald-100"
          />
          <KPICard
            title="New Joiners (Month)"
            value="4"
            change={{ value: 'Joined Oct 2026', trend: 'up' }}
            icon={<UserPlus className="h-5 w-5 text-sky-700" />}
            iconBg="bg-sky-100"
          />
          <KPICard
            title="Exited Employees"
            value="1"
            change={{ value: 'Notice completed', trend: 'neutral' }}
            icon={<UserMinus className="h-5 w-5 text-stone-600" />}
            iconBg="bg-stone-100"
          />
        </div>
      </div>

      {/* Row 2: Today's Attendance Operations (Requirement 12) */}
      <div>
        <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2.5">
          Today's Attendance Operations
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            title="Present Today"
            value="64"
            change={{ value: '52 Office / 12 Remote', trend: 'up' }}
            icon={<Clock className="h-5 w-5 text-emerald-700" />}
            iconBg="bg-emerald-100"
          />
          <KPICard
            title="Absent"
            value="3"
            change={{ value: 'Unplanned absences', trend: 'down' }}
            icon={<UserX className="h-5 w-5 text-rose-700" />}
            iconBg="bg-rose-100"
          />
          <KPICard
            title="On Leave"
            value="5"
            change={{ value: 'Approved leaves', trend: 'neutral' }}
            icon={<CalendarDays className="h-5 w-5 text-amber-700" />}
            iconBg="bg-amber-100"
          />
          <KPICard
            title="Official Visits (OD)"
            value="4"
            change={{ value: 'Outdoor duty active', trend: 'up' }}
            icon={<Briefcase className="h-5 w-5 text-purple-700" />}
            iconBg="bg-purple-100"
          />
        </div>
      </div>

      {/* Charts Section: Attendance Trend & Employee Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="Attendance & Remote Trend"
          subtitle="Distribution of in-office, remote and approved leave"
        >
          <AttendanceTrendChart />
        </ChartCard>

        <ChartCard
          title="Employee Progress & Enablement"
          subtitle="Mandatory training modules and onboarding milestones"
        >
          <EmployeeProgressChart />
        </ChartCard>
      </div>

      {/* Pending HR Actions & Department Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Actions */}
        <div className="rounded-xl border border-stone-200/90 bg-white p-5">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <div>
              <h3 className="text-sm font-semibold text-stone-900">Pending HR Actions</h3>
              <p className="text-xs text-stone-500">Items requiring HR review and authorization</p>
            </div>
            <Badge variant="warning">5 Pending</Badge>
          </div>
          <div className="mt-3 space-y-3">
            {[
              {
                id: '1',
                title: 'Outdoor Duty / Visit Approval',
                name: 'Priya Nair',
                dept: 'Engineering',
                priority: 'High',
                time: '2 hours ago',
              },
              {
                id: '2',
                title: 'Extended Sick Leave (3 Days)',
                name: 'Karan Mehra',
                dept: 'Operations',
                priority: 'Medium',
                time: '4 hours ago',
              },
              {
                id: '3',
                title: 'Onboarding Document Verification',
                name: 'Sunita Rao',
                dept: 'Finance',
                priority: 'High',
                time: 'Yesterday',
              },
            ].map((action) => (
              <div
                key={action.id}
                className="flex items-center justify-between p-3 rounded-lg border border-stone-150 hover:bg-stone-50 transition-colors"
              >
                <div>
                  <p className="text-xs font-semibold text-stone-900">{action.title}</p>
                  <p className="text-[11px] text-stone-500">
                    {action.name} • {action.dept} • {action.time}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={action.priority === 'High' ? 'danger' : 'warning'} size="sm">
                    {action.priority}
                  </Badge>
                  <Button size="sm" variant="outline" className="h-7 text-xs px-2">
                    Review
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Department Overview */}
        <div className="rounded-xl border border-stone-200/90 bg-white p-5">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <div>
              <h3 className="text-sm font-semibold text-stone-900">Department Workforce Roster</h3>
              <p className="text-xs text-stone-500">Headcount distribution & active leave counts</p>
            </div>
          </div>
          <div className="mt-3 space-y-3">
            {[
              { name: 'Engineering', head: 42, onLeave: 2, attendance: '92%' },
              { name: 'Human Resources', head: 8, onLeave: 0, attendance: '100%' },
              { name: 'Operations', head: 16, onLeave: 2, attendance: '88%' },
              { name: 'Finance', head: 6, onLeave: 1, attendance: '83%' },
            ].map((dept, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 rounded-lg bg-stone-50/60"
              >
                <div>
                  <p className="text-xs font-semibold text-stone-800">{dept.name}</p>
                  <p className="text-[11px] text-stone-500">
                    {dept.head} Staff • {dept.onLeave} on leave
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                    {dept.attendance} present
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
