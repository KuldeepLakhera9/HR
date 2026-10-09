'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AppShell } from '../../layouts/AppShell';
import {
  Button,
  Badge,
  Card,
  Dialog,
  Skeleton,
  Input,
  KPICard,
  DataTable,
  DatePicker,
} from '@hrms/ui';
import {
  Clock,
  Building,
  CheckCircle2,
  MapPin,
  Calendar,
  AlertCircle,
  AlertTriangle,
  Coffee,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Moon,
  History,
  FileEdit,
  Compass,
  Send,
  Info,
  ChevronRight,
  Briefcase,
  Home,
  Check,
} from 'lucide-react';
import { attendanceApi } from '../../lib/api-client';
import { useGeolocation, GeolocationPositionData } from '../../hooks/useGeolocation';
import { AttendanceDayStatus } from '@hrms/types';
import { HRAttendanceDashboard } from '../../features/attendance/components/HRAttendanceDashboard';

// Helper: safe UUID generator for idempotency keys
function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'idem-' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

// Client-side Haversine distance calculator for immediate feedback
function calculateHaversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

export default function AttendancePage() {
  const [activeTab, setActiveTab] = useState<'my' | 'operations'>('my');

  // Live Clock State
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Today Data State
  const [todayData, setTodayData] = useState<any>(null);
  const [isLoadingToday, setIsLoadingToday] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // History State
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [correctionsList, setCorrectionsList] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Geolocation & Verification State
  const {
    status: geoStatus,
    position,
    errorMessage: geoError,
    isAcquiring,
    acquireLocation,
    reset: resetGeo,
  } = useGeolocation(100);
  const [locationVerification, setLocationVerification] = useState<{
    status: 'UNVERIFIED' | 'VERIFYING' | 'VERIFIED' | 'OUTSIDE_GEOFENCE' | 'ERROR';
    distanceMeters?: number;
    message?: string;
  }>({ status: 'UNVERIFIED' });

  // Action Pending States
  const [isPunching, setIsPunching] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Geolocation Permission Explainer Modal
  const [showGeoExplainer, setShowGeoExplainer] = useState(false);

  // Correction Request Modal
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [correctionTargetDate, setCorrectionTargetDate] = useState(
    new Date().toISOString().split('T')[0],
  );
  const [requestedCheckInTime, setRequestedCheckInTime] = useState('09:00');
  const [requestedCheckOutTime, setRequestedCheckOutTime] = useState('18:00');
  const [correctionReason, setCorrectionReason] = useState('');
  const [isSubmittingCorrection, setIsSubmittingCorrection] = useState(false);
  const [correctionError, setCorrectionError] = useState<string | null>(null);

  // Fetch today status
  const loadTodayStatus = useCallback(async () => {
    try {
      setIsLoadingToday(true);
      setFetchError(null);
      const res = await attendanceApi.getToday();
      setTodayData(res);
    } catch (err: any) {
      setFetchError(err.message || 'Failed to load today attendance data.');
    } finally {
      setIsLoadingToday(false);
    }
  }, []);

  // Fetch history & corrections
  const loadHistoryAndCorrections = useCallback(async () => {
    try {
      setIsLoadingHistory(true);
      const [histRes, corrRes] = await Promise.all([
        attendanceApi.getMyHistory(30).catch(() => ({ summaries: [] })),
        attendanceApi.getMyCorrections().catch(() => []),
      ]);
      setHistoryData(histRes.summaries || []);
      setCorrectionsList(corrRes || []);
    } catch (err) {
      // Non-fatal
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadTodayStatus();
    loadHistoryAndCorrections();
  }, [loadTodayStatus, loadHistoryAndCorrections]);

  // Derived current status
  const currentStatus = todayData?.currentStatus || {
    isCheckedIn: false,
    isOnBreak: false,
    canCheckIn: true,
    canCheckOut: false,
    canStartBreak: false,
    canEndBreak: false,
  };

  const activeSession = todayData?.activeSession;
  const shift = todayData?.shift;
  const policy = todayData?.policy;
  const office = todayData?.office;
  const summary = todayData?.summary;

  // Running work timer calculation
  const elapsedWorkMinutes = useMemo(() => {
    if (!activeSession?.checkInTime) return summary?.totalWorkMinutes || 0;
    const inMs = new Date(activeSession.checkInTime).getTime();
    const nowMs = currentTime.getTime();
    const currentSessionElapsed = Math.max(0, Math.floor((nowMs - inMs) / 60000));
    const previousMinutes =
      (summary?.totalWorkMinutes || 0) - (activeSession.totalWorkMinutes || 0);
    return previousMinutes + currentSessionElapsed;
  }, [activeSession, summary, currentTime]);

  // Format minutes into HHh MMm
  const formatMinutes = (totalMin: number) => {
    const hours = Math.floor(totalMin / 60);
    const mins = totalMin % 60;
    return `${hours}h ${String(mins).padStart(2, '0')}m`;
  };

  // Perform Location Verification
  const verifyCurrentLocation = async (): Promise<GeolocationPositionData | null> => {
    setLocationVerification({ status: 'VERIFYING', message: 'Acquiring GPS location...' });
    setActionError(null);
    try {
      const pos = await acquireLocation();
      if (!office || office.latitude === undefined || office.longitude === undefined) {
        setLocationVerification({
          status: 'VERIFIED',
          message: 'Location acquired. (No office geofence assigned)',
        });
        return pos;
      }

      const dist = calculateHaversineMeters(
        pos.latitude,
        pos.longitude,
        office.latitude,
        office.longitude,
      );

      const radius = office.geofenceRadiusMeters || 100;
      if (dist <= radius) {
        setLocationVerification({
          status: 'VERIFIED',
          distanceMeters: dist,
          message: `Within perimeter (${dist}m away, radius: ${radius}m)`,
        });
      } else {
        setLocationVerification({
          status: 'OUTSIDE_GEOFENCE',
          distanceMeters: dist,
          message: `Outside office perimeter (${dist}m away, allowed: ${radius}m)`,
        });
      }
      return pos;
    } catch (err: any) {
      setLocationVerification({
        status: 'ERROR',
        message: err.message || 'Unable to retrieve location.',
      });
      return null;
    }
  };

  // Handle Check-In Action
  const handleCheckIn = async () => {
    setActionError(null);
    setActionSuccess(null);

    // Request location
    const pos = await verifyCurrentLocation();
    if (!pos) {
      setActionError('Location verification is required to punch in at an office.');
      return;
    }

    setIsPunching(true);
    const idempotencyKey = generateIdempotencyKey();

    try {
      const payload = {
        latitude: pos.latitude,
        longitude: pos.longitude,
        accuracyMeters: pos.accuracy,
        timestamp: new Date().toISOString(),
        idempotencyKey,
        officeLocationId: office?.id,
        attendanceMode: 'OFFICE',
        deviceInfo: navigator.userAgent,
      };

      const res = await attendanceApi.checkIn(payload);
      if (res.success) {
        setActionSuccess('Check-in confirmed successfully!');
        await loadTodayStatus();
        await loadHistoryAndCorrections();
      } else {
        setActionError(res.message || 'Check-in failed. Please try again.');
      }
    } catch (err: any) {
      setActionError(
        err.message || 'Check-in request failed. Please check network connectivity and retry.',
      );
    } finally {
      setIsPunching(false);
    }
  };

  // Handle Check-Out Action
  const handleCheckOut = async () => {
    setActionError(null);
    setActionSuccess(null);

    // Acquire position for location check if policy requires
    let pos: GeolocationPositionData | null = null;
    if (policy?.geofenceEnforcement) {
      pos = await verifyCurrentLocation();
      if (!pos && locationVerification.status === 'ERROR') {
        setActionError('Location verification is required for checkout under company policy.');
        return;
      }
    }

    setIsPunching(true);
    const idempotencyKey = generateIdempotencyKey();

    try {
      const payload: any = {
        idempotencyKey,
        deviceInfo: navigator.userAgent,
      };

      if (pos) {
        payload.latitude = pos.latitude;
        payload.longitude = pos.longitude;
        payload.accuracyMeters = pos.accuracy;
        payload.timestamp = new Date().toISOString();
      }

      const res = await attendanceApi.checkOut(payload);
      if (res.success) {
        setActionSuccess('Check-out recorded successfully!');
        await loadTodayStatus();
        await loadHistoryAndCorrections();
      } else {
        setActionError(res.message || 'Check-out failed. Please try again.');
      }
    } catch (err: any) {
      setActionError(
        err.message || 'Check-out request failed. Please check network connectivity and retry.',
      );
    } finally {
      setIsPunching(false);
    }
  };

  // Handle Break Start Action
  const handleStartBreak = async () => {
    setActionError(null);
    setActionSuccess(null);
    setIsPunching(true);
    const idempotencyKey = generateIdempotencyKey();

    try {
      const res = await attendanceApi.startBreak({
        idempotencyKey,
        deviceInfo: navigator.userAgent,
      });
      if (res.success) {
        setActionSuccess('Break started. Enjoy your break!');
        await loadTodayStatus();
      } else {
        setActionError(res.message || 'Failed to start break.');
      }
    } catch (err: any) {
      setActionError(err.message || 'Failed to start break.');
    } finally {
      setIsPunching(false);
    }
  };

  // Handle Break End Action
  const handleEndBreak = async () => {
    setActionError(null);
    setActionSuccess(null);
    setIsPunching(true);
    const idempotencyKey = generateIdempotencyKey();

    try {
      const res = await attendanceApi.endBreak({
        idempotencyKey,
        deviceInfo: navigator.userAgent,
      });
      if (res.success) {
        setActionSuccess('Break concluded. Welcome back!');
        await loadTodayStatus();
      } else {
        setActionError(res.message || 'Failed to end break.');
      }
    } catch (err: any) {
      setActionError(err.message || 'Failed to end break.');
    } finally {
      setIsPunching(false);
    }
  };

  // Handle Submit Correction Request
  const handleSubmitCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    setCorrectionError(null);

    if (!correctionReason.trim()) {
      setCorrectionError('Please provide a reason for the attendance correction.');
      return;
    }

    setIsSubmittingCorrection(true);
    try {
      const checkInIso = `${correctionTargetDate}T${requestedCheckInTime}:00.000Z`;
      const checkOutIso = `${correctionTargetDate}T${requestedCheckOutTime}:00.000Z`;

      const res = await attendanceApi.submitCorrectionRequest({
        targetDate: correctionTargetDate,
        requestedCheckIn: checkInIso,
        requestedCheckOut: checkOutIso,
        reason: correctionReason.trim(),
      });

      if (res.success) {
        setIsCorrectionModalOpen(false);
        setCorrectionReason('');
        setActionSuccess('Correction request submitted for manager review.');
        await loadHistoryAndCorrections();
      } else {
        setCorrectionError(res.message || 'Failed to submit correction request.');
      }
    } catch (err: any) {
      setCorrectionError(err.message || 'Failed to submit correction request.');
    } finally {
      setIsSubmittingCorrection(false);
    }
  };

  // Status Badge Colors & Labels
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PRESENT':
        return <Badge variant="success">PRESENT</Badge>;
      case 'HALF_DAY':
        return <Badge variant="warning">HALF DAY</Badge>;
      case 'LATE':
        return <Badge variant="warning">LATE</Badge>;
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
      case 'ABSENT':
        return <Badge variant="danger">ABSENT</Badge>;
      default:
        return <Badge variant="default">{status || 'PENDING'}</Badge>;
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-stone-900 flex items-center gap-2">
              <Clock className="h-6 w-6 text-amber-600" /> Attendance Operations
            </h1>
            <p className="text-xs md:text-sm text-stone-500 mt-1">
              Deterministic office check-in, live shift tracking, and verified work hours.
            </p>
          </div>

          {/* Tab Navigation */}
          <div className="flex items-center p-1 bg-stone-100 rounded-xl border border-stone-200 self-start sm:self-auto">
            <button
              onClick={() => setActiveTab('my')}
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'my'
                  ? 'bg-white text-stone-900 shadow-2xs'
                  : 'text-stone-500 hover:text-stone-900'
              }`}
            >
              My Attendance
            </button>
            <button
              onClick={() => setActiveTab('operations')}
              className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                activeTab === 'operations'
                  ? 'bg-white text-stone-900 shadow-2xs'
                  : 'text-stone-500 hover:text-stone-900'
              }`}
            >
              Organization Overview
            </button>
          </div>
        </div>

        {/* Global Feedback Banners */}
        {actionSuccess && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800 animate-fade-in">
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
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-xs text-rose-800 animate-fade-in">
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

        {activeTab === 'my' ? (
          /* =======================================================================
           * MY ATTENDANCE PORTAL (MOBILE-FIRST)
           * ======================================================================= */
          <div className="space-y-6">
            {/* Top Grid: Live Clock & Shift Details */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Card 1: Live Display Clock */}
              <Card className="p-5 flex flex-col justify-between bg-gradient-to-br from-white to-amber-50/40 border-stone-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                    Live System Clock
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Synchronized
                  </span>
                </div>

                <div className="my-3">
                  <div className="text-3xl md:text-4xl font-extrabold tracking-tight font-mono text-stone-900">
                    {currentTime.toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                      hour12: true,
                    })}
                  </div>
                  <div className="text-xs text-stone-600 mt-1 font-medium flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-stone-400" />
                    {currentTime.toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </div>
                </div>

                <div className="text-[11px] text-stone-400 flex items-center justify-between border-t border-stone-100 pt-2">
                  <span>Timezone: {policy?.timezone || 'Asia/Kolkata'}</span>
                  <span>Cutoff: {policy?.workingDayStartHour ?? 5}:00 AM</span>
                </div>
              </Card>

              {/* Card 2: Today's Assigned Shift */}
              <Card className="p-5 flex flex-col justify-between border-stone-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                    Assigned Shift
                  </span>
                  {shift?.isOvernight && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                      <Moon className="h-3 w-3" /> Overnight
                    </span>
                  )}
                </div>

                <div className="my-2">
                  {isLoadingToday ? (
                    <div className="space-y-2 py-2">
                      <Skeleton className="h-6 w-32" />
                      <Skeleton className="h-4 w-48" />
                    </div>
                  ) : shift ? (
                    <>
                      <div className="text-lg font-bold text-stone-900 flex items-center gap-2">
                        <span>{shift.name}</span>
                        <span className="text-xs font-mono font-normal text-stone-400">
                          ({shift.code})
                        </span>
                      </div>
                      <div className="text-sm font-semibold text-amber-700 mt-1 flex items-center gap-1.5">
                        <Clock className="h-4 w-4" />
                        {shift.startTime} – {shift.endTime}
                      </div>
                      <div className="text-xs text-stone-500 mt-2 flex flex-wrap gap-2">
                        <span className="bg-stone-100 px-2 py-0.5 rounded text-[11px]">
                          Grace: {policy?.gracePeriodMinutes ?? 15}m
                        </span>
                        <span className="bg-stone-100 px-2 py-0.5 rounded text-[11px]">
                          Break: {shift.breakDurationMinutes ?? 60}m
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="py-2 text-stone-500 text-sm">
                      <p className="font-medium text-stone-700">No Shift Assigned</p>
                      <p className="text-xs text-stone-400 mt-0.5">
                        Default organizational timing applies.
                      </p>
                    </div>
                  )}
                </div>

                <div className="text-[11px] text-stone-400 border-t border-stone-100 pt-2 flex items-center justify-between">
                  <span>
                    Standard Work:{' '}
                    {policy?.standardWorkMinutes ? policy.standardWorkMinutes / 60 : 8}h
                  </span>
                  <span>
                    Full Day Min:{' '}
                    {policy?.fullDayThresholdMinutes ? policy.fullDayThresholdMinutes / 60 : 7}h
                  </span>
                </div>
              </Card>

              {/* Card 3: Assigned Office & Location State */}
              <Card className="p-5 flex flex-col justify-between border-stone-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-stone-500 uppercase tracking-wider">
                    Office Geofence
                  </span>
                  <button
                    onClick={verifyCurrentLocation}
                    disabled={isAcquiring}
                    title="Verify GPS location relative to office"
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 hover:text-amber-800 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3 w-3 ${isAcquiring ? 'animate-spin' : ''}`} />
                    Verify
                  </button>
                </div>

                <div className="my-2">
                  {isLoadingToday ? (
                    <div className="space-y-2 py-2">
                      <Skeleton className="h-5 w-40" />
                      <Skeleton className="h-4 w-48" />
                    </div>
                  ) : office ? (
                    <>
                      <div className="text-base font-bold text-stone-900 flex items-center gap-1.5">
                        <Building className="h-4 w-4 text-stone-500" />
                        <span>{office.name}</span>
                      </div>
                      <div className="text-xs text-stone-500 mt-1 flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 text-stone-400 shrink-0" />
                        <span className="truncate">Radius: {office.geofenceRadiusMeters}m</span>
                      </div>
                      <div className="mt-2">
                        {locationVerification.status === 'VERIFYING' && (
                          <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 font-medium">
                            <RefreshCw className="h-3 w-3 animate-spin" /> Verifying GPS...
                          </span>
                        )}
                        {locationVerification.status === 'VERIFIED' && (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            <ShieldCheck className="h-3.5 w-3.5" /> Inside Perimeter
                          </span>
                        )}
                        {locationVerification.status === 'OUTSIDE_GEOFENCE' && (
                          <span className="inline-flex items-center gap-1 text-xs text-rose-700 font-bold bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                            <ShieldAlert className="h-3.5 w-3.5" />{' '}
                            {locationVerification.distanceMeters}m away
                          </span>
                        )}
                        {locationVerification.status === 'ERROR' && (
                          <span className="inline-flex items-center gap-1 text-xs text-rose-600 font-medium">
                            <AlertCircle className="h-3.5 w-3.5" /> GPS Unavailable
                          </span>
                        )}
                        {locationVerification.status === 'UNVERIFIED' && (
                          <span className="inline-flex items-center gap-1 text-xs text-stone-500">
                            <Compass className="h-3.5 w-3.5 text-stone-400" /> Ready to verify
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="py-2 text-stone-500 text-xs">
                      No office location assigned to your profile.
                    </div>
                  )}
                </div>

                <div className="text-[11px] text-stone-400 border-t border-stone-100 pt-2 flex items-center justify-between">
                  <span>Enforcement: {policy?.geofenceEnforcement ? 'Strict' : 'Exempt'}</span>
                  <button
                    onClick={() => setShowGeoExplainer(true)}
                    className="underline hover:text-stone-600 text-[11px]"
                  >
                    Privacy & GPS info
                  </button>
                </div>
              </Card>
            </div>

            {/* Main Interactive Attendance Hub (Mobile-First) */}
            <Card className="p-6 md:p-8 border-stone-200 shadow-xs bg-white">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                {/* Left: Active Working Time & Session State */}
                <div className="flex flex-col sm:flex-row items-center gap-6 w-full md:w-auto text-center sm:text-left">
                  {/* Status Indicator Disc */}
                  <div className="relative">
                    <div
                      className={`h-24 w-24 rounded-full flex flex-col items-center justify-center border-4 ${
                        currentStatus.isOnBreak
                          ? 'bg-amber-50 border-amber-400 text-amber-800'
                          : currentStatus.isCheckedIn
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
                            : 'bg-stone-100 border-stone-300 text-stone-600'
                      }`}
                    >
                      {currentStatus.isOnBreak ? (
                        <Coffee className="h-8 w-8 text-amber-600 animate-bounce" />
                      ) : currentStatus.isCheckedIn ? (
                        <Check className="h-8 w-8 text-emerald-600" />
                      ) : (
                        <Clock className="h-8 w-8 text-stone-400" />
                      )}
                      <span className="text-[10px] font-bold uppercase tracking-wider mt-1">
                        {currentStatus.isOnBreak
                          ? 'ON BREAK'
                          : currentStatus.isCheckedIn
                            ? 'ACTIVE'
                            : 'IDLE'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 justify-center sm:justify-start">
                      <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                        Current Session Status
                      </span>
                      {currentStatus.isCheckedIn && !currentStatus.isOnBreak && (
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                      )}
                    </div>
                    <div className="text-2xl md:text-3xl font-extrabold text-stone-900 mt-1">
                      {currentStatus.isOnBreak
                        ? 'On Official Break'
                        : currentStatus.isCheckedIn
                          ? 'Clocked In & Working'
                          : 'Not Checked In'}
                    </div>

                    <div className="text-xs text-stone-500 mt-1.5 flex flex-wrap items-center justify-center sm:justify-start gap-3">
                      {activeSession?.checkInTime && (
                        <span>
                          Check-In:{' '}
                          <strong className="text-stone-800 font-mono">
                            {new Date(activeSession.checkInTime).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </strong>
                        </span>
                      )}
                      {activeSession?.sessionNumber && (
                        <span>
                          Session: <strong>#{activeSession.sessionNumber}</strong>
                        </span>
                      )}
                      {summary?.status && (
                        <span>
                          Today Status: <strong>{getStatusBadge(summary.status)}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Primary Action Controls */}
                <div className="w-full md:w-auto flex flex-col sm:flex-row items-center gap-3">
                  {!currentStatus.isCheckedIn ? (
                    <Button
                      size="lg"
                      disabled={isPunching || isAcquiring}
                      onClick={handleCheckIn}
                      className="w-full sm:w-auto px-8 py-4 text-base font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md hover:shadow-lg transition-all rounded-xl"
                    >
                      {isPunching ? (
                        <>
                          <RefreshCw className="h-5 w-5 mr-2 animate-spin" /> Verifying &
                          Punching...
                        </>
                      ) : (
                        <>
                          <LogIn className="h-5 w-5 mr-2" /> Check In Now
                        </>
                      )}
                    </Button>
                  ) : (
                    <>
                      {currentStatus.isOnBreak ? (
                        <Button
                          size="lg"
                          disabled={isPunching}
                          onClick={handleEndBreak}
                          className="w-full sm:w-auto px-6 py-3.5 font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-sm"
                        >
                          {isPunching ? (
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Coffee className="h-4 w-4 mr-2" />
                          )}
                          End Break
                        </Button>
                      ) : (
                        <Button
                          size="lg"
                          variant="secondary"
                          disabled={isPunching}
                          onClick={handleStartBreak}
                          className="w-full sm:w-auto px-5 py-3.5 font-semibold border-stone-300 text-stone-700 hover:bg-stone-50 rounded-xl"
                        >
                          {isPunching ? (
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Coffee className="h-4 w-4 mr-2 text-amber-600" />
                          )}
                          Take Break
                        </Button>
                      )}

                      <Button
                        size="lg"
                        disabled={isPunching}
                        onClick={handleCheckOut}
                        className="w-full sm:w-auto px-6 py-3.5 font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-sm"
                      >
                        {isPunching ? (
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <LogOut className="h-4 w-4 mr-2" />
                        )}
                        Check Out
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Working-Time Summary Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8 pt-6 border-t border-stone-100">
                <div className="p-3.5 bg-stone-50 rounded-xl">
                  <span className="text-[11px] font-medium text-stone-500 uppercase tracking-wider block">
                    Gross Time
                  </span>
                  <div className="text-xl font-bold font-mono text-stone-900 mt-1">
                    {formatMinutes(elapsedWorkMinutes + (summary?.totalBreakMinutes || 0))}
                  </div>
                  <span className="text-[10px] text-stone-400">Total elapsed hours</span>
                </div>

                <div className="p-3.5 bg-stone-50 rounded-xl">
                  <span className="text-[11px] font-medium text-stone-500 uppercase tracking-wider block">
                    Break Duration
                  </span>
                  <div className="text-xl font-bold font-mono text-stone-900 mt-1">
                    {formatMinutes(summary?.totalBreakMinutes || 0)}
                  </div>
                  <span className="text-[10px] text-stone-400">
                    Allowed: {policy?.maxDailyBreakMinutes || 60}m
                  </span>
                </div>

                <div className="p-3.5 bg-stone-50 rounded-xl">
                  <span className="text-[11px] font-medium text-stone-500 uppercase tracking-wider block">
                    Net Working Time
                  </span>
                  <div className="text-xl font-bold font-mono text-emerald-700 mt-1">
                    {formatMinutes(elapsedWorkMinutes)}
                  </div>
                  <span className="text-[10px] text-stone-400">
                    Target: {formatMinutes(policy?.fullDayThresholdMinutes || 420)}
                  </span>
                </div>

                <div className="p-3.5 bg-stone-50 rounded-xl">
                  <span className="text-[11px] font-medium text-stone-500 uppercase tracking-wider block">
                    Shift Adherence
                  </span>
                  <div className="text-lg font-bold text-stone-900 mt-1">
                    {summary?.lateMinutes && summary.lateMinutes > 0 ? (
                      <span className="text-amber-700">{summary.lateMinutes}m Late</span>
                    ) : (
                      <span className="text-emerald-700">On Time</span>
                    )}
                  </div>
                  <span className="text-[10px] text-stone-400">
                    OT: {summary?.overtimeMinutes || 0}m
                  </span>
                </div>
              </div>
            </Card>

            {/* Attendance History & Regularization Requests */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                    <History className="h-5 w-5 text-stone-600" /> Attendance History (Past 30 Days)
                  </h3>
                  <p className="text-xs text-stone-500">
                    Daily summaries, hours recorded, and attendance regularization requests.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setIsCorrectionModalOpen(true)}
                  className="self-start sm:self-auto border-stone-300 text-stone-700"
                >
                  <FileEdit className="h-3.5 w-3.5 mr-1.5 text-amber-700" /> Request Correction
                </Button>
              </div>

              {isLoadingHistory ? (
                <div className="space-y-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : historyData.length === 0 ? (
                <Card className="p-8 text-center text-stone-500 text-xs border-dashed border-stone-300">
                  No historical records found for this employee profile yet.
                </Card>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
                  <table className="w-full text-left text-xs text-stone-700">
                    <thead className="bg-stone-50 text-[11px] font-semibold uppercase tracking-wider text-stone-500 border-b border-stone-200">
                      <tr>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">First Punch</th>
                        <th className="py-3 px-4">Last Punch</th>
                        <th className="py-3 px-4">Net Hours</th>
                        <th className="py-3 px-4">Late / OT</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 font-medium">
                      {historyData.map((item: any) => (
                        <tr key={item.id} className="hover:bg-stone-50/70 transition-colors">
                          <td className="py-3.5 px-4 font-semibold text-stone-900 whitespace-nowrap">
                            {item.dateStr}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {getStatusBadge(item.status)}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-stone-600 whitespace-nowrap">
                            {item.firstCheckIn
                              ? new Date(item.firstCheckIn).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '—'}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-stone-600 whitespace-nowrap">
                            {item.lastCheckOut
                              ? new Date(item.lastCheckOut).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '—'}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap font-mono text-stone-800">
                            {item.netHours} hrs ({item.totalWorkMinutes}m)
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap text-stone-500">
                            {item.lateMinutes > 0 && (
                              <span className="text-amber-700 mr-2">{item.lateMinutes}m Late</span>
                            )}
                            {item.overtimeMinutes > 0 && (
                              <span className="text-emerald-700">+{item.overtimeMinutes}m OT</span>
                            )}
                            {item.lateMinutes === 0 && item.overtimeMinutes === 0 && '—'}
                          </td>
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <button
                              onClick={() => {
                                setCorrectionTargetDate(item.dateStr);
                                setIsCorrectionModalOpen(true);
                              }}
                              className="text-[11px] font-semibold text-amber-700 hover:text-amber-800 hover:underline"
                            >
                              Regularize
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Submitted Correction Requests Drawer / Section */}
            {correctionsList.length > 0 && (
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                  Your Recent Regularization Requests
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {correctionsList.map((req: any) => (
                    <Card key={req.id} className="p-4 border-stone-200 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-stone-900">
                          Date: {req.targetDate ? req.targetDate.split('T')[0] : '—'}
                        </span>
                        <Badge
                          variant={
                            req.status === 'APPROVED'
                              ? 'success'
                              : req.status === 'REJECTED'
                                ? 'danger'
                                : 'warning'
                          }
                          size="sm"
                        >
                          {req.status}
                        </Badge>
                      </div>
                      <p className="text-stone-600 mt-2 text-xs">
                        <strong>Reason:</strong> {req.reason}
                      </p>
                      {req.decision && (
                        <div className="mt-2 pt-2 border-t border-stone-100 text-[11px] text-stone-500">
                          <strong>Decision Notes:</strong> {req.decision.reviewNotes || 'Reviewed'}
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* =======================================================================
           * ORGANIZATION OVERVIEW TAB (ADMIN / MANAGERS)
           * ======================================================================= */
          <HRAttendanceDashboard onRefreshNeeded={loadTodayStatus} />
        )}
      </div>

      {/* Geolocation Explainer Modal */}
      <Dialog
        isOpen={showGeoExplainer}
        onClose={() => setShowGeoExplainer(false)}
        title="Location Verification & Privacy Policy"
        maxWidth="md"
      >
        <div className="space-y-4 text-xs text-stone-600 leading-relaxed">
          <p>
            The HRMS attendance system uses <strong>high-accuracy client-side GPS</strong> solely
            during the moment you initiate a <strong>Check-In</strong>, <strong>Check-Out</strong>,
            or click <strong>Verify Location</strong>.
          </p>
          <div className="bg-stone-50 p-3 rounded-lg border border-stone-200 space-y-2">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <strong>No Continuous Tracking:</strong> Your device is NEVER tracked in the
                background. Location coordinates are only polled when you tap an action button.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <strong>Geofence Verification:</strong> The server computes mathematical Haversine
                distance from your assigned branch office without calling third-party map APIs.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <strong>Accuracy Standards:</strong> Mobile GPS coordinates must be within 100
                meters horizontal accuracy to protect against location spoofing or cell-tower
                errors.
              </span>
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <Button size="sm" onClick={() => setShowGeoExplainer(false)}>
              Got it
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Attendance Regularization / Correction Request Modal */}
      <Dialog
        isOpen={isCorrectionModalOpen}
        onClose={() => setIsCorrectionModalOpen(false)}
        title="Request Attendance Correction"
        maxWidth="md"
      >
        <form onSubmit={handleSubmitCorrection} className="space-y-4 text-xs">
          {correctionError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{correctionError}</span>
            </div>
          )}

          <div>
            <label className="font-semibold text-stone-700 block mb-1">Target Working Date</label>
            <input
              type="date"
              required
              value={correctionTargetDate}
              onChange={(e) => setCorrectionTargetDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-stone-900 font-mono text-xs focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-stone-700 block mb-1">Requested Check-In</label>
              <input
                type="time"
                value={requestedCheckInTime}
                onChange={(e) => setRequestedCheckInTime(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 text-stone-900 font-mono text-xs focus:ring-1 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="font-semibold text-stone-700 block mb-1">Requested Check-Out</label>
              <input
                type="time"
                value={requestedCheckOutTime}
                onChange={(e) => setRequestedCheckOutTime(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-stone-300 text-stone-900 font-mono text-xs focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="font-semibold text-stone-700 block mb-1">
              Justification & Reason <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={correctionReason}
              onChange={(e) => setCorrectionReason(e.target.value)}
              placeholder="Explain why punch was missed or discrepancy occurred (e.g., GPS network failure, official site visit, forgot to punch)..."
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-stone-900 text-xs focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsCorrectionModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmittingCorrection}
              className="bg-amber-600 hover:bg-amber-700 text-white font-semibold"
            >
              {isSubmittingCorrection ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Submitting...
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5 mr-1.5" /> Submit Request
                </>
              )}
            </Button>
          </div>
        </form>
      </Dialog>
    </AppShell>
  );
}
