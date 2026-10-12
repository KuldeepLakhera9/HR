'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppShell } from '../../layouts/AppShell';
import { useAuth } from '../../context/AuthContext';
import { employeesApi, leaveApi, wfhApi, visitsApi } from '../../lib/api-client';
import {
  UnifiedEmployeeRequest,
  UnifiedRequestType,
  UnifiedRequestStatus,
  UnifiedRequestsResponse,
} from '@hrms/types';
import { Button, Badge, Card, Skeleton } from '@hrms/ui';
import {
  Calendar,
  Home,
  Briefcase,
  Clock,
  User,
  Search,
  Filter,
  RefreshCw,
  Plus,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
  Trash2,
  ExternalLink,
  CheckSquare,
  ArrowRight,
  FileText,
  CalendarDays,
} from 'lucide-react';
import Link from 'next/link';

export default function MyRequestsPage() {
  const { user } = useAuth();

  // Filter & Pagination state
  const [selectedType, setSelectedType] = useState<UnifiedRequestType | 'ALL'>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<UnifiedRequestStatus | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const limit = 10;

  // Data state
  const [data, setData] = useState<UnifiedRequestsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Selected detail modal & cancellation modal
  const [detailItem, setDetailItem] = useState<UnifiedEmployeeRequest | null>(null);
  const [cancellingItem, setCancellingItem] = useState<UnifiedEmployeeRequest | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  // Fetch unified requests
  const loadRequests = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await employeesApi.getMyRequests({
        type: selectedType,
        status: selectedStatus,
        search: searchQuery.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        page,
        limit,
      });
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch your requests. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedType, selectedStatus, searchQuery, startDate, endDate, page, limit]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  // Handle request cancellation
  const handleConfirmCancel = async () => {
    if (!cancellingItem) return;
    setIsCancelling(true);
    setActionError(null);
    try {
      if (cancellingItem.type === 'LEAVE') {
        await leaveApi.cancelRequest(cancellingItem.id, {
          cancellationReason: cancelReason || 'Cancelled by employee',
        });
      } else if (cancellingItem.type === 'WFH') {
        await wfhApi.cancelWfh(cancellingItem.id, {
          cancellationReason: cancelReason || 'Cancelled by employee',
        });
      } else if (cancellingItem.type === 'OFFICIAL_VISIT') {
        await visitsApi.cancelVisit(cancellingItem.id, cancelReason || 'Cancelled by employee');
      } else if (cancellingItem.type === 'PROFILE_CHANGE') {
        await employeesApi.cancelProfileChangeRequest(cancellingItem.id);
      } else {
        throw new Error('This request type cannot be directly cancelled.');
      }

      setActionSuccess(
        `Your ${cancellingItem.type.replace('_', ' ').toLowerCase()} request was successfully cancelled.`,
      );
      setCancellingItem(null);
      setCancelReason('');
      if (detailItem?.id === cancellingItem.id) {
        setDetailItem(null);
      }
      loadRequests();
    } catch (err: any) {
      setActionError(err.message || 'Failed to cancel the request. Please try again.');
    } finally {
      setIsCancelling(false);
    }
  };

  // Helper for Type styling & icons
  const getTypeMeta = (type: UnifiedRequestType) => {
    switch (type) {
      case 'LEAVE':
        return {
          label: 'Leave',
          icon: Calendar,
          badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
          viewHref: '/leave',
        };
      case 'WFH':
        return {
          label: 'Work From Home',
          icon: Home,
          badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
          viewHref: '/wfh',
        };
      case 'OFFICIAL_VISIT':
        return {
          label: 'Official Visit',
          icon: Briefcase,
          badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
          viewHref: '/visits',
        };
      case 'ATTENDANCE_CORRECTION':
        return {
          label: 'Attendance Regularization',
          icon: Clock,
          badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
          viewHref: '/attendance',
        };
      case 'PROFILE_CHANGE':
        return {
          label: 'Profile Change',
          icon: User,
          badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          viewHref: '/profile',
        };
      default:
        return {
          label: type,
          icon: FileText,
          badgeColor: 'bg-stone-50 text-stone-700 border-stone-200',
          viewHref: '#',
        };
    }
  };

  // Helper for Status styling & icons
  const getStatusBadge = (status: UnifiedRequestStatus) => {
    switch (status) {
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Approved
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="h-3.5 w-3.5 text-rose-600" /> Rejected
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-stone-100 text-stone-600 border border-stone-200">
            Cancelled
          </span>
        );
      case 'PENDING':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" /> Pending Review
          </span>
        );
    }
  };

  return (
    <AppShell>
      <div className="space-y-6 pb-12 max-w-7xl mx-auto">
        {/* Header & Quick Action Shortcuts */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200/80 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-amber-100/70 text-amber-800 rounded-lg">
                <CheckSquare className="h-5 w-5" />
              </span>
              <h1 className="text-2xl font-bold tracking-tight text-stone-900">
                My Requests & Approvals
              </h1>
            </div>
            <p className="text-sm text-stone-500 mt-1">
              Consolidated view of all your leave, work-from-home, official visits, regularizations,
              and profile changes.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/leave"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors"
            >
              <Calendar className="h-3.5 w-3.5" /> Apply Leave
            </Link>
            <Link
              href="/wfh"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-purple-600 hover:bg-purple-700 text-white shadow-xs transition-colors"
            >
              <Home className="h-3.5 w-3.5" /> Apply WFH
            </Link>
            <Link
              href="/visits"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors"
            >
              <Briefcase className="h-3.5 w-3.5" /> Official Visit
            </Link>
            <Link
              href="/attendance"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-colors"
            >
              <Clock className="h-3.5 w-3.5" /> Regularize
            </Link>
          </div>
        </div>

        {/* Action Alerts */}
        {actionSuccess && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{actionSuccess}</span>
            </div>
            <button
              onClick={() => setActionSuccess(null)}
              className="text-emerald-700 hover:text-emerald-900 font-bold"
            >
              ×
            </button>
          </div>
        )}

        {actionError && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-xs text-rose-800">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>{actionError}</span>
            </div>
            <button
              onClick={() => setActionError(null)}
              className="text-rose-700 hover:text-rose-900 font-bold"
            >
              ×
            </button>
          </div>
        )}

        {/* Top Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4 bg-white border-stone-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                Pending Actions
              </span>
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            </div>
            <div className="text-2xl font-bold font-mono text-amber-700 mt-2">
              {data?.counts?.pending ?? (isLoading ? '—' : 0)}
            </div>
            <span className="text-[11px] text-stone-400">Awaiting supervisor review</span>
          </Card>

          <Card className="p-4 bg-white border-stone-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                Approved Leaves
              </span>
              <Calendar className="h-4 w-4 text-blue-500" />
            </div>
            <div className="text-2xl font-bold font-mono text-blue-700 mt-2">
              {data?.counts?.leave ?? (isLoading ? '—' : 0)}
            </div>
            <span className="text-[11px] text-stone-400">Approved leave requests</span>
          </Card>

          <Card className="p-4 bg-white border-stone-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                Approved WFH
              </span>
              <Home className="h-4 w-4 text-purple-500" />
            </div>
            <div className="text-2xl font-bold font-mono text-purple-700 mt-2">
              {data?.counts?.wfh ?? (isLoading ? '—' : 0)}
            </div>
            <span className="text-[11px] text-stone-400">Remote days authorized</span>
          </Card>

          <Card className="p-4 bg-white border-stone-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                Official Visits
              </span>
              <Briefcase className="h-4 w-4 text-indigo-500" />
            </div>
            <div className="text-2xl font-bold font-mono text-indigo-700 mt-2">
              {data?.counts?.visit ?? (isLoading ? '—' : 0)}
            </div>
            <span className="text-[11px] text-stone-400">Outdoor duties assigned</span>
          </Card>
        </div>

        {/* Filter Toolbar */}
        <Card className="p-4 border-stone-200 bg-white space-y-4">
          {/* Type Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 border-b border-stone-100 pb-3">
            <span className="text-xs font-bold text-stone-500 mr-2 uppercase tracking-wider">
              Type:
            </span>
            {(
              [
                { id: 'ALL', label: 'All Requests' },
                { id: 'LEAVE', label: 'Leave' },
                { id: 'WFH', label: 'Work From Home' },
                { id: 'OFFICIAL_VISIT', label: 'Official Visits' },
                { id: 'ATTENDANCE_CORRECTION', label: 'Regularizations' },
                { id: 'PROFILE_CHANGE', label: 'Profile Changes' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setSelectedType(t.id);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  selectedType === t.id
                    ? 'bg-stone-900 text-white shadow-xs'
                    : 'bg-stone-100/70 text-stone-600 hover:bg-stone-200/70'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Status & Search Row */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
            {/* Search Input */}
            <div className="md:col-span-4 relative">
              <Search className="h-4 w-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search reason, note or type..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-stone-200 bg-stone-50/50 text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            {/* Status Select */}
            <div className="md:col-span-3 flex items-center gap-2">
              <span className="text-xs text-stone-500 font-medium">Status:</span>
              <select
                value={selectedStatus}
                onChange={(e) => {
                  setSelectedStatus(e.target.value as any);
                  setPage(1);
                }}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                <option value="ALL">All Statuses</option>
                <option value="PENDING">Pending Review</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>

            {/* Date Range Inputs */}
            <div className="md:col-span-4 flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPage(1);
                }}
                className="w-1/2 px-2.5 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                placeholder="From date"
              />
              <span className="text-stone-400 text-xs">–</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPage(1);
                }}
                className="w-1/2 px-2.5 py-1.5 text-xs rounded-lg border border-stone-200 bg-white text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                placeholder="To date"
              />
            </div>

            {/* Refresh / Clear Button */}
            <div className="md:col-span-1 flex justify-end">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setSelectedType('ALL');
                  setSelectedStatus('ALL');
                  setSearchQuery('');
                  setStartDate('');
                  setEndDate('');
                  setPage(1);
                }}
                title="Reset all filters"
                className="text-stone-500 hover:text-stone-800 px-2.5 py-1.5 text-xs border-stone-200"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </Card>

        {/* Requests Table / List */}
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        ) : error ? (
          <Card className="p-8 text-center border-rose-200 bg-rose-50/50">
            <AlertCircle className="h-8 w-8 text-rose-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-rose-800">{error}</p>
            <Button
              size="sm"
              onClick={loadRequests}
              className="mt-3 bg-rose-600 hover:bg-rose-700 text-white text-xs"
            >
              Retry
            </Button>
          </Card>
        ) : !data || data.items.length === 0 ? (
          <Card className="p-12 text-center border-dashed border-stone-300 bg-white">
            <FileText className="h-10 w-10 text-stone-300 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-stone-800">
              No requests match your filters
            </h3>
            <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto">
              You haven&apos;t submitted any requests matching these criteria, or no requests have
              been logged yet.
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-5">
              <Link
                href="/leave"
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
              >
                Apply Leave
              </Link>
              <Link
                href="/wfh"
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-purple-600 hover:bg-purple-700 text-white"
              >
                Apply WFH
              </Link>
            </div>
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-xs">
            <table className="w-full text-left text-xs text-stone-700">
              <thead className="bg-stone-50/80 text-[11px] font-semibold uppercase tracking-wider text-stone-500 border-b border-stone-200">
                <tr>
                  <th className="py-3 px-4">Request Type</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Duration / Date</th>
                  <th className="py-3 px-4">Details / Reason</th>
                  <th className="py-3 px-4">Submitted On</th>
                  <th className="py-3 px-4">Reviewer</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 font-medium">
                {data.items.map((item) => {
                  const meta = getTypeMeta(item.type);
                  const Icon = meta.icon;
                  const isCancelable =
                    item.status === 'PENDING' && item.type !== 'ATTENDANCE_CORRECTION';

                  return (
                    <tr key={item.id} className="hover:bg-stone-50/60 transition-colors">
                      {/* Type Badge */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${meta.badgeColor}`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {item.title || meta.label}
                        </span>
                      </td>

                      {/* Status Badge */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {getStatusBadge(item.status)}
                      </td>

                      {/* Duration / Target Dates */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-semibold text-stone-900">
                          {item.startDate || '—'}
                          {item.endDate && item.endDate !== item.startDate && (
                            <span className="text-stone-500 font-normal"> to {item.endDate}</span>
                          )}
                        </div>
                        {item.daysCount !== undefined && (
                          <div className="text-[11px] text-stone-400 font-normal">
                            {item.daysCount} {item.daysCount === 1 ? 'day' : 'days'}
                          </div>
                        )}
                      </td>

                      {/* Details / Reason */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <p className="truncate text-stone-800" title={item.reason || ''}>
                          {item.reason || 'No specific notes provided'}
                        </p>
                        {item.reviewNotes && (
                          <p
                            className="text-[11px] text-amber-700 italic truncate mt-0.5"
                            title={`Feedback: ${item.reviewNotes}`}
                          >
                            Feedback: {item.reviewNotes}
                          </p>
                        )}
                      </td>

                      {/* Submitted At */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-stone-500 font-mono text-[11px]">
                        {new Date(item.submittedAt).toLocaleDateString([], {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>

                      {/* Reviewer / Decision Date */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {item.reviewerName ? (
                          <div>
                            <span className="text-stone-800 font-medium block">
                              {item.reviewerName}
                            </span>
                            {item.reviewedAt && (
                              <span className="text-[10px] text-stone-400 block">
                                {new Date(item.reviewedAt).toLocaleDateString([], {
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-stone-400 italic">Pending</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setDetailItem(item)}
                            className="p-1.5 text-stone-500 hover:text-stone-900 hover:bg-stone-100 rounded-md transition-colors"
                            title="View complete details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>

                          {isCancelable && (
                            <button
                              onClick={() => setCancellingItem(item)}
                              className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-md transition-colors"
                              title="Cancel this pending request"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}

                          <Link
                            href={meta.viewHref}
                            className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded-md transition-colors"
                            title={`Open dedicated ${meta.label} portal`}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination footer */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-stone-200 bg-stone-50/50 text-xs text-stone-500">
              <div>
                Showing {(page - 1) * limit + 1} to {Math.min(page * limit, data.meta.total)} of{' '}
                {data.meta.total} requests
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1 text-xs border-stone-200"
                >
                  <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Previous
                </Button>
                <span className="px-2 font-mono text-stone-700">
                  {page} / {data.meta.totalPages || 1}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page >= data.meta.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-2.5 py-1 text-xs border-stone-200"
                >
                  Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Request Details Modal */}
        {detailItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 backdrop-blur-xs p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-stone-200 space-y-4">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`p-1.5 rounded-lg border ${getTypeMeta(detailItem.type).badgeColor}`}
                  >
                    {React.createElement(getTypeMeta(detailItem.type).icon, {
                      className: 'h-4 w-4',
                    })}
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-stone-900">
                      {detailItem.title || getTypeMeta(detailItem.type).label}
                    </h3>
                    <span className="text-[11px] font-mono text-stone-400">
                      ID: {detailItem.id.substring(0, 12)}...
                    </span>
                  </div>
                </div>
                {getStatusBadge(detailItem.status)}
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-2.5 bg-stone-50 rounded-lg">
                  <span className="text-stone-400 block text-[10px] uppercase font-semibold">
                    Schedule / Date
                  </span>
                  <span className="font-semibold text-stone-900">
                    {detailItem.startDate || '—'}
                    {detailItem.endDate && detailItem.endDate !== detailItem.startDate && (
                      <span> to {detailItem.endDate}</span>
                    )}
                  </span>
                </div>

                <div className="p-2.5 bg-stone-50 rounded-lg">
                  <span className="text-stone-400 block text-[10px] uppercase font-semibold">
                    Submitted Date
                  </span>
                  <span className="font-semibold text-stone-900">
                    {new Date(detailItem.submittedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>

              <div className="space-y-1 text-xs">
                <span className="text-stone-500 font-semibold uppercase text-[10px] tracking-wider">
                  Request Reason / Purpose:
                </span>
                <p className="p-3 bg-stone-50 border border-stone-200/60 rounded-xl text-stone-800 font-medium">
                  {detailItem.reason || 'None provided'}
                </p>
              </div>

              {detailItem.reviewNotes && (
                <div className="space-y-1 text-xs">
                  <span className="text-amber-800 font-semibold uppercase text-[10px] tracking-wider">
                    Reviewer Decision Notes:
                  </span>
                  <p className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-amber-900">
                    {detailItem.reviewNotes}
                  </p>
                </div>
              )}

              {detailItem.details && Object.keys(detailItem.details).length > 0 && (
                <div className="space-y-1 text-xs">
                  <span className="text-stone-500 font-semibold uppercase text-[10px] tracking-wider">
                    Additional Context:
                  </span>
                  <div className="p-2.5 bg-stone-50 border border-stone-200 rounded-lg max-h-36 overflow-y-auto">
                    <pre className="text-[11px] font-mono text-stone-600 whitespace-pre-wrap">
                      {JSON.stringify(detailItem.details, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setDetailItem(null)}
                  className="border-stone-300 text-stone-700 text-xs"
                >
                  Close
                </Button>
                {detailItem.status === 'PENDING' && detailItem.type !== 'ATTENDANCE_CORRECTION' && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setCancellingItem(detailItem);
                      setDetailItem(null);
                    }}
                    className="bg-rose-600 hover:bg-rose-700 text-white text-xs"
                  >
                    Cancel Request
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Cancellation Confirmation Modal */}
        {cancellingItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 backdrop-blur-xs p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-stone-200 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-rose-100 text-rose-700 rounded-xl">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-900">
                    Cancel {getTypeMeta(cancellingItem.type).label} Request
                  </h3>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Are you sure you want to withdraw this application? This action cannot be
                    undone.
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-stone-700">
                  Reason for Cancellation (optional):
                </label>
                <textarea
                  rows={3}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Schedule change, resolved conflict..."
                  className="w-full p-2.5 text-xs rounded-xl border border-stone-200 bg-stone-50/50 text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-rose-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={isCancelling}
                  onClick={() => {
                    setCancellingItem(null);
                    setCancelReason('');
                  }}
                  className="border-stone-300 text-stone-700 text-xs"
                >
                  Keep Request
                </Button>
                <Button
                  size="sm"
                  disabled={isCancelling}
                  onClick={handleConfirmCancel}
                  className="bg-rose-600 hover:bg-rose-700 text-white text-xs"
                >
                  {isCancelling ? 'Cancelling...' : 'Confirm Cancellation'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
