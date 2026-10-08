'use client';

import React, { useState } from 'react';
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
} from 'lucide-react';
import { Button, Badge, Card, Toast } from '@hrms/ui';

export const EmployeeDashboard: React.FC = () => {
  const [isCheckedIn, setIsCheckedIn] = useState(true);
  const [checkInTime, setCheckInTime] = useState('09:15 AM');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleToggleAttendance = () => {
    if (isCheckedIn) {
      setIsCheckedIn(false);
      setToastMessage('Checked out successfully. Have a great evening!');
    } else {
      setIsCheckedIn(true);
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setCheckInTime(now);
      setToastMessage(`Checked in successfully at ${now} via Office Geofence.`);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50">
          <Toast
            type="success"
            title="Attendance Recorded"
            message={toastMessage}
            onClose={() => setToastMessage(null)}
          />
        </div>
      )}

      {/* Warm Personal Greeting */}
      <div className="rounded-2xl border border-stone-200/90 bg-gradient-to-r from-amber-500/10 via-amber-50/50 to-white p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 mb-2">
              <Smile className="h-3.5 w-3.5" /> Good morning, Priya!
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900">
              Welcome to your personal workspace
            </h1>
            <p className="text-xs sm:text-sm text-stone-600 mt-1">
              You are currently checked in for the day. Office Geofence active (Bengaluru HQ).
            </p>
          </div>

          <div className="flex flex-col sm:items-end">
            <span className="text-xs font-medium text-stone-500">Today's Date</span>
            <span className="text-sm font-bold text-stone-900">
              {new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </div>
        </div>
      </div>

      {/* Attendance & Check-in Status Card (Requirement 14) */}
      <div className="rounded-2xl border border-stone-200/90 bg-white p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="p-3.5 rounded-2xl bg-amber-50 text-amber-700 shrink-0">
              <Clock className="h-7 w-7" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">
                Today's Attendance Status
              </p>
              <div className="flex items-center gap-2.5 mt-1">
                <h3 className="text-xl font-bold text-stone-900">
                  {isCheckedIn ? 'Checked In & Working' : 'Checked Out'}
                </h3>
                <Badge variant={isCheckedIn ? 'success' : 'default'} size="sm">
                  {isCheckedIn ? 'Active' : 'Offline'}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs text-stone-500 mt-2">
                <span>
                  Check-in:{' '}
                  <strong className="text-stone-800">{isCheckedIn ? checkInTime : '--:--'}</strong>
                </span>
                <span>•</span>
                <span>
                  Mode: <strong className="text-stone-800">Office (In-Geofence)</strong>
                </span>
                <span>•</span>
                <span>
                  Logged Hours:{' '}
                  <strong className="text-amber-700">
                    {isCheckedIn ? '3 hrs 45 mins' : '0 hrs'}
                  </strong>
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant={isCheckedIn ? 'outline' : 'primary'}
              size="lg"
              onClick={handleToggleAttendance}
              leftIcon={
                isCheckedIn ? <LogOut className="h-4 w-4" /> : <LogIn className="h-4 w-4" />
              }
            >
              {isCheckedIn ? 'Punch Out' : 'Punch In'}
            </Button>
          </div>
        </div>
      </div>

      {/* Leave Balances Grid (Requirement 14) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-stone-900 uppercase tracking-wider">
            Leave Balances
          </h2>
          <a href="/leave" className="text-xs font-semibold text-amber-700 hover:underline">
            Apply Leave & View History →
          </a>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              type: 'Casual Leave (CL)',
              available: 8,
              total: 12,
              used: 4,
              color: 'bg-amber-50 text-amber-800',
            },
            {
              type: 'Sick Leave (SL)',
              available: 10,
              total: 10,
              used: 0,
              color: 'bg-emerald-50 text-emerald-800',
            },
            {
              type: 'Privilege Leave (PL)',
              available: 14,
              total: 18,
              used: 4,
              color: 'bg-sky-50 text-sky-800',
            },
          ].map((leave, i) => (
            <div key={i} className="p-4 rounded-xl border border-stone-200/90 bg-white shadow-2xs">
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${leave.color}`}>
                {leave.type}
              </span>
              <div className="mt-3 flex items-baseline justify-between">
                <div>
                  <span className="text-2xl font-bold text-stone-900">{leave.available}</span>
                  <span className="text-xs text-stone-400"> / {leave.total} days</span>
                </div>
                <span className="text-xs text-stone-500 font-medium">{leave.used} used</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Upcoming Leave & Official Visits Placeholders */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Upcoming Leave */}
        <div className="rounded-xl border border-stone-200/90 bg-white p-5">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <h3 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-amber-600" /> Upcoming Planned Leave
            </h3>
            <Badge variant="outline" size="sm">
              1 Scheduled
            </Badge>
          </div>
          <div className="mt-3.5 space-y-3">
            <div className="p-3 rounded-lg bg-stone-50/70 border border-stone-150">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-stone-900">Diwali Festival Vacation</span>
                <Badge variant="success" size="sm">
                  Approved
                </Badge>
              </div>
              <p className="text-xs text-stone-500 mt-1">Oct 29 - Oct 31 • 3 Days (Casual Leave)</p>
            </div>
          </div>
        </div>

        {/* Official Visits Placeholder */}
        <div className="rounded-xl border border-stone-200/90 bg-white p-5">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <h3 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-purple-600" /> Official Visits (Outdoor Duty)
            </h3>
            <Badge variant="outline" size="sm">
              1 Request
            </Badge>
          </div>
          <div className="mt-3.5 space-y-3">
            <div className="p-3 rounded-lg bg-stone-50/70 border border-stone-150">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-stone-900">Client Data Center Tour</span>
                <Badge variant="purple" size="sm">
                  Visit Planned
                </Badge>
              </div>
              <p className="text-xs text-stone-500 mt-1">
                Hyderabad Site • Oct 18 • Geofence Bypass
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Notifications (Requirement 14) */}
      <div className="rounded-xl border border-stone-200/90 bg-white p-5">
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <h3 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
            <Bell className="h-4 w-4 text-amber-600" /> Recent Organization Updates
          </h3>
          <span className="text-xs text-stone-400">All caught up</span>
        </div>
        <div className="mt-3 divide-y divide-stone-100">
          {[
            {
              title: 'Holiday Announcement: Dussehra',
              text: 'All branches will remain closed on Monday, October 12.',
              time: '2 hours ago',
            },
            {
              title: 'Leave Application Approved',
              text: 'Your manager approved your casual leave for Diwali festival.',
              time: '1 day ago',
            },
            {
              title: 'Annual Policy Revision Published',
              text: 'Please review the updated HR & Travel policy under Documents.',
              time: '3 days ago',
            },
          ].map((notif, i) => (
            <div key={i} className="py-2.5 first:pt-0 last:pb-0">
              <p className="text-xs font-medium text-stone-900">{notif.title}</p>
              <p className="text-xs text-stone-500 mt-0.5">{notif.text}</p>
              <span className="text-[10px] text-stone-400 block mt-1">{notif.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
