'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Badge, Button, Dialog, Skeleton } from '@hrms/ui';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  Clock,
  MapPin,
  RefreshCw,
  Search,
  RotateCcw,
  CheckCircle2,
  Lock,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  UserCheck,
  Calendar,
  X,
  FileText,
  Activity,
  History,
} from 'lucide-react';
import { attendanceApi } from '../../../lib/api-client';
import { AttendanceExceptionType, AttendanceExceptionStatus } from '@hrms/types';

interface HRAttendanceExceptionsQueueProps {
  onRefreshNeeded?: () => void;
  defaultDate?: string;
}

export const HRAttendanceExceptionsQueue: React.FC<HRAttendanceExceptionsQueueProps> = ({
  onRefreshNeeded,
  defaultDate,
}) => {
  // Query Filters
  const [selectedStatus, setSelectedStatus] = useState<string>('OPEN');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [searchEmployee, setSearchEmployee] = useState('');
  const [startDate, setStartDate] = useState(defaultDate || '');
  const [endDate, setEndDate] = useState(defaultDate || '');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Data States
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [paginationMeta, setPaginationMeta] = useState<any>({
    page: 1,
    limit: 15,
    total: 0,
    totalPages: 1,
  });
  const [counts, setCounts] = useState<{
    open: number;
    highSeverity: number;
    resolved: number;
    dismissed: number;
  }>({ open: 0, highSeverity: 0, resolved: 0, dismissed: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Scan Action State
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Resolution Modal State
  const [selectedException, setSelectedException] = useState<any>(null);
  const [isResolutionModalOpen, setIsResolutionModalOpen] = useState(false);
  const [resolutionAction, setResolutionAction] = useState<'RESOLVED' | 'DISMISSED'>('RESOLVED');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [isSubmittingResolution, setIsSubmittingResolution] = useState(false);
  const [resolutionError, setResolutionError] = useState<string | null>(null);
  const [resolutionSuccess, setResolutionSuccess] = useState<string | null>(null);

  // Load Exceptions from API
  const loadExceptions = useCallback(async () => {
    try {
      setIsLoading(true);
      setFetchError(null);
      const res = await attendanceApi.getExceptions({
        status: selectedStatus,
        exceptionType: selectedType,
        severity: selectedSeverity,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        page: currentPage,
        limit: pageSize,
      });

      const items = Array.isArray(res?.data)
        ? res.data
        : Array.isArray(res)
          ? res
          : Array.isArray(res?.data?.data)
            ? res.data.data
            : [];
      setExceptions(items);

      const pagination = res?.meta || res?.pagination || res?.data?.meta || res?.data?.pagination;
      if (pagination) {
        setPaginationMeta(pagination);
      }
      const kpis = res?.counts || res?.data?.counts;
      if (kpis) {
        setCounts(kpis);
      }
    } catch (err: any) {
      setFetchError(err.message || 'Failed to fetch attendance exceptions.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedStatus, selectedType, selectedSeverity, startDate, endDate, currentPage]);

  useEffect(() => {
    loadExceptions();
  }, [loadExceptions]);

  // Handle Scan for selected date
  const handleRunScan = async () => {
    try {
      setIsScanning(true);
      setScanMessage(null);
      const target = startDate || new Date().toISOString().split('T')[0];
      const res = await attendanceApi.scanExceptions(target);
      setScanMessage({
        type: 'success',
        text: `Exception scan completed: ${res.flaggedCount ?? 0} anomaly alert(s) detected and recorded idempotently.`,
      });
      loadExceptions();
      onRefreshNeeded?.();
    } catch (err: any) {
      setScanMessage({
        type: 'error',
        text: err.message || 'Failed to execute exception scan.',
      });
    } finally {
      setIsScanning(false);
    }
  };

  // Open Resolution Modal
  const handleOpenResolveModal = (exc: any) => {
    setSelectedException(exc);
    setResolutionAction(exc.status === 'DISMISSED' ? 'DISMISSED' : 'RESOLVED');
    setResolutionNotes(exc.resolutionNotes || '');
    setResolutionError(null);
    setIsResolutionModalOpen(true);
  };

  // Submit Resolution
  const handleSubmitResolution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedException) return;
    if (!resolutionNotes.trim()) {
      setResolutionError('Resolution notes are required for compliance and audit traceability.');
      return;
    }

    try {
      setIsSubmittingResolution(true);
      setResolutionError(null);
      await attendanceApi.resolveException(selectedException.id, {
        status: resolutionAction,
        resolutionNotes: resolutionNotes.trim(),
      });

      setResolutionSuccess(
        `Exception marked as ${resolutionAction} successfully. Audit event recorded and employee notified.`,
      );
      setIsResolutionModalOpen(false);
      loadExceptions();
      onRefreshNeeded?.();
    } catch (err: any) {
      setResolutionError(
        err.message || 'Failed to submit exception resolution. Please verify current status.',
      );
    } finally {
      setIsSubmittingResolution(false);
    }
  };

  const handleResetFilters = () => {
    setSelectedStatus('OPEN');
    setSelectedType('ALL');
    setSelectedSeverity('ALL');
    setSearchEmployee('');
    setStartDate(defaultDate || '');
    setEndDate(defaultDate || '');
    setCurrentPage(1);
  };

  // Filter exceptions by search input client-side for immediate responsiveness
  const filteredExceptions = useMemo(() => {
    if (!searchEmployee.trim()) return exceptions;
    const term = searchEmployee.toLowerCase();
    return exceptions.filter((item) => {
      const code = item.employee?.employeeCode?.toLowerCase() || '';
      const name = item.employee?.displayName?.toLowerCase() || '';
      const email = item.employee?.user?.email?.toLowerCase() || '';
      return code.includes(term) || name.includes(term) || email.includes(term);
    });
  }, [exceptions, searchEmployee]);

  // Helper for category badge styling
  const renderCategoryBadge = (type: string) => {
    switch (type) {
      case 'MISSING_CHECKOUT':
        return (
          <Badge variant="warning" className="flex items-center gap-1 font-semibold text-[11px]">
            <Clock className="h-3 w-3" /> Missing Check-Out
          </Badge>
        );
      case 'LATE_ARRIVAL':
        return (
          <Badge variant="warning" className="flex items-center gap-1 font-semibold text-[11px]">
            <AlertTriangle className="h-3 w-3" /> Late Arrival
          </Badge>
        );
      case 'EARLY_DEPARTURE':
        return (
          <Badge variant="warning" className="flex items-center gap-1 font-semibold text-[11px]">
            <Clock className="h-3 w-3" /> Early Departure
          </Badge>
        );
      case 'OUTSIDE_GEOFENCE':
        return (
          <Badge variant="danger" className="flex items-center gap-1 font-semibold text-[11px]">
            <MapPin className="h-3 w-3" /> Geofence Breach
          </Badge>
        );
      case 'LOW_GPS_ACCURACY':
        return (
          <Badge variant="warning" className="flex items-center gap-1 font-semibold text-[11px]">
            <Activity className="h-3 w-3" /> Low GPS Accuracy
          </Badge>
        );
      case 'INVALID_STATE':
        return (
          <Badge variant="purple" className="flex items-center gap-1 font-semibold text-[11px]">
            <AlertCircle className="h-3 w-3" /> Invalid State
          </Badge>
        );
      case 'PENDING_CORRECTION':
        return (
          <Badge variant="info" className="flex items-center gap-1 font-semibold text-[11px]">
            <FileText className="h-3 w-3" /> Pending Regularization
          </Badge>
        );
      case 'SUSPICIOUS_REPEATED_ATTEMPTS':
        return (
          <Badge variant="danger" className="flex items-center gap-1 font-semibold text-[11px]">
            <ShieldAlert className="h-3 w-3" /> Suspicious Rapid Punches
          </Badge>
        );
      default:
        return <Badge variant="default">{type}</Badge>;
    }
  };

  const renderSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'HIGH':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
            HIGH
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
            MEDIUM
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200">
            LOW
          </span>
        );
    }
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return (
          <Badge variant="danger" className="flex items-center gap-1 font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
            OPEN
          </Badge>
        );
      case 'RESOLVED':
        return (
          <Badge variant="success" className="flex items-center gap-1 font-semibold">
            <CheckCircle2 className="h-3 w-3" /> RESOLVED
          </Badge>
        );
      case 'DISMISSED':
        return (
          <Badge variant="default" className="flex items-center gap-1 font-semibold text-stone-600">
            DISMISSED
          </Badge>
        );
      default:
        return <Badge variant="default">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header Banner & Actions */}
      <div className="p-4 md:p-5 rounded-xl border border-stone-200 bg-gradient-to-r from-stone-50 via-white to-rose-50/20 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-rose-100 text-rose-700 rounded-lg">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base md:text-lg font-bold text-stone-900 tracking-tight flex items-center gap-2">
                Attendance Exceptions Queue
                <span className="text-xs font-mono font-medium text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full">
                  {counts.open} Open
                </span>
              </h2>
              <p className="text-xs text-stone-500 mt-0.5">
                Deterministic anomaly detection for missed checkouts, geofence breaches, late
                arrivals, and suspicious punch sequences.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch md:self-auto justify-end flex-wrap">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleRunScan}
            disabled={isScanning}
            className="border-stone-200 text-amber-800 hover:bg-amber-50 text-xs font-medium"
          >
            <Sparkles className={`h-3.5 w-3.5 mr-1.5 ${isScanning ? 'animate-spin' : ''}`} />
            {isScanning ? 'Scanning Anomalies...' : 'Run Exception Scan'}
          </Button>

          <Button
            size="sm"
            variant="secondary"
            onClick={loadExceptions}
            disabled={isLoading}
            className="border-stone-200 text-stone-700 hover:bg-stone-50 text-xs font-medium"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Global Alerts / Messages */}
      {scanMessage && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs animate-fade-in ${
            scanMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {scanMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            )}
            <span>{scanMessage.text}</span>
          </div>
          <button onClick={() => setScanMessage(null)} className="font-bold hover:opacity-80">
            ×
          </button>
        </div>
      )}

      {resolutionSuccess && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center justify-between text-xs animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{resolutionSuccess}</span>
          </div>
          <button onClick={() => setResolutionSuccess(null)} className="font-bold hover:opacity-80">
            ×
          </button>
        </div>
      )}

      {fetchError && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{fetchError}</span>
          </div>
          <button onClick={() => setFetchError(null)} className="font-bold hover:opacity-80">
            ×
          </button>
        </div>
      )}

      {/* 2. KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <Card
          className={`p-4 border-stone-200 cursor-pointer transition-all ${
            selectedStatus === 'OPEN'
              ? 'ring-2 ring-rose-500 bg-rose-50/20'
              : 'hover:border-stone-300'
          }`}
          onClick={() => {
            setSelectedStatus('OPEN');
            setCurrentPage(1);
          }}
        >
          <div className="flex items-center justify-between text-xs text-stone-500 mb-1">
            <span>Open Exceptions</span>
            <span className="p-1.5 rounded-lg bg-rose-100 text-rose-700">
              <ShieldAlert className="h-4 w-4" />
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-stone-900">{counts.open}</div>
          <span className="text-[11px] text-rose-600 font-medium">Requires HR investigation</span>
        </Card>

        <Card
          className={`p-4 border-stone-200 cursor-pointer transition-all ${
            selectedSeverity === 'HIGH'
              ? 'ring-2 ring-amber-500 bg-amber-50/20'
              : 'hover:border-stone-300'
          }`}
          onClick={() => {
            setSelectedSeverity(selectedSeverity === 'HIGH' ? 'ALL' : 'HIGH');
            setCurrentPage(1);
          }}
        >
          <div className="flex items-center justify-between text-xs text-stone-500 mb-1">
            <span>High Severity</span>
            <span className="p-1.5 rounded-lg bg-rose-100 text-rose-700">
              <AlertTriangle className="h-4 w-4" />
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-stone-900">{counts.highSeverity}</div>
          <span className="text-[11px] text-stone-500 font-medium">
            Geofence / rapid punch breach
          </span>
        </Card>

        <Card
          className={`p-4 border-stone-200 cursor-pointer transition-all ${
            selectedStatus === 'RESOLVED'
              ? 'ring-2 ring-emerald-500 bg-emerald-50/20'
              : 'hover:border-stone-300'
          }`}
          onClick={() => {
            setSelectedStatus('RESOLVED');
            setCurrentPage(1);
          }}
        >
          <div className="flex items-center justify-between text-xs text-stone-500 mb-1">
            <span>Resolved</span>
            <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-stone-900">{counts.resolved}</div>
          <span className="text-[11px] text-emerald-600 font-medium">
            Audited & approved adjustments
          </span>
        </Card>

        <Card
          className={`p-4 border-stone-200 cursor-pointer transition-all ${
            selectedStatus === 'DISMISSED'
              ? 'ring-2 ring-stone-400 bg-stone-50'
              : 'hover:border-stone-300'
          }`}
          onClick={() => {
            setSelectedStatus('DISMISSED');
            setCurrentPage(1);
          }}
        >
          <div className="flex items-center justify-between text-xs text-stone-500 mb-1">
            <span>Dismissed</span>
            <span className="p-1.5 rounded-lg bg-stone-100 text-stone-600">
              <UserCheck className="h-4 w-4" />
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-stone-900">{counts.dismissed}</div>
          <span className="text-[11px] text-stone-500 font-medium">
            Excused anomalies & false flags
          </span>
        </Card>
      </div>

      {/* 3. Filter Bar */}
      <Card className="p-4 border-stone-200 shadow-2xs space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Employee Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-stone-400" />
            <input
              type="text"
              placeholder="Search employee by name, code or email..."
              value={searchEmployee}
              onChange={(e) => setSearchEmployee(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-stone-200 bg-white placeholder-stone-400 text-stone-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          {/* Filters Selectors */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Status */}
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 text-xs rounded-lg border border-stone-200 bg-white text-stone-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="OPEN">Open Exceptions</option>
              <option value="RESOLVED">Resolved</option>
              <option value="DISMISSED">Dismissed</option>
            </select>

            {/* Category / Type */}
            <select
              value={selectedType}
              onChange={(e) => {
                setSelectedType(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 text-xs rounded-lg border border-stone-200 bg-white text-stone-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="ALL">All Exception Types</option>
              <option value="MISSING_CHECKOUT">Missing Check-Out</option>
              <option value="LATE_ARRIVAL">Late Arrival</option>
              <option value="EARLY_DEPARTURE">Early Departure</option>
              <option value="OUTSIDE_GEOFENCE">Geofence Breach</option>
              <option value="LOW_GPS_ACCURACY">Low GPS Accuracy</option>
              <option value="INVALID_STATE">Invalid State Punch</option>
              <option value="PENDING_CORRECTION">Pending Regularization</option>
              <option value="SUSPICIOUS_REPEATED_ATTEMPTS">Suspicious Rapid Punches</option>
            </select>

            {/* Severity */}
            <select
              value={selectedSeverity}
              onChange={(e) => {
                setSelectedSeverity(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 text-xs rounded-lg border border-stone-200 bg-white text-stone-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
            >
              <option value="ALL">All Severities</option>
              <option value="HIGH">High Severity</option>
              <option value="MEDIUM">Medium Severity</option>
              <option value="LOW">Low Severity</option>
            </select>

            {/* Date Pickers */}
            <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-lg border border-stone-200 text-xs">
              <span className="text-[10px] text-stone-400">Date:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="text-xs text-stone-800 bg-transparent focus:outline-none font-mono"
              />
            </div>

            {(selectedStatus !== 'ALL' ||
              selectedType !== 'ALL' ||
              selectedSeverity !== 'ALL' ||
              searchEmployee ||
              startDate) && (
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

      {/* 4. Exceptions Table & Queue */}
      <Card className="border-stone-200 overflow-hidden shadow-2xs">
        <div className="p-4 border-b border-stone-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-stone-900">Flagged Exceptions</h3>
            <span className="text-xs text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full font-mono">
              {paginationMeta.total} records
            </span>
          </div>

          <div className="text-xs text-stone-500">
            Page {paginationMeta.page} of {Math.max(1, paginationMeta.totalPages)}
          </div>
        </div>

        {isLoading ? (
          <div className="p-6 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-4">
                <Skeleton className="h-10 w-48 rounded" />
                <Skeleton className="h-6 w-28 rounded" />
                <Skeleton className="h-6 w-20 rounded" />
                <Skeleton className="h-6 w-32 rounded" />
                <Skeleton className="h-8 w-24 rounded" />
              </div>
            ))}
          </div>
        ) : filteredExceptions.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="mx-auto w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-bold text-stone-900">No Exceptions Found</h4>
            <p className="text-xs text-stone-500 max-w-sm mx-auto">
              No attendance anomalies match the selected filters. All punches adhere to geofence,
              accuracy, and schedule policies.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-stone-600">
              <thead className="bg-stone-50 text-[11px] font-semibold text-stone-500 uppercase tracking-wider border-b border-stone-200">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Exception Category</th>
                  <th className="py-3 px-4">Severity</th>
                  <th className="py-3 px-4">Trigger / Context Details</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Detected At</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredExceptions.map((exc) => {
                  const details = exc.details || {};
                  return (
                    <tr key={exc.id} className="hover:bg-stone-50/70 transition-colors">
                      {/* Employee Column */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center font-bold text-stone-700 text-xs shrink-0">
                            {exc.employee?.displayName
                              ? exc.employee.displayName.substring(0, 2).toUpperCase()
                              : 'EM'}
                          </div>
                          <div>
                            <div className="font-semibold text-stone-900">
                              {exc.employee?.displayName || 'Unknown Employee'}
                            </div>
                            <div className="text-[11px] text-stone-400 font-mono">
                              {exc.employee?.employeeCode || 'No Code'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Exception Category */}
                      <td className="py-3.5 px-4">{renderCategoryBadge(exc.exceptionType)}</td>

                      {/* Severity */}
                      <td className="py-3.5 px-4">{renderSeverityBadge(exc.severity)}</td>

                      {/* Context / Trigger Details */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="space-y-1">
                          {details.lateMinutes !== undefined && (
                            <div className="text-[11px] text-stone-800 font-medium">
                              Late arrival by{' '}
                              <span className="font-bold text-amber-700 font-mono">
                                {details.lateMinutes} mins
                              </span>
                            </div>
                          )}
                          {details.earlyMinutes !== undefined && (
                            <div className="text-[11px] text-stone-800 font-medium">
                              Departed early by{' '}
                              <span className="font-bold text-amber-700 font-mono">
                                {details.earlyMinutes} mins
                              </span>
                            </div>
                          )}
                          {details.distanceMeters !== undefined && (
                            <div className="text-[11px] text-stone-800 font-medium flex items-center gap-1">
                              <MapPin className="h-3 w-3 text-rose-500 shrink-0" />
                              <span>
                                Distance:{' '}
                                <span className="font-bold text-rose-700 font-mono">
                                  {details.distanceMeters}m
                                </span>{' '}
                                from {details.branchName || 'office'}
                              </span>
                            </div>
                          )}
                          {details.accuracyMeters !== undefined && (
                            <div className="text-[11px] text-stone-800 font-medium">
                              GPS Accuracy:{' '}
                              <span className="font-mono">{details.accuracyMeters}m</span>{' '}
                              (Required: &le;100m)
                            </div>
                          )}
                          {details.elapsedSeconds !== undefined && (
                            <div className="text-[11px] text-rose-700 font-medium">
                              Repeated punch in{' '}
                              <span className="font-bold font-mono">{details.elapsedSeconds}s</span>
                            </div>
                          )}
                          {details.reason && (
                            <div className="text-[11px] text-stone-500 italic truncate">
                              "{details.reason}"
                            </div>
                          )}
                          {details.reasonCategory && (
                            <div className="text-[10px] text-stone-400">
                              Category: {details.reasonCategory}
                            </div>
                          )}
                          {exc.resolutionNotes && (
                            <div className="text-[11px] text-emerald-800 bg-emerald-50/70 p-1 rounded border border-emerald-100 mt-1">
                              <strong>Decision note:</strong> {exc.resolutionNotes}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">{renderStatusBadge(exc.status)}</td>

                      {/* Detected At */}
                      <td className="py-3.5 px-4 font-mono text-[11px] text-stone-500 whitespace-nowrap">
                        {new Date(exc.createdAt).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                        })}{' '}
                        {new Date(exc.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <Button
                          size="sm"
                          variant={exc.status === 'OPEN' ? 'primary' : 'secondary'}
                          onClick={() => handleOpenResolveModal(exc)}
                          className={`text-xs h-7 px-3 font-semibold ${
                            exc.status === 'OPEN'
                              ? 'bg-amber-600 hover:bg-amber-700 text-white'
                              : 'text-stone-700 hover:bg-stone-100'
                          }`}
                        >
                          {exc.status === 'OPEN' ? 'Review & Resolve' : 'View Decision'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination controls */}
        {paginationMeta.totalPages > 1 && (
          <div className="p-3.5 bg-stone-50 border-t border-stone-200 flex items-center justify-between text-xs text-stone-600">
            <div>
              Showing {(paginationMeta.page - 1) * pageSize + 1} to{' '}
              {Math.min(paginationMeta.page * pageSize, paginationMeta.total)} of{' '}
              {paginationMeta.total} exceptions
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="secondary"
                disabled={paginationMeta.page <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="h-7 w-7 p-0"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="px-2 font-mono">
                {paginationMeta.page} / {paginationMeta.totalPages}
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={paginationMeta.page >= paginationMeta.totalPages}
                onClick={() => setCurrentPage((p) => Math.min(paginationMeta.totalPages, p + 1))}
                className="h-7 w-7 p-0"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* 5. Resolution Dialog Modal */}
      <Dialog
        isOpen={isResolutionModalOpen}
        onClose={() => setIsResolutionModalOpen(false)}
        title="Attendance Exception Resolution"
        maxWidth="md"
      >
        {selectedException && (
          <form onSubmit={handleSubmitResolution} className="space-y-4 text-xs">
            {resolutionError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{resolutionError}</span>
              </div>
            )}

            {/* Exception Overview Box */}
            <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-stone-400 font-semibold uppercase tracking-wider block">
                    Employee
                  </span>
                  <span className="font-bold text-stone-900 text-sm">
                    {selectedException.employee?.displayName}
                  </span>
                  <span className="text-stone-500 font-mono ml-1.5">
                    ({selectedException.employee?.employeeCode})
                  </span>
                </div>
                <div>{renderCategoryBadge(selectedException.exceptionType)}</div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-stone-200/60 text-[11px]">
                <div>
                  <span className="text-stone-400 block">Severity:</span>
                  <span className="font-bold text-stone-800">{selectedException.severity}</span>
                </div>
                <div>
                  <span className="text-stone-400 block">Idempotency Trace:</span>
                  <span className="font-mono text-stone-600 truncate block">
                    {selectedException.idempotencyKey || 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {/* Privacy Guarantee Note */}
            <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-lg text-[11px] text-amber-800 flex items-start gap-2">
              <Lock className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
              <span>
                <strong>Zero-Trust Privacy:</strong> Raw GPS coordinates, passwords, and tokens are
                strictly excluded from audit records. Only relative distance and compliance flags
                are logged.
              </span>
            </div>

            {/* Decision Radio Group */}
            <div>
              <label className="font-semibold text-stone-800 block mb-1.5">Resolution Action</label>
              <div className="grid grid-cols-2 gap-3">
                <label
                  className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                    resolutionAction === 'RESOLVED'
                      ? 'border-emerald-500 bg-emerald-50/40 text-emerald-900 ring-1 ring-emerald-500'
                      : 'border-stone-200 hover:bg-stone-50 text-stone-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="decisionAction"
                    value="RESOLVED"
                    checked={resolutionAction === 'RESOLVED'}
                    onChange={() => setResolutionAction('RESOLVED')}
                    className="accent-emerald-600"
                  />
                  <div>
                    <span className="font-bold text-xs block">Resolve Exception</span>
                    <span className="text-[10px] text-stone-500">
                      Validated and resolved with adjustments
                    </span>
                  </div>
                </label>

                <label
                  className={`p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                    resolutionAction === 'DISMISSED'
                      ? 'border-stone-500 bg-stone-100 text-stone-900 ring-1 ring-stone-500'
                      : 'border-stone-200 hover:bg-stone-50 text-stone-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="decisionAction"
                    value="DISMISSED"
                    checked={resolutionAction === 'DISMISSED'}
                    onChange={() => setResolutionAction('DISMISSED')}
                    className="accent-stone-600"
                  />
                  <div>
                    <span className="font-bold text-xs block">Dismiss Anomaly</span>
                    <span className="text-[10px] text-stone-500">
                      False alarm, excused or hardware glitch
                    </span>
                  </div>
                </label>
              </div>
            </div>

            {/* Mandatory Notes */}
            <div>
              <label className="font-semibold text-stone-800 block mb-1">
                Resolution Notes <span className="text-rose-500">*</span>
                <span className="text-stone-400 font-normal ml-1">
                  (Required for audit trail & in-app notification)
                </span>
              </label>
              <textarea
                required
                rows={3}
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="e.g. Employee verified client visit on outdoor meeting; excused 15m delay."
                className="w-full px-3 py-2 rounded-lg border border-stone-300 text-stone-900 text-xs focus:ring-1 focus:ring-amber-500 placeholder-stone-400"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setIsResolutionModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSubmittingResolution}
                className="bg-amber-600 hover:bg-amber-700 text-white font-semibold"
              >
                {isSubmittingResolution ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Submit Resolution
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
};
