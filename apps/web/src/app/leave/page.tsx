'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppShell } from '../../layouts/AppShell';
import { useAuth } from '../../context/AuthContext';
import { leaveApi } from '../../lib/api-client';
import {
  Button,
  Badge,
  Card,
  Input,
  Select,
  Toast,
  EmptyState,
  ErrorState,
  LoadingState,
  KPICard,
} from '@hrms/ui';
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
  Filter,
  FileText,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Ban,
  CalendarDays,
} from 'lucide-react';
import { ApplyLeaveModal, LeaveBalanceItem } from '../../components/leave/ApplyLeaveModal';
import { LeaveDetailsModal, LeaveRequestItem } from '../../components/leave/LeaveDetailsModal';

export default function EmployeeLeavePage() {
  const { user } = useAuth();

  // Balance accounts state
  const [balances, setBalances] = useState<LeaveBalanceItem[]>([]);
  const [balancesLoading, setBalancesLoading] = useState<boolean>(true);
  const [balancesError, setBalancesError] = useState<string | null>(null);

  // Requests state
  const [requests, setRequests] = useState<LeaveRequestItem[]>([]);
  const [requestsLoading, setRequestsLoading] = useState<boolean>(true);
  const [requestsError, setRequestsError] = useState<string | null>(null);

  // Filter & Pagination state
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Modal dialog states
  const [isApplyOpen, setIsApplyOpen] = useState<boolean>(false);
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequestItem | null>(null);
  const [toastMessage, setToastMessage] = useState<{
    type: 'success' | 'error';
    title: string;
    text: string;
  } | null>(null);

  // 1. Fetch Authoritative Balances from Backend
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

  // Initial load
  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleRefresh = () => {
    fetchBalances();
    fetchRequests();
  };

  const handleApplySuccess = (msg: string) => {
    setToastMessage({
      type: 'success',
      title: 'Leave Submitted',
      text: msg,
    });
    fetchBalances();
    fetchRequests();
  };

  const handleCancelSuccess = (msg: string) => {
    setToastMessage({
      type: 'success',
      title: 'Application Cancelled',
      text: msg,
    });
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
              My Leave & Balances
            </h1>
            <p className="text-xs md:text-sm text-stone-500 mt-1">
              View your authoritative annual leave balance, track applications, and submit new leave
              requests.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleRefresh}
              leftIcon={
                <RefreshCw
                  className={`h-4 w-4 ${requestsLoading || balancesLoading ? 'animate-spin' : ''}`}
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

        {/* 1. Authoritative Balances Summary Cards */}
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

        {/* 2. Filters & Search Section */}
        <div className="p-4 rounded-xl bg-white border border-stone-200 space-y-3 shadow-2xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Status Pills */}
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

            {/* Leave Type Filter and Search */}
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

        {/* 3. Requests List / Table */}
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
                          <div className="font-semibold text-stone-900">{req.leaveType.name}</div>
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
                        <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
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

              {/* Pagination Footer */}
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

        {/* 4. Modals */}
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
      </div>
    </AppShell>
  );
}
