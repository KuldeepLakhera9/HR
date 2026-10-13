'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppShell } from '../../../layouts/AppShell';
import { ProtectedRoute } from '../../../components/auth/ProtectedRoute';
import { useAuth } from '../../../context/AuthContext';
import { apiClient } from '../../../lib/api-client';
import { formatCurrency } from '../../../lib/formatters';
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
  Banknote,
  Calendar,
  Layers,
  Plus,
  ArrowRight,
  Calculator,
  ShieldCheck,
  CheckCircle2,
  Clock,
  RefreshCw,
  AlertTriangle,
  Play,
  Lock,
  Eye,
  FileCheck,
  Send,
  AlertCircle,
  Users,
  Search,
} from 'lucide-react';

export default function PayrollRunsPage() {
  const router = useRouter();
  const { hasRole, hasPermission } = useAuth();
  const canManage = hasRole('ADMIN') || hasPermission('PAYROLL_MANAGE');

  const [activeTab, setActiveTab] = useState<'runs' | 'periods'>('runs');
  const [loading, setLoading] = useState(true);
  const [runs, setRuns] = useState<any[]>([]);
  const [periods, setPeriods] = useState<any[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // New Period Modal State
  const [isPeriodModalOpen, setIsPeriodModalOpen] = useState(false);
  const [periodSubmitting, setPeriodSubmitting] = useState(false);
  const [periodForm, setPeriodForm] = useState({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    startDate: '',
    endDate: '',
    cutoffDate: '',
    payoutDate: '',
    processingDeadline: '',
  });

  // New Run Modal State
  const [isRunModalOpen, setIsRunModalOpen] = useState(false);
  const [runSubmitting, setRunSubmitting] = useState(false);
  const [runForm, setRunForm] = useState({
    periodId: '',
    title: '',
    scope: 'ALL',
    notes: '',
  });

  // Scope preview state
  const [scopePreviewLoading, setScopePreviewLoading] = useState(false);
  const [scopePreview, setScopePreview] = useState<any>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [periodsRes, runsRes] = await Promise.all([
        apiClient.getPayrollPeriods(),
        apiClient.getPayrollRuns({
          periodId: selectedPeriodId !== 'ALL' ? selectedPeriodId : undefined,
          status: statusFilter !== 'ALL' ? statusFilter : undefined,
        }),
      ]);

      const periodList = periodsRes?.data || [];
      setPeriods(periodList);
      setRuns(runsRes?.data || []);

      // Default runForm periodId to first open period if not set
      setRunForm((prev) => {
        if (!prev.periodId && periodList.length > 0) {
          const firstOpen = periodList.find((p: any) => p.status !== 'CLOSED') || periodList[0];
          return { ...prev, periodId: firstOpen.id };
        }
        return prev;
      });
    } catch (err) {
      console.error('Failed to load payroll orchestration data', err);
    } finally {
      setLoading(false);
    }
  }, [selectedPeriodId, statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle preview scope
  const handlePreviewScope = async () => {
    if (!runForm.periodId) return;
    try {
      setScopePreviewLoading(true);
      const res = await apiClient.previewPayrollRunScope({
        periodId: runForm.periodId,
        scope: runForm.scope,
      });
      setScopePreview(res?.data || null);
    } catch (err) {
      console.error('Failed to preview scope', err);
    } finally {
      setScopePreviewLoading(false);
    }
  };

  // Create Period submit
  const handleCreatePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setPeriodSubmitting(true);
      await apiClient.createPayrollPeriod({
        year: Number(periodForm.year),
        month: Number(periodForm.month),
        startDate: new Date(periodForm.startDate).toISOString(),
        endDate: new Date(periodForm.endDate).toISOString(),
        cutoffDate: periodForm.cutoffDate
          ? new Date(periodForm.cutoffDate).toISOString()
          : undefined,
        payoutDate: periodForm.payoutDate
          ? new Date(periodForm.payoutDate).toISOString()
          : undefined,
        processingDeadline: periodForm.processingDeadline
          ? new Date(periodForm.processingDeadline).toISOString()
          : undefined,
      });
      setIsPeriodModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to create payroll period');
    } finally {
      setPeriodSubmitting(false);
    }
  };

  // Create Run submit
  const handleCreateRun = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setRunSubmitting(true);
      const res = await apiClient.createPayrollRun({
        periodId: runForm.periodId,
        title: runForm.title,
        scope: runForm.scope,
        notes: runForm.notes,
      });
      setIsRunModalOpen(false);
      if (res?.data?.id) {
        router.push(`/payroll/runs/${res.data.id}`);
      } else {
        fetchData();
      }
    } catch (err: any) {
      alert(err.message || 'Failed to initialize payroll run');
    } finally {
      setRunSubmitting(false);
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
          <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300">
            REVIEW PENDING
          </Badge>
        );
      case 'APPROVED':
        return (
          <Badge variant="outline" className="bg-emerald-50 text-emerald-800 border-emerald-300">
            APPROVED
          </Badge>
        );
      case 'LOCKED':
        return (
          <Badge variant="outline" className="bg-purple-50 text-purple-800 border-purple-300">
            LOCKED
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

  return (
    <ProtectedRoute requiredPermissions={['PAYROLL_VIEW']}>
      <AppShell>
        <div className="space-y-6">
          {/* Top Page Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-stone-200">
            <div>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                  <Banknote className="w-5 h-5" />
                </div>
                <h1 className="text-xl md:text-2xl font-bold text-stone-900 tracking-tight">
                  Payroll Runs & Period Orchestration
                </h1>
              </div>
              <p className="text-sm text-stone-500 mt-1">
                Manage monthly calculation cycles, configure deadlines, initiate runs, review
                snapshots, and publish verified payslips.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchData}
                disabled={loading}
                className="text-stone-600"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>

              {canManage && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const now = new Date();
                      const y = now.getFullYear();
                      const m = now.getMonth() + 1;
                      const sDate = `${y}-${String(m).padStart(2, '0')}-01`;
                      const lastDay = new Date(y, m, 0).getDate();
                      const eDate = `${y}-${String(m).padStart(2, '0')}-${lastDay}`;
                      setPeriodForm({
                        year: y,
                        month: m,
                        startDate: sDate,
                        endDate: eDate,
                        cutoffDate: `${y}-${String(m).padStart(2, '0')}-25`,
                        payoutDate: `${y}-${String(m + 1).padStart(2, '0')}-01`,
                        processingDeadline: `${y}-${String(m).padStart(2, '0')}-28`,
                      });
                      setIsPeriodModalOpen(true);
                    }}
                    className="border-stone-300 text-stone-700"
                  >
                    <Calendar className="w-3.5 h-3.5 mr-1.5 text-stone-500" />
                    New Period
                  </Button>

                  <Button
                    size="sm"
                    onClick={() => {
                      const activePeriod = periods.find((p) => p.status !== 'CLOSED');
                      setRunForm({
                        periodId: activePeriod?.id || '',
                        title: activePeriod
                          ? `${new Date(activePeriod.startDate).toLocaleString('default', { month: 'long', year: 'numeric' })} Regular Payroll Run`
                          : 'Monthly Payroll Run',
                        scope: 'ALL',
                        notes: '',
                      });
                      setScopePreview(null);
                      setIsRunModalOpen(true);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    Create Payroll Run
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Navigation Sub-Tabs */}
          <div className="flex border-b border-stone-200 gap-6">
            <button
              onClick={() => setActiveTab('runs')}
              className={`pb-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'runs'
                  ? 'border-emerald-600 text-emerald-800'
                  : 'border-transparent text-stone-500 hover:text-stone-800'
              }`}
            >
              <Calculator className="w-4 h-4" />
              <span>Payroll Runs ({runs.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('periods')}
              className={`pb-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
                activeTab === 'periods'
                  ? 'border-emerald-600 text-emerald-800'
                  : 'border-transparent text-stone-500 hover:text-stone-800'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>Payroll Periods ({periods.length})</span>
            </button>
          </div>

          {/* ------------------------------------------------------------------ */}
          {/* TAB 1: PAYROLL RUNS */}
          {/* ------------------------------------------------------------------ */}
          {activeTab === 'runs' && (
            <div className="space-y-4">
              {/* Filter Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white rounded-xl border border-stone-200/80">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-semibold text-stone-600">Period:</span>
                    <select
                      value={selectedPeriodId}
                      onChange={(e) => setSelectedPeriodId(e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg border border-stone-300 text-xs bg-stone-50 focus:bg-white"
                    >
                      <option value="ALL">All Periods</option>
                      {periods.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.year} / {String(p.month).padStart(2, '0')} ({p.status})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-semibold text-stone-600">Status:</span>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="px-2.5 py-1.5 rounded-lg border border-stone-300 text-xs bg-stone-50 focus:bg-white"
                    >
                      <option value="ALL">All Statuses</option>
                      <option value="DRAFT">DRAFT</option>
                      <option value="CALCULATING">CALCULATING</option>
                      <option value="REVIEW_PENDING">REVIEW PENDING</option>
                      <option value="APPROVED">APPROVED</option>
                      <option value="LOCKED">LOCKED</option>
                      <option value="PUBLISHED">PUBLISHED</option>
                      <option value="CANCELLED">CANCELLED</option>
                    </select>
                  </div>
                </div>

                <div className="text-xs text-stone-500 font-mono">Showing {runs.length} run(s)</div>
              </div>

              {/* Runs Table */}
              <Card className="border border-stone-200/80 shadow-xs bg-white overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 uppercase tracking-wider text-[11px]">
                      <tr>
                        <th className="py-3 px-4 font-semibold">Run Details</th>
                        <th className="py-3 px-4 font-semibold">Period Range</th>
                        <th className="py-3 px-4 font-semibold">Scope</th>
                        <th className="py-3 px-4 font-semibold text-center">Version</th>
                        <th className="py-3 px-4 font-semibold text-right">Employees</th>
                        <th className="py-3 px-4 font-semibold text-right">Net Payable</th>
                        <th className="py-3 px-4 font-semibold text-center">Status</th>
                        <th className="py-3 px-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {runs.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-12 text-center text-stone-400">
                            <div className="flex flex-col items-center justify-center space-y-2">
                              <Calculator className="w-8 h-8 text-stone-300" />
                              <p className="text-xs font-semibold text-stone-600">
                                No payroll runs found
                              </p>
                              <p className="text-[11px] text-stone-400 max-w-sm">
                                Create a new payroll run for an open period to orchestrate
                                calculation and reviews.
                              </p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        runs.map((r) => (
                          <tr key={r.id} className="hover:bg-stone-50/60 transition-colors">
                            <td className="py-3 px-4">
                              <div className="font-semibold text-stone-900">{r.title}</div>
                              <div className="text-[10px] text-stone-400 font-mono">
                                Run #{r.runNumber} • ID: {r.id.slice(0, 8)}...
                              </div>
                            </td>
                            <td className="py-3 px-4 text-stone-600">
                              {r.period ? (
                                <div>
                                  <div className="font-mono text-stone-800">
                                    {r.period.year}-{String(r.period.month).padStart(2, '0')}
                                  </div>
                                  <div className="text-[10px] text-stone-400">
                                    {new Date(r.period.startDate).toLocaleDateString()} -{' '}
                                    {new Date(r.period.endDate).toLocaleDateString()}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-stone-400">—</span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <Badge variant="outline" className="text-[10px] font-mono">
                                {r.scope}
                              </Badge>
                            </td>
                            <td className="py-3 px-4 text-center font-mono text-stone-600">
                              v{r.calculationVersion}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-semibold text-stone-800">
                              {r.totalEmployees}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-emerald-800">
                              {r.totalNet != null ? (
                                formatCurrency(r.totalNet)
                              ) : (
                                <span className="text-stone-400 font-sans font-normal text-xs">
                                  Pending calc
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center">{getStatusBadge(r.status)}</td>
                            <td className="py-3 px-4 text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => router.push(`/payroll/runs/${r.id}`)}
                                className="h-8 text-xs gap-1 border-stone-300"
                              >
                                <span>Inspect</span>
                                <ArrowRight className="w-3 h-3 text-stone-400" />
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {/* ------------------------------------------------------------------ */}
          {/* TAB 2: PAYROLL PERIODS */}
          {/* ------------------------------------------------------------------ */}
          {activeTab === 'periods' && (
            <Card className="border border-stone-200/80 shadow-xs bg-white overflow-hidden">
              <CardHeader className="border-b border-stone-100 pb-3">
                <CardTitle className="text-sm font-bold text-stone-900">
                  Configured Payroll Periods
                </CardTitle>
                <CardDescription className="text-xs text-stone-500">
                  Define calendar monthly schedules, cutoffs for attendance and leaves, and payout
                  targets.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 uppercase tracking-wider text-[11px]">
                      <tr>
                        <th className="py-3 px-4 font-semibold">Period (Year / Month)</th>
                        <th className="py-3 px-4 font-semibold">Date Interval</th>
                        <th className="py-3 px-4 font-semibold text-center">Days</th>
                        <th className="py-3 px-4 font-semibold">Cutoff Date</th>
                        <th className="py-3 px-4 font-semibold">Payout Date</th>
                        <th className="py-3 px-4 font-semibold text-center">Runs</th>
                        <th className="py-3 px-4 font-semibold text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {periods.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-stone-400">
                            No payroll periods created yet.
                          </td>
                        </tr>
                      ) : (
                        periods.map((p) => (
                          <tr key={p.id} className="hover:bg-stone-50/60 transition-colors">
                            <td className="py-3 px-4 font-bold text-stone-900">
                              {p.year} / {String(p.month).padStart(2, '0')}
                            </td>
                            <td className="py-3 px-4 text-stone-600 font-mono text-[11px]">
                              {new Date(p.startDate).toLocaleDateString()} —{' '}
                              {new Date(p.endDate).toLocaleDateString()}
                            </td>
                            <td className="py-3 px-4 text-center font-mono">{p.totalDays}</td>
                            <td className="py-3 px-4 text-stone-600">
                              {p.cutoffDate ? new Date(p.cutoffDate).toLocaleDateString() : '—'}
                            </td>
                            <td className="py-3 px-4 text-stone-600">
                              {p.payoutDate ? new Date(p.payoutDate).toLocaleDateString() : '—'}
                            </td>
                            <td className="py-3 px-4 text-center font-mono font-semibold">
                              {p.runsCount || 0}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <Badge
                                variant="outline"
                                className={
                                  p.status === 'CLOSED'
                                    ? 'bg-stone-100 text-stone-600'
                                    : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                }
                              >
                                {p.status}
                              </Badge>
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

          {/* ------------------------------------------------------------------ */}
          {/* Modal: Create Payroll Period */}
          {/* ------------------------------------------------------------------ */}
          <Dialog
            isOpen={isPeriodModalOpen}
            onClose={() => setIsPeriodModalOpen(false)}
            title="Create Payroll Period"
            description="Configure monthly calendar boundaries, cutoffs, and processing deadlines"
          >
            <form onSubmit={handleCreatePeriod} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Year *</label>
                  <input
                    type="number"
                    required
                    min={2020}
                    max={2100}
                    value={periodForm.year}
                    onChange={(e) => setPeriodForm({ ...periodForm, year: Number(e.target.value) })}
                    className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Month (1-12) *
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={12}
                    value={periodForm.month}
                    onChange={(e) =>
                      setPeriodForm({ ...periodForm, month: Number(e.target.value) })
                    }
                    className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={periodForm.startDate}
                    onChange={(e) => setPeriodForm({ ...periodForm, startDate: e.target.value })}
                    className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    End Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={periodForm.endDate}
                    onChange={(e) => setPeriodForm({ ...periodForm, endDate: e.target.value })}
                    className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Attendance Cutoff Date
                  </label>
                  <input
                    type="date"
                    value={periodForm.cutoffDate}
                    onChange={(e) => setPeriodForm({ ...periodForm, cutoffDate: e.target.value })}
                    className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Target Payout Date
                  </label>
                  <input
                    type="date"
                    value={periodForm.payoutDate}
                    onChange={(e) => setPeriodForm({ ...periodForm, payoutDate: e.target.value })}
                    className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Processing Deadline
                </label>
                <input
                  type="date"
                  value={periodForm.processingDeadline}
                  onChange={(e) =>
                    setPeriodForm({ ...periodForm, processingDeadline: e.target.value })
                  }
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsPeriodModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={periodSubmitting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {periodSubmitting ? 'Creating...' : 'Create Period'}
                </Button>
              </div>
            </form>
          </Dialog>

          {/* ------------------------------------------------------------------ */}
          {/* Modal: Create Payroll Run */}
          {/* ------------------------------------------------------------------ */}
          <Dialog
            isOpen={isRunModalOpen}
            onClose={() => setIsRunModalOpen(false)}
            title="Initialize New Payroll Run"
            description="Select target period and employee scope. Run will be created in DRAFT status."
          >
            <form onSubmit={handleCreateRun} className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Target Payroll Period *
                </label>
                <select
                  required
                  value={runForm.periodId}
                  onChange={(e) => setRunForm({ ...runForm, periodId: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg bg-white"
                >
                  <option value="">Select a period...</option>
                  {periods
                    .filter((p) => p.status !== 'CLOSED')
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.year} / {String(p.month).padStart(2, '0')} (
                        {new Date(p.startDate).toLocaleDateString()} to{' '}
                        {new Date(p.endDate).toLocaleDateString()})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Run Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. October 2026 Regular Payroll Run"
                  value={runForm.title}
                  onChange={(e) => setRunForm({ ...runForm, title: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Employee Scope *
                </label>
                <div className="flex gap-2">
                  <select
                    value={runForm.scope}
                    onChange={(e) => {
                      setRunForm({ ...runForm, scope: e.target.value });
                      setScopePreview(null);
                    }}
                    className="flex-1 text-xs px-3 py-2 border border-stone-300 rounded-lg bg-white"
                  >
                    <option value="ALL">ALL (All active organization employees)</option>
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!runForm.periodId || scopePreviewLoading}
                    onClick={handlePreviewScope}
                    className="text-xs"
                  >
                    <Users className="w-3.5 h-3.5 mr-1" />
                    {scopePreviewLoading ? 'Checking...' : 'Preview Scope'}
                  </Button>
                </div>
              </div>

              {/* Scope Preview Card */}
              {scopePreview && (
                <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs space-y-2">
                  <div className="flex items-center justify-between font-semibold">
                    <span className="text-stone-700">Eligible Employees Count:</span>
                    <span className="text-emerald-800 font-mono text-sm">
                      {scopePreview.eligibleCount}
                    </span>
                  </div>

                  {scopePreview.sampleEmployees && scopePreview.sampleEmployees.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[11px] text-stone-500 font-medium">
                        Sample Checklist:
                      </div>
                      <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                        {scopePreview.sampleEmployees.map((s: any) => (
                          <div
                            key={s.id}
                            className="flex items-center justify-between py-0.5 text-[11px]"
                          >
                            <span className="text-stone-800 font-medium truncate max-w-[200px]">
                              {s.employeeCode} • {s.displayName}
                            </span>
                            {s.hasActiveCompensation ? (
                              <span className="text-emerald-600 text-[10px] flex items-center gap-0.5">
                                <CheckCircle2 className="w-3 h-3" /> Ready
                              </span>
                            ) : (
                              <span className="text-amber-600 text-[10px] flex items-center gap-0.5">
                                <AlertTriangle className="w-3 h-3" /> No Approved Comp
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Operational Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Optional context for reviewers or audit log..."
                  value={runForm.notes}
                  onChange={(e) => setRunForm({ ...runForm, notes: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsRunModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={runSubmitting || !runForm.periodId}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {runSubmitting ? 'Initializing...' : 'Create Draft Run'}
                </Button>
              </div>
            </form>
          </Dialog>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
