'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AppShell } from '../../layouts/AppShell';
import { useAuth } from '../../context/AuthContext';
import { wfhApi, attendanceApi } from '../../lib/api-client';
import {
  Button,
  Badge,
  Card,
  Dialog,
  Input,
  Textarea,
  Toast,
  EmptyState,
  ErrorState,
  LoadingState,
  cn,
} from '@hrms/ui';
import {
  Home,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  FileText,
  AlertCircle,
  LogIn,
  LogOut,
  Edit3,
  Coffee,
  Play,
  Plus,
  Trash2,
  ShieldCheck,
  Search,
  Eye,
  Info,
  ChevronRight,
  UserCheck,
  Ban,
  CalendarDays,
} from 'lucide-react';

function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'idem-' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

export type WfhStatus = 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type WfhDurationType = 'FULL_DAY' | 'FIRST_HALF' | 'SECOND_HALF' | 'CUSTOM_RANGE';

export interface WfhDecision {
  id: string;
  decision: 'APPROVED' | 'REJECTED';
  comments?: string | null;
  decidedAt: string;
  approver?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
}

export interface WfhRequestItem {
  id: string;
  organizationId: string;
  employeeId: string;
  status: WfhStatus;
  startDate: string;
  endDate: string;
  durationType: WfhDurationType;
  reason: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  decisions?: WfhDecision[];
  attendanceSessions?: any[];
}

export default function EmployeeWfhPage() {
  const { user } = useAuth();

  // Data states
  const [requests, setRequests] = useState<WfhRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Today attendance state
  const [todayData, setTodayData] = useState<any>(null);
  const [todayLoading, setTodayLoading] = useState(true);

  // Filters & search
  const [activeFilter, setActiveFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Dialogs
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<WfhRequestItem | null>(null);
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [cancellingRequest, setCancellingRequest] = useState<WfhRequestItem | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<WfhRequestItem | null>(null);

  // Form states
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formIsRange, setFormIsRange] = useState(false);
  const [formDurationType, setFormDurationType] = useState<WfhDurationType>('FULL_DAY');
  const [formReason, setFormReason] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Toast
  const [toastMessage, setToastMessage] = useState<{
    type: 'success' | 'error' | 'info';
    title: string;
    message: string;
  } | null>(null);

  // Get current local date YYYY-MM-DD
  const todayStr = useMemo(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  }, []);

  // Fetch today status
  const loadTodayStatus = useCallback(async () => {
    try {
      setTodayLoading(true);
      const data = await attendanceApi.getToday();
      setTodayData(data);
    } catch (err: any) {
      console.warn('Could not load today attendance status:', err?.message);
    } finally {
      setTodayLoading(false);
    }
  }, []);

  // Fetch WFH requests
  const loadRequests = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await wfhApi.getMyWfh({ limit: 100 });
      const items = res.data?.items || res.data || [];
      setRequests(items);
    } catch (err: any) {
      setError(err?.message || 'Failed to load Work From Home requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
    loadTodayStatus();
  }, [loadRequests, loadTodayStatus]);

  // Find approved WFH request that is active for today
  const approvedTodayRequest = useMemo(() => {
    return requests.find((r) => {
      if (r.status !== 'APPROVED') return false;
      const s = r.startDate.split('T')[0];
      const e = r.endDate.split('T')[0];
      return todayStr >= s && todayStr <= e;
    });
  }, [requests, todayStr]);

  // Check if current user is checked in
  const isCheckedIn = !!todayData?.currentStatus?.isCheckedIn;
  const activeSession = todayData?.activeSession;
  const isWfhSession =
    isCheckedIn &&
    (activeSession?.attendanceMode === 'WFH' ||
      activeSession?.wfhRequestId === approvedTodayRequest?.id);
  const isOnBreak = !!todayData?.currentStatus?.isOnBreak;

  // Check half day shift window status
  const halfDayWindowInfo = useMemo(() => {
    if (!approvedTodayRequest) return null;
    if (
      approvedTodayRequest.durationType !== 'FIRST_HALF' &&
      approvedTodayRequest.durationType !== 'SECOND_HALF'
    ) {
      return null;
    }

    const now = new Date();
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();
    const currentMinutes = currentHour * 60 + currentMin;
    // Default standard shift midpoint: 13:30 (1:30 PM) = 810 minutes
    const midpointMinutes = 13 * 60 + 30;

    if (approvedTodayRequest.durationType === 'FIRST_HALF') {
      const isPast = currentMinutes > midpointMinutes;
      return {
        type: 'FIRST_HALF' as const,
        isAllowed: !isPast,
        message: isPast
          ? 'First-half WFH check-in window closed (ended at 1:30 PM).'
          : 'First-half WFH: check-in is valid until 1:30 PM.',
      };
    } else {
      const isBefore = currentMinutes < midpointMinutes;
      return {
        type: 'SECOND_HALF' as const,
        isAllowed: !isBefore,
        message: isBefore
          ? 'Second-half WFH: check-in window begins at 1:30 PM.'
          : 'Second-half WFH: check-in is valid for the afternoon shift.',
      };
    }
  }, [approvedTodayRequest]);

  // Handle WFH Check-in
  const handleWfhCheckIn = async (request: WfhRequestItem) => {
    if (halfDayWindowInfo && !halfDayWindowInfo.isAllowed) {
      setToastMessage({
        type: 'error',
        title: 'Time Window Restricted',
        message: halfDayWindowInfo.message,
      });
      return;
    }

    try {
      setActionLoading(`checkin-${request.id}`);
      const idempotencyKey = generateIdempotencyKey();
      const res = await attendanceApi.checkIn({
        attendanceMode: 'WFH',
        wfhRequestId: request.id,
        idempotencyKey,
        deviceInfo: typeof navigator !== 'undefined' ? navigator.userAgent : 'Web Browser',
      });

      setToastMessage({
        type: 'success',
        title: 'WFH Check-In Confirmed',
        message: res.message || 'Remote work attendance recorded successfully!',
      });

      await Promise.all([loadTodayStatus(), loadRequests()]);
    } catch (err: any) {
      setToastMessage({
        type: 'error',
        title: 'Check-In Failed',
        message: err?.message || 'Could not process WFH check-in.',
      });
    } finally {
      setActionLoading(null);
    }
  };

  // Handle WFH Check-out
  const handleWfhCheckOut = async () => {
    try {
      setActionLoading('checkout');
      const idempotencyKey = generateIdempotencyKey();
      const res = await attendanceApi.checkOut({
        idempotencyKey,
        wfhRequestId: approvedTodayRequest?.id,
        deviceInfo: typeof navigator !== 'undefined' ? navigator.userAgent : 'Web Browser',
      });

      setToastMessage({
        type: 'success',
        title: 'WFH Check-Out Confirmed',
        message: res.message || 'Session completed and daily summary updated.',
      });

      await Promise.all([loadTodayStatus(), loadRequests()]);
    } catch (err: any) {
      setToastMessage({
        type: 'error',
        title: 'Check-Out Failed',
        message: err?.message || 'Could not process WFH check-out.',
      });
    } finally {
      setActionLoading(null);
    }
  };

  // Handle Break Start / End
  const handleToggleBreak = async () => {
    try {
      setActionLoading('break');
      const idempotencyKey = generateIdempotencyKey();
      if (isOnBreak) {
        await attendanceApi.endBreak({
          idempotencyKey,
          reason: 'Resumed WFH session',
        });
        setToastMessage({
          type: 'success',
          title: 'Break Concluded',
          message: 'Work session resumed.',
        });
      } else {
        await attendanceApi.startBreak({
          idempotencyKey,
          reason: 'Home break',
        });
        setToastMessage({
          type: 'info',
          title: 'Break Started',
          message: 'Break period recorded.',
        });
      }
      await loadTodayStatus();
    } catch (err: any) {
      setToastMessage({
        type: 'error',
        title: 'Break Update Failed',
        message: err?.message || 'Could not toggle break status.',
      });
    } finally {
      setActionLoading(null);
    }
  };

  // Open Create Dialog
  const handleOpenCreate = () => {
    setFormStartDate(todayStr);
    setFormEndDate(todayStr);
    setFormIsRange(false);
    setFormDurationType('FULL_DAY');
    setFormReason('');
    setFormError(null);
    setIsCreateOpen(true);
  };

  // Submit Create WFH
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formStartDate) {
      setFormError('Please select a start date.');
      return;
    }

    const effectiveEndDate = formIsRange ? formEndDate : formStartDate;
    if (!effectiveEndDate) {
      setFormError('Please select an end date.');
      return;
    }

    if (effectiveEndDate < formStartDate) {
      setFormError('End date cannot precede start date.');
      return;
    }

    if (!formReason.trim() || formReason.trim().length < 5) {
      setFormError('Please provide a reason (minimum 5 characters).');
      return;
    }

    const effectiveDuration = formIsRange ? 'CUSTOM_RANGE' : formDurationType;

    try {
      setFormSubmitting(true);
      await wfhApi.createWfh({
        startDate: formStartDate,
        endDate: effectiveEndDate,
        durationType: effectiveDuration,
        reason: formReason.trim(),
      });

      setToastMessage({
        type: 'success',
        title: 'WFH Request Submitted',
        message: 'Your request has been routed to your reporting manager for approval.',
      });

      setIsCreateOpen(false);
      await loadRequests();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to submit WFH request.');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Open Edit Dialog
  const handleOpenEdit = (req: WfhRequestItem) => {
    setEditingRequest(req);
    const s = req.startDate.split('T')[0];
    const e = req.endDate.split('T')[0];
    setFormStartDate(s);
    setFormEndDate(e);
    const isR = req.durationType === 'CUSTOM_RANGE' || s !== e;
    setFormIsRange(isR);
    setFormDurationType(req.durationType);
    setFormReason(req.reason);
    setFormError(null);
    setIsEditOpen(true);
  };

  // Submit Edit WFH
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRequest) return;
    setFormError(null);

    const effectiveEndDate = formIsRange ? formEndDate : formStartDate;
    if (effectiveEndDate < formStartDate) {
      setFormError('End date cannot precede start date.');
      return;
    }

    if (!formReason.trim() || formReason.trim().length < 5) {
      setFormError('Please provide a reason (minimum 5 characters).');
      return;
    }

    const effectiveDuration = formIsRange ? 'CUSTOM_RANGE' : formDurationType;

    try {
      setFormSubmitting(true);
      await wfhApi.updateWfh(editingRequest.id, {
        startDate: formStartDate,
        endDate: effectiveEndDate,
        durationType: effectiveDuration,
        reason: formReason.trim(),
      });

      setToastMessage({
        type: 'success',
        title: 'WFH Request Updated',
        message:
          editingRequest.status === 'APPROVED'
            ? 'Material changes require re-approval; request status reset to Pending.'
            : 'Request details updated successfully.',
      });

      setIsEditOpen(false);
      await loadRequests();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to update WFH request.');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Open Cancel Dialog
  const handleOpenCancel = (req: WfhRequestItem) => {
    setCancellingRequest(req);
    setCancelReason('');
    setIsCancelOpen(true);
  };

  // Submit Cancel WFH
  const handleCancelSubmit = async () => {
    if (!cancellingRequest) return;
    try {
      setActionLoading(`cancel-${cancellingRequest.id}`);
      await wfhApi.cancelWfh(cancellingRequest.id, {
        reason: cancelReason.trim() || 'Cancelled by employee',
      });

      setToastMessage({
        type: 'info',
        title: 'WFH Request Cancelled',
        message: 'The scheduled WFH request has been cancelled.',
      });

      setIsCancelOpen(false);
      await loadRequests();
    } catch (err: any) {
      setToastMessage({
        type: 'error',
        title: 'Cancellation Failed',
        message: err?.message || 'Could not cancel request.',
      });
    } finally {
      setActionLoading(null);
    }
  };

  // Helper: Format Date Range
  const formatDateDisplay = (startStr: string, endStr: string) => {
    const s = startStr.split('T')[0];
    const e = endStr.split('T')[0];
    const sDate = new Date(`${s}T00:00:00.000Z`);
    const eDate = new Date(`${e}T00:00:00.000Z`);

    const sFormatted = sDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    if (s === e) {
      return sFormatted;
    }

    const eFormatted = eDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    return `${sFormatted} — ${eFormatted}`;
  };

  // Helper: Duration label
  const getDurationLabel = (type: WfhDurationType) => {
    switch (type) {
      case 'FULL_DAY':
        return 'Full Day';
      case 'FIRST_HALF':
        return 'First Half (Morning)';
      case 'SECOND_HALF':
        return 'Second Half (Afternoon)';
      case 'CUSTOM_RANGE':
        return 'Custom Range';
      default:
        return type;
    }
  };

  // Helper: Status Badge
  const renderStatusBadge = (req: WfhRequestItem) => {
    const e = req.endDate.split('T')[0];
    const isPast = e < todayStr;

    if (req.status === 'APPROVED' && isPast) {
      return (
        <Badge variant="default" className="gap-1 bg-stone-100 text-stone-700 border-stone-200">
          <Clock className="w-3 h-3 text-stone-500" />
          Completed / Past
        </Badge>
      );
    }

    switch (req.status) {
      case 'APPROVED':
        return (
          <Badge
            variant="success"
            className="gap-1 bg-emerald-50 text-emerald-700 border-emerald-200"
          >
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Approved
          </Badge>
        );
      case 'SUBMITTED':
        return (
          <Badge variant="warning" className="gap-1 bg-amber-50 text-amber-800 border-amber-200">
            <Clock className="w-3 h-3 text-amber-600" />
            Pending Approval
          </Badge>
        );
      case 'REJECTED':
        return (
          <Badge variant="danger" className="gap-1 bg-rose-50 text-rose-700 border-rose-200">
            <XCircle className="w-3 h-3 text-rose-600" />
            Rejected
          </Badge>
        );
      case 'CANCELLED':
        return (
          <Badge variant="default" className="gap-1 bg-stone-100 text-stone-600 border-stone-200">
            <Ban className="w-3 h-3 text-stone-400" />
            Cancelled
          </Badge>
        );
      default:
        return <Badge variant="default">{req.status}</Badge>;
    }
  };

  // Filter requests
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      const s = r.startDate.split('T')[0];
      const e = r.endDate.split('T')[0];
      const isPast = e < todayStr;
      const isToday = todayStr >= s && todayStr <= e;

      // Status filter tab
      if (activeFilter === 'ACTIVE_TODAY' && (!isToday || r.status !== 'APPROVED')) return false;
      if (activeFilter === 'SUBMITTED' && r.status !== 'SUBMITTED') return false;
      if (activeFilter === 'APPROVED' && (r.status !== 'APPROVED' || isPast)) return false;
      if (activeFilter === 'REJECTED' && r.status !== 'REJECTED') return false;
      if (activeFilter === 'CANCELLED' && r.status !== 'CANCELLED') return false;
      if (activeFilter === 'EXPIRED' && (r.status !== 'APPROVED' || !isPast)) return false;

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesReason = r.reason.toLowerCase().includes(query);
        const matchesDate = s.includes(query) || e.includes(query);
        const matchesStatus = r.status.toLowerCase().includes(query);
        return matchesReason || matchesDate || matchesStatus;
      }

      return true;
    });
  }, [requests, activeFilter, searchQuery, todayStr]);

  // KPI counts
  const kpiCounts = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    let activeToday = 0;

    for (const r of requests) {
      const s = r.startDate.split('T')[0];
      const e = r.endDate.split('T')[0];
      const isToday = todayStr >= s && todayStr <= e;

      if (r.status === 'SUBMITTED') pending++;
      if (r.status === 'APPROVED') {
        approved++;
        if (isToday) activeToday++;
      }
      if (r.status === 'REJECTED') rejected++;
    }

    return { pending, approved, rejected, activeToday };
  }, [requests, todayStr]);

  return (
    <AppShell>
      <div className="space-y-6 pb-12">
        {/* Toast feedback */}
        {toastMessage && (
          <Toast
            type={toastMessage.type}
            title={toastMessage.title}
            message={toastMessage.message}
            onClose={() => setToastMessage(null)}
          />
        )}

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-700 border border-amber-500/20">
                <Home className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-stone-900 tracking-tight">
                  Work From Home (WFH)
                </h1>
                <p className="text-xs sm:text-sm text-stone-500 mt-0.5">
                  Request remote working days, track manager decisions, and mark verified attendance
                  securely from home.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                loadRequests();
                loadTodayStatus();
              }}
              disabled={loading || todayLoading}
              className="gap-1.5 text-stone-700 border-stone-300 hover:bg-stone-50"
            >
              <RefreshCw
                className={cn('w-3.5 h-3.5', (loading || todayLoading) && 'animate-spin')}
              />
              Refresh
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={handleOpenCreate}
              className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white shadow-xs"
            >
              <Plus className="w-4 h-4" />
              Request WFH
            </Button>
          </div>
        </div>

        {/* KPI Cards Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
          <Card className="p-4 border-stone-200/80 bg-white shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-stone-500">Active WFH Today</span>
              <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                <Home className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-stone-900 tracking-tight">
                {kpiCounts.activeToday}
              </span>
              <span className="text-xs text-stone-500">
                {kpiCounts.activeToday > 0 ? 'Authorized' : 'None today'}
              </span>
            </div>
          </Card>

          <Card className="p-4 border-stone-200/80 bg-white shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-stone-500">Pending Review</span>
              <span className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
                <Clock className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-stone-900 tracking-tight">
                {kpiCounts.pending}
              </span>
              <span className="text-xs text-stone-500">Awaiting manager</span>
            </div>
          </Card>

          <Card className="p-4 border-stone-200/80 bg-white shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-stone-500">Approved Total</span>
              <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-stone-900 tracking-tight">
                {kpiCounts.approved}
              </span>
              <span className="text-xs text-stone-500">Approved records</span>
            </div>
          </Card>

          <Card className="p-4 border-stone-200/80 bg-white shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-stone-500">Current Attendance</span>
              <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                <ShieldCheck className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-sm font-semibold text-stone-800">
                {isCheckedIn
                  ? isWfhSession
                    ? 'WFH Checked In'
                    : 'Office Session'
                  : 'Not Checked In'}
              </span>
              {isOnBreak && (
                <Badge variant="warning" className="text-[10px] py-0 px-1.5">
                  On Break
                </Badge>
              )}
            </div>
          </Card>
        </div>

        {/* TODAY ACTION HERO CARD (If approved for WFH today or active WFH session) */}
        {approvedTodayRequest && (
          <Card className="p-5 sm:p-6 border-amber-200 bg-gradient-to-r from-amber-50/70 via-stone-50 to-white shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Authorized for Remote Check-In Today
                  </span>
                  <Badge variant="default" className="text-xs">
                    {getDurationLabel(approvedTodayRequest.durationType)}
                  </Badge>
                </div>

                <div>
                  <h3 className="text-base sm:text-lg font-bold text-stone-900">
                    Today is an Approved Work From Home Day
                  </h3>
                  <p className="text-xs sm:text-sm text-stone-600 mt-0.5">
                    Reason: &ldquo;{approvedTodayRequest.reason}&rdquo;
                  </p>
                </div>

                {/* Privacy & Half-day notice */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500 pt-1">
                  <span className="flex items-center gap-1 text-emerald-700">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    Home GPS Privacy: Coordinates are not collected.
                  </span>
                  {halfDayWindowInfo && (
                    <span
                      className={cn(
                        'flex items-center gap-1 font-medium',
                        halfDayWindowInfo.isAllowed ? 'text-amber-700' : 'text-rose-600',
                      )}
                    >
                      <Clock className="w-3.5 h-3.5" />
                      {halfDayWindowInfo.message}
                    </span>
                  )}
                </div>
              </div>

              {/* Attendance Actions */}
              <div className="flex flex-wrap items-center gap-2.5 pt-2 md:pt-0">
                {!isCheckedIn ? (
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => handleWfhCheckIn(approvedTodayRequest)}
                    disabled={
                      actionLoading === `checkin-${approvedTodayRequest.id}` ||
                      Boolean(halfDayWindowInfo && !halfDayWindowInfo.isAllowed)
                    }
                    className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs font-semibold px-5"
                  >
                    <LogIn className="w-4 h-4" />
                    {actionLoading === `checkin-${approvedTodayRequest.id}`
                      ? 'Checking In...'
                      : 'WFH Check In'}
                  </Button>
                ) : isWfhSession ? (
                  <>
                    <Button
                      variant="outline"
                      size="md"
                      onClick={handleToggleBreak}
                      disabled={actionLoading === 'break'}
                      className="gap-1.5 text-stone-700 border-stone-300 hover:bg-stone-100"
                    >
                      {isOnBreak ? (
                        <>
                          <Play className="w-4 h-4 text-emerald-600" />
                          Resume Work
                        </>
                      ) : (
                        <>
                          <Coffee className="w-4 h-4 text-amber-600" />
                          Take Break
                        </>
                      )}
                    </Button>

                    <Button
                      variant="danger"
                      size="md"
                      onClick={handleWfhCheckOut}
                      disabled={actionLoading === 'checkout'}
                      className="gap-1.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold"
                    >
                      <LogOut className="w-4 h-4" />
                      {actionLoading === 'checkout' ? 'Checking Out...' : 'WFH Check Out'}
                    </Button>
                  </>
                ) : (
                  <div className="text-xs text-stone-500 bg-stone-100 px-3 py-2 rounded-lg border border-stone-200">
                    Active office session in progress. Please check out before switching modes.
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Filter and Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          {/* Filter Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none text-xs">
            {[
              { id: 'ALL', label: 'All Requests' },
              { id: 'ACTIVE_TODAY', label: 'Active Today' },
              { id: 'SUBMITTED', label: 'Pending' },
              { id: 'APPROVED', label: 'Approved' },
              { id: 'REJECTED', label: 'Rejected' },
              { id: 'CANCELLED', label: 'Cancelled' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveFilter(tab.id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap cursor-pointer',
                  activeFilter === tab.id
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Bar */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by reason or date..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-9 pr-3 py-1.5 rounded-lg border border-stone-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white"
            />
          </div>
        </div>

        {/* Request List / Cards */}
        {loading ? (
          <div className="py-12 flex justify-center">
            <LoadingState message="Loading your Work From Home requests..." />
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={loadRequests} />
        ) : filteredRequests.length === 0 ? (
          <Card className="py-12 border-dashed border-stone-200">
            <EmptyState
              icon={<Home className="w-8 h-8 text-stone-400" />}
              title="No WFH Requests Found"
              description={
                searchQuery
                  ? 'No requests matched your search query. Try clearing the filter.'
                  : 'You have not submitted any Work From Home requests in this view.'
              }
              action={{
                label: 'Request WFH Now',
                onClick: handleOpenCreate,
              }}
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRequests.map((req) => {
              const isPast = req.endDate.split('T')[0] < todayStr;
              const isToday =
                todayStr >= req.startDate.split('T')[0] && todayStr <= req.endDate.split('T')[0];
              const isApprovedToday = req.status === 'APPROVED' && isToday;
              const canEdit =
                req.status === 'SUBMITTED' ||
                (req.status === 'APPROVED' && req.startDate.split('T')[0] >= todayStr);
              const canCancel = req.status !== 'CANCELLED' && req.status !== 'REJECTED' && !isPast;

              const latestDecision = req.decisions && req.decisions[0];

              return (
                <Card
                  key={req.id}
                  className={cn(
                    'p-4 flex flex-col justify-between border-stone-200 bg-white hover:border-amber-300 transition-all shadow-xs',
                    isApprovedToday && 'ring-1 ring-amber-400/60 bg-amber-50/20',
                  )}
                >
                  <div className="space-y-3">
                    {/* Header: Date & Status */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-stone-900 font-semibold text-sm">
                          <Calendar className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>{formatDateDisplay(req.startDate, req.endDate)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="default" className="text-[11px] font-normal py-0 px-2">
                            {getDurationLabel(req.durationType)}
                          </Badge>
                          {isToday && (
                            <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                              Today
                            </span>
                          )}
                        </div>
                      </div>

                      {renderStatusBadge(req)}
                    </div>

                    {/* Reason Text */}
                    <div className="text-xs text-stone-600 line-clamp-3 bg-stone-50/80 p-2.5 rounded-lg border border-stone-150">
                      <span className="font-medium text-stone-700">Reason: </span>
                      {req.reason}
                    </div>

                    {/* Reviewer Comment Callout if Decided */}
                    {latestDecision && (
                      <div
                        className={cn(
                          'p-2.5 rounded-lg text-xs space-y-1 border',
                          latestDecision.decision === 'APPROVED'
                            ? 'bg-emerald-50/60 border-emerald-200 text-emerald-800'
                            : 'bg-rose-50/60 border-rose-200 text-rose-800',
                        )}
                      >
                        <div className="flex items-center justify-between text-[11px] font-semibold">
                          <span className="flex items-center gap-1">
                            <UserCheck className="w-3 h-3" />
                            {latestDecision.approver
                              ? `${latestDecision.approver.firstName} ${latestDecision.approver.lastName}`
                              : 'Manager Review'}
                          </span>
                          <span className="text-stone-400 font-normal">
                            {new Date(latestDecision.decidedAt).toLocaleDateString()}
                          </span>
                        </div>
                        {latestDecision.comments && (
                          <p className="text-[11px] italic text-stone-600">
                            &ldquo;{latestDecision.comments}&rdquo;
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Card Actions Footer */}
                  <div className="pt-4 border-t border-stone-150 mt-3 flex items-center justify-between gap-2">
                    <button
                      onClick={() => {
                        setSelectedRequest(req);
                        setIsDetailOpen(true);
                      }}
                      className="text-xs font-medium text-stone-500 hover:text-stone-800 flex items-center gap-1 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      View Details
                    </button>

                    <div className="flex items-center gap-1.5">
                      {isApprovedToday && !isCheckedIn && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleWfhCheckIn(req)}
                          disabled={
                            actionLoading === `checkin-${req.id}` ||
                            Boolean(halfDayWindowInfo && !halfDayWindowInfo.isAllowed)
                          }
                          className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-1 px-2.5"
                        >
                          <LogIn className="w-3 h-3" />
                          Check In
                        </Button>
                      )}

                      {canEdit && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEdit(req)}
                          className="gap-1 text-stone-600 hover:text-stone-900 border-stone-300 py-1 px-2 text-xs"
                        >
                          <Edit3 className="w-3 h-3" />
                          Edit
                        </Button>
                      )}

                      {canCancel && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenCancel(req)}
                          className="gap-1 text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200 py-1 px-2 text-xs"
                        >
                          <Trash2 className="w-3 h-3" />
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* DIALOG: CREATE WFH REQUEST */}
        <Dialog
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          title="Submit Work From Home Request"
          description="Select your remote work dates and specify reason for manager approval."
          maxWidth="md"
        >
          <form onSubmit={handleCreateSubmit} className="space-y-4 pt-2">
            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{formError}</span>
              </div>
            )}

            {/* Range Toggle */}
            <div className="flex items-center justify-between p-2.5 bg-stone-50 rounded-lg border border-stone-200">
              <span className="text-xs font-medium text-stone-700">Request Type</span>
              <div className="flex items-center gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setFormIsRange(false);
                    setFormDurationType('FULL_DAY');
                  }}
                  className={cn(
                    'px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer',
                    !formIsRange
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-stone-600 hover:bg-stone-200',
                  )}
                >
                  Single Day
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFormIsRange(true);
                    setFormDurationType('CUSTOM_RANGE');
                  }}
                  className={cn(
                    'px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer',
                    formIsRange
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-stone-600 hover:bg-stone-200',
                  )}
                >
                  Multi-Day Range
                </button>
              </div>
            </div>

            {/* Date Pickers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Start Date *
                </label>
                <Input
                  type="date"
                  value={formStartDate}
                  onChange={(e) => {
                    setFormStartDate(e.target.value);
                    if (!formIsRange) setFormEndDate(e.target.value);
                  }}
                  required
                />
              </div>

              {formIsRange ? (
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    End Date *
                  </label>
                  <Input
                    type="date"
                    min={formStartDate}
                    value={formEndDate}
                    onChange={(e) => setFormEndDate(e.target.value)}
                    required
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Day Portion *
                  </label>
                  <select
                    value={formDurationType}
                    onChange={(e) => setFormDurationType(e.target.value as WfhDurationType)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-stone-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  >
                    <option value="FULL_DAY">Full Day</option>
                    <option value="FIRST_HALF">First Half (Morning)</option>
                    <option value="SECOND_HALF">Second Half (Afternoon)</option>
                  </select>
                </div>
              )}
            </div>

            {/* Reason */}
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Reason / Explanation *
              </label>
              <Textarea
                rows={3}
                placeholder="State the reason for remote work (e.g. broadband setup, personal exigency)..."
                value={formReason}
                onChange={(e) => setFormReason(e.target.value)}
                required
              />
              <span className="text-[11px] text-stone-400 mt-1 block">
                Minimum 5 characters. This will be visible to your manager for approval.
              </span>
            </div>

            {/* Privacy note */}
            <div className="p-3 bg-amber-50/60 border border-amber-200/80 rounded-lg text-xs text-amber-800 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <span>
                <strong>Privacy Protected:</strong> WFH check-in does not collect your home GPS
                location. You will only be authorized to check in once approved by your manager.
              </span>
            </div>

            {/* Modal actions */}
            <div className="pt-2 flex justify-end gap-2 border-t border-stone-200">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={formSubmitting}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {formSubmitting ? 'Submitting...' : 'Submit Request'}
              </Button>
            </div>
          </form>
        </Dialog>

        {/* DIALOG: EDIT WFH REQUEST */}
        <Dialog
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          title="Edit WFH Request"
          description="Update your scheduled remote working dates or explanation."
          maxWidth="md"
        >
          <form onSubmit={handleEditSubmit} className="space-y-4 pt-2">
            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{formError}</span>
              </div>
            )}

            {editingRequest?.status === 'APPROVED' && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                <span>
                  <strong>Notice:</strong> This request is currently APPROVED. Material changes to
                  dates or duration will automatically reset the status to PENDING for manager
                  re-approval.
                </span>
              </div>
            )}

            {/* Range Toggle */}
            <div className="flex items-center justify-between p-2.5 bg-stone-50 rounded-lg border border-stone-200">
              <span className="text-xs font-medium text-stone-700">Request Type</span>
              <div className="flex items-center gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setFormIsRange(false);
                    setFormDurationType('FULL_DAY');
                  }}
                  className={cn(
                    'px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer',
                    !formIsRange
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-stone-600 hover:bg-stone-200',
                  )}
                >
                  Single Day
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFormIsRange(true);
                    setFormDurationType('CUSTOM_RANGE');
                  }}
                  className={cn(
                    'px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer',
                    formIsRange
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-stone-600 hover:bg-stone-200',
                  )}
                >
                  Multi-Day Range
                </button>
              </div>
            </div>

            {/* Date Pickers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Start Date *
                </label>
                <Input
                  type="date"
                  value={formStartDate}
                  onChange={(e) => {
                    setFormStartDate(e.target.value);
                    if (!formIsRange) setFormEndDate(e.target.value);
                  }}
                  required
                />
              </div>

              {formIsRange ? (
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    End Date *
                  </label>
                  <Input
                    type="date"
                    min={formStartDate}
                    value={formEndDate}
                    onChange={(e) => setFormEndDate(e.target.value)}
                    required
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Day Portion *
                  </label>
                  <select
                    value={formDurationType}
                    onChange={(e) => setFormDurationType(e.target.value as WfhDurationType)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-stone-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  >
                    <option value="FULL_DAY">Full Day</option>
                    <option value="FIRST_HALF">First Half (Morning)</option>
                    <option value="SECOND_HALF">Second Half (Afternoon)</option>
                  </select>
                </div>
              )}
            </div>

            {/* Reason */}
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Reason / Explanation *
              </label>
              <Textarea
                rows={3}
                value={formReason}
                onChange={(e) => setFormReason(e.target.value)}
                required
              />
            </div>

            {/* Modal actions */}
            <div className="pt-2 flex justify-end gap-2 border-t border-stone-200">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsEditOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={formSubmitting}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {formSubmitting ? 'Saving Changes...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Dialog>

        {/* DIALOG: CANCEL WFH REQUEST */}
        <Dialog
          isOpen={isCancelOpen}
          onClose={() => setIsCancelOpen(false)}
          title="Cancel WFH Request"
          description="Are you sure you want to cancel this scheduled Work From Home request?"
          maxWidth="sm"
        >
          <div className="space-y-4 pt-2">
            <p className="text-xs text-stone-600">
              Dates:{' '}
              <strong>
                {cancellingRequest &&
                  formatDateDisplay(cancellingRequest.startDate, cancellingRequest.endDate)}
              </strong>
            </p>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Cancellation Reason (Optional)
              </label>
              <Input
                type="text"
                placeholder="Reason for cancellation..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </div>

            <div className="pt-2 flex justify-end gap-2 border-t border-stone-200">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCancelOpen(false)}
              >
                Keep Request
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={handleCancelSubmit}
                disabled={actionLoading?.startsWith('cancel')}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                {actionLoading?.startsWith('cancel') ? 'Cancelling...' : 'Confirm Cancellation'}
              </Button>
            </div>
          </div>
        </Dialog>

        {/* DIALOG: VIEW DETAILS */}
        <Dialog
          isOpen={isDetailOpen}
          onClose={() => setIsDetailOpen(false)}
          title="WFH Request Details"
          maxWidth="md"
        >
          {selectedRequest && (
            <div className="space-y-4 pt-2 text-xs">
              <div className="flex items-center justify-between pb-3 border-b border-stone-200">
                <div>
                  <span className="text-stone-500 block text-[11px]">Dates</span>
                  <span className="font-semibold text-stone-900 text-sm">
                    {formatDateDisplay(selectedRequest.startDate, selectedRequest.endDate)}
                  </span>
                </div>
                {renderStatusBadge(selectedRequest)}
              </div>

              <div className="grid grid-cols-2 gap-3 py-1">
                <div>
                  <span className="text-stone-500 block text-[11px]">Duration Type</span>
                  <span className="font-medium text-stone-800">
                    {getDurationLabel(selectedRequest.durationType)}
                  </span>
                </div>
                <div>
                  <span className="text-stone-500 block text-[11px]">Submitted On</span>
                  <span className="font-medium text-stone-800">
                    {new Date(selectedRequest.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-stone-500 block text-[11px] mb-1">Reason / Purpose</span>
                <div className="p-2.5 bg-stone-50 rounded-lg text-stone-700 border border-stone-200">
                  {selectedRequest.reason}
                </div>
              </div>

              {/* Reviewer Decisions */}
              {selectedRequest.decisions && selectedRequest.decisions.length > 0 && (
                <div>
                  <span className="text-stone-500 block text-[11px] mb-1.5 font-semibold">
                    Approval History
                  </span>
                  <div className="space-y-2">
                    {selectedRequest.decisions.map((dec) => (
                      <div
                        key={dec.id}
                        className={cn(
                          'p-3 rounded-lg border text-xs',
                          dec.decision === 'APPROVED'
                            ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900'
                            : 'bg-rose-50/50 border-rose-200 text-rose-900',
                        )}
                      >
                        <div className="flex items-center justify-between font-semibold">
                          <span>
                            Decision: {dec.decision}{' '}
                            {dec.approver &&
                              `by ${dec.approver.firstName} ${dec.approver.lastName}`}
                          </span>
                          <span className="text-[11px] font-normal text-stone-500">
                            {new Date(dec.decidedAt).toLocaleString()}
                          </span>
                        </div>
                        {dec.comments && (
                          <p className="mt-1 text-[11px] text-stone-600 italic">
                            Comments: &ldquo;{dec.comments}&rdquo;
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-2 flex justify-end border-t border-stone-200">
                <Button variant="outline" size="sm" onClick={() => setIsDetailOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </Dialog>
      </div>
    </AppShell>
  );
}
