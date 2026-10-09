'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AppShell } from '../../layouts/AppShell';
import { useAuth } from '../../context/AuthContext';
import { visitsApi, attendanceApi } from '../../lib/api-client';
import { useGeolocation } from '../../hooks/useGeolocation';
import { ManagerVisitInbox } from '../../features/visits/components/ManagerVisitInbox';
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
  LogIn,
  LogOut,
  Edit3,
  Send,
  Compass,
  ShieldCheck,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react';

// Helper: safe UUID generator for idempotency
function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'idem-' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

// Spherical Haversine calculation for immediate client-side distance display
function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export interface VisitDestinationItem {
  id?: string;
  destinationName: string;
  address?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  radiusMeters?: number;
  isGeofenceRequired?: boolean;
}

export interface VisitApprovalItem {
  id: string;
  decision: 'APPROVED' | 'REJECTED';
  comments?: string | null;
  decidedAt: string;
  approver?: {
    firstName: string;
    lastName: string;
    email: string;
  };
}

export interface OfficialVisitRecord {
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
  destinations: VisitDestinationItem[];
  employee?: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    displayName: string;
  };
  approvals?: VisitApprovalItem[];
  createdAt: string;
  updatedAt: string;
}

export default function VisitsPage() {
  const { user, roles } = useAuth();
  const isManager = roles.includes('MANAGER') || roles.includes('HR') || roles.includes('ADMIN');
  const isAdminOrHr = roles.includes('HR') || roles.includes('ADMIN');

  // Main navigation tab
  const [activeTab, setActiveTab] = useState<'my' | 'approvals' | 'all'>('my');

  // My Visits sub-filter
  const [subFilter, setSubFilter] = useState<'ACTIVE' | 'DRAFTS' | 'HISTORY'>('ACTIVE');
  const [searchQuery, setSearchQuery] = useState('');

  // Data states
  const [myVisits, setMyVisits] = useState<OfficialVisitRecord[]>([]);
  const [pendingVisits, setPendingVisits] = useState<OfficialVisitRecord[]>([]);
  const [allVisits, setAllVisits] = useState<OfficialVisitRecord[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<any>(null);

  // Loading & error feedback
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{
    title: string;
    message: string;
    type: 'success' | 'error' | 'warning';
  } | null>(null);

  // Form modal state (Create / Edit Draft)
  const [formModal, setFormModal] = useState<{
    isOpen: boolean;
    mode: 'CREATE' | 'EDIT';
    visitId?: string;
    title: string;
    purpose: string;
    startDate: string;
    endDate: string;
    destinationName: string;
    address: string;
    city: string;
    latitude: string;
    longitude: string;
    radiusMeters: number;
    isGeofenceRequired: boolean;
    isSubmitting: boolean;
    step: 'FORM' | 'REVIEW';
  }>({
    isOpen: false,
    mode: 'CREATE',
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
    isSubmitting: false,
    step: 'FORM',
  });

  // Decision modal state (Manager)
  const [decisionModal, setDecisionModal] = useState<{
    isOpen: boolean;
    visit: OfficialVisitRecord | null;
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
    visit: OfficialVisitRecord | null;
    reason: string;
    isSubmitting: boolean;
  }>({
    isOpen: false,
    visit: null,
    reason: '',
    isSubmitting: false,
  });

  // Attendance Punch State
  const { acquireLocation, isAcquiring: isGpsAcquiring } = useGeolocation(150);
  const [punchState, setPunchState] = useState<{
    isPunching: boolean;
    locationStatus:
      | 'IDLE'
      | 'CHECKING'
      | 'IN_RANGE'
      | 'OUT_OF_RANGE'
      | 'GPS_DENIED'
      | 'GPS_ERROR'
      | 'EXCEPTION_READY';
    distanceMeters: number | null;
    clientCoords: { lat: number; lng: number; accuracy: number } | null;
    gpsExceptionReason: string;
    showExceptionForm: boolean;
    isConcludingCheckout: boolean;
  }>({
    isPunching: false,
    locationStatus: 'IDLE',
    distanceMeters: null,
    clientCoords: null,
    gpsExceptionReason: '',
    showExceptionForm: false,
    isConcludingCheckout: false,
  });

  // Data fetching callbacks
  const loadMyVisits = useCallback(async () => {
    try {
      const res = await visitsApi.getMyVisits({ limit: 100 });
      if (res && res.data) {
        setMyVisits(res.data);
      }
    } catch (err: any) {
      console.error('Failed to load my visits:', err);
      throw err;
    }
  }, []);

  const loadPendingApprovals = useCallback(async () => {
    if (!isManager) return;
    try {
      const res = await visitsApi.getManagerPendingVisits({ limit: 50 });
      if (res && res.data) {
        setPendingVisits(res.data);
      }
    } catch (err: any) {
      console.error('Failed to load pending visits:', err);
    }
  }, [isManager]);

  const loadAllVisits = useCallback(async () => {
    if (!isAdminOrHr) return;
    try {
      const res = await visitsApi.getOrganizationVisits({ limit: 100 });
      if (res && res.data) {
        setAllVisits(res.data);
      }
    } catch (err: any) {
      console.error('Failed to load organization visits:', err);
    }
  }, [isAdminOrHr]);

  const loadTodayAttendance = useCallback(async () => {
    try {
      const data = await attendanceApi.getToday();
      setTodayAttendance(data);
    } catch (err: any) {
      console.error('Failed to load today attendance:', err);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    setErrorBanner(null);
    try {
      await Promise.all([
        loadMyVisits(),
        loadTodayAttendance(),
        isManager ? loadPendingApprovals() : Promise.resolve(),
        isAdminOrHr ? loadAllVisits() : Promise.resolve(),
      ]);
    } catch (err: any) {
      setLoadError(err.message || 'Unable to connect to the server. Please retry.');
    } finally {
      setIsLoading(false);
    }
  }, [
    loadMyVisits,
    loadTodayAttendance,
    isManager,
    loadPendingApprovals,
    isAdminOrHr,
    loadAllVisits,
  ]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Today's active visit lookup
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const todayVisit = useMemo(() => {
    return myVisits.find((v) => {
      const start = v.startDate.slice(0, 10);
      const end = v.endDate.slice(0, 10);
      const isDateValid = todayStr >= start && todayStr <= end;
      return isDateValid && (v.status === 'APPROVED' || v.status === 'IN_PROGRESS');
    });
  }, [myVisits, todayStr]);

  const activeOfficialSession = useMemo(() => {
    if (!todayAttendance?.currentStatus?.isCheckedIn) return null;
    const session = todayAttendance?.sessions?.find(
      (s: any) =>
        s.status === 'OPEN' && (s.attendanceMode === 'OFFICIAL_VISIT' || s.officialVisitId),
    );
    return session || null;
  }, [todayAttendance]);

  // Filtered My Visits
  const filteredMyVisits = useMemo(() => {
    return myVisits.filter((visit) => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchTitle = visit.title.toLowerCase().includes(query);
        const matchPurpose = visit.purpose.toLowerCase().includes(query);
        const matchDest = visit.destinations.some(
          (d) =>
            d.destinationName.toLowerCase().includes(query) ||
            (d.city && d.city.toLowerCase().includes(query)),
        );
        if (!matchTitle && !matchPurpose && !matchDest) return false;
      }

      if (subFilter === 'ACTIVE') {
        return (
          visit.status === 'APPROVED' ||
          visit.status === 'IN_PROGRESS' ||
          visit.status === 'SUBMITTED'
        );
      }
      if (subFilter === 'DRAFTS') {
        return visit.status === 'DRAFT';
      }
      if (subFilter === 'HISTORY') {
        return (
          visit.status === 'COMPLETED' ||
          visit.status === 'CANCELLED' ||
          visit.status === 'REJECTED' ||
          visit.status === 'EXPIRED'
        );
      }
      return true;
    });
  }, [myVisits, subFilter, searchQuery]);

  // Quick Location Status Checker for Today's Visit Destination
  const handleCheckLocation = async (dest: VisitDestinationItem) => {
    setPunchState((prev) => ({
      ...prev,
      locationStatus: 'CHECKING',
      distanceMeters: null,
      clientCoords: null,
    }));

    try {
      const pos = await acquireLocation();
      const clientLat = pos.latitude;
      const clientLng = pos.longitude;
      const accuracy = pos.accuracy;

      setPunchState((prev) => ({
        ...prev,
        clientCoords: { lat: clientLat, lng: clientLng, accuracy },
      }));

      // Calculate distance if destination has coordinates
      if (dest.latitude != null && dest.longitude != null) {
        const dist = calculateDistanceMeters(clientLat, clientLng, dest.latitude, dest.longitude);
        const maxRadius = dest.radiusMeters || 200;

        if (dist <= maxRadius) {
          setPunchState((prev) => ({
            ...prev,
            locationStatus: 'IN_RANGE',
            distanceMeters: dist,
          }));
        } else {
          setPunchState((prev) => ({
            ...prev,
            locationStatus: 'OUT_OF_RANGE',
            distanceMeters: dist,
          }));
        }
      } else {
        // Destination without coordinates, location deemed in range
        setPunchState((prev) => ({
          ...prev,
          locationStatus: 'IN_RANGE',
          distanceMeters: 0,
        }));
      }
    } catch (err: any) {
      if (err.message && err.message.includes('denied')) {
        setPunchState((prev) => ({ ...prev, locationStatus: 'GPS_DENIED' }));
      } else {
        setPunchState((prev) => ({ ...prev, locationStatus: 'GPS_ERROR' }));
      }
    }
  };

  // Perform Field Check-In
  const handleVisitCheckIn = async (visit: OfficialVisitRecord) => {
    const dest = visit.destinations[0];
    const exceptionReason = punchState.gpsExceptionReason.trim();

    // Check if exception required
    const requiresException =
      punchState.locationStatus === 'GPS_DENIED' ||
      punchState.locationStatus === 'GPS_ERROR' ||
      punchState.locationStatus === 'OUT_OF_RANGE' ||
      punchState.clientCoords === null;

    if (requiresException && exceptionReason.length < 10) {
      setPunchState((prev) => ({ ...prev, showExceptionForm: true }));
      setToastMessage({
        title: 'Location Justification Required',
        message:
          'Please document why GPS is unavailable or outside geofence (minimum 10 characters).',
        type: 'warning',
      });
      return;
    }

    setPunchState((prev) => ({ ...prev, isPunching: true }));
    setErrorBanner(null);

    try {
      const idempotencyKey = generateIdempotencyKey();
      const payload: any = {
        idempotencyKey,
        attendanceMode: 'OFFICIAL_VISIT',
        officialVisitId: visit.id,
        destinationId: dest?.id,
        deviceInfo: typeof navigator !== 'undefined' ? navigator.userAgent : 'Web Browser',
      };

      if (punchState.clientCoords) {
        payload.latitude = punchState.clientCoords.lat;
        payload.longitude = punchState.clientCoords.lng;
        payload.accuracyMeters = punchState.clientCoords.accuracy;
      }

      if (exceptionReason.length >= 10) {
        payload.gpsExceptionReason = exceptionReason;
      }

      // Check-in API call
      const res = await attendanceApi.checkIn(payload);

      // Only display success after verified server response
      if (res && (res.success || res.data || res.message)) {
        setToastMessage({
          title: 'Field Check-In Confirmed',
          message: `Official visit attendance confirmed for ${visit.title}.`,
          type: 'success',
        });
        setPunchState({
          isPunching: false,
          locationStatus: 'IDLE',
          distanceMeters: null,
          clientCoords: null,
          gpsExceptionReason: '',
          showExceptionForm: false,
          isConcludingCheckout: false,
        });
        await refreshAll();
      } else {
        throw new Error(res?.message || 'Check-in failed on server.');
      }
    } catch (err: any) {
      setErrorBanner(
        err.message ||
          'Check-in was rejected by the server. Ensure coordinates match approved destination.',
      );
    } finally {
      setPunchState((prev) => ({ ...prev, isPunching: false }));
    }
  };

  // Perform Field Check-Out
  const handleVisitCheckOut = async (visitId: string) => {
    setPunchState((prev) => ({ ...prev, isPunching: true }));
    setErrorBanner(null);

    try {
      const idempotencyKey = generateIdempotencyKey();
      const payload: any = {
        idempotencyKey,
        officialVisitId: visitId,
        isVisitConcluded: punchState.isConcludingCheckout,
        deviceInfo: typeof navigator !== 'undefined' ? navigator.userAgent : 'Web Browser',
      };

      if (punchState.clientCoords) {
        payload.latitude = punchState.clientCoords.lat;
        payload.longitude = punchState.clientCoords.lng;
        payload.accuracyMeters = punchState.clientCoords.accuracy;
      }

      const res = await attendanceApi.checkOut(payload);

      if (res && (res.success || res.data || res.message)) {
        setToastMessage({
          title: 'Field Check-Out Confirmed',
          message: 'Your field attendance session was closed successfully.',
          type: 'success',
        });
        setPunchState({
          isPunching: false,
          locationStatus: 'IDLE',
          distanceMeters: null,
          clientCoords: null,
          gpsExceptionReason: '',
          showExceptionForm: false,
          isConcludingCheckout: false,
        });
        await refreshAll();
      } else {
        throw new Error(res?.message || 'Check-out failed on server.');
      }
    } catch (err: any) {
      setErrorBanner(err.message || 'Check-out failed. Please try again.');
    } finally {
      setPunchState((prev) => ({ ...prev, isPunching: false }));
    }
  };

  // Open Create Modal
  const handleOpenCreate = () => {
    setFormModal({
      isOpen: true,
      mode: 'CREATE',
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
      isSubmitting: false,
      step: 'FORM',
    });
  };

  // Open Edit Draft Modal
  const handleOpenEdit = (visit: OfficialVisitRecord) => {
    const dest = visit.destinations[0];
    setFormModal({
      isOpen: true,
      mode: 'EDIT',
      visitId: visit.id,
      title: visit.title,
      purpose: visit.purpose,
      startDate: visit.startDate.slice(0, 10),
      endDate: visit.endDate.slice(0, 10),
      destinationName: dest?.destinationName || '',
      address: dest?.address || '',
      city: dest?.city || '',
      latitude: dest?.latitude != null ? String(dest.latitude) : '12.9716',
      longitude: dest?.longitude != null ? String(dest.longitude) : '77.5946',
      radiusMeters: dest?.radiusMeters || 200,
      isGeofenceRequired: dest?.isGeofenceRequired ?? true,
      isSubmitting: false,
      step: 'FORM',
    });
  };

  // Prefill Coordinates from Current Location
  const handlePinCurrentLocation = async () => {
    try {
      const pos = await acquireLocation();
      setFormModal((prev) => ({
        ...prev,
        latitude: pos.latitude.toFixed(6),
        longitude: pos.longitude.toFixed(6),
      }));
      setToastMessage({
        title: 'Coordinates Pinned',
        message: `Acquired device coordinates (${pos.latitude.toFixed(4)}, ${pos.longitude.toFixed(4)})`,
        type: 'success',
      });
    } catch (err: any) {
      setToastMessage({
        title: 'GPS Unavailable',
        message: 'Could not pin current location. You can enter coordinates manually.',
        type: 'warning',
      });
    }
  };

  // Submit Visit Request (Save Draft or Submit for Review)
  const handleSaveVisit = async (targetStatus: 'DRAFT' | 'SUBMITTED') => {
    setFormModal((prev) => ({ ...prev, isSubmitting: true }));
    setErrorBanner(null);

    try {
      const payload = {
        title: formModal.title.trim(),
        purpose: formModal.purpose.trim(),
        startDate: formModal.startDate,
        endDate: formModal.endDate,
        status: targetStatus,
        destinations: [
          {
            destinationName: formModal.destinationName.trim(),
            address: formModal.address.trim() || undefined,
            city: formModal.city.trim() || undefined,
            latitude: formModal.latitude ? parseFloat(formModal.latitude) : undefined,
            longitude: formModal.longitude ? parseFloat(formModal.longitude) : undefined,
            radiusMeters: Number(formModal.radiusMeters) || 200,
            isGeofenceRequired: formModal.isGeofenceRequired,
          },
        ],
      };

      if (formModal.mode === 'CREATE') {
        const res = await visitsApi.createVisit(payload);
        if (res && (res.success || res.data)) {
          setToastMessage({
            title: targetStatus === 'DRAFT' ? 'Draft Saved' : 'Visit Request Submitted',
            message:
              targetStatus === 'DRAFT'
                ? 'Your visit draft is saved and can be edited anytime.'
                : 'Your visit request was submitted to your manager for approval.',
            type: 'success',
          });
          setFormModal((prev) => ({ ...prev, isOpen: false }));
          await refreshAll();
        }
      } else if (formModal.mode === 'EDIT' && formModal.visitId) {
        const res = await visitsApi.updateVisit(formModal.visitId, payload);
        if (res && (res.success || res.data)) {
          setToastMessage({
            title: targetStatus === 'DRAFT' ? 'Draft Updated' : 'Visit Request Submitted',
            message:
              targetStatus === 'DRAFT'
                ? 'Draft changes saved successfully.'
                : 'Your revised visit request has been sent for manager review.',
            type: 'success',
          });
          setFormModal((prev) => ({ ...prev, isOpen: false }));
          await refreshAll();
        }
      }
    } catch (err: any) {
      setErrorBanner(
        err.message ||
          'Operation failed. Verify start and end dates do not overlap with existing visits.',
      );
    } finally {
      setFormModal((prev) => ({ ...prev, isSubmitting: false }));
    }
  };

  // Submit Cancellation
  const handleCancelSubmit = async () => {
    if (!cancelModal.visit) return;
    setCancelModal((prev) => ({ ...prev, isSubmitting: true }));
    setErrorBanner(null);

    try {
      const res = await visitsApi.cancelVisit(cancelModal.visit.id, cancelModal.reason.trim());
      if (res && (res.success || res.data || res.message)) {
        setToastMessage({
          title: 'Visit Cancelled',
          message: 'The official visit request was successfully cancelled.',
          type: 'success',
        });
        setCancelModal({ isOpen: false, visit: null, reason: '', isSubmitting: false });
        await refreshAll();
      }
    } catch (err: any) {
      setErrorBanner(
        err.message ||
          'Failed to cancel visit. Visits that have commenced require HR or manager action.',
      );
      setCancelModal((prev) => ({ ...prev, isSubmitting: false }));
    }
  };

  // Submit Manager Decision
  const handleDecisionSubmit = async () => {
    if (!decisionModal.visit) return;
    setDecisionModal((prev) => ({ ...prev, isSubmitting: true }));
    setErrorBanner(null);

    try {
      const res = await visitsApi.decideVisit(decisionModal.visit.id, {
        decision: decisionModal.decision,
        comments: decisionModal.comments.trim() || undefined,
      });

      if (res && (res.success || res.data)) {
        setToastMessage({
          title: `Visit ${decisionModal.decision}`,
          message: `Official visit for ${decisionModal.visit.employee?.displayName || 'employee'} was ${decisionModal.decision.toLowerCase()}.`,
          type: 'success',
        });
        setDecisionModal({
          isOpen: false,
          visit: null,
          decision: 'APPROVED',
          comments: '',
          isSubmitting: false,
        });
        await refreshAll();
      }
    } catch (err: any) {
      setErrorBanner(err.message || 'Decision failed. Please verify permissions.');
      setDecisionModal((prev) => ({ ...prev, isSubmitting: false }));
    }
  };

  // Render Status Badge
  const renderStatusBadge = (status: OfficialVisitRecord['status']) => {
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
      case 'DRAFT':
        return (
          <Badge variant="outline" size="sm">
            Draft
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
        <div className="fixed top-5 right-5 z-50 animate-in fade-in slide-in-from-top-4 duration-200">
          <Toast
            type={toastMessage.type}
            title={toastMessage.title}
            message={toastMessage.message}
            onClose={() => setToastMessage(null)}
          />
        </div>
      )}

      <div className="space-y-6 max-w-6xl mx-auto px-2 sm:px-4 py-2">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-200 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-amber-500/10 rounded-xl text-amber-700">
                <Briefcase className="h-5 w-5 md:h-6 md:w-6" />
              </span>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-stone-900">
                Official Visits & Field Duty
              </h1>
            </div>
            <p className="text-xs md:text-sm text-stone-500 mt-0.5">
              Manage client visits, multi-site destinations, location geofencing, and attendance
              punch.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button
              size="sm"
              variant="outline"
              onClick={refreshAll}
              disabled={isLoading}
              leftIcon={<RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />}
            >
              Refresh
            </Button>
            <Button size="sm" onClick={handleOpenCreate} leftIcon={<Plus className="h-4 w-4" />}>
              New Request
            </Button>
          </div>
        </div>

        {/* Global Error Banner */}
        {errorBanner && (
          <div className="p-4 rounded-xl border border-rose-200 bg-rose-50 flex items-start gap-3 text-rose-900">
            <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <span className="font-semibold block">Attention Needed</span>
              {errorBanner}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* MOBILE HERO: TODAY'S FIELD PUNCH CARD                     */}
        {/* ======================================================== */}
        {todayVisit && (
          <Card className="border-amber-200 bg-gradient-to-br from-amber-50/50 via-white to-stone-50 p-4 sm:p-5 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Badge variant="purple" size="sm">
                    Today's Authorized Field Visit
                  </Badge>
                  {renderStatusBadge(todayVisit.status)}
                </div>
                <h3 className="text-base sm:text-lg font-bold text-stone-900">
                  {todayVisit.title}
                </h3>
                <p className="text-xs text-stone-600 max-w-xl">{todayVisit.purpose}</p>

                {todayVisit.destinations[0] && (
                  <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-stone-700">
                    <span className="inline-flex items-center gap-1 font-medium bg-white px-2.5 py-1 rounded-md border border-stone-200 shadow-2xs">
                      <MapPin className="h-3.5 w-3.5 text-amber-600" />
                      {todayVisit.destinations[0].destinationName}
                      {todayVisit.destinations[0].city && ` (${todayVisit.destinations[0].city})`}
                    </span>
                    <span className="text-stone-400">
                      Radius: {todayVisit.destinations[0].radiusMeters || 200}m
                    </span>
                  </div>
                )}
              </div>

              {/* Punch Controls */}
              <div className="bg-white p-3.5 rounded-xl border border-stone-200/80 shadow-xs flex flex-col gap-2 min-w-[280px]">
                {activeOfficialSession ? (
                  // Checked In State -> Check Out Flow
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1.5 font-medium text-emerald-700">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                        Checked In at Destination
                      </span>
                      <span className="text-stone-400">
                        Since{' '}
                        {new Date(activeOfficialSession.checkInTime).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <label className="flex items-center gap-2 text-xs text-stone-600 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={punchState.isConcludingCheckout}
                        onChange={(e) =>
                          setPunchState((prev) => ({
                            ...prev,
                            isConcludingCheckout: e.target.checked,
                          }))
                        }
                        className="rounded border-stone-300 text-amber-600 focus:ring-amber-500"
                      />
                      <span>Mark field visit fully completed on checkout</span>
                    </label>

                    <Button
                      size="sm"
                      className="w-full bg-stone-900 hover:bg-stone-800 text-white"
                      disabled={punchState.isPunching}
                      onClick={() => handleVisitCheckOut(todayVisit.id)}
                      leftIcon={<LogOut className="h-4 w-4" />}
                    >
                      {punchState.isPunching ? 'Verifying Checkout...' : 'Check Out of Field Visit'}
                    </Button>
                  </div>
                ) : (
                  // Not Checked In -> Geolocation Pre-verification & Check In Flow
                  <div className="space-y-2.5">
                    {/* Location Status Feedback */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-stone-700">Site Proximity Status:</span>
                      {punchState.locationStatus === 'IDLE' && (
                        <span className="text-stone-400">Not verified</span>
                      )}
                      {punchState.locationStatus === 'CHECKING' && (
                        <span className="text-amber-600 inline-flex items-center gap-1">
                          <RefreshCw className="h-3 w-3 animate-spin" /> Acquiring GPS...
                        </span>
                      )}
                      {punchState.locationStatus === 'IN_RANGE' && (
                        <span className="text-emerald-700 font-semibold inline-flex items-center gap-1">
                          <ShieldCheck className="h-3.5 w-3.5" /> Inside Geofence (
                          {punchState.distanceMeters}m)
                        </span>
                      )}
                      {punchState.locationStatus === 'OUT_OF_RANGE' && (
                        <span className="text-rose-600 font-semibold inline-flex items-center gap-1">
                          <ShieldAlert className="h-3.5 w-3.5" /> Outside Area (
                          {punchState.distanceMeters}m)
                        </span>
                      )}
                      {punchState.locationStatus === 'GPS_DENIED' && (
                        <span className="text-rose-600 font-medium">GPS Denied</span>
                      )}
                      {punchState.locationStatus === 'GPS_ERROR' && (
                        <span className="text-rose-600 font-medium">GPS Unavailable</span>
                      )}
                    </div>

                    {/* Pre-check Location Button */}
                    {punchState.locationStatus === 'IDLE' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full text-stone-700 text-xs"
                        onClick={() => handleCheckLocation(todayVisit.destinations[0])}
                        disabled={isGpsAcquiring}
                        leftIcon={<Compass className="h-3.5 w-3.5 text-amber-600" />}
                      >
                        Verify GPS Distance
                      </Button>
                    )}

                    {/* Documented GPS Exception Toggle for Indoor/Basement/Remote */}
                    {(punchState.locationStatus === 'OUT_OF_RANGE' ||
                      punchState.locationStatus === 'GPS_DENIED' ||
                      punchState.locationStatus === 'GPS_ERROR' ||
                      punchState.showExceptionForm) && (
                      <div className="space-y-1.5 pt-1 border-t border-stone-100">
                        <div className="flex items-center justify-between text-[11px] text-stone-500">
                          <span>Indoor / Remote GPS Exception:</span>
                        </div>
                        <Input
                          placeholder="Reason (e.g. Subterranean client data center)"
                          value={punchState.gpsExceptionReason}
                          onChange={(e) =>
                            setPunchState((prev) => ({
                              ...prev,
                              gpsExceptionReason: e.target.value,
                            }))
                          }
                          className="text-xs"
                        />
                      </div>
                    )}

                    {/* Primary Check-In Action Button */}
                    <Button
                      size="sm"
                      className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                      disabled={punchState.isPunching}
                      onClick={() => handleVisitCheckIn(todayVisit)}
                      leftIcon={<LogIn className="h-4 w-4" />}
                    >
                      {punchState.isPunching
                        ? 'Server Verifying Punch...'
                        : 'Check In at Destination'}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* ======================================================== */}
        {/* PRIMARY NAVIGATION TABS (Employee / Manager / Org)        */}
        {/* ======================================================== */}
        <div className="flex items-center gap-1 sm:gap-2 border-b border-stone-200 overflow-x-auto pb-0.5">
          <button
            onClick={() => setActiveTab('my')}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
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
              className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
                activeTab === 'approvals'
                  ? 'border-amber-600 text-amber-800 bg-amber-50/50'
                  : 'border-transparent text-stone-600 hover:text-stone-900 hover:bg-stone-50'
              }`}
            >
              <UserCheck className="h-4 w-4" />
              Team Approvals
              {pendingVisits.length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-amber-600 text-white">
                  {pendingVisits.length}
                </span>
              )}
            </button>
          )}

          {isAdminOrHr && (
            <button
              onClick={() => setActiveTab('all')}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
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

        {/* ======================================================== */}
        {/* TAB 1: MY VISITS (EMPLOYEE EXPERIENCE)                   */}
        {/* ======================================================== */}
        {activeTab === 'my' && (
          <div className="space-y-4">
            {/* Filter Pills and Search Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-stone-50 p-2 sm:p-2.5 rounded-xl border border-stone-200">
              <div className="flex items-center gap-1.5 overflow-x-auto">
                <button
                  onClick={() => setSubFilter('ACTIVE')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    subFilter === 'ACTIVE'
                      ? 'bg-amber-600 text-white shadow-2xs'
                      : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
                  }`}
                >
                  Active & Upcoming
                </button>
                <button
                  onClick={() => setSubFilter('DRAFTS')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    subFilter === 'DRAFTS'
                      ? 'bg-amber-600 text-white shadow-2xs'
                      : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
                  }`}
                >
                  Drafts
                </button>
                <button
                  onClick={() => setSubFilter('HISTORY')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    subFilter === 'HISTORY'
                      ? 'bg-amber-600 text-white shadow-2xs'
                      : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-200'
                  }`}
                >
                  Visit History
                </button>
              </div>

              <div className="w-full sm:w-64">
                <Input
                  placeholder="Search visits..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="text-xs bg-white"
                />
              </div>
            </div>

            {/* Loading & Error States */}
            {isLoading && myVisits.length === 0 && (
              <LoadingState message="Retrieving your official visit records..." />
            )}

            {loadError && (
              <ErrorState title="Failed to Load Visits" message={loadError} onRetry={refreshAll} />
            )}

            {/* Empty State */}
            {!isLoading && !loadError && filteredMyVisits.length === 0 && (
              <EmptyState
                title={
                  subFilter === 'ACTIVE'
                    ? 'No Active Visits'
                    : subFilter === 'DRAFTS'
                      ? 'No Draft Requests'
                      : 'No Historical Visits'
                }
                description={
                  subFilter === 'ACTIVE'
                    ? 'You have no approved or pending official visits scheduled.'
                    : subFilter === 'DRAFTS'
                      ? 'You have not saved any unsubmitted visit drafts.'
                      : 'Completed and cancelled visit logs will be archived here.'
                }
                action={
                  subFilter === 'DRAFTS' || subFilter === 'ACTIVE'
                    ? { label: 'Create New Visit', onClick: handleOpenCreate }
                    : undefined
                }
              />
            )}

            {/* Visit Cards Grid */}
            {!isLoading && !loadError && filteredMyVisits.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredMyVisits.map((visit) => {
                  const isUpcoming = todayStr < visit.startDate.slice(0, 10);
                  const isCanCancel =
                    (visit.status === 'SUBMITTED' || visit.status === 'APPROVED') && isUpcoming;

                  return (
                    <Card
                      key={visit.id}
                      className="p-4 sm:p-5 flex flex-col justify-between border-stone-200 hover:border-amber-200 hover:shadow-xs transition-all"
                    >
                      <div className="space-y-3">
                        {/* Title & Badge */}
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-semibold text-stone-900 text-sm sm:text-base line-clamp-1">
                            {visit.title}
                          </h4>
                          {renderStatusBadge(visit.status)}
                        </div>

                        <p className="text-xs text-stone-500 line-clamp-2">{visit.purpose}</p>

                        {/* Dates */}
                        <div className="flex items-center gap-2 text-xs text-stone-600 bg-stone-50/70 p-2 rounded-lg border border-stone-100">
                          <Calendar className="h-3.5 w-3.5 text-stone-400 shrink-0" />
                          <span>
                            {visit.startDate.slice(0, 10)} to {visit.endDate.slice(0, 10)} (
                            {visit.expectedDurationDays}{' '}
                            {visit.expectedDurationDays === 1 ? 'day' : 'days'})
                          </span>
                        </div>

                        {/* Destinations */}
                        <div className="space-y-1.5">
                          {visit.destinations.map((dest, i) => (
                            <div
                              key={i}
                              className="flex items-start gap-2 bg-stone-50 p-2 rounded-lg border border-stone-100 text-xs"
                            >
                              <MapPin className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
                              <div className="min-w-0">
                                <span className="font-medium text-stone-800 block truncate">
                                  {dest.destinationName}
                                </span>
                                <span className="text-stone-400 text-[11px]">
                                  {dest.city || 'Site'} • Geofence: {dest.radiusMeters || 200}m
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Approval Trail & Comments */}
                        {visit.approvals && visit.approvals.length > 0 && (
                          <div className="pt-2 border-t border-stone-100 text-xs">
                            <span className="text-[11px] font-semibold text-stone-500 uppercase block mb-1">
                              Reviewer Comments
                            </span>
                            {visit.approvals.map((appr) => (
                              <div
                                key={appr.id}
                                className="bg-stone-50 p-2 rounded-md text-[11px] text-stone-700"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold">
                                    {appr.approver?.firstName} {appr.approver?.lastName}
                                  </span>
                                  <span
                                    className={
                                      appr.decision === 'APPROVED'
                                        ? 'text-emerald-700 font-medium'
                                        : 'text-rose-600 font-medium'
                                    }
                                  >
                                    {appr.decision}
                                  </span>
                                </div>
                                {appr.comments && (
                                  <p className="italic text-stone-500 mt-1">"{appr.comments}"</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Cancellation Reason Note */}
                        {visit.status === 'CANCELLED' && visit.cancellationReason && (
                          <div className="p-2 rounded bg-rose-50 border border-rose-100 text-[11px] text-rose-800">
                            <span className="font-semibold block">Cancellation Reason:</span>
                            {visit.cancellationReason}
                          </div>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-end gap-2">
                        {/* Draft actions */}
                        {visit.status === 'DRAFT' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenEdit(visit)}
                              leftIcon={<Edit3 className="h-3.5 w-3.5" />}
                            >
                              Edit Draft
                            </Button>
                            <Button
                              size="sm"
                              className="bg-amber-600 hover:bg-amber-700 text-white"
                              onClick={() => {
                                handleOpenEdit(visit);
                                setFormModal((prev) => ({ ...prev, step: 'REVIEW' }));
                              }}
                              leftIcon={<Send className="h-3.5 w-3.5" />}
                            >
                              Review & Submit
                            </Button>
                          </>
                        )}

                        {/* Active/Submitted cancellation */}
                        {isCanCancel && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-rose-600 border-rose-200 hover:bg-rose-50"
                            onClick={() =>
                              setCancelModal({
                                isOpen: true,
                                visit,
                                reason: '',
                                isSubmitting: false,
                              })
                            }
                          >
                            Cancel Visit
                          </Button>
                        )}

                        {!isCanCancel &&
                          (visit.status === 'SUBMITTED' || visit.status === 'APPROVED') && (
                            <span className="text-[11px] text-stone-400 italic">
                              Commenced visits require manager/HR cancellation
                            </span>
                          )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 2: TEAM APPROVALS (MANAGER EXPERIENCE)               */}
        {/* ======================================================== */}
        {activeTab === 'approvals' && isManager && (
          <div className="space-y-4">
            <ManagerVisitInbox />
          </div>
        )}

        {/* ======================================================== */}
        {/* TAB 3: ORGANIZATION OVERVIEW (HR/ADMIN)                   */}
        {/* ======================================================== */}
        {activeTab === 'all' && isAdminOrHr && (
          <div className="space-y-4">
            {allVisits.length === 0 ? (
              <EmptyState
                title="No Organization Visits"
                description="No official visits found across the company."
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {allVisits.map((visit) => (
                  <Card key={visit.id} className="p-4 border-stone-200">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-xs font-semibold text-stone-500 block">
                          {visit.employee?.displayName} ({visit.employee?.employeeCode})
                        </span>
                        <h4 className="font-semibold text-stone-900 text-sm mt-0.5">
                          {visit.title}
                        </h4>
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
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* MODAL 1: CREATE / EDIT VISIT REQUEST (WITH REVIEW STEP)   */}
        {/* ======================================================== */}
        <Dialog
          isOpen={formModal.isOpen}
          onClose={() => setFormModal((prev) => ({ ...prev, isOpen: false }))}
          title={
            formModal.mode === 'CREATE'
              ? 'New Official Visit (OD) Request'
              : 'Edit Official Visit Draft'
          }
          description="Schedule client or field duty with destination geofence coordinates."
          footer={
            <div className="flex items-center justify-between w-full">
              {formModal.step === 'REVIEW' ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setFormModal((prev) => ({ ...prev, step: 'FORM' }))}
                >
                  Back to Edit
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setFormModal((prev) => ({ ...prev, isOpen: false }))}
                >
                  Cancel
                </Button>
              )}

              <div className="flex items-center gap-2">
                {formModal.step === 'FORM' ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSaveVisit('DRAFT')}
                      disabled={formModal.isSubmitting || !formModal.title.trim()}
                    >
                      Save as Draft
                    </Button>
                    <Button
                      size="sm"
                      className="bg-amber-600 hover:bg-amber-700 text-white"
                      onClick={() => setFormModal((prev) => ({ ...prev, step: 'REVIEW' }))}
                      disabled={
                        !formModal.title.trim() ||
                        !formModal.purpose.trim() ||
                        !formModal.destinationName.trim()
                      }
                    >
                      Review & Confirm
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSaveVisit('DRAFT')}
                      disabled={formModal.isSubmitting}
                    >
                      Save as Draft
                    </Button>
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => handleSaveVisit('SUBMITTED')}
                      disabled={formModal.isSubmitting}
                    >
                      {formModal.isSubmitting ? 'Submitting...' : 'Submit for Manager Review'}
                    </Button>
                  </>
                )}
              </div>
            </div>
          }
        >
          {formModal.step === 'FORM' ? (
            <div className="space-y-4 py-2 text-stone-800">
              <Input
                label="Visit Title"
                placeholder="e.g. Acme Corp On-Site Technical Architecture Review"
                value={formModal.title}
                onChange={(e) => setFormModal({ ...formModal, title: e.target.value })}
                required
              />

              <Textarea
                label="Business Justification & Deliverables"
                placeholder="Outline scheduled meetings, deliverables, client sponsors, and scope..."
                rows={2}
                value={formModal.purpose}
                onChange={(e) => setFormModal({ ...formModal, purpose: e.target.value })}
                required
              />

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Start Date"
                  type="date"
                  value={formModal.startDate}
                  onChange={(e) => setFormModal({ ...formModal, startDate: e.target.value })}
                  required
                />
                <Input
                  label="End Date"
                  type="date"
                  value={formModal.endDate}
                  onChange={(e) => setFormModal({ ...formModal, endDate: e.target.value })}
                  required
                />
              </div>

              {/* Destination Form Section */}
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-900 uppercase">
                    <MapPin className="h-4 w-4 text-amber-600" />
                    <span>Primary Destination Details</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7 px-2"
                    onClick={handlePinCurrentLocation}
                    leftIcon={<Compass className="h-3.5 w-3.5 text-amber-600" />}
                  >
                    Pin My Current GPS
                  </Button>
                </div>

                <Input
                  label="Destination Facility / Client Name"
                  placeholder="e.g. Apex Tech Park Building 4"
                  value={formModal.destinationName}
                  onChange={(e) => setFormModal({ ...formModal, destinationName: e.target.value })}
                  required
                />

                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="City"
                    placeholder="e.g. Bangalore"
                    value={formModal.city}
                    onChange={(e) => setFormModal({ ...formModal, city: e.target.value })}
                  />
                  <Input
                    label="Geofence Radius (meters)"
                    type="number"
                    placeholder="200"
                    value={formModal.radiusMeters}
                    onChange={(e) =>
                      setFormModal({ ...formModal, radiusMeters: Number(e.target.value) })
                    }
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Target Latitude"
                    placeholder="12.9716"
                    value={formModal.latitude}
                    onChange={(e) => setFormModal({ ...formModal, latitude: e.target.value })}
                  />
                  <Input
                    label="Target Longitude"
                    placeholder="77.5946"
                    value={formModal.longitude}
                    onChange={(e) => setFormModal({ ...formModal, longitude: e.target.value })}
                  />
                </div>
              </div>
            </div>
          ) : (
            // REVIEW STEP
            <div className="space-y-3 py-2 text-stone-800 text-xs">
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-2">
                <div className="font-semibold text-sm text-stone-900">{formModal.title}</div>
                <div className="text-stone-600">{formModal.purpose}</div>
                <div className="flex items-center gap-3 text-stone-500 pt-1 border-t border-stone-200">
                  <span className="font-medium text-stone-800">
                    Schedule: {formModal.startDate} to {formModal.endDate}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-200/80 space-y-1.5">
                <div className="font-semibold text-amber-900 flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-amber-600" />
                  <span>Approved Destination Geofence</span>
                </div>
                <div className="text-stone-700 font-medium">{formModal.destinationName}</div>
                <div className="text-stone-500">
                  {formModal.city || 'Site'} • Target Coordinates: ({formModal.latitude},{' '}
                  {formModal.longitude}) • Allowed Radius: {formModal.radiusMeters}m
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-stone-100 text-stone-600 flex items-start gap-2">
                <Info className="h-4 w-4 text-stone-500 shrink-0 mt-0.5" />
                <span>
                  Once submitted, the request goes to your manager. During the visit, attendance
                  punches will be verified against this geofence radius.
                </span>
              </div>
            </div>
          )}
        </Dialog>

        {/* ======================================================== */}
        {/* MODAL 2: MANAGER DECISION (APPROVE / REJECT)              */}
        {/* ======================================================== */}
        <Dialog
          isOpen={decisionModal.isOpen}
          onClose={() => setDecisionModal((prev) => ({ ...prev, isOpen: false }))}
          title={`${decisionModal.decision === 'APPROVED' ? 'Approve' : 'Reject'} Official Visit`}
          description={`Submit official review decision for ${decisionModal.visit?.employee?.displayName || 'employee'}.`}
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
                  ? 'e.g. Approved. Client visitor badges confirmed.'
                  : 'e.g. Rejected due to scheduling conflict with team milestones.'
              }
              rows={3}
              value={decisionModal.comments}
              onChange={(e) => setDecisionModal({ ...decisionModal, comments: e.target.value })}
            />
          </div>
        </Dialog>

        {/* ======================================================== */}
        {/* MODAL 3: CANCEL VISIT                                    */}
        {/* ======================================================== */}
        <Dialog
          isOpen={cancelModal.isOpen}
          onClose={() => setCancelModal((prev) => ({ ...prev, isOpen: false }))}
          title="Cancel Official Visit Request"
          description="A documented cancellation reason is required for HR audit compliance."
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
              placeholder="e.g. Client requested rescheduling the on-site inspection..."
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
