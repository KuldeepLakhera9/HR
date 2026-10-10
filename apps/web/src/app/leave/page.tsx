'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppShell } from '../../layouts/AppShell';
import { useAuth } from '../../context/AuthContext';
import { leaveApi } from '../../lib/api-client';
import { Button, Badge, Toast, EmptyState, ErrorState, KPICard } from '@hrms/ui';
import {
  CalendarPlus,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Search,
  Eye,
  FileText,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Inbox,
  BarChart3,
  Users,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
  Settings,
} from 'lucide-react';
import { ApplyLeaveModal, LeaveBalanceItem } from '../../components/leave/ApplyLeaveModal';
import { LeaveDetailsModal, LeaveRequestItem } from '../../components/leave/LeaveDetailsModal';
import { DecideLeaveModal } from '../../components/leave/DecideLeaveModal';
import { LeaveCalendarView } from '../../components/leave/LeaveCalendarView';
import { HRLeaveAdminView } from '../../components/leave/HRLeaveAdminView';

export default function LeaveManagementPage() {
  const { user } = useAuth();

  const isManager =
    user?.roles?.includes('MANAGER') ||
    user?.roles?.includes('ADMIN') ||
    user?.roles?.includes('HR');
  const isAdminOrHr = user?.roles?.includes('ADMIN') || user?.roles?.includes('HR');

  // Navigation tab state
  const [activeTab, setActiveTab] = useState<
    'my-leave' | 'manager-approvals' | 'hr-overview' | 'calendar' | 'hr-admin'
  >('my-leave');

  // Balance accounts state
  const [balances, setBalances] = useState<LeaveBalanceItem[]>([]);
  const [balancesLoading, setBalancesLoading] = useState<boolean>(true);
  const [balancesError, setBalancesError] = useState<string | null>(null);

  // My Requests state
  const [requests, setRequests] = useState<LeaveRequestItem[]>([]);
  const [requestsLoading, setRequestsLoading] = useState<boolean>(true);
  const [requestsError, setRequestsError] = useState<string | null>(null);

  // Filter & Pagination state for My Requests
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Manager Pending Inbox state
  const [pendingRequests, setPendingRequests] = useState<LeaveRequestItem[]>([]);
  const [pendingLoading, setPendingLoading] = useState<boolean>(false);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [pendingPage, setPendingPage] = useState<number>(1);
  const [pendingTotalPages, setPendingTotalPages] = useState<number>(1);
  const [pendingTotalCount, setPendingTotalCount] = useState<number>(0);
  const [pendingSearch, setPendingSearch] = useState<string>('');
  const [escalatedOnlyFilter, setEscalatedOnlyFilter] = useState<boolean>(false);

  // HR / Admin Overview state
  const [overviewData, setOverviewData] = useState<any>(null);
  const [overviewLoading, setOverviewLoading] = useState<boolean>(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  // Modals state
  const [isApplyOpen, setIsApplyOpen] = useState<boolean>(false);
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequestItem | null>(null);
  const [decideRequest, setDecideRequest] = useState<LeaveRequestItem | null>(null);
  const [toastMessage, setToastMessage] = useState<{
    type: 'success' | 'error';
    title: string;
    text: string;
  } | null>(null);

  // 1. Fetch Authoritative Balances
  const fetchBalances = useCallback(async () => {
    setBalancesLoading(true);
    setBalancesError(null);
    try {
      const res = await leaveApi.getBalances();
      if (res.success && Array.isArray(res.data)) {
        setBalances(res.data);
      } else {
        setBalances([]);
      }
    } catch (err: any) {
      setBalancesError(err.message || 'Failed to load authoritative leave balances.');
    } finally {
      setBalancesLoading(false);
    }
  }, []);

  // 2. Fetch Employee Leave Applications
  const fetchRequests = useCallback(async () => {
    setRequestsLoading(true);
    setRequestsError(null);
    try {
      const res = await leaveApi.getRequests({
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        leaveTypeId: typeFilter !== 'ALL' ? typeFilter : undefined,
        search: searchTerm.trim() || undefined,
        page,
        limit: 10,
      });

      if (res.success) {
        setRequests(res.data || []);
        const resAny = res as any;
        if (resAny.pagination) {
          setTotalPages(resAny.pagination.totalPages || 1);
          setTotalCount(resAny.pagination.total || 0);
        }
      }
    } catch (err: any) {
      setRequestsError(err.message || 'Failed to load leave applications history.');
    } finally {
      setRequestsLoading(false);
    }
  }, [statusFilter, typeFilter, searchTerm, page]);

  // 3. Fetch Manager Pending Inbox
  const fetchPending = useCallback(async () => {
    if (!isManager) return;
    setPendingLoading(true);
    setPendingError(null);
    try {
      const res = await leaveApi.getManagerPending({
        search: pendingSearch.trim() || undefined,
        page: pendingPage,
        limit: 10,
        escalatedOnly: escalatedOnlyFilter,
      });

      if (res.success) {
        setPendingRequests(res.data || []);
        const resAny = res as any;
        if (resAny.pagination) {
          setPendingTotalPages(resAny.pagination.totalPages || 1);
          setPendingTotalCount(resAny.pagination.total || 0);
        }
      }
    } catch (err: any) {
      setPendingError(err.message || 'Failed to load pending leave applications.');
    } finally {
      setPendingLoading(false);
    }
  }, [isManager, pendingSearch, pendingPage, escalatedOnlyFilter]);

  // 4. Fetch HR Operations Overview
  const fetchOverview = useCallback(async () => {
    if (!isAdminOrHr && !isManager) return;
    setOverviewLoading(true);
    setOverviewError(null);
    try {
      const res = await leaveApi.getOverview();
      if (res.success) {
        setOverviewData(res.data);
      }
    } catch (err: any) {
      setOverviewError(err.message || 'Failed to load leave overview metrics.');
    } finally {
      setOverviewLoading(false);
    }
  }, [isAdminOrHr, isManager]);

  // Initial load
  useEffect(() => {
    fetchBalances();
    fetchRequests();
    if (isManager) fetchPending();
    if (isAdminOrHr || isManager) fetchOverview();
  }, [fetchBalances, fetchRequests, fetchPending, fetchOverview, isManager, isAdminOrHr]);

  const handleRefresh = () => {
    if (activeTab === 'my-leave') {
      fetchBalances();
      fetchRequests();
    } else if (activeTab === 'manager-approvals') {
      fetchPending();
    } else if (activeTab === 'hr-overview') {
      fetchOverview();
    }
  };

  const handleApplySuccess = (msg: string) => {
    setToastMessage({
      type: 'success',
      title: 'Leave Submitted',
      text: msg,
    });
    fetchBalances();
    fetchRequests();
    if (isManager) fetchPending();
  };

  const handleCancelSuccess = (msg: string) => {
    setToastMessage({
      type: 'success',
      title: 'Application Cancelled',
      text: msg,
    });
    fetchBalances();
    fetchRequests();
    if (isManager) fetchPending();
  };

  const handleDecideSuccess = (msg: string) => {
    setToastMessage({
      type: 'success',
      title: 'Decision Recorded',
      text: msg,
    });
    fetchPending();
    fetchOverview();
    fetchBalances();
    fetchRequests();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return (
          <Badge variant="success" size="sm">
            Approved
          </Badge>
        );
      case 'SUBMITTED':
        return (
          <Badge variant="warning" size="sm">
            Pending
          </Badge>
        );
      case 'REJECTED':
        return (
          <Badge variant="danger" size="sm">
            Rejected
          </Badge>
        );
      case 'CANCELLED':
        return (
          <Badge variant="default" size="sm">
            Cancelled
          </Badge>
        );
      default:
        return (
          <Badge variant="default" size="sm">
            {status}
          </Badge>
        );
    }
  };

  return (
    <AppShell>
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 animate-fade-in">
          <Toast
            type={toastMessage.type}
            title={toastMessage.title}
            message={toastMessage.text}
            onClose={() => setToastMessage(null)}
          />
        </div>
      )}

      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-stone-900">
              Leave Management
            </h1>
            <p className="text-xs md:text-sm text-stone-500 mt-1">
              Apply for leave, track balance ledgers, review team applications, and oversee
              organization leave analytics.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleRefresh}
              leftIcon={
                <RefreshCw
                  className={`h-4 w-4 ${
                    requestsLoading || balancesLoading || pendingLoading || overviewLoading
                      ? 'animate-spin'
                      : ''
                  }`}
                />
              }
            >
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => setIsApplyOpen(true)}
              leftIcon={<CalendarPlus className="h-4 w-4" />}
            >
              Apply For Leave
            </Button>
          </div>
        </div>

        {/* Navigation Tabs (Employee vs Calendar vs Manager Inbox vs HR Overview) */}
        <div className="border-b border-stone-200">
          <nav className="flex space-x-6">
            <button
              type="button"
              onClick={() => setActiveTab('my-leave')}
              className={`py-3 px-1 text-xs md:text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
                activeTab === 'my-leave'
                  ? 'border-amber-600 text-amber-700'
                  : 'border-transparent text-stone-500 hover:text-stone-700 hover:border-stone-300'
              }`}
            >
              <Calendar className="h-4 w-4" />
              <span>My Leave & Balances</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('calendar')}
              className={`py-3 px-1 text-xs md:text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
                activeTab === 'calendar'
                  ? 'border-amber-600 text-amber-700'
                  : 'border-transparent text-stone-500 hover:text-stone-700 hover:border-stone-300'
              }`}
            >
              <Users className="h-4 w-4" />
              <span>Team & Leave Calendar</span>
            </button>

            {isManager && (
              <button
                type="button"
                onClick={() => setActiveTab('manager-approvals')}
                className={`py-3 px-1 text-xs md:text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
                  activeTab === 'manager-approvals'
                    ? 'border-amber-600 text-amber-700'
                    : 'border-transparent text-stone-500 hover:text-stone-700 hover:border-stone-300'
                }`}
              >
                <Inbox className="h-4 w-4" />
                <span>Manager Approvals</span>
                {pendingTotalCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">
                    {pendingTotalCount}
                  </span>
                )}
              </button>
            )}

            {isAdminOrHr && (
              <button
                type="button"
                onClick={() => setActiveTab('hr-overview')}
                className={`py-3 px-1 text-xs md:text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
                  activeTab === 'hr-overview'
                    ? 'border-amber-600 text-amber-700'
                    : 'border-transparent text-stone-500 hover:text-stone-700 hover:border-stone-300'
                }`}
              >
                <BarChart3 className="h-4 w-4" />
                <span>HR & Organization Overview</span>
              </button>
            )}

            {isAdminOrHr && (
              <button
                type="button"
                onClick={() => setActiveTab('hr-admin')}
                className={`py-3 px-1 text-xs md:text-sm font-semibold border-b-2 flex items-center gap-2 transition-colors ${
                  activeTab === 'hr-admin'
                    ? 'border-amber-600 text-amber-700'
                    : 'border-transparent text-stone-500 hover:text-stone-700 hover:border-stone-300'
                }`}
              >
                <Settings className="h-4 w-4" />
                <span>HR Admin & Reports</span>
              </button>
            )}
          </nav>
        </div>

        {/* TAB 1: MY LEAVE & BALANCES */}
        {activeTab === 'my-leave' && (
          <div className="space-y-6">
            {/* Balance Summary Cards */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                  Current Leave Entitlements & Balances
                </h2>
                <span className="text-[11px] text-stone-400">
                  Calendar Year {new Date().getFullYear()}
                </span>
              </div>

              {balancesLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="p-5 rounded-xl border border-stone-200 bg-white animate-pulse space-y-3"
                    >
                      <div className="h-4 bg-stone-200 rounded w-1/3" />
                      <div className="h-7 bg-stone-200 rounded w-1/2" />
                      <div className="h-3 bg-stone-100 rounded w-3/4" />
                    </div>
                  ))}
                </div>
              ) : balancesError ? (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center justify-between">
                  <span>{balancesError}</span>
                  <Button size="sm" variant="outline" onClick={fetchBalances}>
                    Retry
                  </Button>
                </div>
              ) : balances.length === 0 ? (
                <div className="p-6 rounded-xl border border-dashed border-stone-300 bg-stone-50 text-center text-xs text-stone-500">
                  No leave policies assigned to your employee profile yet. Please contact HR.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {balances.map((acc) => (
                    <KPICard
                      key={acc.leaveType.id}
                      title={`${acc.leaveType.name} (${acc.leaveType.code})`}
                      value={`${acc.closingBalance} Days`}
                      description={`${acc.usedBalance} utilized · ${acc.pendingBalance} pending · ${acc.allocatedBalance} allocated`}
                      icon={<Calendar className="h-5 w-5 text-amber-700" />}
                      iconBg="bg-amber-100"
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Filter & Search */}
            <div className="p-4 rounded-xl bg-white border border-stone-200 space-y-3 shadow-2xs">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
                  {['ALL', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED'].map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => {
                        setStatusFilter(st);
                        setPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
                        statusFilter === st
                          ? 'bg-amber-600 text-white shadow-2xs font-semibold'
                          : 'bg-stone-100 text-stone-600 hover:bg-stone-200/70'
                      }`}
                    >
                      {st === 'SUBMITTED'
                        ? 'Pending'
                        : st === 'ALL'
                          ? 'All Requests'
                          : st.charAt(0) + st.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={typeFilter}
                    onChange={(e) => {
                      setTypeFilter(e.target.value);
                      setPage(1);
                    }}
                    className="h-9 px-3 rounded-lg border border-stone-200 bg-white text-xs text-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
                  >
                    <option value="ALL">All Leave Categories</option>
                    {balances.map((b) => (
                      <option key={b.leaveType.id} value={b.leaveType.id}>
                        {b.leaveType.name} ({b.leaveType.code})
                      </option>
                    ))}
                  </select>

                  <div className="relative min-w-[200px]">
                    <Search className="h-3.5 w-3.5 absolute left-3 top-3 text-stone-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search reasons..."
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setPage(1);
                      }}
                      className="w-full h-9 pl-8 pr-3 rounded-lg border border-stone-200 bg-white text-xs text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Requests Table */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-stone-900">Leave Applications History</h3>
                <span className="text-xs text-stone-500">
                  {totalCount} total application{totalCount === 1 ? '' : 's'}
                </span>
              </div>

              {requestsLoading ? (
                <div className="p-8 text-center bg-white rounded-xl border border-stone-200">
                  <Clock className="h-6 w-6 animate-spin mx-auto text-amber-600 mb-2" />
                  <p className="text-xs text-stone-500">Loading leave requests history...</p>
                </div>
              ) : requestsError ? (
                <ErrorState
                  title="Unable to load requests"
                  message={requestsError}
                  onRetry={fetchRequests}
                />
              ) : requests.length === 0 ? (
                <EmptyState
                  title="No leave requests found"
                  description={
                    statusFilter !== 'ALL' || typeFilter !== 'ALL' || searchTerm
                      ? 'No applications match your active filter criteria.'
                      : 'You have not submitted any leave requests yet this year.'
                  }
                  action={{
                    label: 'Apply For Leave',
                    onClick: () => setIsApplyOpen(true),
                  }}
                  icon={<CalendarDays className="h-8 w-8 text-stone-400" />}
                />
              ) : (
                <div className="bg-white rounded-xl border border-stone-200/90 overflow-hidden shadow-2xs">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-stone-700">
                      <thead className="bg-stone-50/80 text-[11px] font-semibold uppercase tracking-wider text-stone-500 border-b border-stone-200">
                        <tr>
                          <th className="py-3 px-4">Leave Category</th>
                          <th className="py-3 px-4">Period & Duration</th>
                          <th className="py-3 px-4">Days</th>
                          <th className="py-3 px-4">Reason Preview</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-4">Applied Date</th>
                          <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {requests.map((req) => (
                          <tr
                            key={req.id}
                            className="hover:bg-amber-50/40 transition-colors cursor-pointer"
                            onClick={() => setSelectedRequest(req)}
                          >
                            <td className="py-3.5 px-4">
                              <div className="font-semibold text-stone-900">
                                {req.leaveType.name}
                              </div>
                              <span className="text-[11px] text-stone-400">
                                Code: {req.leaveType.code}
                              </span>
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="font-medium text-stone-800">
                                {req.startDate}{' '}
                                {req.startDate !== req.endDate ? `to ${req.endDate}` : ''}
                              </div>
                              <span className="text-[11px] text-stone-400">
                                {req.durationType.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 font-bold text-stone-900">
                              {req.chargeableDays}
                            </td>
                            <td className="py-3.5 px-4 max-w-[240px]">
                              <p className="truncate text-stone-600" title={req.reason}>
                                {req.reason}
                              </p>
                              {req.attachmentUrl && (
                                <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-medium mt-0.5">
                                  <FileText className="h-3 w-3" /> Attachment
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4">{getStatusBadge(req.status)}</td>
                            <td className="py-3.5 px-4 text-stone-500">
                              {new Date(req.createdAt).toLocaleDateString()}
                            </td>
                            <td
                              className="py-3.5 px-4 text-right"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setSelectedRequest(req)}
                                  leftIcon={<Eye className="h-3.5 w-3.5" />}
                                >
                                  Details
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {totalPages > 1 && (
                    <div className="p-3 border-t border-stone-200 bg-stone-50/60 flex items-center justify-between text-xs text-stone-600">
                      <span>
                        Page {page} of {totalPages}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={page <= 1}
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          leftIcon={<ChevronLeft className="h-3.5 w-3.5" />}
                        >
                          Previous
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={page >= totalPages}
                          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                          rightIcon={<ChevronRight className="h-3.5 w-3.5" />}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: MANAGER APPROVAL INBOX */}
        {activeTab === 'manager-approvals' && isManager && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-stone-900">
                  Pending Team Applications Queue
                </h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  Review and decide leave requests submitted by reporting employees.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {isAdminOrHr && (
                  <button
                    type="button"
                    onClick={() => {
                      setEscalatedOnlyFilter(!escalatedOnlyFilter);
                      setPendingPage(1);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      escalatedOnlyFilter
                        ? 'bg-amber-100 border-amber-300 text-amber-900'
                        : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                    }`}
                  >
                    {escalatedOnlyFilter
                      ? '✓ Showing Unassigned / Escalated Only'
                      : 'Filter Unassigned (Escalations)'}
                  </button>
                )}

                <div className="relative min-w-[220px]">
                  <Search className="h-3.5 w-3.5 absolute left-3 top-3 text-stone-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search applicant or reason..."
                    value={pendingSearch}
                    onChange={(e) => {
                      setPendingSearch(e.target.value);
                      setPendingPage(1);
                    }}
                    className="w-full h-9 pl-8 pr-3 rounded-lg border border-stone-200 bg-white text-xs text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
                  />
                </div>
              </div>
            </div>

            {pendingLoading ? (
              <div className="p-10 text-center bg-white rounded-xl border border-stone-200">
                <Clock className="h-6 w-6 animate-spin mx-auto text-amber-600 mb-2" />
                <p className="text-xs text-stone-500">Loading pending requests...</p>
              </div>
            ) : pendingError ? (
              <ErrorState
                title="Unable to load pending queue"
                message={pendingError}
                onRetry={fetchPending}
              />
            ) : pendingRequests.length === 0 ? (
              <EmptyState
                title="Inbox zero: No pending approvals"
                description={
                  pendingSearch || escalatedOnlyFilter
                    ? 'No pending applications match the active filter criteria.'
                    : 'All leave requests from your reporting team have been reviewed and processed.'
                }
                icon={<CheckCircle2 className="h-8 w-8 text-emerald-600" />}
              />
            ) : (
              <div className="bg-white rounded-xl border border-stone-200/90 overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-stone-700">
                    <thead className="bg-stone-50/80 text-[11px] font-semibold uppercase tracking-wider text-stone-500 border-b border-stone-200">
                      <tr>
                        <th className="py-3 px-4">Employee Applicant</th>
                        <th className="py-3 px-4">Leave Category</th>
                        <th className="py-3 px-4">Period & Duration</th>
                        <th className="py-3 px-4">Days</th>
                        <th className="py-3 px-4">Reason</th>
                        <th className="py-3 px-4">Document</th>
                        <th className="py-3 px-4 text-right">Review Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {pendingRequests.map((req) => (
                        <tr key={req.id} className="hover:bg-amber-50/40 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2">
                              <div className="h-7 w-7 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-bold shrink-0">
                                {req.employee.displayName.charAt(0)}
                              </div>
                              <div>
                                <div className="font-semibold text-stone-900 flex items-center gap-1.5">
                                  <span>{req.employee.displayName}</span>
                                  {(req as any).employee?.isEscalated && (
                                    <Badge variant="warning" size="sm">
                                      Escalated
                                    </Badge>
                                  )}
                                </div>
                                <span className="text-[11px] text-stone-400">
                                  {req.employee.employeeCode} · {req.employee.department || 'Staff'}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-medium text-stone-900">{req.leaveType.name}</span>
                            <span className="block text-[11px] text-stone-400">
                              {req.leaveType.code}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-medium text-stone-800">
                              {req.startDate}{' '}
                              {req.startDate !== req.endDate ? `to ${req.endDate}` : ''}
                            </span>
                            <span className="block text-[11px] text-stone-400">
                              {req.durationType.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-bold text-stone-900">
                            {req.chargeableDays}
                          </td>
                          <td className="py-3.5 px-4 max-w-[200px]">
                            <p className="truncate text-stone-600" title={req.reason}>
                              {req.reason}
                            </p>
                          </td>
                          <td className="py-3.5 px-4">
                            {req.attachmentUrl ? (
                              <a
                                href={req.attachmentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 hover:text-amber-800"
                              >
                                <FileText className="h-3 w-3" /> Attachment
                              </a>
                            ) : (
                              <span className="text-stone-400 text-[11px]">None</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setSelectedRequest(req)}
                                leftIcon={<Eye className="h-3.5 w-3.5" />}
                              >
                                View
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => setDecideRequest(req)}
                                className="bg-amber-600 hover:bg-amber-700 text-white"
                                leftIcon={<ShieldCheck className="h-3.5 w-3.5" />}
                              >
                                Decide
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {pendingTotalPages > 1 && (
                  <div className="p-3 border-t border-stone-200 bg-stone-50/60 flex items-center justify-between text-xs text-stone-600">
                    <span>
                      Page {pendingPage} of {pendingTotalPages} ({pendingTotalCount} total pending)
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pendingPage <= 1}
                        onClick={() => setPendingPage((p) => Math.max(1, p - 1))}
                        leftIcon={<ChevronLeft className="h-3.5 w-3.5" />}
                      >
                        Previous
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pendingPage >= pendingTotalPages}
                        onClick={() => setPendingPage((p) => Math.min(pendingTotalPages, p + 1))}
                        rightIcon={<ChevronRight className="h-3.5 w-3.5" />}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: HR & ORGANIZATION OVERVIEW */}
        {activeTab === 'hr-overview' && isAdminOrHr && (
          <div className="space-y-6">
            <div>
              <h2 className="text-sm font-bold text-stone-900">
                Organization Leave Operations Overview
              </h2>
              <p className="text-xs text-stone-500 mt-0.5">
                Aggregated metrics, department trends, and escalated review management.
              </p>
            </div>

            {overviewLoading ? (
              <div className="p-8 text-center bg-white rounded-xl border border-stone-200">
                <Clock className="h-6 w-6 animate-spin mx-auto text-amber-600 mb-2" />
                <p className="text-xs text-stone-500">Loading overview metrics...</p>
              </div>
            ) : overviewError ? (
              <ErrorState
                title="Unable to load overview"
                message={overviewError}
                onRetry={fetchOverview}
              />
            ) : overviewData ? (
              <div className="space-y-6">
                {/* 5 KPI Metric Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  <KPICard
                    title="Pending Reviews"
                    value={overviewData.pendingCount}
                    description="Awaiting supervisor action"
                    icon={<Clock className="h-5 w-5 text-amber-700" />}
                    iconBg="bg-amber-100"
                  />
                  <KPICard
                    title="Approved (YTD)"
                    value={overviewData.approvedCount}
                    description={`Calendar year ${overviewData.currentYear}`}
                    icon={<CheckCircle2 className="h-5 w-5 text-emerald-700" />}
                    iconBg="bg-emerald-100"
                  />
                  <KPICard
                    title="Rejected (YTD)"
                    value={overviewData.rejectedCount}
                    description="Declined requests"
                    icon={<XCircle className="h-5 w-5 text-rose-700" />}
                    iconBg="bg-rose-100"
                  />
                  <KPICard
                    title="Escalated / Unassigned"
                    value={overviewData.escalatedCount}
                    description="Missing direct manager"
                    icon={<AlertTriangle className="h-5 w-5 text-purple-700" />}
                    iconBg="bg-purple-100"
                  />
                  <KPICard
                    title="On Leave Today"
                    value={overviewData.todayOnLeaveCount}
                    description="Active confirmed absences"
                    icon={<Users className="h-5 w-5 text-sky-700" />}
                    iconBg="bg-sky-100"
                  />
                </div>

                {/* Category Breakdown */}
                {overviewData.categoryBreakdown && (
                  <div className="p-5 rounded-xl bg-white border border-stone-200 space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                      Approved Leave Distribution By Category ({overviewData.currentYear})
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {overviewData.categoryBreakdown.map((cat: any) => (
                        <div
                          key={cat.id}
                          className="p-3 rounded-lg bg-stone-50 border border-stone-200/80 flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-semibold text-stone-800 block">
                              {cat.name} ({cat.code})
                            </span>
                            <span className="text-[11px] text-stone-400">Total approved</span>
                          </div>
                          <span className="text-base font-bold text-stone-900">
                            {cat.approvedCount}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}

        {/* TAB 4: TEAM AVAILABILITY & LEAVE CALENDAR */}
        {activeTab === 'calendar' && <LeaveCalendarView />}

        {/* TAB 5: HR ADMINISTRATION, BALANCES & REPORTS */}
        {activeTab === 'hr-admin' && <HRLeaveAdminView currentUserId={user?.id} />}

        {/* Modals */}
        <ApplyLeaveModal
          isOpen={isApplyOpen}
          onClose={() => setIsApplyOpen(false)}
          onSuccess={handleApplySuccess}
          balances={balances}
        />

        <LeaveDetailsModal
          request={selectedRequest}
          isOpen={Boolean(selectedRequest)}
          onClose={() => setSelectedRequest(null)}
          onCancelSuccess={handleCancelSuccess}
        />

        <DecideLeaveModal
          request={decideRequest}
          isOpen={Boolean(decideRequest)}
          onClose={() => setDecideRequest(null)}
          onSuccess={handleDecideSuccess}
          currentUserId={user?.id}
        />
      </div>
    </AppShell>
  );
}
