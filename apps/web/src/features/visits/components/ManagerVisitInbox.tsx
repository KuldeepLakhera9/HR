'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { visitsApi } from '../../../lib/api-client';
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
} from '@hrms/ui';
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  UserCheck,
  RefreshCw,
  MapPin,
  Calendar,
  FileText,
  AlertCircle,
  Building2,
  Users,
  Search,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  ShieldAlert,
} from 'lucide-react';

export interface ManagerVisitRecord {
  id: string;
  organizationId: string;
  employeeId: string;
  title: string;
  purpose: string;
  startDate: string;
  endDate: string;
  expectedDurationDays: number;
  status:
    | 'DRAFT'
    | 'SUBMITTED'
    | 'APPROVED'
    | 'REJECTED'
    | 'CANCELLED'
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'EXPIRED';
  cancellationReason?: string | null;
  destinations: Array<{
    id?: string;
    destinationName: string;
    address?: string | null;
    city?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    radiusMeters?: number;
    isGeofenceRequired?: boolean;
  }>;
  employee?: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    displayName: string;
  };
  approvals?: Array<{
    id: string;
    decision: 'APPROVED' | 'REJECTED';
    comments?: string | null;
    decidedAt: string;
    approver?: {
      firstName: string;
      lastName: string;
      email: string;
    };
  }>;
  cancelledBy?: {
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export type ManagerInboxFilter = 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED';

export function ManagerVisitInbox() {
  const { user, roles } = useAuth();
  const isManager = roles.includes('MANAGER') || roles.includes('HR') || roles.includes('ADMIN');

  // Filter & Search states
  const [currentFilter, setCurrentFilter] = useState<ManagerInboxFilter>('PENDING');
  const [searchQuery, setSearchQuery] = useState('');

  // Data states
  const [teamVisits, setTeamVisits] = useState<ManagerVisitRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{
    title: string;
    message: string;
    type: 'success' | 'error' | 'warning';
  } | null>(null);

  // Expanded card tracking for full review trail
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

  // Decision Modal State
  const [decisionModal, setDecisionModal] = useState<{
    isOpen: boolean;
    visit: ManagerVisitRecord | null;
    decision: 'APPROVED' | 'REJECTED';
    comments: string;
    isSubmitting: boolean;
  }>({
    isOpen: false,
    visit: null,
    decision: 'APPROVED',
    comments: '',
    isSubmitting: false,
  });

  // Load team visits across all statuses for manager
  const loadVisits = useCallback(async () => {
    if (!isManager) return;
    setIsLoading(true);
    setLoadError(null);

    try {
      // Fetch team visits
      const res = await visitsApi.getTeamVisits({ limit: 100 });
      if (res && res.data) {
        setTeamVisits(res.data);
      }
    } catch (err: any) {
      console.error('Failed to load team visits:', err);
      setLoadError(err.message || 'Unable to retrieve team visit records.');
    } finally {
      setIsLoading(false);
    }
  }, [isManager]);

  useEffect(() => {
    loadVisits();
  }, [loadVisits]);

  // Compute status counts for tab badges
  const counts = useMemo(() => {
    const pending = teamVisits.filter((v) => v.status === 'SUBMITTED').length;
    const approved = teamVisits.filter(
      (v) => v.status === 'APPROVED' || v.status === 'IN_PROGRESS',
    ).length;
    const rejected = teamVisits.filter((v) => v.status === 'REJECTED').length;
    const completed = teamVisits.filter((v) => v.status === 'COMPLETED').length;
    return { pending, approved, rejected, completed };
  }, [teamVisits]);

  // Overlap Detection: computes overlapping team visits
  const overlapMap = useMemo(() => {
    const map = new Map<string, ManagerVisitRecord[]>();

    for (let i = 0; i < teamVisits.length; i++) {
      const v1 = teamVisits[i];
      if (v1.status === 'CANCELLED' || v1.status === 'REJECTED') continue;

      const overlaps: ManagerVisitRecord[] = [];
      const v1Start = new Date(v1.startDate).getTime();
      const v1End = new Date(v1.endDate).getTime();

      for (let j = 0; j < teamVisits.length; j++) {
        if (i === j) continue;
        const v2 = teamVisits[j];
        if (v2.status === 'CANCELLED' || v2.status === 'REJECTED') continue;

        const v2Start = new Date(v2.startDate).getTime();
        const v2End = new Date(v2.endDate).getTime();

        // Check if date intervals overlap: v1Start <= v2End && v1End >= v2Start
        if (v1Start <= v2End && v1End >= v2Start) {
          overlaps.push(v2);
        }
      }

      if (overlaps.length > 0) {
        map.set(v1.id, overlaps);
      }
    }

    return map;
  }, [teamVisits]);

  // Filtered visits based on active sub-filter and search
  const filteredVisits = useMemo(() => {
    return teamVisits.filter((visit) => {
      // Status filter
      let matchesStatus = false;
      if (currentFilter === 'PENDING') {
        matchesStatus = visit.status === 'SUBMITTED';
      } else if (currentFilter === 'APPROVED') {
        matchesStatus = visit.status === 'APPROVED' || visit.status === 'IN_PROGRESS';
      } else if (currentFilter === 'REJECTED') {
        matchesStatus = visit.status === 'REJECTED';
      } else if (currentFilter === 'COMPLETED') {
        matchesStatus = visit.status === 'COMPLETED';
      }

      if (!matchesStatus) return false;

      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const empName = visit.employee?.displayName.toLowerCase() || '';
        const empCode = visit.employee?.employeeCode.toLowerCase() || '';
        const title = visit.title.toLowerCase();
        const purpose = visit.purpose.toLowerCase();
        const dest = visit.destinations.some(
          (d) =>
            d.destinationName.toLowerCase().includes(q) ||
            (d.city && d.city.toLowerCase().includes(q)),
        );
        return (
          empName.includes(q) ||
          empCode.includes(q) ||
          title.includes(q) ||
          purpose.includes(q) ||
          dest
        );
      }

      return true;
    });
  }, [teamVisits, currentFilter, searchQuery]);

  // Handle Decision (Approve / Reject)
  const handleDecisionSubmit = async () => {
    if (!decisionModal.visit) return;
    setDecisionModal((prev) => ({ ...prev, isSubmitting: true }));

    try {
      const res = await visitsApi.decideVisit(decisionModal.visit.id, {
        decision: decisionModal.decision,
        comments: decisionModal.comments.trim() || undefined,
      });

      if (res && (res.success || res.data)) {
        setToastMessage({
          title: `Visit ${decisionModal.decision}`,
          message: `Official visit for ${decisionModal.visit.employee?.displayName || 'employee'} has been ${decisionModal.decision.toLowerCase()}.`,
          type: 'success',
        });
        setDecisionModal({
          isOpen: false,
          visit: null,
          decision: 'APPROVED',
          comments: '',
          isSubmitting: false,
        });
        await loadVisits();
      }
    } catch (err: any) {
      setToastMessage({
        title: 'Decision Prohibited',
        message:
          err.message ||
          'Decision failed. The request may have already been reviewed or cancelled.',
        type: 'error',
      });
      setDecisionModal((prev) => ({ ...prev, isSubmitting: false }));
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedCards((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Status Badge Helper
  const renderStatusBadge = (status: ManagerVisitRecord['status']) => {
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
            Pending Approval
          </Badge>
        );
      case 'IN_PROGRESS':
        return (
          <Badge variant="purple" size="sm">
            In Progress
          </Badge>
        );
      case 'COMPLETED':
        return (
          <Badge variant="default" size="sm">
            Completed
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
          <Badge variant="outline" size="sm">
            Cancelled
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" size="sm">
            {status}
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-5">
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50">
          <Toast
            type={toastMessage.type}
            title={toastMessage.title}
            message={toastMessage.message}
            onClose={() => setToastMessage(null)}
          />
        </div>
      )}

      {/* Header & Sub-Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-stone-50 p-2.5 sm:p-3 rounded-xl border border-stone-200">
        {/* Status Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            onClick={() => setCurrentFilter('PENDING')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              currentFilter === 'PENDING'
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
            }`}
          >
            Pending
            {counts.pending > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  currentFilter === 'PENDING'
                    ? 'bg-amber-800 text-white'
                    : 'bg-amber-600 text-white'
                }`}
              >
                {counts.pending}
              </span>
            )}
          </button>

          <button
            onClick={() => setCurrentFilter('APPROVED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              currentFilter === 'APPROVED'
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
            }`}
          >
            Approved ({counts.approved})
          </button>

          <button
            onClick={() => setCurrentFilter('REJECTED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              currentFilter === 'REJECTED'
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
            }`}
          >
            Rejected ({counts.rejected})
          </button>

          <button
            onClick={() => setCurrentFilter('COMPLETED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              currentFilter === 'COMPLETED'
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
            }`}
          >
            Completed ({counts.completed})
          </button>
        </div>

        {/* Search Input */}
        <div className="w-full md:w-72">
          <Input
            placeholder="Search team member or visit..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="text-xs bg-white"
          />
        </div>
      </div>

      {/* Loading & Error States */}
      {isLoading && teamVisits.length === 0 && (
        <LoadingState message="Loading team official visit requests..." />
      )}

      {loadError && (
        <ErrorState title="Could Not Load Team Visits" message={loadError} onRetry={loadVisits} />
      )}

      {/* Empty State */}
      {!isLoading && !loadError && filteredVisits.length === 0 && (
        <EmptyState
          title={
            currentFilter === 'PENDING'
              ? 'Inbox Zero'
              : `No ${currentFilter.toLowerCase()} requests`
          }
          description={
            currentFilter === 'PENDING'
              ? 'All visit requests from your reporting team have been reviewed.'
              : `There are currently no team requests in ${currentFilter.toLowerCase()} status.`
          }
          icon={
            currentFilter === 'PENDING' ? (
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            ) : (
              <Users className="h-6 w-6 text-stone-400" />
            )
          }
        />
      )}

      {/* List of Visits */}
      {!isLoading && !loadError && filteredVisits.length > 0 && (
        <div className="space-y-3">
          {filteredVisits.map((visit) => {
            const isSelfRequest =
              visit.employee?.id === user?.employeeCode || visit.employeeId === user?.id;
            const overlaps = overlapMap.get(visit.id) || [];
            const isExpanded = !!expandedCards[visit.id];

            return (
              <Card
                key={visit.id}
                className="p-4 sm:p-5 border-stone-200 hover:border-amber-200 transition-colors space-y-3"
              >
                {/* Header: Employee & Status */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-stone-900 text-sm sm:text-base">
                      {visit.employee?.displayName || 'Team Member'}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-stone-100 text-stone-600 font-mono">
                      {visit.employee?.employeeCode}
                    </span>
                    {renderStatusBadge(visit.status)}
                    {isSelfRequest && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-rose-100 text-rose-800">
                        Self-Request (Cannot Review)
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-stone-500 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-stone-400" />
                    <span>Requested: {new Date(visit.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Overlap Warning Callout */}
                {overlaps.length > 0 && (
                  <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold block">Schedule Overlap Alert</span>
                      <span>
                        {overlaps.length === 1
                          ? `1 overlapping visit detected for ${overlaps[0].employee?.displayName || 'team member'} (${overlaps[0].startDate.slice(0, 10)} to ${overlaps[0].endDate.slice(0, 10)}).`
                          : `${overlaps.length} concurrent team visits overlap with these dates.`}
                      </span>
                    </div>
                  </div>
                )}

                {/* Visit Details Grid */}
                <div className="space-y-2">
                  <div>
                    <h4 className="font-semibold text-stone-900 text-sm">{visit.title}</h4>
                    <p className="text-xs text-stone-600 mt-0.5 leading-relaxed">{visit.purpose}</p>
                  </div>

                  {/* Dates & Destinations */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-stone-600">
                    <span className="inline-flex items-center gap-1.5 bg-stone-50 px-2.5 py-1 rounded-md border border-stone-200 font-medium text-stone-800">
                      <Calendar className="h-3.5 w-3.5 text-stone-500" />
                      {visit.startDate.slice(0, 10)} to {visit.endDate.slice(0, 10)} (
                      {visit.expectedDurationDays}{' '}
                      {visit.expectedDurationDays === 1 ? 'day' : 'days'})
                    </span>

                    {visit.destinations.map((d, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1.5 bg-amber-50/70 text-amber-900 px-2.5 py-1 rounded-md border border-amber-200 text-xs font-medium"
                      >
                        <MapPin className="h-3.5 w-3.5 text-amber-600" />
                        {d.destinationName} ({d.city || 'Site'}) • {d.radiusMeters || 200}m
                        {d.isGeofenceRequired === false && ' (No Geofence)'}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Expanded Decision History & Review Comments */}
                {isExpanded && (
                  <div className="pt-3 border-t border-stone-100 text-xs space-y-2 animate-in fade-in duration-150">
                    <span className="font-semibold text-stone-700 block uppercase text-[11px]">
                      Decision Audit History
                    </span>

                    {visit.approvals && visit.approvals.length > 0 ? (
                      <div className="space-y-2">
                        {visit.approvals.map((appr) => (
                          <div
                            key={appr.id}
                            className="bg-stone-50 p-2.5 rounded-lg border border-stone-100 text-xs text-stone-700 space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-semibold">
                                {appr.approver?.firstName} {appr.approver?.lastName} (
                                {appr.approver?.email})
                              </span>
                              <span
                                className={`font-semibold ${
                                  appr.decision === 'APPROVED'
                                    ? 'text-emerald-700'
                                    : 'text-rose-700'
                                }`}
                              >
                                {appr.decision}
                              </span>
                            </div>
                            <div className="text-[11px] text-stone-400">
                              Decided on: {new Date(appr.decidedAt).toLocaleString()}
                            </div>
                            {appr.comments && (
                              <p className="italic text-stone-600 mt-1 bg-white p-2 rounded border border-stone-100">
                                "{appr.comments}"
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-stone-400 italic text-xs">
                        No prior reviewer decisions recorded for this request.
                      </div>
                    )}
                  </div>
                )}

                {/* Card Footer: Expand toggle & Approve/Reject CTAs */}
                <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-stone-100">
                  <button
                    onClick={() => toggleExpand(visit.id)}
                    className="text-stone-500 hover:text-stone-800 text-xs font-medium inline-flex items-center gap-1 cursor-pointer"
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="h-3.5 w-3.5" /> Hide Review History
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3.5 w-3.5" /> View Review History (
                        {visit.approvals?.length || 0})
                      </>
                    )}
                  </button>

                  {/* Approve / Reject Actions (Only for pending requests) */}
                  {visit.status === 'SUBMITTED' && (
                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isSelfRequest}
                        className="border-rose-300 text-rose-700 hover:bg-rose-50"
                        leftIcon={<XCircle className="h-4 w-4" />}
                        onClick={() =>
                          setDecisionModal({
                            isOpen: true,
                            visit,
                            decision: 'REJECTED',
                            comments: '',
                            isSubmitting: false,
                          })
                        }
                      >
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        disabled={isSelfRequest}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        leftIcon={<CheckCircle2 className="h-4 w-4" />}
                        onClick={() =>
                          setDecisionModal({
                            isOpen: true,
                            visit,
                            decision: 'APPROVED',
                            comments: '',
                            isSubmitting: false,
                          })
                        }
                      >
                        Approve Visit
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Decision Confirmation Modal */}
      <Dialog
        isOpen={decisionModal.isOpen}
        onClose={() => setDecisionModal((prev) => ({ ...prev, isOpen: false }))}
        title={`${decisionModal.decision === 'APPROVED' ? 'Approve' : 'Reject'} Official Visit`}
        description={`Submit official decision for ${decisionModal.visit?.employee?.displayName || 'team member'}.`}
        footer={
          <div className="flex items-center justify-between w-full">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDecisionModal((prev) => ({ ...prev, isOpen: false }))}
              disabled={decisionModal.isSubmitting}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className={
                decisionModal.decision === 'APPROVED'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-rose-600 hover:bg-rose-700 text-white'
              }
              onClick={handleDecisionSubmit}
              disabled={decisionModal.isSubmitting}
            >
              {decisionModal.isSubmitting
                ? 'Submitting Decision...'
                : `Confirm ${decisionModal.decision}`}
            </Button>
          </div>
        }
      >
        <div className="space-y-4 py-2">
          {/* Summary of Visit */}
          <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 text-xs space-y-1.5">
            <div className="font-semibold text-stone-900 text-sm">{decisionModal.visit?.title}</div>
            <div className="text-stone-500 flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5" />
              <span>
                {decisionModal.visit?.startDate.slice(0, 10)} to{' '}
                {decisionModal.visit?.endDate.slice(0, 10)}
              </span>
            </div>
            <div className="text-stone-600">{decisionModal.visit?.purpose}</div>
          </div>

          {/* Comments Textarea */}
          <Textarea
            label="Reviewer Comments & Justification"
            placeholder={
              decisionModal.decision === 'APPROVED'
                ? 'e.g. Approved. Customer credentials and security clearance verified.'
                : 'e.g. Rejected due to scheduling conflict with critical milestone.'
            }
            rows={3}
            value={decisionModal.comments}
            onChange={(e) => setDecisionModal((prev) => ({ ...prev, comments: e.target.value }))}
          />
        </div>
      </Dialog>
    </div>
  );
}
