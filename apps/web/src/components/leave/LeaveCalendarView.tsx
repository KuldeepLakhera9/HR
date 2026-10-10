'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Badge, Button, Skeleton } from '@hrms/ui';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Filter,
  Users,
  Building,
  Sparkles,
  MapPin,
  Home,
  Clock,
  Briefcase,
  AlertCircle,
  Eye,
  CheckCircle2,
} from 'lucide-react';
import { leaveApi } from '../../lib/api-client';
import { useAuth } from '../../context/AuthContext';

interface CalendarEvent {
  id: string;
  type: 'APPROVED_LEAVE' | 'PENDING_LEAVE' | 'HOLIDAY' | 'WFH' | 'OFFICIAL_VISIT';
  title: string;
  startDate: string;
  endDate: string;
  status: string;
  durationType?: string;
  chargeableDays?: number;
  color: string;
  isOptional?: boolean;
  employee?: {
    id: string;
    displayName: string;
    employeeCode: string;
    avatarUrl?: string | null;
    department?: string | null;
  };
  leaveType?: {
    id: string;
    name: string;
    code: string;
    color: string;
  };
  destinationsCount?: number;
}

interface CalendarResponse {
  startDate: string;
  endDate: string;
  scope: string;
  events: CalendarEvent[];
  summary: {
    totalApprovedLeaves: number;
    totalPendingLeaves: number;
    totalHolidays: number;
    totalWfh: number;
    totalVisits: number;
    totalEvents: number;
  };
}

export const LeaveCalendarView: React.FC = () => {
  const { user } = useAuth();
  const isAdminOrHr = user?.roles?.includes('ADMIN') || user?.roles?.includes('HR');
  const isManager = user?.roles?.includes('MANAGER');

  // Month navigation state
  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [scope, setScope] = useState<'my' | 'team' | 'organization'>(
    isAdminOrHr ? 'organization' : isManager ? 'team' : 'team',
  );

  const [filterType, setFilterType] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'month' | 'agenda'>('month');

  const [calendarData, setCalendarData] = useState<CalendarResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected event modal
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  // Derive date range for current month
  const { startDateStr, endDateStr, monthTitle } = useMemo(() => {
    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      startDateStr: `${year}-${pad(month + 1)}-01`,
      endDateStr: `${year}-${pad(month + 1)}-${pad(lastDay.getDate())}`,
      monthTitle: firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    };
  }, [currentMonthDate]);

  // Load calendar data
  const loadCalendar = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await leaveApi.getCalendar({
        startDate: startDateStr,
        endDate: endDateStr,
        scope,
      });

      if (res.success && res.data) {
        setCalendarData(res.data);
      } else {
        setError(res.message || 'Failed to load calendar events.');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred loading the team leave calendar.');
    } finally {
      setIsLoading(false);
    }
  }, [startDateStr, endDateStr, scope]);

  useEffect(() => {
    loadCalendar();
  }, [loadCalendar]);

  const handlePrevMonth = () => {
    setCurrentMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleToday = () => {
    const now = new Date();
    setCurrentMonthDate(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  // Filter events
  const filteredEvents = useMemo(() => {
    if (!calendarData?.events) return [];
    if (filterType === 'ALL') return calendarData.events;
    return calendarData.events.filter((e) => e.type === filterType);
  }, [calendarData, filterType]);

  // Month grid day cells
  const calendarDays = useMemo(() => {
    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days = [];
    // Pad previous month days
    for (let i = 0; i < firstDayIndex; i++) {
      days.push({ day: null, dateStr: null, isCurrentMonth: false });
    }
    // Current month days
    const pad = (n: number) => String(n).padStart(2, '0');
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${pad(month + 1)}-${pad(d)}`;
      days.push({ day: d, dateStr, isCurrentMonth: true });
    }
    return days;
  }, [currentMonthDate]);

  // Map events to date strings
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const ev of filteredEvents) {
      const start = ev.startDate;
      const end = ev.endDate;
      const curr = new Date(`${start}T00:00:00Z`);
      const endD = new Date(`${end}T00:00:00Z`);

      while (curr.getTime() <= endD.getTime()) {
        const dStr = curr.toISOString().split('T')[0];
        if (!map[dStr]) map[dStr] = [];
        map[dStr].push(ev);
        curr.setUTCDate(curr.getUTCDate() + 1);
      }
    }
    return map;
  }, [filteredEvents]);

  const summary = calendarData?.summary;

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600">
            <CalendarIcon className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              Leave & Team Availability Calendar
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium border border-slate-200">
                Phase 6 Step 5
              </span>
            </h2>
            <p className="text-sm text-slate-500">
              Cross-domain schedule view integrating approved leave, holidays, WFH, and official
              visits.
            </p>
          </div>
        </div>

        {/* View Mode & Month Switcher */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200">
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                viewMode === 'month'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Month Grid
            </button>
            <button
              onClick={() => setViewMode('agenda')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                viewMode === 'agenda'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Agenda List
            </button>
          </div>

          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
            <Button size="icon" variant="outline" onClick={handlePrevMonth} title="Previous Month">
              <ChevronLeft className="w-4 h-4 text-slate-600" />
            </Button>
            <span className="text-sm font-bold text-slate-800 px-3 min-w-[140px] text-center">
              {monthTitle}
            </span>
            <Button size="icon" variant="outline" onClick={handleNextMonth} title="Next Month">
              <ChevronRight className="w-4 h-4 text-slate-600" />
            </Button>
          </div>

          <Button size="sm" variant="outline" onClick={handleToday}>
            Today
          </Button>
        </div>
      </div>

      {/* KPI Overview Strip */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <span className="text-xs text-slate-500 font-medium">Approved Leave</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-amber-600">
                {summary.totalApprovedLeaves}
              </span>
              <span className="text-xs text-slate-400">leaves</span>
            </div>
          </div>
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <span className="text-xs text-slate-500 font-medium">Pending Approvals</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-orange-500">
                {summary.totalPendingLeaves}
              </span>
              <span className="text-xs text-slate-400">awaiting</span>
            </div>
          </div>
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <span className="text-xs text-slate-500 font-medium">Public Holidays</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-emerald-600">{summary.totalHolidays}</span>
              <span className="text-xs text-slate-400">days</span>
            </div>
          </div>
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <span className="text-xs text-slate-500 font-medium">Work From Home</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-purple-600">{summary.totalWfh}</span>
              <span className="text-xs text-slate-400">authorized</span>
            </div>
          </div>
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <span className="text-xs text-slate-500 font-medium">Official Visits</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-blue-600">{summary.totalVisits}</span>
              <span className="text-xs text-slate-400">trips</span>
            </div>
          </div>
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
            <span className="text-xs text-slate-500 font-medium">Total Activity</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-slate-800">{summary.totalEvents}</span>
              <span className="text-xs text-slate-400">events</span>
            </div>
          </div>
        </div>
      )}

      {/* Scope and Filter Pills */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
        {/* Scope selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Scope:
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setScope('my')}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                scope === 'my'
                  ? 'bg-amber-500 text-white border-amber-600 shadow-sm'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              My Calendar
            </button>
            <button
              onClick={() => setScope('team')}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                scope === 'team'
                  ? 'bg-amber-500 text-white border-amber-600 shadow-sm'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              Team Availability
            </button>
            {isAdminOrHr && (
              <button
                onClick={() => setScope('organization')}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  scope === 'organization'
                    ? 'bg-amber-500 text-white border-amber-600 shadow-sm'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Organization Wide
              </button>
            )}
          </div>
        </div>

        {/* Event Type Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-1">
            Filter:
          </span>
          {[
            { key: 'ALL', label: 'All', color: 'bg-slate-100 text-slate-700' },
            {
              key: 'APPROVED_LEAVE',
              label: 'Leave',
              color: 'bg-amber-50 text-amber-700 border-amber-200',
            },
            {
              key: 'PENDING_LEAVE',
              label: 'Pending',
              color: 'bg-orange-50 text-orange-700 border-orange-200',
            },
            {
              key: 'HOLIDAY',
              label: 'Holiday',
              color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
            },
            { key: 'WFH', label: 'WFH', color: 'bg-purple-50 text-purple-700 border-purple-200' },
            {
              key: 'OFFICIAL_VISIT',
              label: 'Visit',
              color: 'bg-blue-50 text-blue-700 border-blue-200',
            },
          ].map((pill) => (
            <button
              key={pill.key}
              onClick={() => setFilterType(pill.key)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                filterType === pill.key
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                  : `${pill.color} hover:opacity-80`
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main View Area */}
      {isLoading ? (
        <Card className="p-8">
          <div className="space-y-4">
            <Skeleton className="h-8 w-1/4" />
            <Skeleton className="h-64 w-full" />
          </div>
        </Card>
      ) : error ? (
        <Card className="p-8 border-red-200 bg-red-50 text-center">
          <AlertCircle className="w-8 h-8 text-red-600 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-red-900">Failed to load calendar</h3>
          <p className="text-xs text-red-700 mt-1">{error}</p>
          <Button size="sm" variant="outline" className="mt-4" onClick={loadCalendar}>
            Retry
          </Button>
        </Card>
      ) : viewMode === 'month' ? (
        /* Monthly Calendar Grid */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Day Headers */}
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-bold text-slate-600 py-2.5">
            <span className="text-red-500">Sun</span>
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span className="text-amber-600">Sat</span>
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-slate-100 min-h-[500px]">
            {calendarDays.map((cell, idx) => {
              if (!cell.isCurrentMonth || !cell.dateStr) {
                return (
                  <div
                    key={`empty-${idx}`}
                    className="p-2 min-h-[90px] bg-slate-50/50 text-slate-300"
                  />
                );
              }

              const dayEvents = eventsByDate[cell.dateStr] || [];
              const isToday = cell.dateStr === new Date().toISOString().split('T')[0];
              const isWeekend = idx % 7 === 0 || idx % 7 === 6;

              return (
                <div
                  key={cell.dateStr}
                  className={`p-2 min-h-[95px] flex flex-col justify-between transition-colors ${
                    isToday ? 'bg-amber-50/30' : isWeekend ? 'bg-slate-50/40' : 'bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center ${
                        isToday
                          ? 'bg-amber-500 text-white'
                          : isWeekend
                            ? 'text-slate-400'
                            : 'text-slate-700'
                      }`}
                    >
                      {cell.day}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="text-[10px] text-slate-400 font-medium">
                        {dayEvents.length} event{dayEvents.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  {/* Event Badges */}
                  <div className="space-y-1 overflow-y-auto max-h-[70px]">
                    {dayEvents.slice(0, 3).map((ev) => (
                      <button
                        key={`${cell.dateStr}-${ev.id}-${ev.type}`}
                        onClick={() => setSelectedEvent(ev)}
                        className={`w-full text-left text-[11px] font-medium px-1.5 py-0.5 rounded truncate border transition-transform hover:scale-[1.02] ${
                          ev.type === 'APPROVED_LEAVE'
                            ? 'bg-amber-100 text-amber-900 border-amber-300'
                            : ev.type === 'PENDING_LEAVE'
                              ? 'bg-orange-100 text-orange-900 border-orange-300'
                              : ev.type === 'HOLIDAY'
                                ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                                : ev.type === 'WFH'
                                  ? 'bg-purple-100 text-purple-900 border-purple-300'
                                  : 'bg-blue-100 text-blue-900 border-blue-300'
                        }`}
                      >
                        {ev.type === 'HOLIDAY'
                          ? `🎉 ${ev.title}`
                          : ev.employee
                            ? `${ev.employee.displayName.split(' ')[0]}: ${ev.title.split(' - ')[1] || ev.type}`
                            : ev.title}
                      </button>
                    ))}
                    {dayEvents.length > 3 && (
                      <div className="text-[10px] text-center text-slate-500 font-medium">
                        +{dayEvents.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Agenda List View */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
          {filteredEvents.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <CalendarIcon className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p className="font-semibold text-slate-700">No scheduled events found</p>
              <p className="text-xs text-slate-400 mt-1">
                There are no approved leaves, holidays, or remote duties in this window.
              </p>
            </div>
          ) : (
            filteredEvents.map((ev) => (
              <div
                key={`${ev.id}-${ev.type}`}
                className="p-4 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="flex items-start gap-3.5">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                      ev.type === 'APPROVED_LEAVE'
                        ? 'bg-amber-50 text-amber-600 border-amber-200'
                        : ev.type === 'PENDING_LEAVE'
                          ? 'bg-orange-50 text-orange-600 border-orange-200'
                          : ev.type === 'HOLIDAY'
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                            : ev.type === 'WFH'
                              ? 'bg-purple-50 text-purple-600 border-purple-200'
                              : 'bg-blue-50 text-blue-600 border-blue-200'
                    }`}
                  >
                    {ev.type === 'APPROVED_LEAVE' && <Clock className="w-5 h-5" />}
                    {ev.type === 'PENDING_LEAVE' && <AlertCircle className="w-5 h-5" />}
                    {ev.type === 'HOLIDAY' && <Sparkles className="w-5 h-5" />}
                    {ev.type === 'WFH' && <Home className="w-5 h-5" />}
                    {ev.type === 'OFFICIAL_VISIT' && <MapPin className="w-5 h-5" />}
                  </div>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 text-sm">{ev.title}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                          ev.type === 'APPROVED_LEAVE'
                            ? 'bg-amber-100 text-amber-800 border-amber-200'
                            : ev.type === 'PENDING_LEAVE'
                              ? 'bg-orange-100 text-orange-800 border-orange-200'
                              : ev.type === 'HOLIDAY'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                : ev.type === 'WFH'
                                  ? 'bg-purple-100 text-purple-800 border-purple-200'
                                  : 'bg-blue-100 text-blue-800 border-blue-200'
                        }`}
                      >
                        {ev.type.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-slate-500 mt-1">
                      <span>
                        📅 {ev.startDate} {ev.endDate !== ev.startDate && `→ ${ev.endDate}`}
                      </span>
                      {ev.employee?.department && <span>🏢 Dept: {ev.employee.department}</span>}
                      {ev.chargeableDays !== undefined && (
                        <span>⏱ {ev.chargeableDays} chargeable day(s)</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <Button size="sm" variant="outline" onClick={() => setSelectedEvent(ev)}>
                    <Eye className="w-3.5 h-3.5 mr-1" />
                    Details
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Event Details Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 relative">
            <h3 className="text-lg font-bold text-slate-900 mb-1">{selectedEvent.title}</h3>
            <p className="text-xs text-slate-500 mb-4">
              Event Category: <span className="font-semibold">{selectedEvent.type}</span>
            </p>

            <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Dates:</span>
                <span className="font-semibold text-slate-900">
                  {selectedEvent.startDate}{' '}
                  {selectedEvent.endDate !== selectedEvent.startDate &&
                    `to ${selectedEvent.endDate}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status:</span>
                <span className="font-semibold text-slate-900">{selectedEvent.status}</span>
              </div>
              {selectedEvent.employee && (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Employee:</span>
                    <span className="font-semibold text-slate-900">
                      {selectedEvent.employee.displayName} ({selectedEvent.employee.employeeCode})
                    </span>
                  </div>
                  {selectedEvent.employee.department && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Department:</span>
                      <span className="font-semibold text-slate-900">
                        {selectedEvent.employee.department}
                      </span>
                    </div>
                  )}
                </>
              )}
              {selectedEvent.leaveType && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Leave Type:</span>
                  <span className="font-semibold text-slate-900">
                    {selectedEvent.leaveType.name} ({selectedEvent.leaveType.code})
                  </span>
                </div>
              )}
              {selectedEvent.chargeableDays !== undefined && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Chargeable Days:</span>
                  <span className="font-semibold text-slate-900">
                    {selectedEvent.chargeableDays} day(s)
                  </span>
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <Button size="sm" onClick={() => setSelectedEvent(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
