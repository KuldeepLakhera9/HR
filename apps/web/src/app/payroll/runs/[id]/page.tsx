'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '../../../../layouts/AppShell';
import { ProtectedRoute } from '../../../../components/auth/ProtectedRoute';
import { useAuth } from '../../../../context/AuthContext';
import { apiClient } from '../../../../lib/api-client';
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
  ArrowLeft,
  Banknote,
  Calendar,
  CheckCircle2,
  Clock,
  Layers,
  Play,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Lock,
  Send,
  RotateCcw,
  XCircle,
  Eye,
  FileCheck,
  Users,
  AlertCircle,
  Check,
  X,
  Search,
  Info,
  ExternalLink,
  BarChart3,
  Building2,
  TrendingUp,
  TrendingDown,
  UserPlus,
  UserMinus,
  FileSpreadsheet,
} from 'lucide-react';
import { PayrollRunReviewSummaryDto } from '@hrms/types';

export default function PayrollRunDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { hasRole, hasPermission } = useAuth();
  const canManage = hasRole('ADMIN') || hasPermission('PAYROLL_MANAGE');
  const canApprove = hasRole('ADMIN') || hasPermission('PAYROLL_APPROVE');

  const runId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [run, setRun] = useState<any>(null);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [snapshotsMeta, setSnapshotsMeta] = useState<any>({ total: 0, page: 1, limit: 20 });
  const [actionLoading, setActionLoading] = useState(false);

  // Filters for Snapshots
  const [search, setSearch] = useState('');
  const [filterException, setFilterException] = useState<string>('ALL');

  // Modal States
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [approveComments, setApproveComments] = useState('');

  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const [isLockOpen, setIsLockOpen] = useState(false);
  const [lockNotes, setLockNotes] = useState('');

  const [isPublishOpen, setIsPublishOpen] = useState(false);

  const [isCorrectionOpen, setIsCorrectionOpen] = useState(false);
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionNotes, setCorrectionNotes] = useState('');

  // Phase 11.8: Return for Correction Modal State
  const [isReturnForCorrectionOpen, setIsReturnForCorrectionOpen] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [returnNotes, setReturnNotes] = useState('');

  // Phase 11.8: Review Summary Data
  const [reviewSummary, setReviewSummary] = useState<PayrollRunReviewSummaryDto | null>(null);

  // Selected snapshot for breakdown modal
  const [selectedSnapshot, setSelectedSnapshot] = useState<any>(null);
  const [calculationDetail, setCalculationDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Phase 11.6, 11.7 & 11.8 Tabs: Review & Analytics, Snapshots, Attendance, Exceptions
  const [activeTab, setActiveTab] = useState<'review' | 'snapshots' | 'attendance' | 'exceptions'>(
    'review',
  );
  const [reconciliationData, setReconciliationData] = useState<any>(null);
  const [lateReport, setLateReport] = useState<any>(null);
  const [filterLateOnly, setFilterLateOnly] = useState(false);

  // Phase 11.7: Exceptions and Validation
  const [exceptionsSummary, setExceptionsSummary] = useState<any>(null);
  const [runExceptions, setRunExceptions] = useState<any[]>([]);
  const [activeException, setActiveException] = useState<any | null>(null);
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [resolveAction, setResolveAction] = useState<
    'OVERRIDE_APPROVED' | 'SOURCE_FIXED' | 'RECALCULATED' | 'DISMISSED'
  >('OVERRIDE_APPROVED');
  const [resolveNotes, setResolveNotes] = useState('');
  const [resolveSubmitting, setResolveSubmitting] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const handleOpenSnapshotDetail = async (snapshot: any) => {
    setSelectedSnapshot(snapshot);
    setLoadingDetail(true);
    setCalculationDetail(null);
    try {
      const res = await apiClient.getSnapshotCalculationDetail(runId, snapshot.id);
      setCalculationDetail(res?.data || null);
    } catch (err) {
      console.error('Failed to load calculation detail', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleOpenResolveModal = (ex: any) => {
    setActiveException(ex);
    setResolveAction(ex.severity === 'BLOCKING_ERROR' ? 'OVERRIDE_APPROVED' : 'SOURCE_FIXED');
    setResolveNotes('');
    setResolveError(null);
    setIsResolveModalOpen(true);
  };

  const handleResolveExceptionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeException) return;

    if (!resolveNotes || resolveNotes.trim().length < 5) {
      setResolveError(
        'Resolution notes must be at least 5 characters for statutory audit compliance.',
      );
      return;
    }

    try {
      setResolveSubmitting(true);
      setResolveError(null);
      await apiClient.resolvePayrollException(activeException.id, {
        action: resolveAction,
        resolutionNotes: resolveNotes.trim(),
      });
      setIsResolveModalOpen(false);
      setActiveException(null);
      await fetchRunData();
    } catch (err: any) {
      setResolveError(err.message || 'Failed to resolve exception');
    } finally {
      setResolveSubmitting(false);
    }
  };

  const handleRevalidate = async () => {
    try {
      setActionLoading(true);
      await apiClient.revalidatePayrollRun(runId);
      await fetchRunData();
    } catch (err: any) {
      alert(err.message || 'Re-validation failed');
    } finally {
      setActionLoading(false);
    }
  };

  const fetchRunData = useCallback(async () => {
    try {
      setLoading(true);
      const [runRes, snapsRes, reconRes, lateRes, exSumRes, exListRes, revSumRes] =
        await Promise.all([
          apiClient.getPayrollRun(runId),
          apiClient.getPayrollRunSnapshots(runId, {
            search: search || undefined,
            isException:
              filterException === 'true' ? true : filterException === 'false' ? false : undefined,
            limit: 50,
          }),
          apiClient.getPayrollAttendanceReconciliation(runId).catch(() => null),
          apiClient.getPayrollLateChanges(runId).catch(() => null),
          apiClient.getRunExceptionsSummary(runId).catch(() => null),
          apiClient.getRunExceptions(runId, { limit: 50 }).catch(() => null),
          apiClient.getPayrollReviewSummary(runId).catch(() => null),
        ]);

      setRun(runRes?.data || null);
      setSnapshots(snapsRes?.data || []);
      setSnapshotsMeta(snapsRes?.meta || { total: 0 });
      setReconciliationData(reconRes?.data || null);
      setLateReport(lateRes?.data || null);
      setExceptionsSummary(exSumRes?.data?.data || null);
      setRunExceptions(exListRes?.data?.data || []);
      setReviewSummary(revSumRes?.data || null);
    } catch (err) {
      console.error('Failed to load run detail', err);
    } finally {
      setLoading(false);
    }
  }, [runId, search, filterException]);

  useEffect(() => {
    fetchRunData();
  }, [fetchRunData]);

  // Actions
  const handleCalculate = async () => {
    try {
      setActionLoading(true);
      await apiClient.calculatePayrollRun(runId);
      fetchRunData();
    } catch (err: any) {
      alert(err.message || 'Calculation failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRetry = async () => {
    try {
      setActionLoading(true);
      await apiClient.retryPayrollRun(runId);
      fetchRunData();
    } catch (err: any) {
      alert(err.message || 'Retry failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRecalculate = async () => {
    if (
      !confirm(
        'Recalculate will re-evaluate all compensations and update to a new calculation version. Proceed?',
      )
    ) {
      return;
    }
    try {
      setActionLoading(true);
      await apiClient.recalculatePayrollRun(runId);
      fetchRunData();
    } catch (err: any) {
      alert(err.message || 'Recalculation failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = async () => {
    if (exceptionsSummary?.hasBlockingErrors) {
      alert(
        `Cannot approve payroll run: ${exceptionsSummary.blockingErrors} unresolved blocking error(s) must be resolved first.`,
      );
      return;
    }
    try {
      setActionLoading(true);
      await apiClient.approvePayrollRun(runId, { comments: approveComments });
      setIsApproveOpen(false);
      fetchRunData();
    } catch (err: any) {
      alert(err.message || 'Approval failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      alert('Please specify rejection reason');
      return;
    }
    try {
      setActionLoading(true);
      await apiClient.rejectPayrollRun(runId, { rejectionReason });
      setIsRejectOpen(false);
      fetchRunData();
    } catch (err: any) {
      alert(err.message || 'Rejection failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReturnForCorrection = async () => {
    if (!returnReason.trim()) {
      alert('Please specify reason for returning run for correction');
      return;
    }
    try {
      setActionLoading(true);
      await apiClient.returnPayrollRunForCorrection(runId, {
        reason: returnReason.trim(),
        notes: returnNotes.trim() || undefined,
      });
      setIsReturnForCorrectionOpen(false);
      setReturnReason('');
      setReturnNotes('');
      fetchRunData();
    } catch (err: any) {
      alert(err.message || 'Failed to return run for correction');
    } finally {
      setActionLoading(false);
    }
  };

  const handleLock = async () => {
    try {
      setActionLoading(true);
      await apiClient.lockPayrollRun(runId, { notes: lockNotes });
      setIsLockOpen(false);
      fetchRunData();
    } catch (err: any) {
      alert(err.message || 'Locking failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePublish = async () => {
    try {
      setActionLoading(true);
      await apiClient.publishPayrollRun(runId);
      setIsPublishOpen(false);
      fetchRunData();
    } catch (err: any) {
      alert(err.message || 'Publishing failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelRun = async () => {
    const reason = prompt('Please enter reason for cancelling this payroll run:');
    if (!reason) return;
    try {
      setActionLoading(true);
      await apiClient.cancelPayrollRun(runId, reason);
      fetchRunData();
    } catch (err: any) {
      alert(err.message || 'Cancellation failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateCorrection = async () => {
    if (!correctionReason.trim()) {
      alert('Correction reason is mandatory');
      return;
    }
    try {
      setActionLoading(true);
      const res = await apiClient.createCorrectionPayrollRun(runId, {
        correctionReason,
        notes: correctionNotes,
      });
      setIsCorrectionOpen(false);
      if (res?.data?.id) {
        router.push(`/payroll/runs/${res.data.id}`);
      } else {
        fetchRunData();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to create correction run');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return (
          <Badge variant="outline" className="bg-stone-50 text-stone-700 border-stone-300">
            DRAFT
          </Badge>
        );
      case 'CALCULATING':
        return (
          <Badge
            variant="outline"
            className="bg-blue-50 text-blue-700 border-blue-300 animate-pulse"
          >
            CALCULATING...
          </Badge>
        );
      case 'REVIEW_PENDING':
        return (
          <Badge
            variant="outline"
            className="bg-amber-50 text-amber-800 border-amber-300 font-bold"
          >
            REVIEW PENDING
          </Badge>
        );
      case 'APPROVED':
        return (
          <Badge
            variant="outline"
            className="bg-emerald-50 text-emerald-800 border-emerald-300 font-bold"
          >
            APPROVED
          </Badge>
        );
      case 'LOCKED':
        return (
          <Badge
            variant="outline"
            className="bg-purple-50 text-purple-800 border-purple-300 font-bold"
          >
            LOCKED (IMMUTABLE)
          </Badge>
        );
      case 'PUBLISHED':
        return (
          <Badge variant="outline" className="bg-teal-50 text-teal-800 border-teal-300 font-bold">
            PUBLISHED
          </Badge>
        );
      case 'CANCELLED':
        return (
          <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-300">
            CANCELLED
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading && !run) {
    return (
      <AppShell>
        <div className="py-24 text-center text-stone-400 space-y-2">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-stone-300" />
          <p className="text-xs">Loading payroll run details...</p>
        </div>
      </AppShell>
    );
  }

  if (!run) {
    return (
      <AppShell>
        <div className="py-24 text-center space-y-4">
          <p className="text-stone-600 font-semibold text-sm">Payroll run not found</p>
          <Button variant="outline" size="sm" onClick={() => router.push('/payroll/runs')}>
            Return to Runs
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <ProtectedRoute requiredPermissions={['PAYROLL_VIEW']}>
      <AppShell>
        <div className="space-y-6">
          {/* Header & Breadcrumb */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-stone-200">
            <div className="space-y-1">
              <button
                onClick={() => router.push('/payroll/runs')}
                className="text-xs text-stone-500 hover:text-stone-800 flex items-center gap-1 font-medium group transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
                <span>Back to Payroll Runs</span>
              </button>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl md:text-2xl font-bold text-stone-900 tracking-tight">
                  {run.title}
                </h1>
                {getStatusBadge(run.status)}
                <span className="font-mono text-xs px-2 py-0.5 bg-stone-100 rounded text-stone-600 font-semibold border border-stone-200">
                  Run #{run.runNumber} • v{run.calculationVersion}
                </span>
                {run.parentRunId && (
                  <Badge
                    variant="outline"
                    className="bg-amber-50 text-amber-800 border-amber-300 text-[10px]"
                  >
                    CORRECTION RUN
                  </Badge>
                )}
              </div>
              <div className="text-xs text-stone-500 flex flex-wrap items-center gap-2">
                <span>
                  Scope: <strong className="font-mono text-stone-700">{run.scope}</strong>
                </span>
                <span>•</span>
                {run.period && (
                  <span>
                    Period:{' '}
                    <strong className="text-stone-700">
                      {run.period.year}-{String(run.period.month).padStart(2, '0')}
                    </strong>{' '}
                    ({new Date(run.period.startDate).toLocaleDateString()} to{' '}
                    {new Date(run.period.endDate).toLocaleDateString()})
                  </span>
                )}
              </div>
            </div>

            {/* State Machine Action Bar */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchRunData}
                disabled={actionLoading}
                className="text-stone-600"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 mr-1.5 ${actionLoading ? 'animate-spin' : ''}`}
                />
                Refresh
              </Button>

              {/* DRAFT: Calculate */}
              {run.status === 'DRAFT' && canManage && (
                <>
                  <Button
                    size="sm"
                    disabled={actionLoading}
                    onClick={handleCalculate}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                  >
                    <Play className="w-3.5 h-3.5 mr-1.5" />
                    Calculate Run
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={actionLoading}
                    onClick={handleCancelRun}
                    className="text-rose-600 border-rose-200 hover:bg-rose-50"
                  >
                    Cancel Run
                  </Button>
                </>
              )}

              {/* CALCULATING: Retry */}
              {run.status === 'CALCULATING' && canManage && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={actionLoading}
                  onClick={handleRetry}
                  className="border-amber-300 text-amber-800"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                  Retry Calculation
                </Button>
              )}

              {/* REVIEW_PENDING: Approve, Reject, Recalculate, Re-validate */}
              {run.status === 'REVIEW_PENDING' && (
                <>
                  {canApprove && (
                    <Button
                      size="sm"
                      disabled={actionLoading || exceptionsSummary?.hasBlockingErrors}
                      onClick={() => setIsApproveOpen(true)}
                      className={
                        exceptionsSummary?.hasBlockingErrors
                          ? 'bg-stone-300 text-stone-500 cursor-not-allowed'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      }
                      title={
                        exceptionsSummary?.hasBlockingErrors
                          ? `Approval blocked by ${exceptionsSummary.blockingErrors} unresolved blocking error(s)`
                          : undefined
                      }
                    >
                      {exceptionsSummary?.hasBlockingErrors ? (
                        <>
                          <ShieldAlert className="w-3.5 h-3.5 mr-1.5 text-red-500" />
                          Approval Blocked ({exceptionsSummary.blockingErrors})
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                          Approve Run
                        </>
                      )}
                    </Button>
                  )}
                  {canManage && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={actionLoading}
                      onClick={handleRevalidate}
                      className="border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                      title="Re-run validation rules on this payroll run"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 mr-1.5 ${actionLoading ? 'animate-spin' : ''}`}
                      />
                      Re-validate
                    </Button>
                  )}
                  {canApprove && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={actionLoading}
                      onClick={() => setIsRejectOpen(true)}
                      className="border-rose-300 text-rose-700 hover:bg-rose-50"
                    >
                      <XCircle className="w-3.5 h-3.5 mr-1.5" />
                      Reject (Draft)
                    </Button>
                  )}
                  {canManage && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={actionLoading}
                      onClick={handleRecalculate}
                      className="border-stone-300 text-stone-700"
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                      Recalculate
                    </Button>
                  )}
                </>
              )}

              {/* APPROVED: Lock & Return for Correction */}
              {run.status === 'APPROVED' && canApprove && (
                <>
                  <Button
                    size="sm"
                    disabled={actionLoading}
                    onClick={() => setIsLockOpen(true)}
                    className="bg-purple-600 hover:bg-purple-700 text-white font-medium"
                  >
                    <Lock className="w-3.5 h-3.5 mr-1.5" />
                    Lock & Finalize Run
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={actionLoading}
                    onClick={() => setIsReturnForCorrectionOpen(true)}
                    className="border-amber-400 text-amber-800 hover:bg-amber-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                    Return for Correction
                  </Button>
                </>
              )}

              {/* LOCKED: Publish & Correction */}
              {run.status === 'LOCKED' && (
                <>
                  {canManage && (
                    <Button
                      size="sm"
                      disabled={actionLoading}
                      onClick={() => setIsPublishOpen(true)}
                      className="bg-teal-600 hover:bg-teal-700 text-white font-medium"
                    >
                      <Send className="w-3.5 h-3.5 mr-1.5" />
                      Publish Payslips
                    </Button>
                  )}
                  {canApprove && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={actionLoading}
                      onClick={() => setIsCorrectionOpen(true)}
                      className="border-amber-400 text-amber-800"
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                      Issue Correction Run
                    </Button>
                  )}
                </>
              )}

              {/* PUBLISHED: Correction */}
              {run.status === 'PUBLISHED' && canApprove && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={actionLoading}
                  onClick={() => setIsCorrectionOpen(true)}
                  className="border-amber-400 text-amber-800"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                  Issue Correction Run
                </Button>
              )}
            </div>
          </div>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <Card className="border border-stone-200/80 shadow-xs bg-white p-3.5 space-y-1">
              <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                Total Employees
              </span>
              <div className="text-xl font-bold font-mono text-stone-900">{run.totalEmployees}</div>
              <div className="text-[10px] text-stone-400">Scoped workforce count</div>
            </Card>

            <Card className="border border-stone-200/80 shadow-xs bg-white p-3.5 space-y-1">
              <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                Gross Earnings
              </span>
              <div className="text-xl font-bold font-mono text-stone-900">
                ₹{Number(run.totalGross).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-stone-400">Total earned before deductions</div>
            </Card>

            <Card className="border border-stone-200/80 shadow-xs bg-white p-3.5 space-y-1">
              <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                Total Deductions
              </span>
              <div className="text-xl font-bold font-mono text-rose-700">
                ₹{Number(run.totalDeductions).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-stone-400">Tax, PF & recoveries</div>
            </Card>

            <Card className="border border-stone-200/80 shadow-xs bg-white p-3.5 space-y-1">
              <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                Net Pay Outflow
              </span>
              <div className="text-xl font-bold font-mono text-emerald-800">
                ₹{Number(run.totalNet).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-stone-400">Total net payable</div>
            </Card>

            <Card className="border border-stone-200/80 shadow-xs bg-white p-3.5 space-y-1">
              <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                Employer Costs
              </span>
              <div className="text-xl font-bold font-mono text-blue-900">
                ₹
                {Number(
                  run.totalEmployerCost || reviewSummary?.totals?.totalEmployerCost || 0,
                ).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-stone-400">PF, ESI & statutory share</div>
            </Card>

            <Card
              onClick={() => setActiveTab('exceptions')}
              className={`border border-stone-200/80 shadow-xs p-3.5 space-y-1 cursor-pointer transition-all hover:border-amber-400 ${
                exceptionsSummary?.hasBlockingErrors ? 'bg-red-50/40 border-red-300' : 'bg-white'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                  Exceptions
                </span>
                {exceptionsSummary?.hasBlockingErrors ? (
                  <ShieldAlert className="w-4 h-4 text-red-600" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                )}
              </div>
              <div
                className={`text-xl font-bold font-mono ${
                  exceptionsSummary?.hasBlockingErrors
                    ? 'text-red-700'
                    : (exceptionsSummary?.total || run.exceptionCount) > 0
                      ? 'text-amber-700'
                      : 'text-stone-400'
                }`}
              >
                {exceptionsSummary?.total ?? (run.exceptionCount || 0)}
              </div>
              <div className="text-[10px] text-stone-500">
                {exceptionsSummary
                  ? `${exceptionsSummary.blockingErrors} blocking • ${exceptionsSummary.warnings} warnings`
                  : 'Unassigned or flagged anomalies'}
              </div>
            </Card>
          </div>

          {/* Phase 11.7: Blocking Error Alert Banner */}
          {exceptionsSummary?.hasBlockingErrors && run.status === 'REVIEW_PENDING' && (
            <div className="p-4 rounded-xl border border-red-300 bg-red-50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <h4 className="font-bold text-sm text-red-950">
                    Approval Gated: {exceptionsSummary.blockingErrors} Unresolved Blocking Error(s)
                  </h4>
                  <p className="text-red-800 leading-relaxed text-[11px]">
                    Organizational policy prevents approving this payroll run while unresolved
                    blocking errors remain. Please resolve or override them in the Exceptions tab or
                    re-validate after correcting source data.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRevalidate}
                  disabled={actionLoading}
                  className="bg-white border-red-200 text-red-800 hover:bg-red-50 text-xs"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 mr-1 ${actionLoading ? 'animate-spin' : ''}`}
                  />
                  Re-validate Run
                </Button>
                <Button
                  size="sm"
                  onClick={() => setActiveTab('exceptions')}
                  className="bg-red-700 hover:bg-red-800 text-white text-xs font-semibold"
                >
                  View Exceptions
                </Button>
              </div>
            </div>
          )}

          {/* Late Source Changes Banner */}
          {lateReport && lateReport.totalLateChanges > 0 && (
            <div
              className={`p-4 rounded-xl border text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                lateReport.requiresCorrectionRun
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle
                  className={`w-5 h-5 shrink-0 mt-0.5 ${
                    lateReport.requiresCorrectionRun ? 'text-rose-600' : 'text-amber-600'
                  }`}
                />
                <div>
                  <div className="font-bold text-sm">
                    {lateReport.requiresCorrectionRun
                      ? 'Late Attendance / Leave Changes Detected on Finalized Run'
                      : 'Late Attendance / Leave Changes Detected'}
                  </div>
                  <p className="text-xs opacity-90 mt-0.5">
                    {lateReport.totalLateChanges} source record(s) across{' '}
                    {lateReport.affectedEmployeesCount} employee(s) were modified or approved since
                    this calculation.
                    {lateReport.requiresCorrectionRun
                      ? ' This run is locked/published and cannot be mutated automatically. Please issue a controlled correction run.'
                      : ' Recalculation is required to capture the latest source data.'}
                  </p>
                </div>
              </div>
              {lateReport.requiresCorrectionRun
                ? canApprove && (
                    <Button
                      size="sm"
                      onClick={() => setIsCorrectionOpen(true)}
                      className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                      Issue Correction Run
                    </Button>
                  )
                : canManage && (
                    <Button
                      size="sm"
                      onClick={handleRecalculate}
                      className="bg-amber-800 hover:bg-amber-900 text-white shrink-0"
                    >
                      <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                      Recalculate Run
                    </Button>
                  )}
            </div>
          )}

          {/* View Tabs */}
          <div className="flex items-center gap-2 border-b border-stone-200 pb-2">
            <button
              type="button"
              onClick={() => setActiveTab('review')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'review'
                  ? 'bg-amber-800 text-white shadow-xs'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Review & Analytics
              {reviewSummary?.comparison && (
                <Badge
                  variant="outline"
                  className={`text-[10px] ml-1 ${
                    activeTab === 'review'
                      ? 'bg-amber-900 text-amber-100 border-amber-700'
                      : 'text-stone-500'
                  }`}
                >
                  Variance
                </Badge>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('snapshots')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'snapshots'
                  ? 'bg-amber-800 text-white shadow-xs'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              <Banknote className="w-3.5 h-3.5" />
              Financial Snapshots
              <Badge
                variant="outline"
                className={`text-[10px] ml-1 ${
                  activeTab === 'snapshots'
                    ? 'bg-amber-900 text-amber-100 border-amber-700'
                    : 'text-stone-500'
                }`}
              >
                {snapshotsMeta.total || snapshots.length}
              </Badge>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('attendance')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'attendance'
                  ? 'bg-amber-800 text-white shadow-xs'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              Attendance & Leave Reconciliation
              {lateReport && lateReport.totalLateChanges > 0 && (
                <Badge
                  variant="outline"
                  className="text-[10px] ml-1 bg-amber-500 text-white border-none"
                >
                  {lateReport.totalLateChanges} Late
                </Badge>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('exceptions')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'exceptions'
                  ? 'bg-amber-800 text-white shadow-xs'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              Exceptions & Validation
              {exceptionsSummary && exceptionsSummary.total > 0 && (
                <Badge
                  variant="outline"
                  className={`text-[10px] ml-1 ${
                    exceptionsSummary.hasBlockingErrors
                      ? 'bg-red-500 text-white border-none'
                      : activeTab === 'exceptions'
                        ? 'bg-amber-900 text-amber-100 border-amber-700'
                        : 'bg-amber-100 text-amber-800 border-amber-300'
                  }`}
                >
                  {exceptionsSummary.blockingErrors > 0
                    ? `${exceptionsSummary.blockingErrors} Blocking`
                    : `${exceptionsSummary.open} Open`}
                </Badge>
              )}
            </button>
          </div>

          {/* TAB 0: Executive Review & Analytics (Phase 11.8) */}
          {activeTab === 'review' && (
            <div className="space-y-6">
              {/* Executive Run Overview & Cutoff Info */}
              <Card className="border border-stone-200/80 shadow-xs bg-white p-5">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-stone-100">
                  <div>
                    <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                      <FileSpreadsheet className="w-5 h-5 text-amber-800" />
                      Executive Payroll Review & Cutoff Diagnostics
                    </h3>
                    <p className="text-xs text-stone-500 mt-0.5">
                      Deterministic calculation versioning, cutoff boundaries, and governance
                      verification.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className="text-xs px-2.5 py-1 bg-stone-50 text-stone-700 border-stone-300"
                    >
                      Version: <strong>v{run.calculationVersion}</strong>
                    </Badge>
                    <Badge
                      variant="outline"
                      className="text-xs px-2.5 py-1 bg-stone-50 text-stone-700 border-stone-300"
                    >
                      Scope: <strong>{run.scope}</strong>
                    </Badge>
                    <Badge
                      variant="outline"
                      className="text-xs px-2.5 py-1 bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold"
                    >
                      {reviewSummary?.processingStatus || run.status}
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 text-xs">
                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">
                      Payroll Period
                    </span>
                    <div className="font-bold text-stone-800">
                      {run.period ? `${run.period.month}/${run.period.year}` : 'N/A'}
                    </div>
                    <div className="text-[10px] text-stone-500 font-mono">
                      {run.period
                        ? `${new Date(run.period.startDate).toLocaleDateString()} - ${new Date(run.period.endDate).toLocaleDateString()}`
                        : ''}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">
                      Data Cutoff Date
                    </span>
                    <div className="font-bold text-stone-800">
                      {reviewSummary?.cutoffDate
                        ? new Date(reviewSummary.cutoffDate).toLocaleDateString()
                        : run.period?.cutoffDate
                          ? new Date(run.period.cutoffDate).toLocaleDateString()
                          : 'End of Period'}
                    </div>
                    <div className="text-[10px] text-stone-500">Attendance & leave freeze date</div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">
                      Calculation Timestamp
                    </span>
                    <div className="font-bold text-stone-800">
                      {run.calculatedAt
                        ? new Date(run.calculatedAt).toLocaleString()
                        : 'Pending calculation'}
                    </div>
                    <div className="text-[10px] text-stone-500 font-mono">Run #{run.runNumber}</div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider">
                      Initiator / Created By
                    </span>
                    <div className="font-bold text-stone-800">
                      {run.createdBy
                        ? `${run.createdBy.firstName} ${run.createdBy.lastName}`
                        : reviewSummary?.separationOfDuties?.createdByName || 'System'}
                    </div>
                    <div className="text-[10px] text-stone-500">Four-eyes governance active</div>
                  </div>
                </div>
              </Card>

              {/* Separation of Duties Governance Notification */}
              {reviewSummary?.separationOfDuties && (
                <div
                  className={`p-4 rounded-xl border flex items-start gap-3 text-xs ${
                    reviewSummary.separationOfDuties.selfApprovalBlocked
                      ? 'bg-amber-50/70 border-amber-300 text-amber-950'
                      : 'bg-emerald-50/60 border-emerald-300 text-emerald-950'
                  }`}
                >
                  {reviewSummary.separationOfDuties.selfApprovalBlocked ? (
                    <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  ) : (
                    <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-0.5">
                    <div className="font-bold text-sm">
                      {reviewSummary.separationOfDuties.selfApprovalBlocked
                        ? 'Separation of Duties Enforced'
                        : 'Separation of Duties Verified'}
                    </div>
                    <p className="leading-relaxed text-[11px]">
                      {reviewSummary.separationOfDuties.selfApprovalBlocked
                        ? reviewSummary.separationOfDuties.reason ||
                          'Organizational policy prohibits users from approving their own payroll runs or calculations. An independent authorized reviewer must sign off.'
                        : 'Independent review requirements satisfied. The authorized approver is separate from run creation and computation.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Period-Over-Period Comparison & Variance */}
              {reviewSummary?.comparison ? (
                <Card className="border border-stone-200/80 shadow-xs bg-white p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                    <div>
                      <h4 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-amber-800" />
                        Changes from Previous Comparable Period (
                        {reviewSummary.comparison.previousPeriodTitle || 'Prior Run'})
                      </h4>
                      <p className="text-xs text-stone-500">
                        Variance tracking across headcount, gross earnings, net pay, and employer
                        statutory costs.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {/* Headcount Variance */}
                    <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 space-y-1">
                      <span className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider">
                        Headcount Variance
                      </span>
                      <div className="text-base font-bold font-mono text-stone-900">
                        {reviewSummary.comparison.currentHeadcount} emp
                      </div>
                      <div
                        className={`text-[11px] font-semibold flex items-center gap-1 ${
                          reviewSummary.comparison.headcountDelta > 0
                            ? 'text-emerald-700'
                            : reviewSummary.comparison.headcountDelta < 0
                              ? 'text-rose-700'
                              : 'text-stone-500'
                        }`}
                      >
                        {reviewSummary.comparison.headcountDelta > 0 ? '+' : ''}
                        {reviewSummary.comparison.headcountDelta} vs prev (
                        {reviewSummary.comparison.previousHeadcount})
                      </div>
                    </div>

                    {/* Gross Earnings Variance */}
                    <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 space-y-1">
                      <span className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider">
                        Gross Pay Variance
                      </span>
                      <div className="text-base font-bold font-mono text-stone-900">
                        ₹
                        {reviewSummary.comparison.currentTotalGross.toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                        })}
                      </div>
                      <div
                        className={`text-[11px] font-semibold flex items-center gap-1 ${
                          reviewSummary.comparison.grossDelta > 0
                            ? 'text-amber-800'
                            : reviewSummary.comparison.grossDelta < 0
                              ? 'text-emerald-700'
                              : 'text-stone-500'
                        }`}
                      >
                        {reviewSummary.comparison.grossDelta >= 0 ? '+' : ''}₹
                        {reviewSummary.comparison.grossDelta.toLocaleString('en-IN')} (
                        {reviewSummary.comparison.grossDeltaPercentage}%)
                      </div>
                    </div>

                    {/* Deductions Variance */}
                    <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 space-y-1">
                      <span className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider">
                        Deductions Variance
                      </span>
                      <div className="text-base font-bold font-mono text-rose-700">
                        ₹
                        {reviewSummary.comparison.currentTotalDeductions.toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                        })}
                      </div>
                      <div className="text-[11px] font-semibold text-stone-500">
                        {reviewSummary.comparison.deductionsDelta >= 0 ? '+' : ''}₹
                        {reviewSummary.comparison.deductionsDelta.toLocaleString('en-IN')} vs prev
                      </div>
                    </div>

                    {/* Net Pay Variance */}
                    <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 space-y-1">
                      <span className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider">
                        Net Pay Variance
                      </span>
                      <div className="text-base font-bold font-mono text-emerald-800">
                        ₹
                        {reviewSummary.comparison.currentTotalNet.toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                        })}
                      </div>
                      <div
                        className={`text-[11px] font-semibold flex items-center gap-1 ${
                          reviewSummary.comparison.netDelta > 0
                            ? 'text-emerald-700'
                            : reviewSummary.comparison.netDelta < 0
                              ? 'text-rose-700'
                              : 'text-stone-500'
                        }`}
                      >
                        {reviewSummary.comparison.netDelta >= 0 ? '+' : ''}₹
                        {reviewSummary.comparison.netDelta.toLocaleString('en-IN')} (
                        {reviewSummary.comparison.netDeltaPercentage}%)
                      </div>
                    </div>

                    {/* Employer Cost Variance */}
                    <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 space-y-1">
                      <span className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider">
                        Employer Cost Variance
                      </span>
                      <div className="text-base font-bold font-mono text-blue-900">
                        ₹
                        {reviewSummary.comparison.currentTotalEmployerCost.toLocaleString('en-IN', {
                          minimumFractionDigits: 2,
                        })}
                      </div>
                      <div
                        className={`text-[11px] font-semibold flex items-center gap-1 ${
                          reviewSummary.comparison.employerCostDelta > 0
                            ? 'text-blue-700'
                            : reviewSummary.comparison.employerCostDelta < 0
                              ? 'text-stone-600'
                              : 'text-stone-500'
                        }`}
                      >
                        {reviewSummary.comparison.employerCostDelta >= 0 ? '+' : ''}₹
                        {reviewSummary.comparison.employerCostDelta.toLocaleString('en-IN')} (
                        {reviewSummary.comparison.employerCostDeltaPercentage}%)
                      </div>
                    </div>
                  </div>
                </Card>
              ) : (
                <Card className="border border-stone-200/80 shadow-xs bg-stone-50/50 p-4 text-xs text-stone-500 flex items-center gap-2">
                  <Info className="w-4 h-4 text-stone-400" />
                  <span>
                    No prior finalized payroll run found for comparable variance analysis. First
                    period baseline established.
                  </span>
                </Card>
              )}

              {/* Department-Level Summaries */}
              <Card className="border border-stone-200/80 shadow-xs bg-white overflow-hidden">
                <CardHeader className="border-b border-stone-100 pb-3">
                  <CardTitle className="text-sm font-bold text-stone-900 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-amber-800" />
                    Department Cost & Headcount Summaries ({reviewSummary?.departments?.length ||
                      0}{' '}
                    Departments)
                  </CardTitle>
                  <CardDescription className="text-xs text-stone-500">
                    Aggregated department totals for gross compensation, employee deductions, net
                    outflow, and employer contributions.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 uppercase tracking-wider text-[11px]">
                        <tr>
                          <th className="py-3 px-4 font-semibold">Department</th>
                          <th className="py-3 px-4 font-semibold text-center">Employees</th>
                          <th className="py-3 px-4 font-semibold text-right">Gross Earnings</th>
                          <th className="py-3 px-4 font-semibold text-right">Deductions</th>
                          <th className="py-3 px-4 font-semibold text-right">Net Payable</th>
                          <th className="py-3 px-4 font-semibold text-right">Employer Costs</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {reviewSummary?.departments && reviewSummary.departments.length > 0 ? (
                          reviewSummary.departments.map((dept, i) => (
                            <tr key={i} className="hover:bg-stone-50/50">
                              <td className="py-3 px-4 font-semibold text-stone-800 flex items-center gap-2">
                                <Building2 className="w-3.5 h-3.5 text-stone-400" />
                                {dept.departmentName}
                              </td>
                              <td className="py-3 px-4 text-center font-mono font-medium text-stone-700">
                                {dept.employeeCount}
                              </td>
                              <td className="py-3 px-4 text-right font-mono font-medium text-stone-900">
                                ₹
                                {dept.totalGross.toLocaleString('en-IN', {
                                  minimumFractionDigits: 2,
                                })}
                              </td>
                              <td className="py-3 px-4 text-right font-mono font-medium text-rose-700">
                                ₹
                                {dept.totalDeductions.toLocaleString('en-IN', {
                                  minimumFractionDigits: 2,
                                })}
                              </td>
                              <td className="py-3 px-4 text-right font-mono font-bold text-emerald-800">
                                ₹
                                {dept.totalNet.toLocaleString('en-IN', {
                                  minimumFractionDigits: 2,
                                })}
                              </td>
                              <td className="py-3 px-4 text-right font-mono font-medium text-blue-900">
                                ₹
                                {dept.totalEmployerCost.toLocaleString('en-IN', {
                                  minimumFractionDigits: 2,
                                })}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-stone-400 text-xs">
                              No department breakdown data available yet. Calculate payroll to
                              generate department summaries.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Material Movements in Period */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* New Joiners */}
                <Card className="border border-stone-200/80 shadow-xs bg-white p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                    <h5 className="font-bold text-xs text-stone-900 flex items-center gap-1.5">
                      <UserPlus className="w-4 h-4 text-emerald-600" />
                      New Joiners ({reviewSummary?.movements?.newJoiners?.length || 0})
                    </h5>
                    <span className="text-[10px] text-stone-400">Joined in payroll period</span>
                  </div>
                  {reviewSummary?.movements?.newJoiners &&
                  reviewSummary.movements.newJoiners.length > 0 ? (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {reviewSummary.movements.newJoiners.map((j) => (
                        <div
                          key={j.id}
                          className="p-2 bg-stone-50 rounded-lg text-xs flex items-center justify-between"
                        >
                          <div>
                            <div className="font-semibold text-stone-800">{j.name}</div>
                            <div className="text-[10px] text-stone-400">
                              {j.employeeCode} • {j.department || 'N/A'}
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200"
                          >
                            {new Date(j.joiningDate).toLocaleDateString()}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-stone-400 py-3 text-center">
                      No new joiners in this period.
                    </p>
                  )}
                </Card>

                {/* Exits */}
                <Card className="border border-stone-200/80 shadow-xs bg-white p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                    <h5 className="font-bold text-xs text-stone-900 flex items-center gap-1.5">
                      <UserMinus className="w-4 h-4 text-rose-600" />
                      Exits / Relieved ({reviewSummary?.movements?.exits?.length || 0})
                    </h5>
                    <span className="text-[10px] text-stone-400">Left in payroll period</span>
                  </div>
                  {reviewSummary?.movements?.exits && reviewSummary.movements.exits.length > 0 ? (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {reviewSummary.movements.exits.map((e) => (
                        <div
                          key={e.id}
                          className="p-2 bg-stone-50 rounded-lg text-xs flex items-center justify-between"
                        >
                          <div>
                            <div className="font-semibold text-stone-800">{e.name}</div>
                            <div className="text-[10px] text-stone-400">
                              {e.employeeCode} • {e.department || 'N/A'}
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-rose-50 text-rose-700 border-rose-200"
                          >
                            {new Date(e.leavingDate).toLocaleDateString()}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-stone-400 py-3 text-center">
                      No exits in this period.
                    </p>
                  )}
                </Card>

                {/* Compensation Changes */}
                <Card className="border border-stone-200/80 shadow-xs bg-white p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                    <h5 className="font-bold text-xs text-stone-900 flex items-center gap-1.5">
                      <TrendingUp className="w-4 h-4 text-amber-700" />
                      Compensation Revisions (
                      {reviewSummary?.movements?.compensationChanges?.length || 0})
                    </h5>
                    <span className="text-[10px] text-stone-400">Effective in period</span>
                  </div>
                  {reviewSummary?.movements?.compensationChanges &&
                  reviewSummary.movements.compensationChanges.length > 0 ? (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {reviewSummary.movements.compensationChanges.map((c, i) => (
                        <div
                          key={i}
                          className="p-2 bg-stone-50 rounded-lg text-xs flex items-center justify-between"
                        >
                          <div>
                            <div className="font-semibold text-stone-800">{c.name}</div>
                            <div className="text-[10px] text-stone-400">
                              {c.employeeCode} • {c.department || 'N/A'}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-stone-900 font-mono">
                              ₹{c.newMonthlyGross.toLocaleString('en-IN')}/mo
                            </div>
                            <div className="text-[10px] text-stone-400">
                              {new Date(c.effectiveDate).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-stone-400 py-3 text-center">
                      No compensation revisions in this period.
                    </p>
                  )}
                </Card>

                {/* Manual Adjustments */}
                <Card className="border border-stone-200/80 shadow-xs bg-white p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                    <h5 className="font-bold text-xs text-stone-900 flex items-center gap-1.5">
                      <Banknote className="w-4 h-4 text-blue-700" />
                      Manual Adjustments ({reviewSummary?.movements?.manualAdjustments?.length || 0}
                      )
                    </h5>
                    <span className="text-[10px] text-stone-400">Bonus, arrears & recoveries</span>
                  </div>
                  {reviewSummary?.movements?.manualAdjustments &&
                  reviewSummary.movements.manualAdjustments.length > 0 ? (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {reviewSummary.movements.manualAdjustments.map((a) => (
                        <div
                          key={a.id}
                          className="p-2 bg-stone-50 rounded-lg text-xs flex items-center justify-between"
                        >
                          <div>
                            <div className="font-semibold text-stone-800">
                              {a.name} ({a.employeeCode})
                            </div>
                            <div className="text-[10px] text-stone-500">
                              {a.title} ({a.type})
                            </div>
                          </div>
                          <div
                            className={`font-mono font-bold ${a.amount >= 0 ? 'text-emerald-800' : 'text-rose-700'}`}
                          >
                            {a.amount >= 0 ? '+' : ''}₹{a.amount.toLocaleString('en-IN')}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-stone-400 py-3 text-center">
                      No manual adjustments recorded for this run.
                    </p>
                  )}
                </Card>
              </div>
            </div>
          )}

          {/* TAB 1: Financial Snapshots Table */}
          {activeTab === 'snapshots' && (
            <Card className="border border-stone-200/80 shadow-xs bg-white overflow-hidden">
              <CardHeader className="border-b border-stone-100 pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <CardTitle className="text-sm font-bold text-stone-900">
                      Employee Calculation Snapshots ({snapshotsMeta.total || snapshots.length})
                    </CardTitle>
                    <CardDescription className="text-xs text-stone-500">
                      Individual payslip line items, working metrics, earned pay, and exception
                      flags.
                    </CardDescription>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-stone-400" />
                      <input
                        type="text"
                        placeholder="Search code or name..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="text-xs pl-8 pr-3 py-1.5 rounded-lg border border-stone-300 w-44 bg-stone-50 focus:bg-white"
                      />
                    </div>

                    <select
                      value={filterException}
                      onChange={(e) => setFilterException(e.target.value)}
                      className="text-xs px-2.5 py-1.5 rounded-lg border border-stone-300 bg-stone-50 focus:bg-white"
                    >
                      <option value="ALL">All Records</option>
                      <option value="true">Exceptions Only</option>
                      <option value="false">Valid Only</option>
                    </select>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 uppercase tracking-wider text-[11px]">
                      <tr>
                        <th className="py-3 px-4 font-semibold">Employee</th>
                        <th className="py-3 px-4 font-semibold">Department</th>
                        <th className="py-3 px-4 font-semibold text-center">
                          Calendar / Paid Days
                        </th>
                        <th className="py-3 px-4 font-semibold text-right">Base Monthly</th>
                        <th className="py-3 px-4 font-semibold text-right">Earned Gross</th>
                        <th className="py-3 px-4 font-semibold text-right">Deductions</th>
                        <th className="py-3 px-4 font-semibold text-right">Net Payable</th>
                        <th className="py-3 px-4 font-semibold text-center">Status</th>
                        <th className="py-3 px-4 font-semibold text-right">Breakdown</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {snapshots.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-12 text-center text-stone-400">
                            {run.status === 'DRAFT'
                              ? 'Run is in DRAFT. Click "Calculate Run" above to generate snapshots.'
                              : 'No snapshots matching filters.'}
                          </td>
                        </tr>
                      ) : (
                        snapshots.map((s) => (
                          <tr key={s.id} className="hover:bg-stone-50/60 transition-colors">
                            <td className="py-3 px-4">
                              <div className="font-semibold text-stone-900">{s.employeeName}</div>
                              <div className="text-[10px] text-stone-400 font-mono">
                                {s.employeeCode} • {s.payslipNumber}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-stone-600">{s.departmentName || '—'}</td>
                            <td className="py-3 px-4 text-center font-mono text-stone-700">
                              {Number(s.calendarDays)} / {Number(s.paidDays)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-stone-600">
                              ₹
                              {Number(s.baseMonthlyGross).toLocaleString('en-IN', {
                                minimumFractionDigits: 2,
                              })}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-medium text-stone-900">
                              ₹
                              {Number(s.earnedGross).toLocaleString('en-IN', {
                                minimumFractionDigits: 2,
                              })}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-rose-700">
                              ₹
                              {Number(s.totalDeductions).toLocaleString('en-IN', {
                                minimumFractionDigits: 2,
                              })}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-emerald-800">
                              ₹
                              {Number(s.netSalary).toLocaleString('en-IN', {
                                minimumFractionDigits: 2,
                              })}
                            </td>
                            <td className="py-3 px-4 text-center">
                              {s.isException ? (
                                <Badge
                                  variant="outline"
                                  className="bg-amber-50 text-amber-800 border-amber-300 text-[10px]"
                                >
                                  EXCEPTION
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="bg-emerald-50 text-emerald-800 border-emerald-300 text-[10px]"
                                >
                                  {s.payslipStatus}
                                </Badge>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenSnapshotDetail(s)}
                                className="h-7 text-[11px] border-stone-200"
                              >
                                <Eye className="w-3 h-3 mr-1 text-stone-400" />
                                View
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* TAB 2: Attendance & Leave Reconciliation Table */}
          {activeTab === 'attendance' && (
            <Card className="border border-stone-200/80 shadow-xs bg-white overflow-hidden space-y-4">
              <CardHeader className="border-b border-stone-100 pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <CardTitle className="text-sm font-bold text-stone-900 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-amber-800" />
                      Attendance, Leave, WFH & Shift Reconciliation
                    </CardTitle>
                    <CardDescription className="text-xs text-stone-500">
                      Cross-verification between canonical working records, approved leaves, and
                      resultant payroll paid days.
                    </CardDescription>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFilterLateOnly(!filterLateOnly)}
                      className={`text-xs px-2.5 py-1.5 rounded-lg border font-semibold transition-colors ${
                        filterLateOnly
                          ? 'bg-amber-100 text-amber-900 border-amber-300'
                          : 'bg-stone-50 text-stone-600 border-stone-300'
                      }`}
                    >
                      {filterLateOnly ? 'Showing Late Only' : 'Filter Late Changes'}
                    </button>
                  </div>
                </div>
              </CardHeader>

              {/* KPI Strip for Attendance & Leave */}
              {reconciliationData && (
                <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 px-6">
                  <div className="p-2.5 bg-stone-50 rounded-lg border border-stone-200 text-xs">
                    <span className="text-[10px] text-stone-400 block uppercase">
                      Expected Workdays
                    </span>
                    <span className="font-bold font-mono text-stone-900 text-sm">
                      {reconciliationData.totalExpectedWorkdays}
                    </span>
                  </div>
                  <div className="p-2.5 bg-stone-50 rounded-lg border border-stone-200 text-xs">
                    <span className="text-[10px] text-stone-400 block uppercase">
                      Recognized Work
                    </span>
                    <span className="font-bold font-mono text-emerald-800 text-sm">
                      {reconciliationData.totalRecognizedWorkdays}
                    </span>
                  </div>
                  <div className="p-2.5 bg-stone-50 rounded-lg border border-stone-200 text-xs">
                    <span className="text-[10px] text-stone-400 block uppercase">Paid Leave</span>
                    <span className="font-bold font-mono text-blue-800 text-sm">
                      {reconciliationData.totalPaidLeaveDays}
                    </span>
                  </div>
                  <div className="p-2.5 bg-stone-50 rounded-lg border border-stone-200 text-xs">
                    <span className="text-[10px] text-stone-400 block uppercase">Unpaid (LOP)</span>
                    <span className="font-bold font-mono text-rose-700 text-sm">
                      {reconciliationData.totalUnpaidLeaveDays}
                    </span>
                  </div>
                  <div className="p-2.5 bg-stone-50 rounded-lg border border-stone-200 text-xs">
                    <span className="text-[10px] text-stone-400 block uppercase">Exceptions</span>
                    <span
                      className={`font-bold font-mono text-sm ${
                        reconciliationData.totalExceptions > 0 ? 'text-amber-700' : 'text-stone-500'
                      }`}
                    >
                      {reconciliationData.totalExceptions}
                    </span>
                  </div>
                  <div className="p-2.5 bg-stone-50 rounded-lg border border-stone-200 text-xs">
                    <span className="text-[10px] text-stone-400 block uppercase">Late Changes</span>
                    <span
                      className={`font-bold font-mono text-sm ${
                        reconciliationData.lateChangesDetected > 0
                          ? 'text-amber-700'
                          : 'text-stone-500'
                      }`}
                    >
                      {reconciliationData.lateChangesDetected}
                    </span>
                  </div>
                </div>
              )}

              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 uppercase tracking-wider text-[11px]">
                      <tr>
                        <th className="py-3 px-4 font-semibold">Employee</th>
                        <th className="py-3 px-4 font-semibold text-center">Cal / Eligible</th>
                        <th className="py-3 px-4 font-semibold text-center">Expected</th>
                        <th className="py-3 px-4 font-semibold text-center">
                          Recognized (Work/WFH/Visit)
                        </th>
                        <th className="py-3 px-4 font-semibold text-center">Paid Leave</th>
                        <th className="py-3 px-4 font-semibold text-center">Unpaid (LOP)</th>
                        <th className="py-3 px-4 font-semibold text-center">Holidays / Offs</th>
                        <th className="py-3 px-4 font-semibold text-center">Final Paid Days</th>
                        <th className="py-3 px-4 font-semibold text-right">Payroll Treatment</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {!reconciliationData || reconciliationData.items.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-12 text-center text-stone-400">
                            No attendance reconciliation records available for this run.
                          </td>
                        </tr>
                      ) : (
                        reconciliationData.items
                          .filter((item: any) => (filterLateOnly ? item.hasLateChanges : true))
                          .map((item: any) => (
                            <tr
                              key={item.employeeId}
                              className={`hover:bg-stone-50/60 transition-colors ${
                                item.hasLateChanges ? 'bg-amber-50/40' : ''
                              }`}
                            >
                              <td className="py-3 px-4">
                                <div className="font-semibold text-stone-900">
                                  {item.employeeName}
                                </div>
                                <div className="text-[10px] text-stone-400 font-mono">
                                  {item.employeeCode} • {item.departmentName || 'General'}
                                </div>
                              </td>
                              <td className="py-3 px-4 text-center font-mono">
                                {item.calendarDays} / {item.eligibleDays}
                              </td>
                              <td className="py-3 px-4 text-center font-mono text-stone-700">
                                {item.expectedWorkdays}
                              </td>
                              <td className="py-3 px-4 text-center font-mono text-emerald-800">
                                <span className="font-semibold">{item.recognizedWorkdays}</span>
                                <div className="text-[10px] text-stone-400">
                                  {item.officeWorkedDays} off / {item.wfhDays} wfh /{' '}
                                  {item.officialVisitDays} vis
                                </div>
                              </td>
                              <td className="py-3 px-4 text-center font-mono text-blue-800 font-medium">
                                {item.approvedPaidLeaveDays}
                              </td>
                              <td className="py-3 px-4 text-center font-mono text-rose-700 font-medium">
                                {item.approvedUnpaidLeaveDays}
                              </td>
                              <td className="py-3 px-4 text-center font-mono text-stone-500">
                                {item.holidays} / {item.weeklyOffs}
                              </td>
                              <td className="py-3 px-4 text-center font-mono font-bold text-stone-900">
                                {item.paidDays}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <div className="flex flex-col items-end gap-1">
                                  <Badge
                                    variant="outline"
                                    className={`text-[9px] px-1.5 py-0 ${
                                      item.treatment === 'STANDARD_ATTENDANCE'
                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                        : item.treatment === 'LOP_PRORATED'
                                          ? 'bg-rose-50 text-rose-800 border-rose-300'
                                          : 'bg-blue-50 text-blue-800 border-blue-300'
                                    }`}
                                  >
                                    {item.treatment}
                                  </Badge>
                                  {item.hasLateChanges && (
                                    <Badge
                                      variant="outline"
                                      className="text-[9px] px-1 py-0 bg-amber-100 text-amber-800 border-amber-300"
                                    >
                                      LATE CHANGE
                                    </Badge>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* TAB 3: Phase 11.7 Exceptions & Validation */}
          {activeTab === 'exceptions' && (
            <div className="space-y-4">
              <Card className="border border-stone-200/80 shadow-xs bg-white">
                <CardHeader className="border-b border-stone-100 pb-3 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-bold text-stone-900 flex items-center gap-2">
                      <ShieldAlert className="w-5 h-5 text-amber-700" />
                      Payroll Run Validation Exceptions ({exceptionsSummary?.total || 0})
                    </CardTitle>
                    <CardDescription className="text-xs text-stone-500 mt-0.5">
                      Deterministic rule flags, anomaly detectors, and resolution history for this
                      run.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRevalidate}
                      disabled={actionLoading}
                      className="text-xs gap-1"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
                      Re-validate Run
                    </Button>
                    <Link href={`/payroll/exceptions?runId=${runId}`}>
                      <Button variant="outline" size="sm" className="text-xs gap-1">
                        Open in Full Page <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {runExceptions.length === 0 ? (
                    <div className="py-16 text-center space-y-2">
                      <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-700">
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <p className="text-sm font-semibold text-stone-800">No Exceptions Found</p>
                      <p className="text-xs text-stone-400">
                        All calculated employee snapshots and records satisfy validation rules.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 uppercase tracking-wider text-[11px]">
                          <tr>
                            <th className="py-3 px-4 font-semibold">Severity / Category</th>
                            <th className="py-3 px-4 font-semibold">Employee</th>
                            <th className="py-3 px-4 font-semibold">Title & Rule</th>
                            <th className="py-3 px-4 font-semibold">Explanation</th>
                            <th className="py-3 px-4 font-semibold">Status / Resolution</th>
                            <th className="py-3 px-4 font-semibold text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                          {runExceptions.map((ex: any) => (
                            <tr
                              key={ex.id}
                              className={
                                ex.severity === 'BLOCKING_ERROR' && ex.status === 'OPEN'
                                  ? 'bg-red-50/20'
                                  : undefined
                              }
                            >
                              <td className="py-3 px-4 space-y-1">
                                {ex.severity === 'BLOCKING_ERROR' ? (
                                  <Badge variant="danger" className="text-[10px] bg-red-600">
                                    BLOCKING ERROR
                                  </Badge>
                                ) : ex.severity === 'WARNING' ? (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] bg-amber-50 text-amber-800 border-amber-300"
                                  >
                                    REVIEW WARNING
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] bg-blue-50 text-blue-800 border-blue-300"
                                  >
                                    INFORMATION
                                  </Badge>
                                )}
                                <div className="text-[10px] font-mono text-stone-500">
                                  {ex.category}
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <div className="font-semibold text-stone-900">
                                  {ex.employeeName || 'N/A'}
                                </div>
                                <div className="text-[10px] text-stone-400 font-mono">
                                  {ex.employeeCode} • {ex.departmentName || 'N/A'}
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <div className="font-semibold text-stone-800">{ex.title}</div>
                                <div className="text-[10px] text-stone-400 font-mono">
                                  Rule: {ex.ruleName}
                                </div>
                              </td>
                              <td className="py-3 px-4 max-w-xs text-stone-600 text-[11px] leading-relaxed">
                                {ex.explanation}
                              </td>
                              <td className="py-3 px-4">
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold ${
                                    ex.status === 'OPEN'
                                      ? 'bg-red-50 text-red-700 border border-red-200'
                                      : ex.status === 'OVERRIDDEN'
                                        ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  }`}
                                >
                                  {ex.status}
                                </span>
                                {ex.resolutionNotes && (
                                  <div
                                    className="text-[10px] text-stone-500 mt-1 italic truncate max-w-[150px]"
                                    title={ex.resolutionNotes}
                                  >
                                    "{ex.resolutionNotes}"
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right">
                                {ex.status === 'OPEN' && canManage && (
                                  <Button
                                    size="sm"
                                    onClick={() => handleOpenResolveModal(ex)}
                                    className="text-xs bg-stone-900 hover:bg-stone-800 text-white font-medium"
                                  >
                                    Resolve
                                  </Button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* Approval & State Machine Audit Trail */}
          <Card className="border border-stone-200/80 shadow-xs bg-white">
            <CardHeader className="border-b border-stone-100 pb-3">
              <CardTitle className="text-sm font-bold text-stone-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-800" />
                Lifecycle Transition & Approval Audit Trail
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-3">
                {run.approvalHistories && run.approvalHistories.length > 0 ? (
                  run.approvalHistories.map((h: any) => (
                    <div
                      key={h.id}
                      className="p-3 rounded-lg bg-stone-50 border border-stone-200 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-stone-900">{h.action}</span>
                          {h.previousStatus && (
                            <span className="text-stone-400 text-[11px]">
                              ({h.previousStatus} → {h.newStatus})
                            </span>
                          )}
                        </div>
                        {h.comments && (
                          <div className="text-stone-600 text-[11px] italic">"{h.comments}"</div>
                        )}
                        <div className="text-[10px] text-stone-400">
                          Actor: {h.actor?.firstName} {h.actor?.lastName} ({h.actor?.email})
                        </div>
                      </div>
                      <div className="text-[10px] text-stone-400 font-mono self-end sm:self-auto">
                        {new Date(h.createdAt).toLocaleString()}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-stone-400 italic py-4 text-center">
                    No transition events recorded yet.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ------------------------------------------------------------------ */}
          {/* Modal: View Snapshot Breakdown */}
          {/* ------------------------------------------------------------------ */}
          <Dialog
            isOpen={Boolean(selectedSnapshot)}
            onClose={() => {
              setSelectedSnapshot(null);
              setCalculationDetail(null);
            }}
            title="Employee Payroll Calculation Detail & Audit Snapshot"
            description={
              selectedSnapshot
                ? `${selectedSnapshot.employeeName} (${selectedSnapshot.employeeCode}) • Payslip: ${selectedSnapshot.payslipNumber}`
                : ''
            }
          >
            {selectedSnapshot && (
              <div className="space-y-4 pt-2 text-xs max-h-[75vh] overflow-y-auto pr-1">
                {selectedSnapshot.isException && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <strong>Exception Flagged:</strong>{' '}
                      {selectedSnapshot.exceptionReason ||
                        'No approved compensation assignment active for period'}
                    </div>
                  </div>
                )}

                {/* Audit Reconciliation Banner */}
                {calculationDetail?.reconciliation && (
                  <div
                    className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
                      calculationDetail.reconciliation.isReconciled
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-rose-50 border-rose-200 text-rose-900'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {calculationDetail.reconciliation.isReconciled ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      )}
                      <div>
                        <span className="font-bold">
                          {calculationDetail.reconciliation.isReconciled
                            ? 'Deterministic Financial Reconciliation: VERIFIED'
                            : 'Reconciliation Discrepancy Flagged'}
                        </span>
                        <div className="text-[10px] opacity-80">
                          {calculationDetail.reconciliation.isReconciled
                            ? `Sum of line-item earnings (₹${calculationDetail.reconciliation.sumItemEarnings}) and deductions (₹${calculationDetail.reconciliation.sumItemDeductions}) perfectly balance to Net Pay.`
                            : calculationDetail.reconciliation.discrepancyReason}
                        </div>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] font-mono ${
                        calculationDetail.reconciliation.isReconciled
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : 'bg-rose-100 text-rose-800 border-rose-300'
                      }`}
                    >
                      v{calculationDetail.calculationVersion}
                    </Badge>
                  </div>
                )}

                {/* High-Level Calculation Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 bg-stone-50 rounded-lg border border-stone-200 font-mono text-xs">
                  <div>
                    <span className="text-[10px] text-stone-400 block uppercase">
                      Days (Cal / Paid)
                    </span>
                    <span className="font-bold text-stone-800">
                      {Number(selectedSnapshot.calendarDays)} / {Number(selectedSnapshot.paidDays)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-stone-400 block uppercase">Base Monthly</span>
                    <span className="font-bold text-stone-800">
                      ₹
                      {Number(selectedSnapshot.baseMonthlyGross).toLocaleString('en-IN', {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-stone-400 block uppercase">Earned Gross</span>
                    <span className="font-bold text-stone-900">
                      ₹
                      {Number(selectedSnapshot.earnedGross).toLocaleString('en-IN', {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-stone-400 block uppercase">Deductions</span>
                    <span className="font-bold text-rose-700">
                      ₹
                      {Number(selectedSnapshot.totalDeductions).toLocaleString('en-IN', {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-stone-400 block uppercase">
                      Employer Contrib.
                    </span>
                    <span className="font-bold text-stone-600">
                      ₹
                      {Number(
                        calculationDetail?.inputSnapshot?.totalEmployerContributions ?? 0,
                      ).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-stone-400 block uppercase">
                      Rounding Adjustment
                    </span>
                    <span className="font-bold text-stone-600">
                      ₹
                      {Number(
                        calculationDetail?.roundingAdjustment ??
                          selectedSnapshot.roundingAdjustment ??
                          0,
                      ).toFixed(2)}
                    </span>
                  </div>
                  <div className="sm:col-span-2 bg-white p-2 rounded border border-stone-200">
                    <span className="text-[10px] text-stone-400 block uppercase font-sans font-semibold">
                      Net Payable Take-Home
                    </span>
                    <span className="font-bold text-emerald-800 text-base">
                      ₹
                      {Number(selectedSnapshot.netSalary).toLocaleString('en-IN', {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                </div>

                {/* Calculation Explanations & Rule Versions */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-stone-800">
                      Itemized Line Items & Calculation Explanations
                    </span>
                    <span className="text-[10px] text-stone-400">
                      {loadingDetail ? 'Loading formulas...' : 'Traceable rule derivations'}
                    </span>
                  </div>

                  {calculationDetail?.lineItemExplanations &&
                  calculationDetail.lineItemExplanations.length > 0 ? (
                    <div className="border border-stone-200 rounded-lg overflow-hidden divide-y divide-stone-100">
                      {calculationDetail.lineItemExplanations.map((line: any, idx: number) => (
                        <div
                          key={idx}
                          className="p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs hover:bg-stone-50/70 transition-colors"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-stone-900">
                                {line.componentName}
                              </span>
                              <Badge
                                variant="outline"
                                className={`text-[9px] px-1.5 py-0 ${
                                  line.type === 'EARNING'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : line.type === 'DEDUCTION'
                                      ? 'bg-rose-50 text-rose-800 border-rose-200'
                                      : 'bg-stone-100 text-stone-700 border-stone-200'
                                }`}
                              >
                                {line.type}
                              </Badge>
                              {line.isProrated && (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] px-1 py-0 bg-blue-50 text-blue-700 border-blue-200"
                                >
                                  PRORATED
                                </Badge>
                              )}
                            </div>
                            <div className="text-[10px] text-stone-500 font-mono">
                              {line.explanation}
                            </div>
                          </div>

                          <div className="text-right font-mono shrink-0">
                            <div
                              className={`font-bold ${
                                line.type === 'EARNING'
                                  ? 'text-stone-900'
                                  : line.type === 'DEDUCTION'
                                    ? 'text-rose-700'
                                    : 'text-stone-500'
                              }`}
                            >
                              {line.type === 'DEDUCTION' ? '-' : ''}₹
                              {Number(line.earnedAmount).toLocaleString('en-IN', {
                                minimumFractionDigits: 2,
                              })}
                            </div>
                            {line.baseAmount !== undefined && (
                              <div className="text-[10px] text-stone-400">
                                Base: ₹
                                {Number(line.baseAmount).toLocaleString('en-IN', {
                                  minimumFractionDigits: 2,
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : selectedSnapshot.items && selectedSnapshot.items.length > 0 ? (
                    <div className="border border-stone-200 rounded-lg overflow-hidden divide-y divide-stone-100">
                      {selectedSnapshot.items.map((item: any) => (
                        <div
                          key={item.id}
                          className="p-2.5 flex items-center justify-between text-xs"
                        >
                          <div>
                            <div className="font-semibold text-stone-900">{item.componentName}</div>
                            <div className="text-[10px] text-stone-400 font-mono">
                              {item.componentCode} • {item.type}
                            </div>
                          </div>
                          <div className="text-right font-mono">
                            <span
                              className={`font-bold ${
                                item.type === 'EARNING' ? 'text-stone-900' : 'text-rose-700'
                              }`}
                            >
                              {item.type === 'DEDUCTION' ? '-' : ''}₹
                              {Number(item.earnedAmount).toLocaleString('en-IN', {
                                minimumFractionDigits: 2,
                              })}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-stone-400 italic bg-stone-50 rounded-lg">
                      No itemized components recorded for this snapshot.
                    </div>
                  )}
                </div>

                {/* Calculation Warnings if any */}
                {calculationDetail?.inputSnapshot?.warnings &&
                  calculationDetail.inputSnapshot.warnings.length > 0 && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-[11px] space-y-1">
                      <div className="font-bold flex items-center gap-1.5 text-amber-900">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                        Calculation Warnings
                      </div>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {calculationDetail.inputSnapshot.warnings.map((w: string, i: number) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                <div className="flex justify-end pt-2 border-t border-stone-200">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedSnapshot(null);
                      setCalculationDetail(null);
                    }}
                  >
                    Close
                  </Button>
                </div>
              </div>
            )}
          </Dialog>

          {/* ------------------------------------------------------------------ */}
          {/* Modal: Approve Run */}
          {/* ------------------------------------------------------------------ */}
          {/* ------------------------------------------------------------------ */}
          {/* Modal: Approve Run */}
          {/* ------------------------------------------------------------------ */}
          <Dialog
            isOpen={isApproveOpen}
            onClose={() => setIsApproveOpen(false)}
            title="Approve Payroll Run"
            description="Sign off on calculated amounts and totals. This transitions run to APPROVED status."
          >
            <div className="space-y-4 pt-2 text-xs">
              <p className="text-stone-600">
                You are approving payroll run <strong>{run.title}</strong> across{' '}
                <strong>{run.totalEmployees}</strong> employees.
              </p>

              {/* Separately Labeled Totals */}
              <div className="grid grid-cols-2 gap-2 p-3 bg-stone-50 border border-stone-200 rounded-lg">
                <div>
                  <span className="text-[10px] uppercase font-bold text-stone-500 block">
                    Gross Earnings
                  </span>
                  <span className="font-semibold text-stone-900 text-sm">
                    ₹
                    {Number(run.totalGross || 0).toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-stone-500 block">
                    Total Deductions
                  </span>
                  <span className="font-semibold text-stone-900 text-sm">
                    ₹
                    {Number(run.totalDeductions || 0).toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-emerald-700 block">
                    Net Pay
                  </span>
                  <span className="font-bold text-emerald-800 text-sm">
                    ₹
                    {Number(run.totalNet || 0).toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-indigo-700 block">
                    Employer Costs
                  </span>
                  <span className="font-bold text-indigo-800 text-sm">
                    ₹
                    {Number(run.totalEmployerCost || 0).toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>

              {/* Separation of Duties Restriction */}
              {reviewSummary?.separationOfDuties.selfApprovalBlocked && (
                <div className="p-3 bg-rose-50 border border-rose-300 rounded-lg text-rose-900 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <ShieldAlert className="w-4 h-4 text-rose-600" />
                    <span>Separation of Duties Violation</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    {reviewSummary.separationOfDuties.reason ||
                      'You cannot approve this payroll run because you initiated or executed the calculation. Organizational policy requires an independent approver.'}
                  </p>
                </div>
              )}

              {/* Material Changes Warning */}
              {lateReport?.requiresRecalculation && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>Recalculation Required</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    Material input changes ({lateReport.totalLateChanges} late attendance records or
                    modifications) were detected since the last calculation. This run must be
                    recalculated before approval.
                  </p>
                </div>
              )}

              {exceptionsSummary?.hasBlockingErrors && (
                <div className="p-3 bg-red-50 border border-red-300 rounded-lg text-red-900 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <ShieldAlert className="w-4 h-4 text-red-600" />
                    <span>Approval Blocked by Policy</span>
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    This payroll run currently has {exceptionsSummary.blockingErrors} unresolved
                    blocking error(s). All blocking errors must be resolved or overridden before
                    approval.
                  </p>
                </div>
              )}

              {exceptionsSummary &&
                exceptionsSummary.warnings > 0 &&
                !exceptionsSummary.hasBlockingErrors && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <span>Audit Preservation Notice</span>
                    </div>
                    <p className="text-[11px] leading-relaxed">
                      This run contains {exceptionsSummary.warnings} unresolved review warning(s).
                      By approving, these warnings will be preserved in the final audit trail and
                      approval history.
                    </p>
                  </div>
                )}

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Approval Comments / Sign-off Remarks
                </label>
                <textarea
                  rows={3}
                  placeholder="Optional review remarks (e.g. Verified with Finance Director)..."
                  value={approveComments}
                  onChange={(e) => setApproveComments(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
                <Button size="sm" variant="outline" onClick={() => setIsApproveOpen(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={
                    actionLoading ||
                    exceptionsSummary?.hasBlockingErrors ||
                    reviewSummary?.separationOfDuties.selfApprovalBlocked ||
                    lateReport?.requiresRecalculation
                  }
                  onClick={handleApprove}
                  className={
                    exceptionsSummary?.hasBlockingErrors ||
                    reviewSummary?.separationOfDuties.selfApprovalBlocked ||
                    lateReport?.requiresRecalculation
                      ? 'bg-stone-300 text-stone-500 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }
                >
                  {reviewSummary?.separationOfDuties.selfApprovalBlocked
                    ? 'Self-Approval Restricted'
                    : lateReport?.requiresRecalculation
                      ? 'Recalculation Required'
                      : exceptionsSummary?.hasBlockingErrors
                        ? 'Approval Blocked'
                        : 'Confirm Approval'}
                </Button>
              </div>
            </div>
          </Dialog>

          {/* ------------------------------------------------------------------ */}
          {/* Modal: Return for Correction */}
          {/* ------------------------------------------------------------------ */}
          <Dialog
            isOpen={isReturnForCorrectionOpen}
            onClose={() => setIsReturnForCorrectionOpen(false)}
            title="Return Payroll Run for Correction"
            description="Reverts APPROVED status back to REVIEW_PENDING for corrections or adjustments."
          >
            <div className="space-y-4 pt-2 text-xs">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <RotateCcw className="w-4 h-4 text-amber-700" />
                  <span>Controlled Correction Workflow</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  Returning this run will unlock it for recalculation and revision before final
                  locking. This action and its justification will be recorded in the immutable audit
                  history.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Correction Reason *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Specify mandatory reason (e.g. Revision needed for newly approved sales incentives)..."
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Operational Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Additional notes for payroll team..."
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsReturnForCorrectionOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={actionLoading || !returnReason.trim()}
                  onClick={handleReturnForCorrection}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-medium"
                >
                  Confirm Return for Correction
                </Button>
              </div>
            </div>
          </Dialog>

          {/* ------------------------------------------------------------------ */}
          {/* Modal: Reject Run */}
          {/* ------------------------------------------------------------------ */}
          <Dialog
            isOpen={isRejectOpen}
            onClose={() => setIsRejectOpen(false)}
            title="Reject Payroll Run"
            description="Send this run back to DRAFT for corrections or recalculation."
          >
            <div className="space-y-4 pt-2 text-xs">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Rejection Reason *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Provide explicit reasons for rejection (e.g. Sales incentives missing)..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
                <Button size="sm" variant="outline" onClick={() => setIsRejectOpen(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={actionLoading || !rejectionReason.trim()}
                  onClick={handleReject}
                  className="bg-rose-600 hover:bg-rose-700 text-white"
                >
                  Confirm Rejection
                </Button>
              </div>
            </div>
          </Dialog>

          {/* ------------------------------------------------------------------ */}
          {/* Modal: Lock Run */}
          {/* ------------------------------------------------------------------ */}
          <Dialog
            isOpen={isLockOpen}
            onClose={() => setIsLockOpen(false)}
            title="Lock & Finalize Payroll Run"
            description="Locking freezes all calculation snapshots permanently. Once locked, line items cannot be edited."
          >
            <div className="space-y-4 pt-2 text-xs">
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-purple-900 text-xs">
                <strong>Immutable Finalization:</strong> After locking, any adjustments will
                strictly require an authorized post-lock correction run.
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Locking Notes
                </label>
                <textarea
                  rows={3}
                  placeholder="Optional final audit remarks..."
                  value={lockNotes}
                  onChange={(e) => setLockNotes(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
                <Button size="sm" variant="outline" onClick={() => setIsLockOpen(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={actionLoading}
                  onClick={handleLock}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  Lock Permanently
                </Button>
              </div>
            </div>
          </Dialog>

          {/* ------------------------------------------------------------------ */}
          {/* Modal: Publish Payslips */}
          {/* ------------------------------------------------------------------ */}
          <Dialog
            isOpen={isPublishOpen}
            onClose={() => setIsPublishOpen(false)}
            title="Publish Payslips to Employee Portal"
            description="Verified payslips will become visible to employees in self-service portal."
          >
            <div className="space-y-4 pt-2 text-xs">
              <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg text-teal-900 text-xs space-y-1">
                <strong>Publication Notice:</strong>
                <p>
                  Publishing updates all employee snapshot states to <strong>PUBLISHED</strong>.
                  Note: Publishing does <em>not</em> trigger bank payments. Payment execution is
                  handled in the payment disbursement module.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
                <Button size="sm" variant="outline" onClick={() => setIsPublishOpen(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={actionLoading}
                  onClick={handlePublish}
                  className="bg-teal-600 hover:bg-teal-700 text-white"
                >
                  Confirm Publication
                </Button>
              </div>
            </div>
          </Dialog>

          {/* ------------------------------------------------------------------ */}
          {/* Modal: Create Correction Run */}
          {/* ------------------------------------------------------------------ */}
          <Dialog
            isOpen={isCorrectionOpen}
            onClose={() => setIsCorrectionOpen(false)}
            title="Issue Post-Lock Correction Run"
            description="Creates a supplementary run linked to this locked run with a mandatory correction reason."
          >
            <div className="space-y-4 pt-2 text-xs">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Correction Reason / Legal Justification *
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Specify why a correction is needed (e.g. Retrospective bonus approved by Board)..."
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Operational Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Optional notes for payroll team..."
                  value={correctionNotes}
                  onChange={(e) => setCorrectionNotes(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
                <Button size="sm" variant="outline" onClick={() => setIsCorrectionOpen(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={actionLoading || !correctionReason.trim()}
                  onClick={handleCreateCorrection}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  Create Correction Run
                </Button>
              </div>
            </div>
          </Dialog>

          {/* ------------------------------------------------------------------ */}
          {/* Modal: Resolve Exception */}
          {/* ------------------------------------------------------------------ */}
          <Dialog
            isOpen={isResolveModalOpen}
            onClose={() => setIsResolveModalOpen(false)}
            title={`Resolve Exception: ${activeException?.title || ''}`}
          >
            <form onSubmit={handleResolveExceptionSubmit} className="space-y-4 text-xs">
              <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-stone-700">Category:</span>
                  <span className="font-mono text-stone-900">{activeException?.category}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-stone-700">Employee:</span>
                  <span className="font-medium text-stone-900">
                    {activeException?.employeeName || 'N/A'} (
                    {activeException?.employeeCode || 'N/A'})
                  </span>
                </div>
                <p className="text-stone-600 pt-1 border-t border-stone-200 leading-relaxed text-[11px]">
                  {activeException?.explanation}
                </p>
              </div>

              {resolveError && (
                <div className="p-2.5 bg-red-50 text-red-800 border border-red-200 rounded-lg text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{resolveError}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-semibold text-stone-700 block">
                  Resolution Action <span className="text-red-500">*</span>
                </label>
                <select
                  value={resolveAction}
                  onChange={(e) => setResolveAction(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  <option value="OVERRIDE_APPROVED">
                    OVERRIDE_APPROVED - Authorize manual override & sign-off
                  </option>
                  <option value="SOURCE_FIXED">
                    SOURCE_FIXED - Source record fixed in HR/Attendance
                  </option>
                  <option value="RECALCULATED">
                    RECALCULATED - Recalculated with updated parameters
                  </option>
                  <option value="DISMISSED">DISMISSED - Dismiss as non-impacting notice</option>
                </select>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-stone-700">
                    Resolution Reason & Notes <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[10px] text-stone-400">Min. 5 characters required</span>
                </div>
                <textarea
                  rows={3}
                  required
                  placeholder="Mandatory justification for audit trail (e.g. Compensation verified with HR Ops)..."
                  value={resolveNotes}
                  onChange={(e) => setResolveNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="p-2.5 bg-amber-50 rounded-lg border border-amber-200 text-[11px] text-amber-900 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <span>
                  <strong>Audit Requirement:</strong> This override is permanently recorded in the
                  immutable audit trail with your user identity and timestamp.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-200">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsResolveModalOpen(false)}
                  disabled={resolveSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={resolveSubmitting || resolveNotes.trim().length < 5}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold"
                >
                  {resolveSubmitting ? 'Recording...' : 'Record Resolution'}
                </Button>
              </div>
            </form>
          </Dialog>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
