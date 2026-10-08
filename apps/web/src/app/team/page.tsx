'use client';

import React from 'react';
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
  DataTable,
} from '@hrms/ui';
import { Users, Clock, CalendarCheck, CheckCircle2 } from 'lucide-react';

export default function TeamPage() {
  const teamMembers = [
    {
      id: '1',
      name: 'Priya Nair',
      email: 'priya.nair@peopleos.local',
      designation: 'Senior Frontend Engineer',
      attendanceToday: 'PRESENT',
      mode: 'OFFICE',
      inTime: '09:12 AM',
      leaveBalance: '16 days',
    },
    {
      id: '2',
      name: 'Arun Patel',
      email: 'arun.patel@peopleos.local',
      designation: 'Staff Backend Engineer',
      attendanceToday: 'PRESENT',
      mode: 'OFFICE',
      inTime: '09:28 AM',
      leaveBalance: '14 days',
    },
    {
      id: '3',
      name: 'Kavita Das',
      email: 'kavita.das@peopleos.local',
      designation: 'QA Automation Engineer',
      attendanceToday: 'ON_LEAVE',
      mode: 'CASUAL_LEAVE',
      inTime: '-',
      leaveBalance: '11 days',
    },
    {
      id: '4',
      name: 'Manish Joshi',
      email: 'manish.joshi@peopleos.local',
      designation: 'DevOps & SRE Engineer',
      attendanceToday: 'PRESENT',
      mode: 'WORK_FROM_HOME',
      inTime: '09:05 AM',
      leaveBalance: '18 days',
    },
  ];

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-stone-900">Engineering Team Roster</h1>
          <p className="text-xs md:text-sm text-stone-500 mt-1">
            Overview of your direct reports, real-time availability, and shift assignments.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            title="Direct Reports"
            value="4"
            description="Engineering Team A"
            icon={<Users className="h-5 w-5 text-amber-700" />}
          />
          <KPICard
            title="Present Today"
            value="3"
            description="75% on duty"
            icon={<CheckCircle2 className="h-5 w-5 text-emerald-700" />}
          />
          <KPICard
            title="On Leave"
            value="1"
            description="Approved casual leave"
            icon={<CalendarCheck className="h-5 w-5 text-amber-700" />}
          />
          <KPICard
            title="Avg Check-in Time"
            value="09:15 AM"
            description="Within grace window"
            icon={<Clock className="h-5 w-5 text-amber-700" />}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Team Members</CardTitle>
            <CardDescription>Real-time attendance & status for today</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={[
                {
                  key: 'name',
                  header: 'Member',
                  render: (row) => (
                    <div className="flex items-center gap-3">
                      <Avatar name={row.name} size="sm" />
                      <div>
                        <p className="font-semibold text-stone-900">{row.name}</p>
                        <p className="text-xs text-stone-500">{row.email}</p>
                      </div>
                    </div>
                  ),
                },
                { key: 'designation', header: 'Designation' },
                {
                  key: 'attendanceToday',
                  header: 'Status',
                  render: (row) => (
                    <Badge
                      variant={row.attendanceToday === 'PRESENT' ? 'success' : 'warning'}
                      size="sm"
                    >
                      {row.attendanceToday}
                    </Badge>
                  ),
                },
                {
                  key: 'mode',
                  header: 'Mode / Location',
                  render: (row) => (
                    <span className="text-xs font-mono font-medium text-stone-700">{row.mode}</span>
                  ),
                },
                { key: 'inTime', header: 'Clock In' },
                { key: 'leaveBalance', header: 'Leave Balance' },
              ]}
              data={teamMembers}
            />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
