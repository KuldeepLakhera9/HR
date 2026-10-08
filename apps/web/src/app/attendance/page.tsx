'use client';

import React, { useState } from 'react';
import { AppShell } from '../../layouts/AppShell';
import { DataTable, DatePicker, Filter, Button, Badge, KPICard, Avatar, Card } from '@hrms/ui';
import {
  Clock,
  Building,
  Briefcase,
  Home,
  CheckCircle2,
  MapPin,
  Calendar,
  ShieldAlert,
} from 'lucide-react';
import { AttendanceMode, AttendanceStatus } from '@hrms/types';

interface AttendanceRow {
  id: string;
  name: string;
  code: string;
  mode: AttendanceMode;
  status: AttendanceStatus;
  checkIn: string;
  checkOut: string;
  geofenceStatus: 'VERIFIED' | 'OUTSIDE_PERIMETER' | 'N/A';
  location: string;
}

const mockAttendanceData: AttendanceRow[] = [
  {
    id: '1',
    name: 'Vikram Aditya',
    code: 'EMP001',
    mode: 'OFFICE',
    status: 'PRESENT',
    checkIn: '08:55 AM',
    checkOut: '--:--',
    geofenceStatus: 'VERIFIED',
    location: 'BLR Headquarters',
  },
  {
    id: '2',
    name: 'Ananya Sharma',
    code: 'EMP002',
    mode: 'OFFICE',
    status: 'PRESENT',
    checkIn: '09:05 AM',
    checkOut: '--:--',
    geofenceStatus: 'VERIFIED',
    location: 'BLR Headquarters',
  },
  {
    id: '3',
    name: 'Rajesh Kumar',
    code: 'EMP003',
    mode: 'OFFICE',
    status: 'PRESENT',
    checkIn: '09:12 AM',
    checkOut: '--:--',
    geofenceStatus: 'VERIFIED',
    location: 'BLR Headquarters',
  },
  {
    id: '4',
    name: 'Priya Nair',
    code: 'EMP004',
    mode: 'OFFICIAL_VISIT',
    status: 'PRESENT',
    checkIn: '09:15 AM',
    checkOut: '--:--',
    geofenceStatus: 'N/A',
    location: 'Hyderabad Client DC (Approved OD)',
  },
  {
    id: '5',
    name: 'Neha Gupta',
    code: 'EMP006',
    mode: 'WORK_FROM_HOME',
    status: 'PRESENT',
    checkIn: '09:00 AM',
    checkOut: '--:--',
    geofenceStatus: 'N/A',
    location: 'Remote Residential IP',
  },
  {
    id: '6',
    name: 'Amitabh Roy',
    code: 'EMP005',
    mode: 'OFFICE',
    status: 'PRESENT',
    checkIn: '09:28 AM',
    checkOut: '--:--',
    geofenceStatus: 'VERIFIED',
    location: 'MUM Tech Park',
  },
  {
    id: '7',
    name: 'Siddharth Rao',
    code: 'EMP008',
    mode: 'OFFICE',
    status: 'ON_LEAVE',
    checkIn: '--:--',
    checkOut: '--:--',
    geofenceStatus: 'N/A',
    location: 'Casual Leave Approved',
  },
];

export default function AttendancePage() {
  const [selectedDate, setSelectedDate] = useState('2026-10-08');
  const [modeFilter, setModeFilter] = useState('ALL');

  const filtered = mockAttendanceData.filter((row) => {
    return modeFilter === 'ALL' || row.mode === modeFilter;
  });

  const columns = [
    {
      key: 'employee',
      header: 'Employee',
      render: (row: AttendanceRow) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={row.name} size="sm" />
          <div>
            <span className="font-semibold text-stone-900 block leading-tight">{row.name}</span>
            <span className="text-xs text-stone-400">{row.code}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'mode',
      header: 'Attendance Mode',
      render: (row: AttendanceRow) => {
        if (row.mode === 'OFFICE') {
          return (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
              <Building className="h-3 w-3" /> Office (Geofenced)
            </span>
          );
        }
        if (row.mode === 'OFFICIAL_VISIT') {
          return (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-purple-800 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
              <Briefcase className="h-3 w-3" /> Official Visit (OD)
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-800 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
            <Home className="h-3 w-3" /> Work From Home
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: AttendanceRow) => (
        <Badge
          variant={
            row.status === 'PRESENT' ? 'success' : row.status === 'ON_LEAVE' ? 'warning' : 'danger'
          }
          size="sm"
        >
          {row.status}
        </Badge>
      ),
    },
    { key: 'checkIn', header: 'Check In' },
    { key: 'checkOut', header: 'Check Out' },
    {
      key: 'geofence',
      header: 'Geofence Verification',
      render: (row: AttendanceRow) => (
        <span
          className={`text-xs font-medium ${
            row.geofenceStatus === 'VERIFIED'
              ? 'text-emerald-700'
              : row.geofenceStatus === 'OUTSIDE_PERIMETER'
                ? 'text-rose-700 font-bold'
                : 'text-stone-400'
          }`}
        >
          {row.geofenceStatus}
        </span>
      ),
    },
    { key: 'location', header: 'Registered Location' },
  ];

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-stone-900">
              Attendance Operations Hub
            </h1>
            <p className="text-xs md:text-sm text-stone-500 mt-1">
              Supports 3 attendance paradigms: Office Geofence, Outdoor Official Visit, and WFH.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <DatePicker value={selectedDate} onChange={setSelectedDate} label="Date:" />
          </div>
        </div>

        {/* Mode Overview KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-stone-200 bg-white">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded">
                Mode 1: Office Geofence
              </span>
              <Building className="h-4 w-4 text-amber-600" />
            </div>
            <p className="text-2xl font-bold text-stone-900 mt-2">52 Staff</p>
            <p className="text-[11px] text-stone-500 mt-0.5">Punch validated via GPS perimeter</p>
          </div>

          <div className="p-4 rounded-xl border border-stone-200 bg-white">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-purple-800 bg-purple-50 px-2 py-0.5 rounded">
                Mode 2: Official Visit (OD)
              </span>
              <Briefcase className="h-4 w-4 text-purple-600" />
            </div>
            <p className="text-2xl font-bold text-stone-900 mt-2">4 Staff</p>
            <p className="text-[11px] text-stone-500 mt-0.5">Approved outdoor duty trips</p>
          </div>

          <div className="p-4 rounded-xl border border-stone-200 bg-white">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-sky-800 bg-sky-50 px-2 py-0.5 rounded">
                Mode 3: Work From Home
              </span>
              <Home className="h-4 w-4 text-sky-600" />
            </div>
            <p className="text-2xl font-bold text-stone-900 mt-2">8 Staff</p>
            <p className="text-[11px] text-stone-500 mt-0.5">Approved remote work requests</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-stone-200 bg-white">
          <Filter
            label="Filter Attendance Mode"
            selectedValue={modeFilter}
            onChange={setModeFilter}
            options={[
              { label: 'All Modes', value: 'ALL' },
              { label: 'Office Geofenced', value: 'OFFICE' },
              { label: 'Official Visit (OD)', value: 'OFFICIAL_VISIT' },
              { label: 'Work From Home (WFH)', value: 'WORK_FROM_HOME' },
            ]}
          />
          <div className="text-xs text-stone-500">
            Showing <strong className="text-stone-800">{filtered.length}</strong> check-in records
          </div>
        </div>

        {/* Table */}
        <DataTable columns={columns} data={filtered} />
      </div>
    </AppShell>
  );
}
