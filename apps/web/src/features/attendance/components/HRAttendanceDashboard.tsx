'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  KPICard,
  Badge,
  Button,
  Input,
  Skeleton,
  Drawer,
  Dialog,
} from '@hrms/ui';
import {
  Users,
  UserCheck,
  Clock,
  AlertTriangle,
  AlertCircle,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  MapPin,
  Building,
  Filter,
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  RefreshCw,
  Globe,
  Calendar,
  Coffee,
  Lock,
  Unlock,
  SlidersHorizontal,
  Briefcase,
  Home,
  Check,
  X,
  XCircle,
  FileText,
  ChevronDown,
  RotateCcw,
  Compass,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { attendanceApi, organizationApi } from '../../../lib/api-client';
import { useAuth } from '../../../context/AuthContext';
import { HRAttendanceExceptionsQueue } from './HRAttendanceExceptionsQueue';
import { FieldAndRemoteOverviewDashboard } from './FieldAndRemoteOverviewDashboard';

interface HRAttendanceDashboardProps {
  onRefreshNeeded?: () => void;
}

export const HRAttendanceDashboard: React.FC<HRAttendanceDashboardProps> = () => {
  const { user } = useAuth();

  // Sub-navigation state: 'roster' | 'exceptions' | 'corrections' | 'field-remote'
  const [hrSubTab, setHrSubTab] = useState<
    'roster' | 'exceptions' | 'corrections' | 'field-remote'
  >('roster');

  // Query Filter States
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [selectedDeptId, setSelectedDeptId] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Corrections State
  const [corrections, setCorrections] = useState<any[]>([]);
  const [isLoadingCorrections, setIsLoadingCorrections] = useState(true);
  const [selectedCorrection, setSelectedCorrection] = useState<any>(null);
  const [isDecisionModalOpen, setIsDecisionModalOpen] = useState(false);
  const [decisionAction, setDecisionAction] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [decisionNotes, setDecisionNotes] = useState('');
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [decisionSuccess, setDecisionSuccess] = useState<string | null>(null);

  // Metadata dropdown options
  const [branches, setBranches] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);

  // Operations Dashboard State
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  // Operations Records (Table) State
  const [records, setRecords] = useState<any[]>([]);
  const [paginationMeta, setPaginationMeta] = useState<any>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  });
  const [isLoadingRecords, setIsLoadingRecords] = useState(true);
  const [recordsError, setRecordsError] = useState<string | null>(null);

  // Detail Drawer State
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [employeeDetail, setEmployeeDetail] = useState<any>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Action status (reconciliation)
  const [isReconciling, setIsReconciling] = useState(false);
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Load filter options (branches & departments)
  useEffect(() => {
    async function loadMeta() {
      try {
        const [branchList, deptList] = await Promise.all([
          organizationApi.getBranches({ status: 'ACTIVE' }).catch(() => []),
          organizationApi.getDepartments({ status: 'ACTIVE' }).catch(() => []),
        ]);
        setBranches(Array.isArray(branchList) ? branchList : []);
        setDepartments(Array.isArray(deptList) ? deptList : []);
      } catch {
        // Non-fatal
      }
    }
    loadMeta();
  }, []);

  // Fetch Dashboard Aggregates
  const loadDashboard = useCallback(async () => {
    try {
      setIsLoadingDashboard(true);
      setDashboardError(null);
      const data = await attendanceApi.getOperationsDashboard({
        date: selectedDate,
        branchId: selectedBranchId || undefined,
        departmentId: selectedDeptId || undefined,
      });
      setDashboardData(data);
    } catch (err: any) {
      setDashboardError(err.message || 'Failed to fetch attendance dashboard aggregates.');
    } finally {
      setIsLoadingDashboard(false);
    }
  }, [selectedDate, selectedBranchId, selectedDeptId]);

  // Fetch Paginated Employee Records
  const loadRecords = useCallback(async () => {
    try {
      setIsLoadingRecords(true);
      setRecordsError(null);
      const res = await attendanceApi.getOperationsRecords({
        date: selectedDate,
        search: searchQuery.trim() || undefined,
        branchId: selectedBranchId || undefined,
        departmentId: selectedDeptId || undefined,
        status: selectedStatus,
        page: currentPage,
        limit: pageSize,
      });

      setRecords(res?.data || []);
      if ((res as any)?.pagination) {
        setPaginationMeta((res as any).pagination);
      }
    } catch (err: any) {
      setRecordsError(err.message || 'Failed to load employee attendance records.');
    } finally {
      setIsLoadingRecords(false);
    }
  }, [
    selectedDate,
    searchQuery,
    selectedBranchId,
    selectedDeptId,
    selectedStatus,
    currentPage,
    pageSize,
  ]);

  // Initial and reactive loads
  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  // Handle Detail Drawer Open
  const handleOpenDetail = async (employeeId: string) => {
    setSelectedEmployeeId(employeeId);
    setIsDrawerOpen(true);
    setIsLoadingDetail(true);
    setDetailError(null);
    try {
      const detail = await attendanceApi.getOperationsEmployeeDetail(employeeId, selectedDate);
      setEmployeeDetail(detail);
    } catch (err: any) {
      setDetailError(err.message || 'Failed to retrieve detailed attendance logs for employee.');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // Reconcile Cutoff Action
  const handleReconcileCutoff = async () => {
    try {
      setIsReconciling(true);
      setActionMessage(null);
      const res = await attendanceApi.reconcileMissing();
      setActionMessage({
        type: 'success',
        text: res.message || 'Cutoff reconciliation concluded successfully.',
      });
      await Promise.all([loadDashboard(), loadRecords()]);
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || 'Cutoff reconciliation encountered an error.',
      });
    } finally {
      setIsReconciling(false);
    }
  };

  // Load Pending Organization Regularizations
  const loadCorrections = useCallback(async () => {
    try {
      setIsLoadingCorrections(true);
      const data = await attendanceApi.getOperationsCorrections('PENDING');
      setCorrections(Array.isArray(data) ? data : []);
    } catch {
      // Non-fatal
    } finally {
      setIsLoadingCorrections(false);
    }
  }, []);

  useEffect(() => {
    loadCorrections();
  }, [loadCorrections]);

  const handleOpenDecisionModal = (correction: any, action: 'APPROVED' | 'REJECTED') => {
    setSelectedCorrection(correction);
    setDecisionAction(action);
    setDecisionNotes('');
    setDecisionError(null);
    setIsDecisionModalOpen(true);
  };

  const handleConfirmDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCorrection) return;

    try {
      setIsSubmittingDecision(true);
      setDecisionError(null);
      const res = await attendanceApi.decideCorrectionRequest(selectedCorrection.id, {
        decision: decisionAction,
        reviewNotes: decisionNotes.trim() || undefined,
      });

      if (res.success) {
        setIsDecisionModalOpen(false);
        setDecisionSuccess(`Correction request ${decisionAction.toLowerCase()} successfully.`);
        setTimeout(() => setDecisionSuccess(null), 4000);
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

  // Reset Filters
  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedBranchId('');
    setSelectedDeptId('');
    setSelectedStatus('ALL');
    setCurrentPage(1);
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
      case 'WEEK_OFF':
      case 'WEEKEND_OFF':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-stone-600 bg-stone-100 px-2 py-0.5 rounded border border-stone-200">
            WEEK OFF
          </span>
        );
      case 'HOLIDAY':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-800 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
            HOLIDAY
          </span>
        );
      case 'NOT_SCHEDULED':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-stone-500 bg-stone-50 px-2 py-0.5 rounded border border-stone-200">
            NOT SCHEDULED
          </span>
        );
      default:
        return <Badge variant="default">{status || 'PENDING'}</Badge>;
    }
  };

  const headcount = dashboardData?.headcount || {
    totalActiveEmployees: 0,
    checkedInNow: 0,
    present: 0,
    lateArrivals: 0,
    halfDay: 0,
    absent: 0,
    onLeave: 0,
    incomplete: 0,
    pendingReview: 0,
    unresolvedExceptions: 0,
  };

  const trendData = dashboardData?.trend || [];
  const modesData = dashboardData?.modes || { office: 0, officialVisit: 0, workFromHome: 0 };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 1. Reporting Metadata & Quick Controls Banner */}
      <div className="p-4 md:p-5 rounded-xl border border-stone-200 bg-gradient-to-r from-stone-50 via-white to-amber-50/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-2xs">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700 bg-amber-100/70 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Globe className="h-3 w-3" /> Live Org Telemetry
            </span>
            <span className="text-xs text-stone-500">
              Timezone:{' '}
              <strong className="text-stone-800">
                {dashboardData?.timezone || 'Asia/Kolkata'}
              </strong>
            </span>
            <span className="text-stone-300">•</span>
            <span className="text-xs text-stone-500">
              Daily Cutoff:{' '}
              <strong className="text-stone-800">{dashboardData?.cutoffHour ?? 5}:00 AM</strong>
            </span>
          </div>
          <p className="text-xs text-stone-500 flex items-center gap-1.5 pt-0.5">
            <Clock className="h-3.5 w-3.5 text-stone-400" />
            Report Generated:{' '}
            <span className="font-mono text-stone-700">
              {dashboardData?.reportingTimestamp
                ? new Date(dashboardData.reportingTimestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })
                : '—'}
            </span>
          </p>
        </div>

        {/* Date Selector & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-lg border border-stone-200 shadow-2xs">
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
            }}
            disabled={isLoadingDashboard || isLoadingRecords}
            className="border-stone-200 text-stone-700 hover:bg-stone-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 mr-1.5 ${
                isLoadingDashboard || isLoadingRecords ? 'animate-spin' : ''
              }`}
            />
            Refresh
          </Button>

          <Button
            size="sm"
            variant="secondary"
            onClick={handleReconcileCutoff}
            disabled={isReconciling}
            className="border-stone-200 text-amber-800 hover:bg-amber-50/50"
          >
            <ShieldAlert className={`h-3.5 w-3.5 mr-1.5 ${isReconciling ? 'animate-spin' : ''}`} />
            {isReconciling ? 'Reconciling...' : 'Reconcile Cutoff'}
          </Button>
        </div>
      </div>

      {/* Action Notification */}
      {actionMessage && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs animate-fade-in ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button onClick={() => setActionMessage(null)} className="font-bold hover:opacity-80">
            ×
          </button>
        </div>
      )}

      {/* 2. Reusable Headcount KPI Cards Grid */}
      {hrSubTab !== 'field-remote' && (
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
                title="Active Headcount"
                value={headcount.totalActiveEmployees}
                description="Assigned employees"
                icon={<Users className="h-4 w-4 text-stone-700" />}
                iconBg="bg-stone-100"
              />
              <KPICard
                title="Checked-In Now"
                value={headcount.checkedInNow}
                description="Open active sessions"
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
                description="Valid day summary"
                icon={<CheckCircle2 className="h-4 w-4 text-emerald-700" />}
                iconBg="bg-emerald-50"
              />
              <KPICard
                title="Late Arrivals"
                value={headcount.lateArrivals}
                description="Past grace window"
                icon={<Clock className="h-4 w-4 text-amber-700" />}
                iconBg="bg-amber-50"
              />
              <KPICard
                title="Incomplete"
                value={headcount.incomplete}
                description="Missing checkout / open"
                icon={<AlertTriangle className="h-4 w-4 text-amber-700" />}
                iconBg="bg-amber-100/60"
              />
              <div
                onClick={() => setHrSubTab('exceptions')}
                className="cursor-pointer transition-transform hover:scale-[1.02]"
                title="Click to view Attendance Exceptions Queue"
              >
                <KPICard
                  title="Unresolved Exceptions"
                  value={headcount.unresolvedExceptions}
                  description="Geofence / delay alerts"
                  icon={<ShieldAlert className="h-4 w-4 text-rose-700" />}
                  iconBg="bg-rose-50"
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* 2.5 Sub-Navigation Tab Bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 pb-2">
        <button
          onClick={() => setHrSubTab('roster')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all ${
            hrSubTab === 'roster'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          <span>Attendance Roster & Analytics</span>
        </button>

        <button
          onClick={() => setHrSubTab('field-remote')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all ${
            hrSubTab === 'field-remote'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
          }`}
        >
          <Compass className="h-3.5 w-3.5" />
          <span>Field & Remote Work</span>
        </button>

        <button
          onClick={() => setHrSubTab('exceptions')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all ${
            hrSubTab === 'exceptions'
              ? 'bg-rose-600 text-white shadow-xs'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
          }`}
        >
          <ShieldAlert className="h-3.5 w-3.5" />
          <span>Exceptions Queue</span>
          {headcount.unresolvedExceptions > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                hrSubTab === 'exceptions' ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-700'
              }`}
            >
              {headcount.unresolvedExceptions}
            </span>
          )}
        </button>

        <button
          onClick={() => setHrSubTab('corrections')}
          className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all ${
            hrSubTab === 'corrections'
              ? 'bg-amber-700 text-white shadow-xs'
              : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
          }`}
        >
          <Clock className="h-3.5 w-3.5" />
          <span>Regularization Requests</span>
          {corrections.length > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                hrSubTab === 'corrections'
                  ? 'bg-white/20 text-white'
                  : 'bg-amber-100 text-amber-700'
              }`}
            >
              {corrections.length}
            </span>
          )}
        </button>
      </div>

      {/* Field & Remote Work Operations Overview Sub-View */}
      {hrSubTab === 'field-remote' && (
        <FieldAndRemoteOverviewDashboard initialDate={selectedDate} />
      )}

      {/* Exceptions Queue Sub-View */}
      {hrSubTab === 'exceptions' && (
        <HRAttendanceExceptionsQueue
          defaultDate={selectedDate}
          onRefreshNeeded={() => {
            loadDashboard();
            loadRecords();
          }}
        />
      )}

      {/* 3. Reusable Charts Section */}
      <div
        className={`grid grid-cols-1 lg:grid-cols-3 gap-6 ${hrSubTab !== 'roster' ? 'hidden' : ''}`}
      >
        {/* Left 2 Cols: 7-Day Attendance Trend */}
        <Card className="lg:col-span-2 p-5 border-stone-200">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100 mb-4">
            <div>
              <h3 className="text-sm font-bold text-stone-900">7-Day Attendance Volume & Trend</h3>
              <p className="text-xs text-stone-500">
                Aggregated daily presence, late arrivals, and absence over the past week.
              </p>
            </div>
          </div>

          {isLoadingDashboard ? (
            <div className="h-56 flex items-center justify-center">
              <Skeleton className="h-48 w-full" />
            </div>
          ) : (
            <div className="w-full h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="opsColorPresent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#059669" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#059669" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="opsColorLate" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#D97706" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#D97706" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="opsColorAbsent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#E11D48" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#E11D48" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0ECE4" />
                  <XAxis
                    dataKey="day"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#78716C', fontSize: 11 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#78716C', fontSize: 11 }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      borderColor: '#E7E2DA',
                      borderRadius: '8px',
                      fontSize: '12px',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.08)',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Area
                    type="monotone"
                    dataKey="present"
                    name="Present"
                    stroke="#059669"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#opsColorPresent)"
                  />
                  <Area
                    type="monotone"
                    dataKey="late"
                    name="Late Arrivals"
                    stroke="#D97706"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#opsColorLate)"
                  />
                  <Area
                    type="monotone"
                    dataKey="absent"
                    name="Absent"
                    stroke="#E11D48"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#opsColorAbsent)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Right 1 Col: Punch Modes & Privacy Disclaimer */}
        <Card className="p-5 border-stone-200 flex flex-col justify-between">
          <div>
            <div className="pb-3 border-b border-stone-100 mb-3">
              <h3 className="text-sm font-bold text-stone-900">Attendance Verification Modes</h3>
              <p className="text-xs text-stone-500">Distribution of confirmed punch methods.</p>
            </div>

            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between p-3 bg-stone-50 rounded-xl border border-stone-200/60">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-amber-100 text-amber-800 rounded-lg">
                    <Building className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-stone-900 block">Office Geofence</span>
                    <span className="text-[10px] text-stone-500">Perimeter validated</span>
                  </div>
                </div>
                <span className="text-lg font-extrabold text-stone-900 font-mono">
                  {modesData.office}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-stone-50 rounded-xl border border-stone-200/60">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-purple-100 text-purple-800 rounded-lg">
                    <Briefcase className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-stone-900 block">
                      Official Visit (OD)
                    </span>
                    <span className="text-[10px] text-stone-500">Outdoor customer site</span>
                  </div>
                </div>
                <span className="text-lg font-extrabold text-stone-900 font-mono">
                  {modesData.officialVisit}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-stone-50 rounded-xl border border-stone-200/60">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-sky-100 text-sky-800 rounded-lg">
                    <Home className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-stone-900 block">Work From Home</span>
                    <span className="text-[10px] text-stone-500">Approved remote agreements</span>
                  </div>
                </div>
                <span className="text-lg font-extrabold text-stone-900 font-mono">
                  {modesData.workFromHome}
                </span>
              </div>
            </div>
          </div>

          {/* Privacy Notice Badge */}
          <div className="mt-4 p-3 bg-stone-100/70 rounded-xl border border-stone-200 text-[11px] text-stone-600 flex items-start gap-2">
            <Lock className="h-3.5 w-3.5 text-stone-500 shrink-0 mt-0.5" />
            <span>
              <strong>GPS Privacy Enforced:</strong> Exact geographic coordinates are redacted from
              operations view. Only geofence verification status and distance are displayed.
            </span>
          </div>
        </Card>
      </div>

      {/* 3.5. Pending Regularization Requests for HR Review */}
      {(hrSubTab === 'corrections' || (hrSubTab === 'roster' && corrections.length > 0)) && (
        <Card className="p-5 border-amber-200/70 bg-gradient-to-r from-amber-50/40 via-white to-amber-50/20 shadow-2xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-amber-100">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-amber-100 text-amber-800 rounded-lg">
                <Clock className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-stone-900">
                  Pending Regularization Approvals ({corrections.length})
                </h3>
                <p className="text-xs text-stone-500">
                  Review employee requests for missing checkout, wrong punches, and emergency
                  adjustments.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={loadCorrections}
              className="text-xs h-7 px-2.5"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
            </Button>
          </div>

          {corrections.length === 0 ? (
            <div className="p-8 text-center text-stone-500 text-xs">
              <CheckCircle2 className="h-6 w-6 text-emerald-600 mx-auto mb-2" />
              No pending regularization requests. All submitted correction requests have been
              addressed.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {corrections.map((req) => {
                const categoryLabel =
                  req.reasonCategory === 'MISSING_CHECKOUT'
                    ? 'Missing Check-Out'
                    : req.reasonCategory === 'WRONG_EVENT'
                      ? 'Wrong Event'
                      : req.reasonCategory === 'TECHNICAL_GLITCH'
                        ? 'Technical Glitch'
                        : req.reasonCategory === 'EMERGENCY'
                          ? 'Emergency'
                          : req.reasonCategory === 'OFFICIAL_DUTY'
                            ? 'Official Duty'
                            : req.reasonCategory || 'Discrepancy';

                const isSelfRequest = user?.id === req.employee?.userId;

                return (
                  <div
                    key={req.id}
                    className="p-4 bg-white rounded-xl border border-stone-200 shadow-2xs space-y-2.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-stone-900">
                          {req.employee?.displayName || 'Employee'}
                        </span>
                        <span className="text-[11px] font-mono text-stone-400">
                          ({req.employee?.employeeCode})
                        </span>
                        <Badge variant="outline" size="sm" className="bg-stone-100 text-stone-700">
                          {categoryLabel}
                        </Badge>
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
                      <strong>Reason:</strong> {req.explanation || req.reason}
                    </p>

                    {req.evidenceMetadata && (
                      <p className="text-[11px] text-amber-800 bg-amber-50/60 px-2.5 py-1 rounded border border-amber-200/50">
                        <strong>Evidence Reference:</strong>{' '}
                        {typeof req.evidenceMetadata === 'object'
                          ? req.evidenceMetadata.note || JSON.stringify(req.evidenceMetadata)
                          : req.evidenceMetadata}
                      </p>
                    )}

                    {isSelfRequest ? (
                      <div className="pt-2 border-t border-stone-100 flex items-center justify-between">
                        <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          Self-Approval Prohibited (Must be reviewed by another admin)
                        </span>
                      </div>
                    ) : (
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
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* 4. Filter & Search Controls Bar & 5. Table */}
      {hrSubTab === 'roster' && (
        <>
          <Card className="p-4 border-stone-200">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
              {/* Search Input */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
                <input
                  type="text"
                  placeholder="Search employee by name or code (e.g., Vikram, EMP-101)..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-stone-200 bg-white placeholder-stone-400 text-stone-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              {/* Dropdown Filters */}
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Branch Filter */}
                <select
                  value={selectedBranchId}
                  onChange={(e) => {
                    setSelectedBranchId(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-3 py-2 text-xs rounded-lg border border-stone-200 bg-white text-stone-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="">All Branches</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>

                {/* Department Filter */}
                <select
                  value={selectedDeptId}
                  onChange={(e) => {
                    setSelectedDeptId(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-3 py-2 text-xs rounded-lg border border-stone-200 bg-white text-stone-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="">All Departments</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>

                {/* Status Filter */}
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
                  <option value="WEEK_OFF">Week Off</option>
                  <option value="HOLIDAY">Holiday</option>
                </select>

                {(searchQuery ||
                  selectedBranchId ||
                  selectedDeptId ||
                  selectedStatus !== 'ALL') && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleResetFilters}
                    className="text-stone-500 hover:text-stone-900 text-xs px-2.5"
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {/* 5. Paginated Attendance Management Table */}
          <Card className="border-stone-200 overflow-hidden shadow-2xs">
            <div className="p-4 border-b border-stone-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-stone-900">Attendance Records</h3>
                <span className="text-xs text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full font-mono">
                  {paginationMeta.total} Employees
                </span>
              </div>

              <div className="text-xs text-stone-500 flex items-center gap-2">
                <span>Rows per page:</span>
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

            {/* Error State */}
            {recordsError && (
              <div className="p-6 text-center">
                <div className="inline-flex p-3 bg-rose-50 text-rose-600 rounded-full mb-2">
                  <AlertCircle className="h-6 w-6" />
                </div>
                <p className="text-sm font-semibold text-rose-900">{recordsError}</p>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={loadRecords}
                  className="mt-3 text-xs"
                >
                  Retry
                </Button>
              </div>
            )}

            {/* Loading State */}
            {isLoadingRecords && !recordsError && (
              <div className="p-6 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <div className="space-y-1.5 flex-1">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-28" />
                    </div>
                    <Skeleton className="h-6 w-20" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            )}

            {/* Empty State */}
            {!isLoadingRecords && !recordsError && records.length === 0 && (
              <div className="p-12 text-center space-y-3">
                <div className="inline-flex p-3 bg-stone-100 text-stone-400 rounded-full">
                  <Search className="h-6 w-6" />
                </div>
                <p className="text-sm font-semibold text-stone-800">No attendance records found</p>
                <p className="text-xs text-stone-500 max-w-sm mx-auto">
                  No employees matched the selected date ({selectedDate}) and filter parameters. Try
                  adjusting or resetting the search filters.
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleResetFilters}
                  className="text-xs"
                >
                  Reset Filters
                </Button>
              </div>
            )}

            {/* Records Table */}
            {!isLoadingRecords && !recordsError && records.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-stone-700">
                  <thead className="bg-stone-50 text-[11px] font-semibold uppercase tracking-wider text-stone-500 border-b border-stone-200">
                    <tr>
                      <th className="py-3 px-4">Employee</th>
                      <th className="py-3 px-4">Branch / Dept</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">First Punch</th>
                      <th className="py-3 px-4">Last Punch</th>
                      <th className="py-3 px-4">Net Work Time</th>
                      <th className="py-3 px-4">Exceptions</th>
                      <th className="py-3 px-4">Geofence Status</th>
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
                          {/* Employee Column */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-2.5">
                              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-amber-500 to-amber-700 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                                {emp.displayName ? emp.displayName.charAt(0).toUpperCase() : 'E'}
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

                          {/* Branch & Department */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="text-stone-800 text-xs font-semibold">{emp.branch}</div>
                            <div className="text-[11px] text-stone-400">{emp.department}</div>
                          </td>

                          {/* Attendance Status */}
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

                          {/* First Punch */}
                          <td className="py-3 px-4 whitespace-nowrap font-mono text-stone-700">
                            {sum.firstCheckIn
                              ? new Date(sum.firstCheckIn).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '—'}
                          </td>

                          {/* Last Punch */}
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

                          {/* Net Hours */}
                          <td className="py-3 px-4 whitespace-nowrap font-mono text-stone-900 font-semibold">
                            {sum.netHours > 0 ? `${sum.netHours} hrs` : '0 hrs'}
                            {sum.lateMinutes > 0 && (
                              <span className="text-amber-700 text-[11px] block font-sans">
                                +{sum.lateMinutes}m late
                              </span>
                            )}
                          </td>

                          {/* Exceptions */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            {excCount > 0 ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                                <ShieldAlert className="h-3 w-3" /> {excCount} Alert
                                {excCount > 1 ? 's' : ''}
                              </span>
                            ) : (
                              <span className="text-stone-400 text-[11px]">None</span>
                            )}
                          </td>

                          {/* Location Verification & Privacy */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            {loc ? (
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1">
                                  {loc.geofenceStatus === 'VERIFIED' ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                                      <ShieldCheck className="h-3.5 w-3.5" /> Verified (
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
                                  <span
                                    className="inline-flex items-center gap-1 text-[10px] text-stone-400"
                                    title="Precise latitude/longitude redacted for privacy"
                                  >
                                    <Lock className="h-2.5 w-2.5" /> GPS Redacted
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-stone-400 text-[11px]">—</span>
                            )}
                          </td>

                          {/* Action */}
                          <td
                            className="py-3 px-4 text-right whitespace-nowrap"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => handleOpenDetail(emp.id)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100/70 px-2.5 py-1 rounded-lg transition-colors"
                            >
                              <Eye className="h-3.5 w-3.5" /> Details
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
                of <strong className="text-stone-800">{paginationMeta.total}</strong> employees
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
        </>
      )}

      {/* 6. Attendance Detail Drawer (Right Slide-Over) */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={
          employeeDetail?.employee?.displayName
            ? `${employeeDetail.employee.displayName} (${employeeDetail.employee.employeeCode})`
            : 'Employee Attendance Detail'
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
                <AlertCircle className="h-4 w-4" /> Error loading details
              </div>
              <p>{detailError}</p>
            </div>
          )}

          {!isLoadingDetail && !detailError && employeeDetail && (
            <>
              {/* Employee Header Info */}
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
                    <span className="text-stone-400 block text-[10px]">TARGET DATE</span>
                    <strong className="font-mono">{employeeDetail.date}</strong>
                  </div>
                </div>
              </div>

              {/* Day Summary Card */}
              <div className="p-4 bg-white rounded-xl border border-stone-200 space-y-3">
                <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                  <span className="font-bold text-stone-900">Attendance Summary</span>
                  {getStatusBadge(employeeDetail.summary?.status || 'NOT_SCHEDULED')}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-stone-700">
                  <div className="p-2 bg-stone-50 rounded-lg">
                    <span className="text-stone-400 text-[10px] block">First Check-In</span>
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
                    <span className="text-stone-400 text-[10px] block">Last Check-Out</span>
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
                    <span className="text-stone-400 text-[10px] block">Net Work Time</span>
                    <strong className="font-mono text-emerald-700">
                      {formatMinutes(employeeDetail.summary?.totalWorkMinutes || 0)}
                    </strong>
                  </div>
                  <div className="p-2 bg-stone-50 rounded-lg">
                    <span className="text-stone-400 text-[10px] block">Break Duration</span>
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

              {/* Shift & Policy Rules */}
              <div className="p-4 bg-stone-50/70 rounded-xl border border-stone-200 space-y-2">
                <span className="font-bold text-stone-900 block">Assigned Shift & Rules</span>
                <div className="grid grid-cols-2 gap-2 text-stone-600">
                  <div>
                    <span className="text-stone-400 text-[10px] block">Shift Name</span>
                    <strong>{employeeDetail.shift?.name || 'Standard General'}</strong>
                  </div>
                  <div>
                    <span className="text-stone-400 text-[10px] block">Shift Window</span>
                    <strong>
                      {employeeDetail.shift
                        ? `${employeeDetail.shift.startTime} – ${employeeDetail.shift.endTime}`
                        : '09:00 – 18:00'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-stone-400 text-[10px] block">Full-Day Threshold</span>
                    <strong>
                      {formatMinutes(employeeDetail.policy?.fullDayThresholdMinutes || 420)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-stone-400 text-[10px] block">Grace Period</span>
                    <strong>{employeeDetail.policy?.gracePeriodMinutes || 15} minutes</strong>
                  </div>
                </div>
              </div>

              {/* Sessions List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-stone-900 uppercase tracking-wider text-[11px]">
                    Recorded Sessions ({employeeDetail.sessions?.length || 0})
                  </span>
                </div>

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
                        <div className="grid grid-cols-2 gap-2 text-stone-600">
                          <div>
                            <span className="text-stone-400 text-[10px] block">Check-In</span>
                            <span className="font-mono">
                              {new Date(sess.checkInTime).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })}
                            </span>
                          </div>
                          <div>
                            <span className="text-stone-400 text-[10px] block">Check-Out</span>
                            <span className="font-mono">
                              {sess.checkOutTime
                                ? new Date(sess.checkOutTime).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    second: '2-digit',
                                  })
                                : sess.status === 'OPEN'
                                  ? 'In Progress'
                                  : 'Missing'}
                            </span>
                          </div>
                          <div>
                            <span className="text-stone-400 text-[10px] block">Work Duration</span>
                            <span className="font-mono font-semibold text-stone-800">
                              {formatMinutes(sess.totalWorkMinutes)}
                            </span>
                          </div>
                          <div>
                            <span className="text-stone-400 text-[10px] block">Break Duration</span>
                            <span className="font-mono font-semibold text-stone-800">
                              {formatMinutes(sess.totalBreakMinutes)}
                            </span>
                          </div>
                        </div>

                        {/* Raw Punches & Geofence Verification Timeline */}
                        {sess.events && sess.events.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-stone-100 space-y-1.5">
                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
                              Punches & Verification Audit
                            </span>
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
                                  {ev.distanceFromOfficeMeters !== null &&
                                    ev.distanceFromOfficeMeters !== undefined && (
                                      <>
                                        <span>•</span>
                                        <span>Distance: {ev.distanceFromOfficeMeters}m</span>
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

                                {/* Privacy Protection GPS status */}
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

              {/* Exceptions Panel */}
              {employeeDetail.exceptions && employeeDetail.exceptions.length > 0 && (
                <div className="p-4 bg-rose-50/50 rounded-xl border border-rose-200 space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-rose-900">
                    <ShieldAlert className="h-4 w-4 text-rose-600" />
                    <span>Attendance Exceptions ({employeeDetail.exceptions.length})</span>
                  </div>
                  <div className="space-y-2 pt-1">
                    {employeeDetail.exceptions.map((ex: any) => (
                      <div
                        key={ex.id}
                        className="p-2.5 bg-white rounded-lg border border-rose-200 text-stone-700 space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <strong className="text-rose-800">{ex.exceptionType}</strong>
                          <Badge variant={ex.severity === 'HIGH' ? 'danger' : 'warning'} size="sm">
                            {ex.severity}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-stone-500">
                          Status: {ex.resolved ? 'Resolved' : 'Pending Review'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </Drawer>

      {/* Attendance Regularization Review Modal */}
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
        <form onSubmit={handleConfirmDecision} className="space-y-4 text-xs">
          {decisionError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{decisionError}</span>
            </div>
          )}

          {selectedCorrection && (
            <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 space-y-1.5 text-stone-700">
              <div>
                <strong>Employee:</strong> {selectedCorrection.employee?.displayName} (
                {selectedCorrection.employee?.employeeCode})
              </div>
              <div>
                <strong>Target Date:</strong> {selectedCorrection.targetDate?.split('T')[0]}
              </div>
              <div>
                <strong>Category:</strong> {selectedCorrection.reasonCategory || 'Discrepancy'}
              </div>
              <div>
                <strong>Explanation:</strong>{' '}
                {selectedCorrection.explanation || selectedCorrection.reason}
              </div>
              {selectedCorrection.evidenceMetadata && (
                <div>
                  <strong>Evidence Reference:</strong>{' '}
                  {typeof selectedCorrection.evidenceMetadata === 'object'
                    ? selectedCorrection.evidenceMetadata.note ||
                      JSON.stringify(selectedCorrection.evidenceMetadata)
                    : selectedCorrection.evidenceMetadata}
                </div>
              )}
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
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Processing...
                </>
              ) : decisionAction === 'APPROVED' ? (
                <>
                  <Check className="h-3.5 w-3.5 mr-1" /> Confirm Approval
                </>
              ) : (
                <>
                  <X className="h-3.5 w-3.5 mr-1" /> Confirm Rejection
                </>
              )}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};
