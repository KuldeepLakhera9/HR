'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppShell } from '../../layouts/AppShell';
import { useAuth } from '../../context/AuthContext';
import { fetchWithAuth } from '../../lib/api-client';
import { Button, Badge, Card, Dialog, Input, Textarea, Toast } from '@hrms/ui';
import {
  Briefcase,
  MapPin,
  Calendar,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  UserCheck,
  RefreshCw,
  Navigation,
  FileText,
  AlertCircle,
  Building2,
  Users,
} from 'lucide-react';

interface VisitDestination {
  id?: string;
  destinationName: string;
  address?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  radiusMeters?: number;
  isGeofenceRequired?: boolean;
}

interface VisitItem {
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
  destinations: VisitDestination[];
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
}

export default function VisitsPage() {
  const { user, roles } = useAuth();
  const isManager = roles.includes('MANAGER') || roles.includes('HR') || roles.includes('ADMIN');
  const isAdminOrHr = roles.includes('HR') || roles.includes('ADMIN');

  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'my' | 'approvals' | 'all'>('my');

  // Data states
  const [myVisits, setMyVisits] = useState<VisitItem[]>([]);
  const [pendingVisits, setPendingVisits] = useState<VisitItem[]>([]);
  const [allVisits, setAllVisits] = useState<VisitItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{
    title: string;
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  // Creation modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: '',
    purpose: '',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
    destinationName: '',
    address: '',
    city: '',
    latitude: '12.9716',
    longitude: '77.5946',
    radiusMeters: 200,
    isGeofenceRequired: true,
  });

  // Decision modal state
  const [decisionModal, setDecisionModal] = useState<{
    isOpen: boolean;
    visit: VisitItem | null;
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

  // Cancellation modal state
  const [cancelModal, setCancelModal] = useState<{
    isOpen: boolean;
    visit: VisitItem | null;
    reason: string;
    isSubmitting: boolean;
  }>({
    isOpen: false,
    visit: null,
    reason: '',
    isSubmitting: false,
  });

  // Fetch data callbacks
  const loadMyVisits = useCallback(async () => {
    try {
      const res = await fetchWithAuth<VisitItem[]>('/visits/my');
      if (res.data) setMyVisits(res.data);
    } catch (err: any) {
      console.error('Failed to load my visits:', err);
    }
  }, []);

  const loadPendingApprovals = useCallback(async () => {
    if (!isManager) return;
    try {
      const res = await fetchWithAuth<VisitItem[]>('/visits/manager/pending');
      if (res.data) setPendingVisits(res.data);
    } catch (err: any) {
      console.error('Failed to load pending visits:', err);
    }
  }, [isManager]);

  const loadAllVisits = useCallback(async () => {
    if (!isAdminOrHr) return;
    try {
      const res = await fetchWithAuth<VisitItem[]>('/visits?scope=organization');
      if (res.data) setAllVisits(res.data);
    } catch (err: any) {
      console.error('Failed to load organization visits:', err);
    }
  }, [isAdminOrHr]);

  const refreshCurrentView = useCallback(async () => {
    setIsLoading(true);
    setErrorBanner(null);
    try {
      if (activeTab === 'my') {
        await loadMyVisits();
      } else if (activeTab === 'approvals') {
        await loadPendingApprovals();
      } else if (activeTab === 'all') {
        await loadAllVisits();
      }
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, loadMyVisits, loadPendingApprovals, loadAllVisits]);

  useEffect(() => {
    refreshCurrentView();
  }, [refreshCurrentView]);

  // Handle Create Submit
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorBanner(null);

    try {
      const payload = {
        title: createForm.title,
        purpose: createForm.purpose,
        startDate: createForm.startDate,
        endDate: createForm.endDate,
        destinations: [
          {
            destinationName: createForm.destinationName,
            address: createForm.address || undefined,
            city: createForm.city || undefined,
            latitude: createForm.latitude ? parseFloat(createForm.latitude) : undefined,
            longitude: createForm.longitude ? parseFloat(createForm.longitude) : undefined,
            radiusMeters: Number(createForm.radiusMeters) || 200,
            isGeofenceRequired: createForm.isGeofenceRequired,
          },
        ],
      };

      const res = await fetchWithAuth<VisitItem>('/visits', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (res.success || res.data) {
        setIsCreateOpen(false);
        setToastMessage({
          title: 'Visit Request Submitted',
          message: 'Your official visit request was created and sent to your manager for review.',
          type: 'success',
        });
        setCreateForm({
          title: '',
          purpose: '',
          startDate: new Date().toISOString().slice(0, 10),
          endDate: new Date().toISOString().slice(0, 10),
          destinationName: '',
          address: '',
          city: '',
          latitude: '12.9716',
          longitude: '77.5946',
          radiusMeters: 200,
          isGeofenceRequired: true,
        });
        loadMyVisits();
      }
    } catch (err: any) {
      setErrorBanner(
        err.message || 'Failed to submit visit request. Check dates for overlapping bookings.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Decision Submit (Approve / Reject)
  const handleDecisionSubmit = async () => {
    if (!decisionModal.visit) return;
    setDecisionModal((prev) => ({ ...prev, isSubmitting: true }));
    setErrorBanner(null);

    try {
      const res = await fetchWithAuth(`/visits/${decisionModal.visit.id}/decide`, {
        method: 'POST',
        body: JSON.stringify({
          decision: decisionModal.decision,
          comments: decisionModal.comments || undefined,
        }),
      });

      if (res.success || res.data) {
        setToastMessage({
          title: `Visit ${decisionModal.decision}`,
          message: `Official visit for ${decisionModal.visit.employee?.displayName || 'employee'} was successfully ${decisionModal.decision.toLowerCase()}.`,
          type: 'success',
        });
        setDecisionModal({
          isOpen: false,
          visit: null,
          decision: 'APPROVED',
          comments: '',
          isSubmitting: false,
        });
        loadPendingApprovals();
        loadAllVisits();
      }
    } catch (err: any) {
      setErrorBanner(
        err.message ||
          'Decision failed. The request may have been processed concurrently or cancelled.',
      );
      setDecisionModal((prev) => ({ ...prev, isSubmitting: false }));
    }
  };

  // Handle Cancel Submit
  const handleCancelSubmit = async () => {
    if (!cancelModal.visit) return;
    setCancelModal((prev) => ({ ...prev, isSubmitting: true }));
    setErrorBanner(null);

    try {
      const res = await fetchWithAuth(`/visits/${cancelModal.visit.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({
          cancellationReason: cancelModal.reason,
        }),
      });

      if (res.success || res.data) {
        setToastMessage({
          title: 'Visit Cancelled',
          message: 'The official visit request has been cancelled.',
          type: 'success',
        });
        setCancelModal({ isOpen: false, visit: null, reason: '', isSubmitting: false });
        loadMyVisits();
        loadPendingApprovals();
      }
    } catch (err: any) {
      setErrorBanner(
        err.message || 'Cancellation failed. Commenced visits require HR authorization.',
      );
      setCancelModal((prev) => ({ ...prev, isSubmitting: false }));
    }
  };

  const renderStatusBadge = (status: VisitItem['status']) => {
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
      case 'EXPIRED':
        return (
          <Badge variant="outline" size="sm">
            Expired
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
    <AppShell>
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

      <div className="space-y-6 max-w-7xl mx-auto px-2 sm:px-4">
        {/* Header Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-amber-500/10 rounded-xl text-amber-700">
                <Briefcase className="h-6 w-6" />
              </span>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-stone-900">
                Official Visits & Field Approvals
              </h1>
            </div>
            <p className="text-xs md:text-sm text-stone-500 mt-1">
              Field duty management, multi-destination geofencing, and manager approval governance.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              onClick={refreshCurrentView}
              disabled={isLoading}
              leftIcon={<RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />}
            >
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => setIsCreateOpen(true)}
              leftIcon={<Plus className="h-4 w-4" />}
            >
              Request Visit
            </Button>
          </div>
        </div>

        {/* Global Error Banner */}
        {errorBanner && (
          <div className="p-4 rounded-xl border border-rose-200 bg-rose-50 flex items-start gap-3 text-rose-900">
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <span className="font-semibold block">Action Prohibited</span>
              {errorBanner}
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-stone-200">
          <button
            onClick={() => setActiveTab('my')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'my'
                ? 'border-amber-600 text-amber-800 bg-amber-50/50'
                : 'border-transparent text-stone-600 hover:text-stone-900 hover:bg-stone-50'
            }`}
          >
            <Briefcase className="h-4 w-4" />
            My Visits ({myVisits.length})
          </button>

          {isManager && (
            <button
              onClick={() => setActiveTab('approvals')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors relative ${
                activeTab === 'approvals'
                  ? 'border-amber-600 text-amber-800 bg-amber-50/50'
                  : 'border-transparent text-stone-600 hover:text-stone-900 hover:bg-stone-50'
              }`}
            >
              <UserCheck className="h-4 w-4" />
              Team Approvals Inbox
              {pendingVisits.length > 0 && (
                <span className="ml-1.5 px-2 py-0.5 text-xs font-bold rounded-full bg-amber-600 text-white">
                  {pendingVisits.length}
                </span>
              )}
            </button>
          )}

          {isAdminOrHr && (
            <button
              onClick={() => setActiveTab('all')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                activeTab === 'all'
                  ? 'border-amber-600 text-amber-800 bg-amber-50/50'
                  : 'border-transparent text-stone-600 hover:text-stone-900 hover:bg-stone-50'
              }`}
            >
              <Building2 className="h-4 w-4" />
              Organization Overview
            </button>
          )}
        </div>

        {/* TAB 1: MY VISITS */}
        {activeTab === 'my' && (
          <div className="space-y-4">
            {myVisits.length === 0 ? (
              <div className="p-12 text-center border-2 border-dashed border-stone-200 rounded-2xl bg-stone-50/50">
                <Briefcase className="h-10 w-10 text-stone-400 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-stone-800">No Official Visits Found</h3>
                <p className="text-sm text-stone-500 mt-1 max-w-md mx-auto">
                  You have not submitted any official visit requests. Click "Request Visit" to log
                  upcoming client trips.
                </p>
                <Button
                  size="sm"
                  className="mt-4"
                  onClick={() => setIsCreateOpen(true)}
                  leftIcon={<Plus className="h-4 w-4" />}
                >
                  Request First Visit
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {myVisits.map((visit) => (
                  <Card
                    key={visit.id}
                    className="p-5 flex flex-col justify-between border-stone-200 hover:shadow-md transition-shadow"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-semibold text-stone-900 line-clamp-1">{visit.title}</h4>
                        {renderStatusBadge(visit.status)}
                      </div>
                      <p className="text-xs text-stone-500 mt-1 line-clamp-2">{visit.purpose}</p>

                      <div className="mt-4 space-y-2 text-xs text-stone-600">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5 text-stone-400" />
                          <span>
                            {visit.startDate.slice(0, 10)} to {visit.endDate.slice(0, 10)} (
                            {visit.expectedDurationDays}d)
                          </span>
                        </div>

                        {visit.destinations.map((dest, i) => (
                          <div
                            key={i}
                            className="flex items-start gap-2 bg-stone-50 p-2 rounded-lg border border-stone-100"
                          >
                            <MapPin className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                            <div>
                              <span className="font-medium text-stone-800 block">
                                {dest.destinationName}
                              </span>
                              <span className="text-stone-400 text-[11px]">
                                {dest.city || 'Site'} • Radius: {dest.radiusMeters || 200}m
                              </span>
                            </div>
                          </div>
                        ))}

                        {visit.approvals && visit.approvals.length > 0 && (
                          <div className="pt-2 border-t border-stone-100">
                            <span className="text-[11px] font-semibold text-stone-500 uppercase block mb-1">
                              Review Decision
                            </span>
                            {visit.approvals.map((appr) => (
                              <div
                                key={appr.id}
                                className="text-[11px] text-stone-600 bg-stone-50 p-1.5 rounded"
                              >
                                <span className="font-medium">{appr.decision}</span> by{' '}
                                {appr.approver?.firstName} {appr.approver?.lastName}
                                {appr.comments && (
                                  <p className="italic text-stone-500 mt-0.5">"{appr.comments}"</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    {(visit.status === 'SUBMITTED' || visit.status === 'APPROVED') && (
                      <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-rose-600 border-rose-200 hover:bg-rose-50"
                          onClick={() =>
                            setCancelModal({ isOpen: true, visit, reason: '', isSubmitting: false })
                          }
                        >
                          Cancel Visit
                        </Button>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: TEAM APPROVALS INBOX (MANAGER VIEW) */}
        {activeTab === 'approvals' && isManager && (
          <div className="space-y-4">
            {pendingVisits.length === 0 ? (
              <div className="p-12 text-center border-2 border-dashed border-stone-200 rounded-2xl bg-stone-50/50">
                <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-stone-800">
                  Inbox Zero: No Pending Requests
                </h3>
                <p className="text-sm text-stone-500 mt-1 max-w-md mx-auto">
                  All official visit requests from your reporting team have been reviewed and
                  decided.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingVisits.map((visit) => {
                  const isSelfRequest =
                    visit.employee?.id === user?.employeeCode || visit.employeeId === user?.id;

                  return (
                    <Card
                      key={visit.id}
                      className="p-5 border-stone-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:border-amber-200 transition-colors"
                    >
                      <div className="space-y-2 max-w-3xl">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-stone-900 text-base">
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

                        <div>
                          <h4 className="font-semibold text-stone-800 text-sm">{visit.title}</h4>
                          <p className="text-xs text-stone-600 mt-0.5">{visit.purpose}</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-xs text-stone-500 pt-1">
                          <span className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 text-stone-400" />
                            {visit.startDate.slice(0, 10)} to {visit.endDate.slice(0, 10)} (
                            {visit.expectedDurationDays} days)
                          </span>

                          {visit.destinations.map((d, i) => (
                            <span
                              key={i}
                              className="flex items-center gap-1.5 text-stone-700 bg-amber-50/60 px-2 py-0.5 rounded border border-amber-100"
                            >
                              <MapPin className="h-3.5 w-3.5 text-amber-600" />
                              {d.destinationName} ({d.city || 'Site'}) • {d.radiusMeters}m
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Review Buttons */}
                      <div className="flex items-center gap-2 self-end lg:self-center shrink-0">
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
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: ORGANIZATION OVERVIEW (HR/ADMIN) */}
        {activeTab === 'all' && isAdminOrHr && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {allVisits.map((visit) => (
                <Card key={visit.id} className="p-4 border-stone-200">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-xs font-semibold text-stone-500 block">
                        {visit.employee?.displayName} ({visit.employee?.employeeCode})
                      </span>
                      <h4 className="font-semibold text-stone-900 text-sm mt-0.5">{visit.title}</h4>
                    </div>
                    {renderStatusBadge(visit.status)}
                  </div>
                  <p className="text-xs text-stone-500 mt-1 line-clamp-2">{visit.purpose}</p>

                  <div className="mt-3 text-xs text-stone-500 flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5" />
                    {visit.startDate.slice(0, 10)} to {visit.endDate.slice(0, 10)}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* MODAL 1: REQUEST VISIT */}
        <Dialog
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          title="New Official Visit (OD) Request"
          description="Log outside field duty with client destination coordinates for authorized punch."
          footer={
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleCreateSubmit} disabled={isSubmitting}>
                {isSubmitting ? 'Submitting...' : 'Submit Request'}
              </Button>
            </div>
          }
        >
          <form onSubmit={handleCreateSubmit} className="space-y-4 py-2 text-stone-800">
            <Input
              label="Visit Title"
              placeholder="e.g. Acme Corp Disaster Recovery Architecture Review"
              value={createForm.title}
              onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
              required
            />

            <Textarea
              label="Business Justification & Deliverables"
              placeholder="Detail scheduled meetings, scope of inspection, expected deliverables..."
              rows={2}
              value={createForm.purpose}
              onChange={(e) => setCreateForm({ ...createForm, purpose: e.target.value })}
              required
            />

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Start Date"
                type="date"
                value={createForm.startDate}
                onChange={(e) => setCreateForm({ ...createForm, startDate: e.target.value })}
                required
              />
              <Input
                label="End Date"
                type="date"
                value={createForm.endDate}
                onChange={(e) => setCreateForm({ ...createForm, endDate: e.target.value })}
                required
              />
            </div>

            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-3">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-amber-600" />
                <span className="text-xs font-semibold text-stone-900 uppercase">
                  Primary Destination Details
                </span>
              </div>

              <Input
                label="Destination Facility / Client Name"
                placeholder="e.g. Apex Data Center 2"
                value={createForm.destinationName}
                onChange={(e) => setCreateForm({ ...createForm, destinationName: e.target.value })}
                required
              />

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="City"
                  placeholder="e.g. Bangalore"
                  value={createForm.city}
                  onChange={(e) => setCreateForm({ ...createForm, city: e.target.value })}
                />
                <Input
                  label="Geofence Radius (m)"
                  type="number"
                  placeholder="200"
                  value={createForm.radiusMeters}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, radiusMeters: Number(e.target.value) })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Target Latitude"
                  placeholder="12.9716"
                  value={createForm.latitude}
                  onChange={(e) => setCreateForm({ ...createForm, latitude: e.target.value })}
                />
                <Input
                  label="Target Longitude"
                  placeholder="77.5946"
                  value={createForm.longitude}
                  onChange={(e) => setCreateForm({ ...createForm, longitude: e.target.value })}
                />
              </div>
            </div>
          </form>
        </Dialog>

        {/* MODAL 2: DECIDE VISIT (APPROVE / REJECT) */}
        <Dialog
          isOpen={decisionModal.isOpen}
          onClose={() => setDecisionModal((prev) => ({ ...prev, isOpen: false }))}
          title={`${decisionModal.decision === 'APPROVED' ? 'Approve' : 'Reject'} Official Visit`}
          description={`Submit final review decision for ${decisionModal.visit?.employee?.displayName || 'employee'}.`}
          footer={
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDecisionModal((prev) => ({ ...prev, isOpen: false }))}
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
                {decisionModal.isSubmitting ? 'Processing...' : `Confirm ${decisionModal.decision}`}
              </Button>
            </div>
          }
        >
          <div className="space-y-4 py-2">
            <div className="p-3 rounded-lg bg-stone-50 border border-stone-200 text-xs space-y-1">
              <div className="font-semibold text-stone-800">{decisionModal.visit?.title}</div>
              <div className="text-stone-500">
                {decisionModal.visit?.startDate.slice(0, 10)} to{' '}
                {decisionModal.visit?.endDate.slice(0, 10)}
              </div>
              <div className="text-stone-600">{decisionModal.visit?.purpose}</div>
            </div>

            <Textarea
              label="Reviewer Comments & Justification"
              placeholder={
                decisionModal.decision === 'APPROVED'
                  ? 'e.g. Approved. Client badge approved.'
                  : 'e.g. Rejected due to scheduling conflict with team sprint review.'
              }
              rows={3}
              value={decisionModal.comments}
              onChange={(e) => setDecisionModal({ ...decisionModal, comments: e.target.value })}
            />
          </div>
        </Dialog>

        {/* MODAL 3: CANCEL VISIT */}
        <Dialog
          isOpen={cancelModal.isOpen}
          onClose={() => setCancelModal((prev) => ({ ...prev, isOpen: false }))}
          title="Cancel Official Visit Request"
          description="A documented cancellation reason is required for audit compliance."
          footer={
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCancelModal((prev) => ({ ...prev, isOpen: false }))}
              >
                Keep Visit
              </Button>
              <Button
                size="sm"
                className="bg-rose-600 hover:bg-rose-700 text-white"
                onClick={handleCancelSubmit}
                disabled={cancelModal.isSubmitting || cancelModal.reason.length < 3}
              >
                {cancelModal.isSubmitting ? 'Cancelling...' : 'Confirm Cancellation'}
              </Button>
            </div>
          }
        >
          <div className="space-y-3 py-2">
            <Textarea
              label="Cancellation Reason"
              placeholder="e.g. Client postponed the on-site technical inspection..."
              rows={3}
              value={cancelModal.reason}
              onChange={(e) => setCancelModal({ ...cancelModal, reason: e.target.value })}
              required
            />
          </div>
        </Dialog>
      </div>
    </AppShell>
  );
}
