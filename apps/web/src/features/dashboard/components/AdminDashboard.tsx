'use client';

import React from 'react';
import {
  Users,
  CheckCircle2,
  CalendarDays,
  UserX,
  Building,
  ShieldCheck,
  TrendingUp,
  Activity,
} from 'lucide-react';
import { KPICard, ChartCard, ActivityItem } from '@hrms/ui';
import { AttendanceTrendChart } from './charts/AttendanceTrendChart';
import { DepartmentDistributionChart } from './charts/DepartmentDistributionChart';

export const AdminDashboard: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Top Banner / Welcome */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-stone-900">
            System Administration & Overview
          </h1>
          <p className="text-xs md:text-sm text-stone-500 mt-1">
            Real-time organization health, access governance and operational telemetry.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            System Healthy
          </span>
          <span className="text-xs text-stone-400">|</span>
          <span className="text-xs font-medium text-stone-600">3 Branches Active</span>
        </div>
      </div>

      {/* Primary KPI Row (Requirement 11) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total Employees"
          value="72"
          change={{ value: '+4 this month', trend: 'up' }}
          icon={<Users className="h-5 w-5 text-amber-700" />}
          iconBg="bg-amber-100"
        />
        <KPICard
          title="Present Today"
          value="64"
          change={{ value: '88.9% rate', trend: 'up' }}
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-700" />}
          iconBg="bg-emerald-100"
        />
        <KPICard
          title="On Leave"
          value="5"
          change={{ value: '3 planned', trend: 'neutral' }}
          icon={<CalendarDays className="h-5 w-5 text-sky-700" />}
          iconBg="bg-sky-100"
        />
        <KPICard
          title="Absent"
          value="3"
          change={{ value: '-1 vs yesterday', trend: 'down' }}
          icon={<UserX className="h-5 w-5 text-rose-700" />}
          iconBg="bg-rose-100"
        />
      </div>

      {/* Organization Overview & Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-stone-200/90 bg-white">
          <p className="text-xs text-stone-500">Active Branches</p>
          <p className="text-lg font-bold text-stone-900 mt-1">3 Locations</p>
          <p className="text-[11px] text-stone-400 mt-0.5">BLR (HQ), MUM, DEL</p>
        </div>
        <div className="p-4 rounded-xl border border-stone-200/90 bg-white">
          <p className="text-xs text-stone-500">Departments</p>
          <p className="text-lg font-bold text-stone-900 mt-1">4 Units</p>
          <p className="text-[11px] text-stone-400 mt-0.5">Engineering, HR, Ops, Finance</p>
        </div>
        <div className="p-4 rounded-xl border border-stone-200/90 bg-white">
          <p className="text-xs text-stone-500">Avg Attendance Rate</p>
          <p className="text-lg font-bold text-stone-900 mt-1">93.4%</p>
          <p className="text-[11px] text-emerald-600 font-medium mt-0.5">+1.2% above benchmark</p>
        </div>
        <div className="p-4 rounded-xl border border-stone-200/90 bg-white">
          <p className="text-xs text-stone-500">Audit Events Today</p>
          <p className="text-lg font-bold text-stone-900 mt-1">142 Logs</p>
          <p className="text-[11px] text-stone-400 mt-0.5">No security anomalies</p>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="Attendance Overview (Weekly)"
          subtitle="Real-time check-in vs approved leave trend across all branches"
        >
          <AttendanceTrendChart />
        </ChartCard>

        <ChartCard
          title="Department Distribution"
          subtitle="Headcount allocation across company business units"
        >
          <DepartmentDistributionChart />
        </ChartCard>
      </div>

      {/* Organization Summary & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Department Summary */}
        <div className="lg:col-span-2 rounded-xl border border-stone-200/90 bg-white p-5">
          <div className="flex items-center justify-between pb-4 border-b border-stone-100">
            <div>
              <h3 className="text-sm font-semibold text-stone-900">
                Department Performance Summary
              </h3>
              <p className="text-xs text-stone-500">Headcount and today attendance ratio</p>
            </div>
            <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-1 rounded-md">
              4 Departments
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {[
              { name: 'Engineering & Product', head: 42, present: 38, rate: '90%' },
              { name: 'Human Resources', head: 8, present: 8, rate: '100%' },
              { name: 'Operations & Facilities', head: 16, present: 14, rate: '87.5%' },
              { name: 'Finance & Accounts', head: 6, present: 4, rate: '66.7%' },
            ].map((dept, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 rounded-lg bg-stone-50/70 hover:bg-stone-50 transition-colors"
              >
                <div>
                  <p className="text-xs font-semibold text-stone-800">{dept.name}</p>
                  <p className="text-[11px] text-stone-500">{dept.head} team members</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-stone-900">{dept.present} Present</p>
                  <p className="text-[11px] text-emerald-600 font-medium">{dept.rate} rate</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity Feed */}
        <div className="rounded-xl border border-stone-200/90 bg-white p-5">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <h3 className="text-sm font-semibold text-stone-900">System Activity</h3>
            <Activity className="h-4 w-4 text-stone-400" />
          </div>
          <div className="divide-y divide-stone-100">
            <ActivityItem
              actorName="Vikram Aditya"
              action="updated policy"
              target="Attendance Geofence (HQ)"
              timestamp="15 mins ago"
            />
            <ActivityItem
              actorName="Ananya Sharma"
              action="registered new employee"
              target="Amitabh Roy"
              timestamp="1 hour ago"
            />
            <ActivityItem
              actorName="System"
              action="executed daily backup"
              target="PostgreSQL Cluster"
              timestamp="4 hours ago"
            />
            <ActivityItem
              actorName="Rajesh Kumar"
              action="approved official visit"
              target="Priya Nair"
              timestamp="Yesterday"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
