'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '../../../layouts/AppShell';
import { ProtectedRoute } from '../../../components/auth/ProtectedRoute';
import { useAuth } from '../../../context/AuthContext';
import { apiClient } from '../../../lib/api-client';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Button,
  Dialog,
} from '@hrms/ui';
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Search,
  Filter,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  Info,
  User,
  Building,
  Calendar,
  FileSpreadsheet,
  Check,
  X,
  ExternalLink,
  RotateCcw,
} from 'lucide-react';
import {
  PayrollExceptionSeverity,
  PayrollExceptionCategory,
  PayrollExceptionStatus,
} from '@hrms/types';

function PayrollExceptionsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRunId = searchParams.get('runId') || '';

  const { hasRole, hasPermission, user } = useAuth();
  const canResolve =
    hasRole('ADMIN') || hasPermission('PAYROLL_MANAGE') || hasPermission('PAYROLL_APPROVE');

  // Filter States
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('OPEN');
  const [runIdFilter, setRunIdFilter] = useState<string>(initialRunId);

  // Data States
  const [isLoading, setIsLoading] = useState(true);
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [summary, setSummary] = useState<{
    total: number;
    blockingErrors: number;
    warnings: number;
    information: number;
    open: number;
    resolved: number;
    overridden: number;
    hasBlockingErrors: boolean;
    canApprove: boolean;
  }>({
    total: 0,
    blockingErrors: 0,
    warnings: 0,
    information: 0,
    open: 0,
    resolved: 0,
    overridden: 0,
    hasBlockingErrors: false,
    canApprove: true,
  });
  const [meta, setMeta] = useState({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [runsList, setRunsList] = useState<any[]>([]);

  // Resolution Modal State
  const [activeException, setActiveException] = useState<any | null>(null);
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [resolveAction, setResolveAction] = useState<
    'OVERRIDE_APPROVED' | 'SOURCE_FIXED' | 'RECALCULATED' | 'DISMISSED'
  >('OVERRIDE_APPROVED');
  const [resolveNotes, setResolveNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchExceptions = useCallback(async () => {
    try {
      setIsLoading(true);
      const [exRes, sumRes, runsRes] = await Promise.all([
        apiClient.getPayrollExceptions({
          search: search || undefined,
          severity: severityFilter !== 'ALL' ? severityFilter : undefined,
          category: categoryFilter !== 'ALL' ? categoryFilter : undefined,
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
          runId: runIdFilter || undefined,
          page: meta.page,
          limit: meta.limit,
        }),
        apiClient.getPayrollExceptionsSummary(runIdFilter || undefined),
        runsList.length === 0 ? apiClient.getPayrollRuns({ limit: 50 }) : Promise.resolve(null),
      ]);

      if (exRes?.data) {
        setExceptions(exRes.data.data || []);
        if (exRes.data.meta) {
          setMeta(exRes.data.meta);
        }
      }

      if (sumRes?.data?.data) {
        setSummary(sumRes.data.data);
      }

      if (runsRes?.data?.data) {
        setRunsList(runsRes.data.data);
      }
    } catch (err) {
      console.error('Failed to load payroll exceptions:', err);
    } finally {
      setIsLoading(false);
    }
  }, [
    search,
    severityFilter,
    categoryFilter,
    statusFilter,
    runIdFilter,
    meta.page,
    meta.limit,
    runsList.length,
  ]);

  useEffect(() => {
    fetchExceptions();
  }, [fetchExceptions]);

  const handleOpenResolveModal = (ex: any) => {
    setActiveException(ex);
    setResolveAction(ex.severity === 'BLOCKING_ERROR' ? 'OVERRIDE_APPROVED' : 'SOURCE_FIXED');
    setResolveNotes('');
    setActionError(null);
    setIsResolveModalOpen(true);
  };

  const handleResolveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeException) return;

    if (!resolveNotes || resolveNotes.trim().length < 5) {
      setActionError(
        'Resolution notes must be at least 5 characters for statutory audit compliance.',
      );
      return;
    }

    try {
      setIsSubmitting(true);
      setActionError(null);
      await apiClient.resolvePayrollException(activeException.id, {
        action: resolveAction,
        resolutionNotes: resolveNotes.trim(),
      });

      setIsResolveModalOpen(false);
      setActiveException(null);
      await fetchExceptions();
    } catch (err: any) {
      setActionError(err.message || 'Failed to submit resolution. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getSeverityBadge = (severity: PayrollExceptionSeverity) => {
    switch (severity) {
      case 'BLOCKING_ERROR':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-300">
            <ShieldAlert className="w-3.5 h-3.5 text-red-600" />
            BLOCKING ERROR
          </span>
        );
      case 'WARNING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            REVIEW WARNING
          </span>
        );
      case 'INFORMATION':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300">
            <Info className="w-3.5 h-3.5 text-blue-600" />
            INFORMATION
          </span>
        );
    }
  };

  const getStatusBadge = (status: PayrollExceptionStatus) => {
    switch (status) {
      case 'OPEN':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-200">
            <Clock className="w-3 h-3" /> Open
          </span>
        );
      case 'RESOLVED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" /> Resolved
          </span>
        );
      case 'OVERRIDDEN':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
            <ShieldCheck className="w-3 h-3" /> Overridden
          </span>
        );
      case 'DISMISSED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-stone-100 text-stone-600 border border-stone-200">
            <X className="w-3 h-3" /> Dismissed
          </span>
        );
    }
  };

  return (
    <ProtectedRoute requiredPermissions={['PAYROLL_VIEW']}>
      <AppShell>
        <div className="space-y-6 pb-12 max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200 pb-5">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-stone-500 uppercase tracking-wider">
                <Link href="/payroll" className="hover:text-stone-800 transition-colors">
                  Payroll
                </Link>
                <span>/</span>
                <span className="text-stone-900">Exceptions & Validation</span>
              </div>
              <h1 className="text-2xl font-bold text-stone-900 mt-1 flex items-center gap-2">
                <ShieldAlert className="w-7 h-7 text-amber-600" />
                Payroll Exceptions Management
              </h1>
              <p className="text-sm text-stone-600 mt-0.5">
                Deterministic rule verification, anomaly detection, and authorized exception
                resolutions.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchExceptions}
                disabled={isLoading}
                className="gap-1.5"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Link href="/payroll/runs">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <FileSpreadsheet className="w-4 h-4" />
                  View Payroll Runs
                </Button>
              </Link>
            </div>
          </div>

          {/* Metric KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card className="border-stone-200 shadow-sm">
              <CardContent className="p-4">
                <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider block">
                  Total Detected
                </span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-stone-900">{summary.total}</span>
                  <span className="text-xs text-stone-500 font-medium">{summary.open} open</span>
                </div>
              </CardContent>
            </Card>

            <Card
              className={`border shadow-sm ${summary.blockingErrors > 0 ? 'border-red-300 bg-red-50/20' : 'border-stone-200'}`}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-red-600 uppercase tracking-wider block">
                    Blocking Errors
                  </span>
                  <ShieldAlert className="w-4 h-4 text-red-600" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-red-700">{summary.blockingErrors}</span>
                  {summary.blockingErrors > 0 && (
                    <Badge variant="danger" className="text-[10px] bg-red-600">
                      Blocks Approval
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-stone-200 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider block">
                    Review Warnings
                  </span>
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-amber-700">{summary.warnings}</span>
                  <span className="text-[11px] text-stone-500">Proration / Spikes</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-stone-200 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider block">
                    Information
                  </span>
                  <Info className="w-4 h-4 text-blue-600" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-blue-700">{summary.information}</span>
                  <span className="text-[11px] text-stone-500">Statutory / Tax</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-stone-200 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider block">
                    Resolved / Overridden
                  </span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-emerald-700">
                    {summary.resolved + summary.overridden}
                  </span>
                  <span className="text-[11px] text-stone-500">Audited</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Blocking Banner Alert if blocking errors exist */}
          {summary.blockingErrors > 0 && (
            <div className="p-4 rounded-xl border border-red-300 bg-red-50 flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-red-900">
                  Payroll Approval Gated by {summary.blockingErrors} Blocking Error(s)
                </h4>
                <p className="text-xs text-red-800 leading-relaxed">
                  Organizational policy strictly prevents approval of payroll runs while unresolved
                  blocking errors remain. Please investigate missing compensation assignments,
                  negative net salaries, or calculation discrepancies below and record authorized
                  overrides or trigger recalculation.
                </p>
              </div>
            </div>
          )}

          {/* Filter Bar */}
          <Card className="border-stone-200 shadow-sm">
            <CardContent className="p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                {/* Search */}
                <div className="relative md:col-span-2">
                  <Search className="w-4 h-4 text-stone-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    placeholder="Search by title, employee name, or code..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
                  />
                </div>

                {/* Severity Filter */}
                <div>
                  <select
                    value={severityFilter}
                    onChange={(e) => setSeverityFilter(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="ALL">All Severities</option>
                    <option value="BLOCKING_ERROR">🔴 Blocking Errors</option>
                    <option value="WARNING">🟡 Review Warnings</option>
                    <option value="INFORMATION">🔵 Information</option>
                  </select>
                </div>

                {/* Status Filter */}
                <div>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="OPEN">Open (Pending Resolution)</option>
                    <option value="RESOLVED">Resolved</option>
                    <option value="OVERRIDDEN">Overridden</option>
                    <option value="DISMISSED">Dismissed</option>
                  </select>
                </div>

                {/* Run Filter */}
                <div>
                  <select
                    value={runIdFilter}
                    onChange={(e) => setRunIdFilter(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    <option value="">All Payroll Runs</option>
                    {runsList.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.title} ({r.status})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Secondary category chips */}
              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-stone-100 text-xs text-stone-500">
                <span className="font-semibold text-stone-700 mr-1 flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5" /> Category:
                </span>
                {[
                  { id: 'ALL', label: 'All' },
                  { id: 'MISSING_COMPENSATION', label: 'Missing Compensation' },
                  { id: 'NEGATIVE_NET_PAY', label: 'Negative Net Pay' },
                  { id: 'CALCULATION_DISCREPANCY', label: 'Discrepancy' },
                  { id: 'ANOMALY_SALARY_SPIKE', label: 'Salary Spike' },
                  { id: 'ANOMALY_SALARY_DROP', label: 'Salary Drop' },
                  { id: 'UNRESOLVED_ATTENDANCE', label: 'Attendance' },
                  { id: 'MISSING_BANK_DETAILS', label: 'Bank Details' },
                  { id: 'MISSING_TAX_IDENTIFIER', label: 'PAN/Tax' },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setCategoryFilter(cat.id)}
                    className={`px-2 py-0.5 rounded-full border transition-colors ${
                      categoryFilter === cat.id
                        ? 'bg-stone-800 text-white border-stone-800 font-semibold'
                        : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Exceptions List */}
          <div className="space-y-4">
            {isLoading ? (
              <div className="py-16 text-center">
                <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-2" />
                <p className="text-sm text-stone-500">
                  Analyzing calculation snapshots and validation rules...
                </p>
              </div>
            ) : exceptions.length === 0 ? (
              <Card className="border-stone-200 border-dashed bg-white">
                <CardContent className="py-16 text-center space-y-3">
                  <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-700">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-stone-900">No Exceptions Found</h3>
                  <p className="text-xs text-stone-500 max-w-md mx-auto">
                    All employee records, salary assignments, and attendance reconciliations satisfy
                    validation policies.
                  </p>
                </CardContent>
              </Card>
            ) : (
              exceptions.map((ex) => (
                <Card
                  key={ex.id}
                  className={`border transition-all shadow-sm ${
                    ex.severity === 'BLOCKING_ERROR' && ex.status === 'OPEN'
                      ? 'border-red-300 bg-red-50/10 hover:border-red-400'
                      : ex.severity === 'WARNING' && ex.status === 'OPEN'
                        ? 'border-amber-200 bg-amber-50/5 hover:border-amber-300'
                        : 'border-stone-200 hover:border-stone-300'
                  }`}
                >
                  <CardContent className="p-5 space-y-4">
                    {/* Top Row: Severity, Title, Status & Action */}
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {getSeverityBadge(ex.severity)}
                          {getStatusBadge(ex.status)}
                          <span className="text-[11px] font-mono text-stone-500 bg-stone-100 px-2 py-0.5 rounded">
                            {ex.category}
                          </span>
                          <span className="text-xs text-stone-400">
                            v{ex.calculationVersion} • {new Date(ex.detectedAt).toLocaleString()}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                          {ex.title}
                        </h3>
                        <p className="text-sm text-stone-700 leading-relaxed">{ex.explanation}</p>
                      </div>

                      <div className="flex items-center gap-2 self-start">
                        {ex.status === 'OPEN' && canResolve && (
                          <Button
                            size="sm"
                            className="bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold"
                            onClick={() => handleOpenResolveModal(ex)}
                          >
                            Investigate & Resolve
                          </Button>
                        )}
                        {ex.payrollRunId && (
                          <Link href={`/payroll/runs/${ex.payrollRunId}`}>
                            <Button variant="outline" size="sm" className="text-xs gap-1">
                              View Run <ExternalLink className="w-3.5 h-3.5" />
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>

                    {/* Metadata Context Bar */}
                    <div className="p-3 bg-stone-50/80 rounded-lg border border-stone-200/80 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-stone-600">
                      {ex.employeeName && (
                        <div className="flex items-center gap-1.5 font-medium text-stone-900">
                          <User className="w-3.5 h-3.5 text-stone-400" />
                          <span>{ex.employeeName}</span>
                          <span className="text-stone-400 font-mono text-[11px]">
                            ({ex.employeeCode || 'N/A'})
                          </span>
                        </div>
                      )}

                      {ex.departmentName && (
                        <div className="flex items-center gap-1 text-stone-600">
                          <Building className="w-3.5 h-3.5 text-stone-400" />
                          <span>{ex.departmentName}</span>
                        </div>
                      )}

                      {ex.runTitle && (
                        <div className="flex items-center gap-1 text-stone-600">
                          <Calendar className="w-3.5 h-3.5 text-stone-400" />
                          <span>Run: {ex.runTitle}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-1 text-stone-500 font-mono text-[11px]">
                        <span>Rule: {ex.ruleName || 'STANDARD_VALIDATION'}</span>
                      </div>

                      {ex.sourceRecordType && (
                        <div className="flex items-center gap-1 text-stone-500 text-[11px]">
                          <span>Source: {ex.sourceRecordType}</span>
                        </div>
                      )}
                    </div>

                    {/* Resolution Audit Trail block if resolved */}
                    {ex.status !== 'OPEN' && (
                      <div className="p-3.5 rounded-lg border border-emerald-200 bg-emerald-50/40 space-y-1.5 text-xs text-emerald-950">
                        <div className="flex items-center justify-between font-semibold">
                          <div className="flex items-center gap-1.5 text-emerald-800">
                            <ShieldCheck className="w-4 h-4 text-emerald-600" />
                            <span>
                              Resolution: {ex.resolutionAction?.replace(/_/g, ' ') || ex.status}
                            </span>
                          </div>
                          <span className="text-stone-500 font-normal">
                            Resolved by {ex.resolvedByName || 'Authorized User'} on{' '}
                            {ex.resolvedAt ? new Date(ex.resolvedAt).toLocaleString() : 'N/A'}
                          </span>
                        </div>
                        {ex.resolutionNotes && (
                          <p className="text-stone-700 italic bg-white/70 p-2 rounded border border-emerald-100">
                            &ldquo;{ex.resolutionNotes}&rdquo;
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>

        {/* Resolution Dialog Modal */}
        <Dialog
          isOpen={isResolveModalOpen}
          onClose={() => setIsResolveModalOpen(false)}
          title={`Resolve Exception: ${activeException?.title || ''}`}
        >
          <form onSubmit={handleResolveSubmit} className="space-y-4">
            <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-stone-700">Exception Category:</span>
                <span className="font-mono text-stone-900">{activeException?.category}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-stone-700">Impacted Employee:</span>
                <span className="font-medium text-stone-900">
                  {activeException?.employeeName || 'N/A'} ({activeException?.employeeCode || 'N/A'}
                  )
                </span>
              </div>
              <p className="text-stone-600 pt-1 border-t border-stone-200 leading-relaxed">
                {activeException?.explanation}
              </p>
            </div>

            {actionError && (
              <div className="p-3 bg-red-50 text-red-800 border border-red-200 rounded-lg text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-stone-700 block">
                Resolution Action <span className="text-red-500">*</span>
              </label>
              <select
                value={resolveAction}
                onChange={(e) => setResolveAction(e.target.value as any)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
              >
                <option value="OVERRIDE_APPROVED">
                  OVERRIDE_APPROVED - Authorize manual override & proceed
                </option>
                <option value="SOURCE_FIXED">
                  SOURCE_FIXED - Source records updated in Attendance / HR
                </option>
                <option value="RECALCULATED">
                  RECALCULATED - Recalculated with updated inputs
                </option>
                <option value="DISMISSED">
                  DISMISSED - Dismiss as non-impacting informational note
                </option>
              </select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-stone-700">
                  Audit Resolution Reason & Notes <span className="text-red-500">*</span>
                </label>
                <span className="text-[10px] text-stone-400">Min. 5 characters required</span>
              </div>
              <textarea
                rows={3}
                required
                placeholder="Explain the justification for this override, source verification, or approval rationale..."
                value={resolveNotes}
                onChange={(e) => setResolveNotes(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-[11px] text-amber-900 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-700 flex-shrink-0 mt-0.5" />
              <span>
                <strong>Audit Compliance:</strong> This resolution action will be permanently
                recorded in the organizational audit trail with your timestamp and user identity (
                {user?.email}).
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-200">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsResolveModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSubmitting || resolveNotes.trim().length < 5}
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold"
              >
                {isSubmitting ? 'Recording Resolution...' : 'Confirm & Record Resolution'}
              </Button>
            </div>
          </form>
        </Dialog>
      </AppShell>
    </ProtectedRoute>
  );
}

export default function PayrollExceptionsPage() {
  return (
    <React.Suspense
      fallback={
        <AppShell>
          <div className="py-24 text-center text-stone-400 space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-stone-300" />
            <p className="text-xs">Loading payroll exceptions...</p>
          </div>
        </AppShell>
      }
    >
      <PayrollExceptionsContent />
    </React.Suspense>
  );
}
