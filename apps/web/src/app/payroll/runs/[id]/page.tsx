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
} from 'lucide-react';

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

  // Selected snapshot for breakdown modal
  const [selectedSnapshot, setSelectedSnapshot] = useState<any>(null);

  const fetchRunData = useCallback(async () => {
    try {
      setLoading(true);
      const [runRes, snapsRes] = await Promise.all([
        apiClient.getPayrollRun(runId),
        apiClient.getPayrollRunSnapshots(runId, {
          search: search || undefined,
          isException:
            filterException === 'true' ? true : filterException === 'false' ? false : undefined,
          limit: 50,
        }),
      ]);

      setRun(runRes?.data || null);
      setSnapshots(snapsRes?.data || []);
      setSnapshotsMeta(snapsRes?.meta || { total: 0 });
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

              {/* REVIEW_PENDING: Approve, Reject, Recalculate */}
              {run.status === 'REVIEW_PENDING' && (
                <>
                  {canApprove && (
                    <Button
                      size="sm"
                      disabled={actionLoading}
                      onClick={() => setIsApproveOpen(true)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                      Approve Run
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

              {/* APPROVED: Lock */}
              {run.status === 'APPROVED' && canApprove && (
                <Button
                  size="sm"
                  disabled={actionLoading}
                  onClick={() => setIsLockOpen(true)}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-medium"
                >
                  <Lock className="w-3.5 h-3.5 mr-1.5" />
                  Lock & Finalize Run
                </Button>
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
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card className="border border-stone-200/80 shadow-xs bg-white p-4 space-y-1">
              <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                Total Employees
              </span>
              <div className="text-xl font-bold font-mono text-stone-900">{run.totalEmployees}</div>
              <div className="text-[10px] text-stone-400">Scoped workforce count</div>
            </Card>

            <Card className="border border-stone-200/80 shadow-xs bg-white p-4 space-y-1">
              <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                Gross Earnings
              </span>
              <div className="text-xl font-bold font-mono text-stone-900">
                ₹{Number(run.totalGross).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-stone-400">Total earned before deductions</div>
            </Card>

            <Card className="border border-stone-200/80 shadow-xs bg-white p-4 space-y-1">
              <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                Total Deductions
              </span>
              <div className="text-xl font-bold font-mono text-rose-700">
                ₹{Number(run.totalDeductions).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-stone-400">Tax, PF & recoveries</div>
            </Card>

            <Card className="border border-stone-200/80 shadow-xs bg-white p-4 space-y-1">
              <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                Net Pay Outflow
              </span>
              <div className="text-xl font-bold font-mono text-emerald-800">
                ₹{Number(run.totalNet).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-stone-400">Total net payable</div>
            </Card>

            <Card className="border border-stone-200/80 shadow-xs bg-white p-4 space-y-1">
              <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                Exceptions
              </span>
              <div
                className={`text-xl font-bold font-mono ${
                  run.exceptionCount > 0 ? 'text-amber-700' : 'text-stone-400'
                }`}
              >
                {run.exceptionCount || 0}
              </div>
              <div className="text-[10px] text-stone-400">Unassigned or missing compensation</div>
            </Card>
          </div>

          {/* Exceptions Alert Panel (if any) */}
          {run.exceptionCount > 0 && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                <span>{run.exceptionCount} Employee Calculation Exception(s) Detected</span>
              </div>
              <p className="text-amber-800 leading-relaxed text-[11px]">
                Some scoped employees lack an approved compensation assignment active for this
                period, resulting in ₹0.00 earned pay. Please assign salary structures to these
                employees and trigger recalculation prior to approval.
              </p>
            </div>
          )}

          {/* Employee Snapshots Table */}
          <Card className="border border-stone-200/80 shadow-xs bg-white overflow-hidden">
            <CardHeader className="border-b border-stone-100 pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-sm font-bold text-stone-900">
                    Employee Calculation Snapshots ({snapshotsMeta.total || snapshots.length})
                  </CardTitle>
                  <CardDescription className="text-xs text-stone-500">
                    Individual payslip line items, working metrics, earned pay, and exception flags.
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
                      <th className="py-3 px-4 font-semibold text-center">Calendar / Paid Days</th>
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
                              onClick={() => setSelectedSnapshot(s)}
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
            onClose={() => setSelectedSnapshot(null)}
            title="Employee Calculation Snapshot"
            description={
              selectedSnapshot
                ? `${selectedSnapshot.employeeName} (${selectedSnapshot.employeeCode}) • Payslip: ${selectedSnapshot.payslipNumber}`
                : ''
            }
          >
            {selectedSnapshot && (
              <div className="space-y-4 pt-2 text-xs">
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

                <div className="grid grid-cols-2 gap-3 p-3 bg-stone-50 rounded-lg border border-stone-200 font-mono">
                  <div>
                    <span className="text-[10px] text-stone-400 block uppercase">
                      Calendar Days
                    </span>
                    <span className="font-bold text-stone-800">
                      {Number(selectedSnapshot.calendarDays)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-stone-400 block uppercase">Paid Days</span>
                    <span className="font-bold text-stone-800">
                      {Number(selectedSnapshot.paidDays)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-stone-400 block uppercase">
                      Base Monthly Gross
                    </span>
                    <span className="font-bold text-stone-800">
                      ₹
                      {Number(selectedSnapshot.baseMonthlyGross).toLocaleString('en-IN', {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-stone-400 block uppercase">
                      Net Payable Salary
                    </span>
                    <span className="font-bold text-emerald-800 text-sm">
                      ₹
                      {Number(selectedSnapshot.netSalary).toLocaleString('en-IN', {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                </div>

                {/* Itemized Components */}
                <div className="space-y-2">
                  <div className="font-bold text-stone-800">Component Line Items</div>
                  {selectedSnapshot.items && selectedSnapshot.items.length > 0 ? (
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

                <div className="flex justify-end pt-2 border-t border-stone-200">
                  <Button size="sm" variant="outline" onClick={() => setSelectedSnapshot(null)}>
                    Close
                  </Button>
                </div>
              </div>
            )}
          </Dialog>

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
                You are approving payroll run <strong>{run.title}</strong> with total net payable of{' '}
                <strong className="text-emerald-800">
                  ₹{Number(run.totalNet).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </strong>{' '}
                across <strong>{run.totalEmployees}</strong> employees.
              </p>

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
                  disabled={actionLoading}
                  onClick={handleApprove}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Confirm Approval
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
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
