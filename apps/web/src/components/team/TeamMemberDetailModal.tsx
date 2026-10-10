'use client';

import React, { useEffect, useState } from 'react';
import { Button, Dialog, Badge, Avatar } from '@hrms/ui';
import { managerApi } from '../../lib/api-client';
import {
  User,
  Mail,
  Phone,
  Briefcase,
  MapPin,
  Calendar,
  Clock,
  ShieldAlert,
  ShieldCheck,
  AlertCircle,
  FileCheck2,
  CalendarClock,
  Sparkles,
} from 'lucide-react';

interface TeamMemberDetailModalProps {
  employeeId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export const TeamMemberDetailModal: React.FC<TeamMemberDetailModalProps> = ({
  employeeId,
  isOpen,
  onClose,
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'balances' | 'attendance'>('overview');

  useEffect(() => {
    if (!isOpen || !employeeId) {
      setData(null);
      setError(null);
      return;
    }

    const fetchDetail = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await managerApi.getTeamMember(employeeId);
        if (res.data) {
          setData(res.data);
        } else {
          setError(res.message || 'Failed to load team member details.');
        }
      } catch (err: any) {
        setError(err.message || 'An unexpected error occurred while fetching details.');
      } finally {
        setLoading(false);
      }
    };

    fetchDetail();
  }, [isOpen, employeeId]);

  if (!isOpen) return null;

  const profile = data?.profile;
  const availability = data?.availability;
  const balances = data?.leaveBalances || [];
  const recentAttendance = data?.recentAttendance || [];
  const upcomingAbsences = data?.upcomingAbsences || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PRESENT_OFFICE':
        return <Badge variant="success">Checked In (Office)</Badge>;
      case 'PRESENT_WFH':
        return <Badge variant="info">Checked In (WFH)</Badge>;
      case 'ON_LEAVE':
        return <Badge variant="purple">On Approved Leave</Badge>;
      case 'ON_WFH':
        return <Badge variant="info">Remote Work (Scheduled)</Badge>;
      case 'ON_VISIT':
        return <Badge variant="primary">Official Visit</Badge>;
      case 'NOT_DUE_YET':
        return <Badge variant="default">Shift Not Due</Badge>;
      case 'PENDING_CHECK_IN':
        return <Badge variant="warning">Not Checked In</Badge>;
      default:
        return <Badge variant="default">{status || 'Offline'}</Badge>;
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="xl"
      title="Team Member Profile"
      description="Authorized Manager View"
      footer={
        <Button variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-6 pt-2">
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-stone-400">
            <div className="w-8 h-8 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium text-stone-500">
              Loading authorized employee details...
            </p>
          </div>
        ) : error ? (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold">Unable to Load Details</h4>
              <p className="text-xs mt-0.5">{error}</p>
            </div>
          </div>
        ) : profile ? (
          <>
            {/* Employee Identity Card */}
            <div className="bg-white p-5 rounded-xl border border-stone-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <Avatar
                  src={profile.profilePhoto}
                  name={profile.displayName}
                  size="xl"
                  className="bg-gradient-to-tr from-amber-600 to-amber-800 text-white font-bold"
                />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-lg font-bold text-stone-900">{profile.displayName}</h4>
                    <Badge variant="outline" className="font-mono text-xs">
                      {profile.employeeCode}
                    </Badge>
                    <Badge variant={profile.status === 'ACTIVE' ? 'success' : 'warning'} size="sm">
                      {profile.status}
                    </Badge>
                    <Badge variant="primary" size="sm">
                      {profile.employment.workMode}
                    </Badge>
                  </div>
                  <p className="text-sm font-medium text-stone-700 mt-0.5">
                    {profile.employment.designation} &bull;{' '}
                    <span className="text-stone-500">{profile.employment.department}</span>
                  </p>
                  <div className="flex items-center gap-3 text-xs text-stone-500 mt-2 flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-stone-400" />
                      {profile.employment.branch}
                    </span>
                    {profile.employment.reportingManager && (
                      <span className="inline-flex items-center gap-1">
                        <Briefcase className="w-3.5 h-3.5 text-stone-400" />
                        Reports to: {profile.employment.reportingManager.displayName}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-stone-400" />
                      Joined: {new Date(profile.joiningDate).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Direct Contact Buttons */}
              <div className="flex items-center gap-2 self-stretch sm:self-center border-t sm:border-t-0 pt-3 sm:pt-0 border-stone-100">
                {profile.contact.workEmail && (
                  <a
                    href={`mailto:${profile.contact.workEmail}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 bg-stone-50 text-xs font-medium text-stone-700 hover:bg-stone-100 transition-colors"
                    title="Send Email"
                  >
                    <Mail className="w-3.5 h-3.5 text-stone-500" />
                    Email
                  </a>
                )}
                {profile.contact.workPhone && (
                  <a
                    href={`tel:${profile.contact.workPhone}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-stone-200 bg-stone-50 text-xs font-medium text-stone-700 hover:bg-stone-100 transition-colors"
                    title="Call"
                  >
                    <Phone className="w-3.5 h-3.5 text-stone-500" />
                    Call
                  </a>
                )}
              </div>
            </div>

            {/* Today's Availability Live Banner */}
            {availability && (
              <div className="bg-gradient-to-r from-stone-900 to-stone-800 text-white p-4 rounded-xl shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-amber-400">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs uppercase tracking-wider text-stone-400 font-semibold">
                        Today's Presence & Availability
                      </span>
                      {getStatusBadge(availability.status)}
                    </div>
                    <p className="text-sm font-semibold text-stone-200 mt-0.5">
                      {availability.statusLabel}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs text-stone-300 divide-x divide-stone-700">
                  <div>
                    <span className="text-stone-400 block text-[10px] uppercase">Shift</span>
                    <span className="font-semibold text-white">
                      {availability.shift.name} ({availability.shift.startTime} -{' '}
                      {availability.shift.endTime})
                    </span>
                  </div>
                  <div className="pl-4">
                    <span className="text-stone-400 block text-[10px] uppercase">
                      First Check-In
                    </span>
                    <span className="font-semibold text-white">
                      {availability.firstCheckIn
                        ? new Date(availability.firstCheckIn).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </span>
                  </div>
                  <div className="pl-4">
                    <span className="text-stone-400 block text-[10px] uppercase">Work Minutes</span>
                    <span className="font-semibold text-white">
                      {availability.totalWorkMinutes > 0
                        ? `${Math.floor(availability.totalWorkMinutes / 60)}h ${availability.totalWorkMinutes % 60}m`
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Sub-Tabs */}
            <div className="flex border-b border-stone-200 gap-6 text-sm">
              <button
                onClick={() => setActiveTab('overview')}
                className={`pb-2.5 font-semibold transition-colors relative ${
                  activeTab === 'overview'
                    ? 'text-amber-800 border-b-2 border-amber-600'
                    : 'text-stone-500 hover:text-stone-900'
                }`}
              >
                Leave Balances & Upcoming
              </button>
              <button
                onClick={() => setActiveTab('attendance')}
                className={`pb-2.5 font-semibold transition-colors relative ${
                  activeTab === 'attendance'
                    ? 'text-amber-800 border-b-2 border-amber-600'
                    : 'text-stone-500 hover:text-stone-900'
                }`}
              >
                Recent Attendance (7 Days)
              </button>
            </div>

            {/* Tab 1: Leave Balances & Upcoming Absences */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Leave Accounts Grid */}
                <div>
                  <h5 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-3 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    Active Leave Balances (Year {new Date().getFullYear()})
                  </h5>
                  {balances.length === 0 ? (
                    <div className="p-4 bg-white border border-stone-200 rounded-lg text-center text-xs text-stone-500">
                      No active leave accounts assigned for this leave period.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {balances.map((bal: any) => (
                        <div
                          key={bal.id}
                          className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm relative overflow-hidden"
                        >
                          <div
                            className="absolute top-0 left-0 right-0 h-1"
                            style={{ backgroundColor: bal.leaveTypeColor || '#d97706' }}
                          />
                          <div className="flex items-start justify-between">
                            <div>
                              <span className="text-xs font-bold text-stone-900">
                                {bal.leaveTypeName}
                              </span>
                              <span className="text-[10px] text-stone-400 block font-mono">
                                {bal.leaveTypeCode}
                              </span>
                            </div>
                            <span className="text-xl font-extrabold text-stone-900">
                              {bal.availableBalance}
                              <span className="text-xs font-normal text-stone-500 ml-1">days</span>
                            </span>
                          </div>
                          <div className="mt-3 pt-2.5 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500">
                            <span>Allocated: {bal.allocatedBalance}</span>
                            <span>Used: {bal.usedBalance}</span>
                            {bal.pendingBalance > 0 && (
                              <span className="text-amber-700 font-semibold">
                                Pending: {bal.pendingBalance}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Upcoming Scheduled Absences */}
                <div>
                  <h5 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-3 flex items-center gap-1.5">
                    <CalendarClock className="w-3.5 h-3.5 text-amber-600" />
                    Upcoming Approved Absences (Next 14 Days)
                  </h5>
                  {upcomingAbsences.length === 0 ? (
                    <div className="p-4 bg-white border border-stone-200 rounded-lg text-center text-xs text-stone-500">
                      No scheduled leaves planned in the next 14 days.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {upcomingAbsences.map((abs: any) => (
                        <div
                          key={abs.id}
                          className="p-3 bg-white border border-stone-200 rounded-lg flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: abs.leaveTypeColor || '#d97706' }}
                            />
                            <div>
                              <span className="font-semibold text-stone-900">
                                {abs.leaveTypeName}
                              </span>
                              <span className="text-stone-500 ml-2">
                                {new Date(abs.startDate).toLocaleDateString()} &ndash;{' '}
                                {new Date(abs.endDate).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" size="sm">
                              {abs.chargeableDays} {abs.chargeableDays === 1 ? 'day' : 'days'}
                            </Badge>
                            <span className="text-[11px] text-stone-400 italic">{abs.reason}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab 2: Recent Attendance Timeline */}
            {activeTab === 'attendance' && (
              <div>
                <h5 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-3 flex items-center gap-1.5">
                  <FileCheck2 className="w-3.5 h-3.5 text-amber-600" />
                  Last 7 Days Attendance Log
                </h5>
                {recentAttendance.length === 0 ? (
                  <div className="p-4 bg-white border border-stone-200 rounded-lg text-center text-xs text-stone-500">
                    No attendance records found in the last 7 days.
                  </div>
                ) : (
                  <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-stone-50 border-b border-stone-200 text-stone-600 font-semibold uppercase text-[10px]">
                        <tr>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">First In</th>
                          <th className="px-4 py-3">Last Out</th>
                          <th className="px-4 py-3">Work Duration</th>
                          <th className="px-4 py-3">Mode</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {recentAttendance.map((rec: any) => (
                          <tr key={rec.id} className="hover:bg-stone-50/50">
                            <td className="px-4 py-2.5 font-medium text-stone-900">
                              {new Date(rec.date).toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </td>
                            <td className="px-4 py-2.5">
                              <Badge
                                size="sm"
                                variant={
                                  rec.status === 'PRESENT'
                                    ? 'success'
                                    : rec.status === 'ABSENT'
                                      ? 'danger'
                                      : rec.status === 'LEAVE'
                                        ? 'purple'
                                        : 'default'
                                }
                              >
                                {rec.status}
                              </Badge>
                            </td>
                            <td className="px-4 py-2.5 text-stone-600">
                              {rec.firstCheckIn
                                ? new Date(rec.firstCheckIn).toLocaleTimeString('en-US', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-stone-600">
                              {rec.lastCheckOut
                                ? new Date(rec.lastCheckOut).toLocaleTimeString('en-US', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : '—'}
                            </td>
                            <td className="px-4 py-2.5 font-medium text-stone-800">
                              {rec.totalWorkMinutes > 0
                                ? `${Math.floor(rec.totalWorkMinutes / 60)}h ${rec.totalWorkMinutes % 60}m`
                                : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-stone-500">
                              {rec.primaryAttendanceMode || 'OFFICE'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Privacy Notice Footnote */}
            <div className="p-3 bg-amber-50/60 border border-amber-200/60 rounded-lg flex items-center gap-2.5 text-[11px] text-amber-900">
              <ShieldCheck className="w-4 h-4 text-amber-700 flex-shrink-0" />
              <span>
                <strong>Privacy Protected:</strong> In compliance with organizational data
                confidentiality rules, private leave medical reasons, personal emergency contacts,
                and sensitive payroll details are excluded from the manager view.
              </span>
            </div>
          </>
        ) : null}
      </div>
    </Dialog>
  );
};
