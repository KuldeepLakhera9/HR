'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, KPICard, Badge, Button, Skeleton, Drawer, Dialog } from '@hrms/ui';
import {
  Users,
  Clock,
  AlertTriangle,
  AlertCircle,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  RefreshCw,
  Lock,
  Unlock,
  Check,
  X,
  FileCheck2,
  FileEdit,
  RotateCcw,
  UserCheck,
} from 'lucide-react';
import { attendanceApi } from '../../../lib/api-client';

interface ManagerTeamAttendanceProps {
  onRefreshNeeded?: () => void;
}

export const ManagerTeamAttendance: React.FC<ManagerTeamAttendanceProps> = () => {
  // Query Filter States
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Dashboard Data State
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  // Team Records State
  const [records, setRecords] = useState<any[]>([]);
  const [paginationMeta, setPaginationMeta] = useState<any>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [isLoadingRecords, setIsLoadingRecords] = useState(true);
  const [recordsError, setRecordsError] = useState<string | null>(null);

  // Pending Corrections State
  const [corrections, setCorrections] = useState<any[]>([]);
  const [isLoadingCorrections, setIsLoadingCorrections] = useState(true);

  // Review / Decision Modal State
  const [selectedCorrection, setSelectedCorrection] = useState<any>(null);
  const [isDecisionModalOpen, setIsDecisionModalOpen] = useState(false);
  const [decisionAction, setDecisionAction] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [decisionNotes, setDecisionNotes] = useState('');
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  // Detail Drawer State
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [employeeDetail, setEmployeeDetail] = useState<any>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Toast / Feedback State
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  );

  // Load Team Dashboard
  const loadDashboard = useCallback(async () => {
    try {
      setIsLoadingDashboard(true);
      setDashboardError(null);
      const data = await attendanceApi.getManagerDashboard(selectedDate);
      setDashboardData(data);
    } catch (err: any) {
      setDashboardError(err.message || 'Failed to retrieve team attendance summary.');
    } finally {
      setIsLoadingDashboard(false);
    }
  }, [selectedDate]);

  // Load Team Records
  const loadRecords = useCallback(async () => {
    try {
      setIsLoadingRecords(true);
      setRecordsError(null);
      const res = await attendanceApi.getManagerRecords({
        date: selectedDate,
        search: searchQuery.trim() || undefined,
        status: selectedStatus,
        page: currentPage,
        limit: pageSize,
      });
      setRecords(res?.data || []);
      if ((res as any)?.pagination) {
        setPaginationMeta((res as any).pagination);
      }
    } catch (err: any) {
      setRecordsError(err.message || 'Failed to load team attendance records.');
    } finally {
      setIsLoadingRecords(false);
    }
  }, [selectedDate, searchQuery, selectedStatus, currentPage, pageSize]);

  // Load Pending Corrections
  const loadCorrections = useCallback(async () => {
    try {
      setIsLoadingCorrections(true);
      const data = await attendanceApi.getManagerCorrections();
      setCorrections(Array.isArray(data) ? data : []);
    } catch {
      // Non-fatal
    } finally {
      setIsLoadingCorrections(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  useEffect(() => {
    loadCorrections();
  }, [loadCorrections]);

  // Handle Detail Drawer Open
  const handleOpenDetail = async (employeeId: string) => {
    setSelectedEmployeeId(employeeId);
    setIsDrawerOpen(true);
    setIsLoadingDetail(true);
    setDetailError(null);
    try {
      const detail = await attendanceApi.getManagerEmployeeDetail(employeeId, selectedDate);
      setEmployeeDetail(detail);
    } catch (err: any) {
      setDetailError(err.message || 'Failed to retrieve team employee attendance details.');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // Open Decision Modal
  const handleOpenDecisionModal = (correction: any, action: 'APPROVED' | 'REJECTED') => {
    setSelectedCorrection(correction);
    setDecisionAction(action);
    setDecisionNotes('');
    setDecisionError(null);
    setIsDecisionModalOpen(true);
  };

  // Submit Decision
  const handleSubmitDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCorrection) return;

    setIsSubmittingDecision(true);
    setDecisionError(null);
    try {
      const res = await attendanceApi.decideCorrectionRequest(selectedCorrection.id, {
        decision: decisionAction,
        reviewNotes: decisionNotes.trim() || undefined,
      });

      if (res.success) {
        setIsDecisionModalOpen(false);
        setFeedback({
          type: 'success',
          message: `Correction request ${decisionAction.toLowerCase()} successfully.`,
        });
        await Promise.all([loadCorrections(), loadDashboard(), loadRecords()]);
      } else {
        setDecisionError(res.message || 'Failed to update correction request.');
      }
    } catch (err: any) {
      setDecisionError(err.message || 'Failed to update correction request.');
    } finally {
      setIsSubmittingDecision(false);
    }
  };

  // Helpers
  const formatMinutes = (totalMin: number) => {
    const hours = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    return `${hours}h ${String(mins).padStart(2, '0')}m`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PRESENT':
        return <Badge variant="success">PRESENT</Badge>;
      case 'HALF_DAY':
        return <Badge variant="warning">HALF DAY</Badge>;
      case 'LATE':
        return <Badge variant="warning">LATE</Badge>;
      case 'ABSENT':
        return <Badge variant="danger">ABSENT</Badge>;
      case 'INCOMPLETE':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-300">
            <AlertTriangle className="h-3 w-3" /> INCOMPLETE
          </span>
        );
      case 'PENDING_REVIEW':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-800 bg-purple-50 px-2 py-0.5 rounded border border-purple-300">
            <ShieldAlert className="h-3 w-3" /> PENDING REVIEW
          </span>
        );
      case 'ON_LEAVE':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
            ON LEAVE
          </span>
        );
      default:
        return <Badge variant="default">{status || 'NOT SCHEDULED'}</Badge>;
    }
  };

  const headcount = dashboardData?.headcount || {
    totalTeamMembers: 0,
    checkedInNow: 0,
    present: 0,
    lateArrivals: 0,
    halfDay: 0,
    absent: 0,
    onLeave: 0,
    incomplete: 0,
    pendingReview: 0,
    notScheduled: 0,
    unresolvedExceptions: 0,
  };

  const pendingCorrectionsList = corrections.filter((c) => c.status === 'PENDING');

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 1. Header & Date Controls */}
      <div className="p-4 md:p-5 rounded-xl border border-stone-200 bg-gradient-to-r from-stone-50 via-white to-amber-50/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700 bg-amber-100/70 px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
              <UserCheck className="h-3.5 w-3.5" /> Team Reporting Scope
            </span>
            <span className="text-xs text-stone-500">
              Timezone:{' '}
              <strong className="text-stone-800">
                {dashboardData?.timezone || 'Asia/Kolkata'}
              </strong>
            </span>
          </div>
          <p className="text-xs text-stone-500 mt-1">
            Authoritative attendance tracking, incomplete session monitoring, and regularization for
            your direct and indirect reports.
          </p>
        </div>

        {/* Date Selector */}
        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-lg border border-stone-200 shadow-2xs">
            <Calendar className="h-4 w-4 text-stone-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setCurrentPage(1);
              }}
              className="text-xs font-semibold text-stone-800 bg-transparent focus:outline-none"
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              loadDashboard();
              loadRecords();
              loadCorrections();
            }}
            disabled={isLoadingDashboard || isLoadingRecords}
            className="border-stone-200 text-stone-700 hover:bg-stone-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${
                isLoadingDashboard || isLoadingRecords ? 'animate-spin' : ''
              }`}
            />
          </Button>
        </div>
      </div>

      {/* Global Feedback Banner */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs animate-fade-in ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="font-bold hover:opacity-80">
            ×
          </button>
        </div>
      )}

      {/* 2. Team Attendance KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {isLoadingDashboard ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-4 border-stone-200">
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-7 w-12" />
            </Card>
          ))
        ) : (
          <>
            <KPICard
              title="Team Size"
              value={headcount.totalTeamMembers}
              description="Direct & team reports"
              icon={<Users className="h-4 w-4 text-stone-700" />}
              iconBg="bg-stone-100"
            />
            <KPICard
              title="Checked-In Now"
              value={headcount.checkedInNow}
              description="Working actively"
              icon={
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
                </span>
              }
              iconBg="bg-emerald-50"
            />
            <KPICard
              title="Present Today"
              value={headcount.present}
              description="Valid work summary"
              icon={<CheckCircle2 className="h-4 w-4 text-emerald-700" />}
              iconBg="bg-emerald-50"
            />
            <KPICard
              title="Late Arrivals"
              value={headcount.lateArrivals}
              description="Past grace period"
              icon={<Clock className="h-4 w-4 text-amber-700" />}
              iconBg="bg-amber-50"
            />
            <KPICard
              title="Incomplete"
              value={headcount.incomplete}
              description="Missing check-out"
              icon={<AlertTriangle className="h-4 w-4 text-amber-700" />}
              iconBg="bg-amber-100/60"
            />
            <KPICard
              title="Pending Reviews"
              value={pendingCorrectionsList.length}
              description="Correction requests"
              icon={<FileEdit className="h-4 w-4 text-purple-700" />}
              iconBg="bg-purple-50"
            />
          </>
        )}
      </div>

      {/* 3. Pending Correction Requests for Manager Review */}
      {pendingCorrectionsList.length > 0 && (
        <Card className="p-5 border-amber-200/80 bg-amber-50/20 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-amber-200/50 mb-3">
            <div className="flex items-center gap-2">
              <FileCheck2 className="h-5 w-5 text-amber-700" />
              <h3 className="text-sm font-bold text-stone-900">
                Pending Team Attendance Regularizations ({pendingCorrectionsList.length})
              </h3>
            </div>
            <span className="text-xs text-amber-800 font-medium">Requires manager action</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {pendingCorrectionsList.map((req) => (
              <div
                key={req.id}
                className="p-4 bg-white rounded-xl border border-stone-200 shadow-2xs space-y-2.5 text-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-stone-900">
                      {req.employee?.displayName || 'Team Member'}
                    </span>
                    <span className="text-[11px] font-mono text-stone-400">
                      ({req.employee?.employeeCode})
                    </span>
                  </div>
                  <Badge variant="warning" size="sm">
                    PENDING
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-stone-600 bg-stone-50 p-2.5 rounded-lg text-[11px]">
                  <div>
                    <span className="text-stone-400 block text-[10px]">DATE</span>
                    <strong>{req.targetDate ? req.targetDate.split('T')[0] : '—'}</strong>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px]">REQUESTED TIMINGS</span>
                    <strong className="font-mono">
                      {req.requestedCheckIn
                        ? new Date(req.requestedCheckIn).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '09:00'}{' '}
                      –{' '}
                      {req.requestedCheckOut
                        ? new Date(req.requestedCheckOut).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '18:00'}
                    </strong>
                  </div>
                </div>

                <p className="text-stone-600 text-xs">
                  <strong>Reason:</strong> {req.reason}
                </p>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleOpenDecisionModal(req, 'REJECTED')}
                    className="text-rose-700 hover:bg-rose-50 text-xs h-7 px-2.5"
                  >
                    <X className="h-3.5 w-3.5 mr-1" /> Reject
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleOpenDecisionModal(req, 'APPROVED')}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-7 px-3 font-semibold"
                  >
                    <Check className="h-3.5 w-3.5 mr-1" /> Approve
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 4. Search & Status Filter Bar */}
      <Card className="p-4 border-stone-200">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
            <input
              type="text"
              placeholder="Search team member by name or employee code..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-stone-200 bg-white placeholder-stone-400 text-stone-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div className="flex items-center gap-2.5">
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 text-xs rounded-lg border border-stone-200 bg-white text-stone-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="PRESENT">Present</option>
              <option value="LATE">Late Arrivals</option>
              <option value="HALF_DAY">Half Day</option>
              <option value="INCOMPLETE">Incomplete</option>
              <option value="PENDING_REVIEW">Pending Review</option>
              <option value="ABSENT">Absent</option>
              <option value="ON_LEAVE">On Leave</option>
            </select>

            {(searchQuery || selectedStatus !== 'ALL') && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedStatus('ALL');
                  setCurrentPage(1);
                }}
                className="text-stone-500 hover:text-stone-900 text-xs px-2.5"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* 5. Team Attendance Records Table */}
      <Card className="border-stone-200 overflow-hidden shadow-2xs">
        <div className="p-4 border-b border-stone-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-stone-900">Team Attendance Table</h3>
            <span className="text-xs text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full font-mono">
              {paginationMeta.total} Members
            </span>
          </div>

          <div className="text-xs text-stone-500 flex items-center gap-2">
            <span>Per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="border border-stone-200 rounded px-1.5 py-0.5 text-xs bg-white"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
          </div>
        </div>

        {recordsError && (
          <div className="p-6 text-center">
            <div className="inline-flex p-3 bg-rose-50 text-rose-600 rounded-full mb-2">
              <AlertCircle className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-rose-900">{recordsError}</p>
            <Button size="sm" variant="secondary" onClick={loadRecords} className="mt-3 text-xs">
              Retry
            </Button>
          </div>
        )}

        {isLoadingRecords && !recordsError && (
          <div className="p-6 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-6 w-20" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        )}

        {!isLoadingRecords && !recordsError && records.length === 0 && (
          <div className="p-12 text-center space-y-3">
            <div className="inline-flex p-3 bg-stone-100 text-stone-400 rounded-full">
              <Users className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-stone-800">No team reports found</p>
            <p className="text-xs text-stone-500 max-w-sm mx-auto">
              No subordinate employees reporting to your profile matched the criteria for{' '}
              {selectedDate}.
            </p>
          </div>
        )}

        {!isLoadingRecords && !recordsError && records.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-stone-700">
              <thead className="bg-stone-50 text-[11px] font-semibold uppercase tracking-wider text-stone-500 border-b border-stone-200">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Designation & Dept</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">First Punch</th>
                  <th className="py-3 px-4">Last Punch</th>
                  <th className="py-3 px-4">Net Hours</th>
                  <th className="py-3 px-4">Alerts</th>
                  <th className="py-3 px-4">Verification</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 font-medium">
                {records.map((row: any) => {
                  const emp = row.employee;
                  const sum = row.summary;
                  const loc = row.locationVerification;
                  const active = row.activeSession;
                  const excCount = row.exceptionCount || 0;

                  return (
                    <tr
                      key={emp.id}
                      className="hover:bg-stone-50/80 transition-colors cursor-pointer"
                      onClick={() => handleOpenDetail(emp.id)}
                    >
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-amber-600 to-amber-800 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                            {emp.displayName ? emp.displayName.charAt(0).toUpperCase() : 'M'}
                          </div>
                          <div>
                            <span className="font-bold text-stone-900 block hover:text-amber-700">
                              {emp.displayName}
                            </span>
                            <span className="text-[11px] font-mono text-stone-400">
                              {emp.employeeCode}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="text-stone-800 text-xs font-semibold">
                          {emp.designation}
                        </div>
                        <div className="text-[11px] text-stone-400">{emp.department}</div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {getStatusBadge(sum.status)}
                          {active && (
                            <span
                              className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0"
                              title="Active open session"
                            />
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap font-mono text-stone-700">
                        {sum.firstCheckIn
                          ? new Date(sum.firstCheckIn).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap font-mono text-stone-700">
                        {sum.lastCheckOut ? (
                          new Date(sum.lastCheckOut).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        ) : active ? (
                          <span className="text-emerald-700 text-[11px] font-sans">Open</span>
                        ) : (
                          '—'
                        )}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap font-mono text-stone-900 font-semibold">
                        {sum.netHours > 0 ? `${sum.netHours} hrs` : '0 hrs'}
                        {sum.lateMinutes > 0 && (
                          <span className="text-amber-700 text-[11px] block font-sans">
                            +{sum.lateMinutes}m late
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        {excCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                            <ShieldAlert className="h-3 w-3" /> {excCount} Alert
                            {excCount > 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span className="text-stone-400 text-[11px]">Normal</span>
                        )}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        {loc ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1">
                              {loc.geofenceStatus === 'VERIFIED' ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                                  <ShieldCheck className="h-3.5 w-3.5" /> Inside (
                                  {loc.distanceMeters}m)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700">
                                  <ShieldAlert className="h-3.5 w-3.5" /> Outside (
                                  {loc.distanceMeters}m)
                                </span>
                              )}
                            </div>
                            {loc.isGpsRedacted && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-stone-400">
                                <Lock className="h-2.5 w-2.5" /> GPS Redacted
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-stone-400 text-[11px]">—</span>
                        )}
                      </td>

                      <td
                        className="py-3 px-4 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => handleOpenDetail(emp.id)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100/70 px-2.5 py-1 rounded-lg transition-colors"
                        >
                          <Eye className="h-3.5 w-3.5" /> View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="p-4 border-t border-stone-100 bg-stone-50/50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-stone-500">
          <div>
            Showing{' '}
            <strong className="text-stone-800">
              {paginationMeta.total === 0
                ? 0
                : (paginationMeta.page - 1) * paginationMeta.limit + 1}
            </strong>{' '}
            to{' '}
            <strong className="text-stone-800">
              {Math.min(paginationMeta.page * paginationMeta.limit, paginationMeta.total)}
            </strong>{' '}
            of <strong className="text-stone-800">{paginationMeta.total}</strong> team members
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={paginationMeta.page <= 1 || isLoadingRecords}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="h-8 px-2.5 text-xs border-stone-200"
            >
              <ChevronLeft className="h-4 w-4 mr-0.5" /> Previous
            </Button>
            <span className="px-2 font-semibold text-stone-700">
              Page {paginationMeta.page} of {paginationMeta.totalPages}
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={paginationMeta.page >= paginationMeta.totalPages || isLoadingRecords}
              onClick={() => setCurrentPage((p) => Math.min(paginationMeta.totalPages, p + 1))}
              className="h-8 px-2.5 text-xs border-stone-200"
            >
              Next <ChevronRight className="h-4 w-4 ml-0.5" />
            </Button>
          </div>
        </div>
      </Card>

      {/* 6. Review & Decision Modal */}
      <Dialog
        isOpen={isDecisionModalOpen}
        onClose={() => setIsDecisionModalOpen(false)}
        title={
          decisionAction === 'APPROVED'
            ? 'Approve Attendance Regularization'
            : 'Reject Attendance Regularization'
        }
        maxWidth="md"
      >
        <form onSubmit={handleSubmitDecision} className="space-y-4 text-xs">
          {decisionError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{decisionError}</span>
            </div>
          )}

          {selectedCorrection && (
            <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 space-y-1">
              <div>
                <strong>Employee:</strong> {selectedCorrection.employee?.displayName} (
                {selectedCorrection.employee?.employeeCode})
              </div>
              <div>
                <strong>Target Date:</strong> {selectedCorrection.targetDate?.split('T')[0]}
              </div>
              <div>
                <strong>Employee Justification:</strong> {selectedCorrection.reason}
              </div>
            </div>
          )}

          <div>
            <label className="font-semibold text-stone-700 block mb-1">
              Review Notes & Remarks
            </label>
            <textarea
              rows={3}
              value={decisionNotes}
              onChange={(e) => setDecisionNotes(e.target.value)}
              placeholder={
                decisionAction === 'APPROVED'
                  ? 'Add approval note (e.g., Verified client visit log)...'
                  : 'Specify reason for rejection (e.g., Insufficient documentation)...'
              }
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-stone-900 text-xs focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsDecisionModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmittingDecision}
              className={
                decisionAction === 'APPROVED'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white font-semibold'
                  : 'bg-rose-600 hover:bg-rose-700 text-white font-semibold'
              }
            >
              {isSubmittingDecision ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Submitting...
                </>
              ) : decisionAction === 'APPROVED' ? (
                <>
                  <Check className="h-3.5 w-3.5 mr-1.5" /> Confirm Approval
                </>
              ) : (
                <>
                  <X className="h-3.5 w-3.5 mr-1.5" /> Confirm Rejection
                </>
              )}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* 7. Team Member Detail Drawer */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={
          employeeDetail?.employee?.displayName
            ? `${employeeDetail.employee.displayName} (${employeeDetail.employee.employeeCode})`
            : 'Team Member Attendance Detail'
        }
        side="right"
      >
        <div className="space-y-6 text-xs">
          {isLoadingDetail && (
            <div className="space-y-4 py-4">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          )}

          {detailError && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 space-y-2">
              <div className="flex items-center gap-2 font-semibold">
                <AlertCircle className="h-4 w-4" /> Access Error
              </div>
              <p>{detailError}</p>
            </div>
          )}

          {!isLoadingDetail && !detailError && employeeDetail && (
            <>
              {/* Profile Card */}
              <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-stone-900 text-sm">
                    {employeeDetail.employee.displayName}
                  </span>
                  <Badge variant="default">{employeeDetail.employee.status}</Badge>
                </div>
                <div className="text-stone-600 grid grid-cols-2 gap-1.5 pt-1">
                  <div>
                    <span className="text-stone-400 block text-[10px]">DESIGNATION</span>
                    <strong>{employeeDetail.employee.designation}</strong>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px]">DEPARTMENT</span>
                    <strong>{employeeDetail.employee.department}</strong>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px]">BRANCH</span>
                    <strong>{employeeDetail.employee.branch}</strong>
                  </div>
                  <div>
                    <span className="text-stone-400 block text-[10px]">WORKING DATE</span>
                    <strong className="font-mono">{employeeDetail.date}</strong>
                  </div>
                </div>
              </div>

              {/* Day Summary */}
              <div className="p-4 bg-white rounded-xl border border-stone-200 space-y-3">
                <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                  <span className="font-bold text-stone-900">Attendance Summary</span>
                  {getStatusBadge(employeeDetail.summary?.status || 'NOT_SCHEDULED')}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-stone-700">
                  <div className="p-2 bg-stone-50 rounded-lg">
                    <span className="text-stone-400 text-[10px] block">First Punch</span>
                    <strong className="font-mono text-stone-900">
                      {employeeDetail.summary?.firstCheckIn
                        ? new Date(employeeDetail.summary.firstCheckIn).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </strong>
                  </div>
                  <div className="p-2 bg-stone-50 rounded-lg">
                    <span className="text-stone-400 text-[10px] block">Last Punch</span>
                    <strong className="font-mono text-stone-900">
                      {employeeDetail.summary?.lastCheckOut
                        ? new Date(employeeDetail.summary.lastCheckOut).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </strong>
                  </div>
                  <div className="p-2 bg-stone-50 rounded-lg">
                    <span className="text-stone-400 text-[10px] block">Net Hours</span>
                    <strong className="font-mono text-emerald-700">
                      {formatMinutes(employeeDetail.summary?.totalWorkMinutes || 0)}
                    </strong>
                  </div>
                  <div className="p-2 bg-stone-50 rounded-lg">
                    <span className="text-stone-400 text-[10px] block">Break Taken</span>
                    <strong className="font-mono text-stone-900">
                      {formatMinutes(employeeDetail.summary?.totalBreakMinutes || 0)}
                    </strong>
                  </div>
                  <div className="p-2 bg-stone-50 rounded-lg">
                    <span className="text-stone-400 text-[10px] block">Late Arrival</span>
                    <strong
                      className={`font-mono ${
                        (employeeDetail.summary?.lateMinutes || 0) > 0
                          ? 'text-amber-700'
                          : 'text-stone-900'
                      }`}
                    >
                      {employeeDetail.summary?.lateMinutes || 0}m
                    </strong>
                  </div>
                  <div className="p-2 bg-stone-50 rounded-lg">
                    <span className="text-stone-400 text-[10px] block">Overtime</span>
                    <strong className="font-mono text-emerald-700">
                      {employeeDetail.summary?.overtimeMinutes || 0}m
                    </strong>
                  </div>
                </div>
              </div>

              {/* Sessions & Punches */}
              <div className="space-y-3">
                <span className="font-bold text-stone-900 uppercase tracking-wider text-[11px] block">
                  Recorded Sessions ({employeeDetail.sessions?.length || 0})
                </span>

                {employeeDetail.sessions?.length === 0 ? (
                  <div className="p-4 bg-stone-50 rounded-xl text-center text-stone-400">
                    No sessions recorded on this working date.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {employeeDetail.sessions?.map((sess: any) => (
                      <div
                        key={sess.id}
                        className="p-3 bg-white rounded-xl border border-stone-200 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-stone-900">
                            Session #{sess.sessionNumber}
                          </span>
                          <Badge
                            variant={
                              sess.status === 'COMPLETED'
                                ? 'success'
                                : sess.status === 'OPEN'
                                  ? 'warning'
                                  : 'danger'
                            }
                            size="sm"
                          >
                            {sess.status}
                          </Badge>
                        </div>

                        {sess.events && sess.events.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-stone-100 space-y-1.5">
                            {sess.events.map((ev: any) => (
                              <div
                                key={ev.id}
                                className="p-2 bg-stone-50 rounded-lg flex flex-col gap-1"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-stone-800">{ev.eventType}</span>
                                  <span className="font-mono text-stone-500">
                                    {new Date(ev.eventTimestamp).toLocaleTimeString([], {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      second: '2-digit',
                                    })}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-[10px] text-stone-500">
                                  <span>Mode: {ev.attendanceMode}</span>
                                  <span>•</span>
                                  <span>Office: {ev.officeName || 'Assigned Office'}</span>
                                  {ev.distanceFromOfficeMeters !== null && (
                                    <>
                                      <span>•</span>
                                      <span>{ev.distanceFromOfficeMeters}m</span>
                                    </>
                                  )}
                                  <span>•</span>
                                  <span
                                    className={`font-semibold ${
                                      ev.geofenceStatus === 'VERIFIED'
                                        ? 'text-emerald-700'
                                        : 'text-rose-700'
                                    }`}
                                  >
                                    {ev.geofenceStatus}
                                  </span>
                                </div>
                                <div className="pt-1 border-t border-stone-200/50 flex items-center justify-between text-[10px]">
                                  {ev.isGpsRedacted ? (
                                    <span className="inline-flex items-center gap-1 text-stone-400">
                                      <Lock className="h-3 w-3" /> GPS Coordinates Redacted (Privacy
                                      Enforced)
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-emerald-700 font-mono">
                                      <Unlock className="h-3 w-3" /> Lat: {ev.latitude?.toFixed(4)},
                                      Long: {ev.longitude?.toFixed(4)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </Drawer>
    </div>
  );
};
