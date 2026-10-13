'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@hrms/ui';
import { reportsApi, organizationApi, payrollApi } from '../../../lib/api-client';
import { useAuth } from '../../../context/AuthContext';
import {
  PayrollSummaryReportDto,
  PayrollCostCenterReportDto,
  PayrollRegisterReportDto,
  PayrollEarningsDeductionsReportDto,
  PayrollExceptionsReportDto,
  PayrollPeriodComparisonReportDto,
  PayrollAdjustmentReportDto,
  PayrollApprovalHistoryReportDto,
  PaymentReconciliationReportDto,
} from '@hrms/types';
import {
  DollarSign,
  Building2,
  PieChart as PieChartIcon,
  AlertOctagon,
  ArrowRightLeft,
  Sliders,
  History,
  CheckCircle2,
  AlertTriangle,
  Download,
  RefreshCw,
  Table as TableIcon,
  BarChart3,
  Filter,
  Lock,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  CreditCard,
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

export function PayrollAnalyticsTab() {
  const { hasRole, hasPermission } = useAuth();
  const [subTab, setSubTab] = useState<
    | 'SUMMARY'
    | 'COST_CENTERS'
    | 'REGISTER'
    | 'EARNINGS_DEDUCTIONS'
    | 'EXCEPTIONS'
    | 'COMPARISON'
    | 'ADJUSTMENTS'
    | 'APPROVAL_HISTORY'
    | 'PAYMENT_RECONCILIATION'
  >('SUMMARY');

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'CHARTS' | 'TABLES'>('CHARTS');

  // Filters
  const [periodId, setPeriodId] = useState<string>('ALL');
  const [runId, setRunId] = useState<string>('ALL');
  const [compareRunId, setCompareRunId] = useState<string>('ALL');
  const [departmentId, setDepartmentId] = useState<string>('ALL');
  const [branchId, setBranchId] = useState<string>('ALL');
  const [payrollStatus, setPayrollStatus] = useState<string>('ALL');
  const [paymentStatus, setPaymentStatus] = useState<string>('ALL');
  const [page, setPage] = useState<number>(1);

  // Metadata dropdowns
  const [periods, setPeriods] = useState<
    Array<{ id: string; name: string; year: number; month: number }>
  >([]);
  const [runs, setRuns] = useState<Array<{ id: string; title: string; status: string }>>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);

  // Report States
  const [summaryData, setSummaryData] = useState<PayrollSummaryReportDto | null>(null);
  const [costCenterData, setCostCenterData] = useState<PayrollCostCenterReportDto | null>(null);
  const [registerData, setRegisterData] = useState<PayrollRegisterReportDto | null>(null);
  const [earningsDeductionsData, setEarningsDeductionsData] =
    useState<PayrollEarningsDeductionsReportDto | null>(null);
  const [exceptionsData, setExceptionsData] = useState<PayrollExceptionsReportDto | null>(null);
  const [comparisonData, setComparisonData] = useState<PayrollPeriodComparisonReportDto | null>(
    null,
  );
  const [adjustmentsData, setAdjustmentsData] = useState<PayrollAdjustmentReportDto | null>(null);
  const [approvalHistoryData, setApprovalHistoryData] =
    useState<PayrollApprovalHistoryReportDto | null>(null);
  const [paymentReconciliationData, setPaymentReconciliationData] =
    useState<PaymentReconciliationReportDto | null>(null);

  // Currency Formatter
  const formatCurrency = (amount: number | undefined | null) => {
    if (amount === undefined || amount === null || isNaN(amount)) return '₹0.00';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Load dropdown options
  useEffect(() => {
    async function loadOptions() {
      try {
        const [periodRes, deptRes, branchRes] = await Promise.all([
          payrollApi.getPayrollPeriods().catch(() => []),
          organizationApi.getDepartments().catch(() => []),
          organizationApi.getBranches().catch(() => []),
        ]);

        if (Array.isArray(periodRes)) {
          setPeriods(
            periodRes.map((p: any) => ({
              id: p.id,
              name: p.name || `${p.year}-${String(p.month).padStart(2, '0')}`,
              year: p.year,
              month: p.month,
            })),
          );
        }
        if (Array.isArray(deptRes)) setDepartments(deptRes);
        if (Array.isArray(branchRes)) setBranches(branchRes);
      } catch {
        // Fallback gracefully
      }
    }
    loadOptions();
  }, []);

  // When period changes, load corresponding runs
  useEffect(() => {
    async function loadRuns() {
      try {
        const runRes: any = await payrollApi
          .getPayrollRuns({
            periodId: periodId !== 'ALL' ? periodId : undefined,
          })
          .catch(() => []);

        const items = Array.isArray(runRes?.data?.items)
          ? runRes.data.items
          : Array.isArray(runRes?.items)
            ? runRes.items
            : Array.isArray(runRes)
              ? runRes
              : [];

        setRuns(items.map((r: any) => ({ id: r.id, title: r.title, status: r.status })));
      } catch {
        setRuns([]);
      }
    }
    loadRuns();
  }, [periodId]);

  // Fetch active report data
  const fetchData = useCallback(
    async (isBackground = false) => {
      if (!isBackground) setLoading(true);
      else setRefreshing(true);
      setError(null);

      const queryParams: Record<string, any> = {
        periodId: periodId !== 'ALL' ? periodId : undefined,
        runId: runId !== 'ALL' ? runId : undefined,
        departmentId: departmentId !== 'ALL' ? departmentId : undefined,
        branchId: branchId !== 'ALL' ? branchId : undefined,
        payrollStatus: payrollStatus !== 'ALL' ? payrollStatus : undefined,
        paymentStatus: paymentStatus !== 'ALL' ? paymentStatus : undefined,
      };

      try {
        if (subTab === 'SUMMARY') {
          const res = await reportsApi.getPayrollSummary(queryParams);
          setSummaryData(res);
        } else if (subTab === 'COST_CENTERS') {
          const res = await reportsApi.getPayrollCostCenters(queryParams);
          setCostCenterData(res);
        } else if (subTab === 'REGISTER') {
          const res = await reportsApi.getPayrollRegister({
            ...queryParams,
            page,
            limit: 20,
          });
          setRegisterData(res);
        } else if (subTab === 'EARNINGS_DEDUCTIONS') {
          const res = await reportsApi.getPayrollEarningsDeductions(queryParams);
          setEarningsDeductionsData(res);
        } else if (subTab === 'EXCEPTIONS') {
          const res = await reportsApi.getPayrollExceptionsReport(queryParams);
          setExceptionsData(res);
        } else if (subTab === 'COMPARISON') {
          const res = await reportsApi.getPayrollPeriodComparison({
            ...queryParams,
            compareRunId: compareRunId !== 'ALL' ? compareRunId : undefined,
          });
          setComparisonData(res);
        } else if (subTab === 'ADJUSTMENTS') {
          const res = await reportsApi.getPayrollAdjustmentsReport(queryParams);
          setAdjustmentsData(res);
        } else if (subTab === 'APPROVAL_HISTORY') {
          const res = await reportsApi.getPayrollApprovalHistory(queryParams);
          setApprovalHistoryData(res);
        } else if (subTab === 'PAYMENT_RECONCILIATION') {
          const res = await reportsApi.getPayrollPaymentReconciliation(queryParams);
          setPaymentReconciliationData(res);
        }
      } catch (err: any) {
        setError(
          err.message ||
            'Failed to load payroll report data. Ensure you have authorized permissions.',
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [
      subTab,
      periodId,
      runId,
      compareRunId,
      departmentId,
      branchId,
      payrollStatus,
      paymentStatus,
      page,
    ],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Export report to CSV with injection protection & audit logging
  const handleExportCsv = async () => {
    try {
      setExporting(true);
      const reportKeyMap: Record<string, string> = {
        SUMMARY: 'REP-PAY-01',
        COST_CENTERS: 'REP-PAY-02',
        REGISTER: 'REP-PAY-03',
        EARNINGS_DEDUCTIONS: 'REP-PAY-04',
        EXCEPTIONS: 'REP-PAY-05',
        COMPARISON: 'REP-PAY-06',
        ADJUSTMENTS: 'REP-PAY-07',
        APPROVAL_HISTORY: 'REP-PAY-08',
        PAYMENT_RECONCILIATION: 'REP-PAY-09',
      };

      await reportsApi.exportReportCsv({
        reportKey: reportKeyMap[subTab],
        periodId: periodId !== 'ALL' ? periodId : undefined,
        runId: runId !== 'ALL' ? runId : undefined,
        compareRunId: compareRunId !== 'ALL' ? compareRunId : undefined,
        departmentId: departmentId !== 'ALL' ? departmentId : undefined,
        branchId: branchId !== 'ALL' ? branchId : undefined,
        payrollStatus: payrollStatus !== 'ALL' ? payrollStatus : undefined,
        paymentStatus: paymentStatus !== 'ALL' ? paymentStatus : undefined,
      });
    } catch (err: any) {
      alert(`Export failed: ${err.message || 'Check access rights'}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Sub-tabs and Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-stone-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-stone-900">
              Payroll Reports, Secure Exports & Reconciliation
            </h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
              <ShieldCheck className="h-3.5 w-3.5" />
              Role Authorized
            </span>
          </div>
          <p className="mt-1 text-xs text-stone-500">
            Enterprise gross-to-net summaries, cost centers, salary register, compliance exceptions,
            and financial reconciliation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Charts vs Tables Toggle */}
          <div className="flex items-center rounded-lg border border-stone-200 bg-white p-0.5 shadow-sm">
            <button
              onClick={() => setViewMode('CHARTS')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'CHARTS'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Visual Analytics
            </button>
            <button
              onClick={() => setViewMode('TABLES')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'TABLES'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <TableIcon className="h-3.5 w-3.5" />
              Detailed Data
            </button>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => fetchData(true)}
            disabled={loading || refreshing}
            leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>

          <Button
            size="sm"
            variant="secondary"
            onClick={handleExportCsv}
            disabled={loading || exporting}
            leftIcon={<Download className={`h-3.5 w-3.5 ${exporting ? 'animate-spin' : ''}`} />}
          >
            {exporting ? 'Exporting...' : 'Secure CSV Export'}
          </Button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3 text-xs font-semibold uppercase tracking-wider text-stone-600">
          <Filter className="h-3.5 w-3.5 text-amber-600" />
          Multi-Dimensional Report Filters
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
          {/* Payroll Period */}
          <div>
            <label className="block text-stone-600 font-medium mb-1">Payroll Period</label>
            <select
              value={periodId}
              onChange={(e) => {
                setPeriodId(e.target.value);
                setRunId('ALL');
              }}
              className="w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-stone-800 shadow-sm focus:border-amber-500 focus:outline-none"
            >
              <option value="ALL">All Periods (Latest Active)</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Specific Run Filter */}
          <div>
            <label className="block text-stone-600 font-medium mb-1">Payroll Run</label>
            <select
              value={runId}
              onChange={(e) => setRunId(e.target.value)}
              className="w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-stone-800 shadow-sm focus:border-amber-500 focus:outline-none"
            >
              <option value="ALL">All Finalized Runs</option>
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title} ({r.status})
                </option>
              ))}
            </select>
          </div>

          {/* Department Filter */}
          <div>
            <label className="block text-stone-600 font-medium mb-1">Department</label>
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-stone-800 shadow-sm focus:border-amber-500 focus:outline-none"
            >
              <option value="ALL">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* Branch Filter */}
          <div>
            <label className="block text-stone-600 font-medium mb-1">Branch</label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-stone-800 shadow-sm focus:border-amber-500 focus:outline-none"
            >
              <option value="ALL">All Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* SubTab Specific Dropdown (Comparison or Payment) */}
          {subTab === 'COMPARISON' ? (
            <div>
              <label className="block text-stone-600 font-medium mb-1">Compare Against Run</label>
              <select
                value={compareRunId}
                onChange={(e) => setCompareRunId(e.target.value)}
                className="w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-stone-800 shadow-sm focus:border-amber-500 focus:outline-none"
              >
                <option value="ALL">Prior Consecutive Period</option>
                {runs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title} ({r.status})
                  </option>
                ))}
              </select>
            </div>
          ) : subTab === 'PAYMENT_RECONCILIATION' ? (
            <div>
              <label className="block text-stone-600 font-medium mb-1">Payment Status</label>
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value)}
                className="w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-stone-800 shadow-sm focus:border-amber-500 focus:outline-none"
              >
                <option value="ALL">All Payment Statuses</option>
                <option value="PAID">PAID</option>
                <option value="PENDING">PENDING</option>
                <option value="FAILED">FAILED</option>
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-stone-600 font-medium mb-1">Payroll Status</label>
              <select
                value={payrollStatus}
                onChange={(e) => setPayrollStatus(e.target.value)}
                className="w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-stone-800 shadow-sm focus:border-amber-500 focus:outline-none"
              >
                <option value="ALL">All Active Statuses</option>
                <option value="COMPLETED">COMPLETED / FINAL</option>
                <option value="LOCKED">LOCKED</option>
                <option value="APPROVED">APPROVED</option>
                <option value="PROCESSING">PROCESSING</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Subtabs Navigation */}
      <div className="flex border-b border-stone-200 overflow-x-auto">
        <button
          onClick={() => {
            setSubTab('SUMMARY');
            setPage(1);
          }}
          className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2 text-xs font-semibold transition-all ${
            subTab === 'SUMMARY'
              ? 'border-emerald-600 text-emerald-900 bg-emerald-50/50'
              : 'border-transparent text-stone-600 hover:text-stone-900 hover:border-stone-300'
          }`}
        >
          <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
          Summary (REP-PAY-01)
        </button>

        <button
          onClick={() => {
            setSubTab('COST_CENTERS');
            setPage(1);
          }}
          className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2 text-xs font-semibold transition-all ${
            subTab === 'COST_CENTERS'
              ? 'border-emerald-600 text-emerald-900 bg-emerald-50/50'
              : 'border-transparent text-stone-600 hover:text-stone-900 hover:border-stone-300'
          }`}
        >
          <Building2 className="h-3.5 w-3.5 text-emerald-600" />
          Cost Summaries (REP-PAY-02)
        </button>

        <button
          onClick={() => {
            setSubTab('REGISTER');
            setPage(1);
          }}
          className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2 text-xs font-semibold transition-all ${
            subTab === 'REGISTER'
              ? 'border-emerald-600 text-emerald-900 bg-emerald-50/50'
              : 'border-transparent text-stone-600 hover:text-stone-900 hover:border-stone-300'
          }`}
        >
          <Lock className="h-3.5 w-3.5 text-amber-600" />
          Employee Register (REP-PAY-03)
        </button>

        <button
          onClick={() => {
            setSubTab('EARNINGS_DEDUCTIONS');
            setPage(1);
          }}
          className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2 text-xs font-semibold transition-all ${
            subTab === 'EARNINGS_DEDUCTIONS'
              ? 'border-emerald-600 text-emerald-900 bg-emerald-50/50'
              : 'border-transparent text-stone-600 hover:text-stone-900 hover:border-stone-300'
          }`}
        >
          <PieChartIcon className="h-3.5 w-3.5 text-emerald-600" />
          Earnings & Deductions (REP-PAY-04)
        </button>

        <button
          onClick={() => {
            setSubTab('EXCEPTIONS');
            setPage(1);
          }}
          className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2 text-xs font-semibold transition-all ${
            subTab === 'EXCEPTIONS'
              ? 'border-emerald-600 text-emerald-900 bg-emerald-50/50'
              : 'border-transparent text-stone-600 hover:text-stone-900 hover:border-stone-300'
          }`}
        >
          <AlertOctagon className="h-3.5 w-3.5 text-rose-600" />
          Exceptions (REP-PAY-05)
        </button>

        <button
          onClick={() => {
            setSubTab('COMPARISON');
            setPage(1);
          }}
          className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2 text-xs font-semibold transition-all ${
            subTab === 'COMPARISON'
              ? 'border-emerald-600 text-emerald-900 bg-emerald-50/50'
              : 'border-transparent text-stone-600 hover:text-stone-900 hover:border-stone-300'
          }`}
        >
          <ArrowRightLeft className="h-3.5 w-3.5 text-indigo-600" />
          Period Variance (REP-PAY-06)
        </button>

        <button
          onClick={() => {
            setSubTab('ADJUSTMENTS');
            setPage(1);
          }}
          className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2 text-xs font-semibold transition-all ${
            subTab === 'ADJUSTMENTS'
              ? 'border-emerald-600 text-emerald-900 bg-emerald-50/50'
              : 'border-transparent text-stone-600 hover:text-stone-900 hover:border-stone-300'
          }`}
        >
          <Sliders className="h-3.5 w-3.5 text-emerald-600" />
          Adjustments (REP-PAY-07)
        </button>

        <button
          onClick={() => {
            setSubTab('APPROVAL_HISTORY');
            setPage(1);
          }}
          className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2 text-xs font-semibold transition-all ${
            subTab === 'APPROVAL_HISTORY'
              ? 'border-emerald-600 text-emerald-900 bg-emerald-50/50'
              : 'border-transparent text-stone-600 hover:text-stone-900 hover:border-stone-300'
          }`}
        >
          <History className="h-3.5 w-3.5 text-stone-600" />
          Approvals & Audit (REP-PAY-08)
        </button>

        <button
          onClick={() => {
            setSubTab('PAYMENT_RECONCILIATION');
            setPage(1);
          }}
          className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2 text-xs font-semibold transition-all ${
            subTab === 'PAYMENT_RECONCILIATION'
              ? 'border-emerald-600 text-emerald-900 bg-emerald-50/50'
              : 'border-transparent text-stone-600 hover:text-stone-900 hover:border-stone-300'
          }`}
        >
          <CreditCard className="h-3.5 w-3.5 text-emerald-600" />
          Disbursements (REP-PAY-09)
        </button>
      </div>

      {/* Error / Unauthorized State */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-start gap-3 shadow-sm">
          <AlertTriangle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-rose-900">Access or Computation Restriction</div>
            <div>{error}</div>
            <div className="mt-1 text-rose-700">
              Employee-level salary registers and compensation data require explicit payroll
              authorization roles.
            </div>
          </div>
        </div>
      )}

      {/* Content Rendering based on SubTab */}
      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-xl border border-stone-200 bg-white">
          <div className="text-center">
            <RefreshCw className="mx-auto h-8 w-8 animate-spin text-amber-600" />
            <p className="mt-2 text-xs text-stone-500 font-medium">
              Reconciling payroll ledger records...
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* ========================================================================= */}
          {/* SUBTAB 1: SUMMARY (REP-PAY-01) */}
          {/* ========================================================================= */}
          {subTab === 'SUMMARY' && summaryData && (
            <div className="space-y-6">
              {/* KPI Cards Grid */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                  <div className="text-xs font-semibold text-stone-500 uppercase tracking-wide">
                    Earned Gross
                  </div>
                  <div className="mt-1 text-xl font-bold text-stone-900">
                    {formatCurrency(summaryData.financialTotals.earnedGross)}
                  </div>
                  <div className="mt-1 text-xs text-stone-400">
                    Base monthly: {formatCurrency(summaryData.financialTotals.baseMonthlyGross)}
                  </div>
                </div>

                <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                  <div className="text-xs font-semibold text-stone-500 uppercase tracking-wide">
                    Total Deductions
                  </div>
                  <div className="mt-1 text-xl font-bold text-rose-600">
                    {formatCurrency(summaryData.financialTotals.totalEmployeeDeductions)}
                  </div>
                  <div className="mt-1 text-xs text-stone-400">Employee statutory & voluntary</div>
                </div>

                <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                  <div className="text-xs font-semibold text-stone-500 uppercase tracking-wide">
                    Net Pay Disbursement
                  </div>
                  <div className="mt-1 text-xl font-bold text-emerald-600">
                    {formatCurrency(summaryData.financialTotals.netSalary)}
                  </div>
                  <div className="mt-1 text-xs text-emerald-700 font-medium">
                    Reconciled against gross ledger
                  </div>
                </div>

                <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                  <div className="text-xs font-semibold text-stone-500 uppercase tracking-wide">
                    Employer Contributions
                  </div>
                  <div className="mt-1 text-xl font-bold text-indigo-600">
                    {formatCurrency(summaryData.financialTotals.totalEmployerContributions)}
                  </div>
                  <div className="mt-1 text-xs text-stone-400">PF, ESI, statutory overhead</div>
                </div>

                <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                  <div className="text-xs font-semibold text-stone-500 uppercase tracking-wide">
                    Total Organization CTC
                  </div>
                  <div className="mt-1 text-xl font-bold text-amber-700">
                    {formatCurrency(summaryData.financialTotals.totalCostToCompany)}
                  </div>
                  <div className="mt-1 text-xs text-stone-400">
                    {summaryData.headcount.totalEmployees} Total Employees
                  </div>
                </div>
              </div>

              {/* Status Breakdown & Reconciliation Status */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-stone-900 mb-3 flex items-center justify-between">
                    <span>Payroll Lifecycle Rollup</span>
                    <span className="text-xs font-normal text-stone-500">
                      Run: {summaryData.run.title} ({summaryData.run.status})
                    </span>
                  </h3>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                    <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
                      <div className="text-xs text-stone-500">Draft</div>
                      <div className="text-lg font-bold text-stone-800">
                        {summaryData.statusBreakdown.draftCount}
                      </div>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                      <div className="text-xs text-amber-800">Approved</div>
                      <div className="text-lg font-bold text-amber-900">
                        {summaryData.statusBreakdown.approvedCount}
                      </div>
                    </div>
                    <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3">
                      <div className="text-xs text-indigo-800">Locked</div>
                      <div className="text-lg font-bold text-indigo-900">
                        {summaryData.statusBreakdown.lockedCount}
                      </div>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                      <div className="text-xs text-emerald-800">Published</div>
                      <div className="text-lg font-bold text-emerald-900">
                        {summaryData.statusBreakdown.publishedCount}
                      </div>
                    </div>
                    <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
                      <div className="text-xs text-blue-800">Paid</div>
                      <div className="text-lg font-bold text-blue-900">
                        {summaryData.statusBreakdown.paidCount}
                      </div>
                    </div>
                  </div>

                  {/* Visual Cost Allocation Bar */}
                  <div className="mt-6">
                    <div className="text-xs font-semibold text-stone-700 mb-2">
                      Gross-to-Net Allocation Breakdown
                    </div>
                    <div className="h-4 w-full bg-stone-100 rounded-full overflow-hidden flex">
                      <div
                        className="bg-emerald-500 h-full"
                        style={{
                          width: `${
                            summaryData.financialTotals.earnedGross > 0
                              ? Math.round(
                                  (summaryData.financialTotals.netSalary /
                                    summaryData.financialTotals.earnedGross) *
                                    100,
                                )
                              : 0
                          }%`,
                        }}
                        title="Net Pay"
                      />
                      <div
                        className="bg-rose-400 h-full"
                        style={{
                          width: `${
                            summaryData.financialTotals.earnedGross > 0
                              ? Math.round(
                                  (summaryData.financialTotals.totalEmployeeDeductions /
                                    summaryData.financialTotals.earnedGross) *
                                    100,
                                )
                              : 0
                          }%`,
                        }}
                        title="Deductions"
                      />
                    </div>
                    <div className="flex justify-between items-center text-xs text-stone-500 mt-1">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 inline-block" />
                        Net Pay (Take-Home)
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-rose-400 inline-block" />
                        Total Deductions
                      </span>
                    </div>
                  </div>
                </div>

                {/* Reconciliation Audit Box */}
                <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-stone-900 mb-2 flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      Ledger Integrity Audit
                    </h3>
                    <p className="text-xs text-stone-600 leading-relaxed">
                      All calculations are strictly cross-reconciled with underlying immutable
                      payroll snapshot ledgers.
                    </p>

                    <div className="mt-4 space-y-2 text-xs">
                      <div className="flex justify-between border-b border-stone-100 pb-1.5">
                        <span className="text-stone-500">Gross Minus Deductions:</span>
                        <span className="font-semibold text-stone-900">
                          {summaryData.reconciliationAudit.grossMinusDeductionsEqualsNet
                            ? 'Verified Equal'
                            : 'Discrepancy'}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-stone-100 pb-1.5">
                        <span className="text-stone-500">Discrepancy Amount:</span>
                        <span className="font-semibold text-stone-900">
                          {formatCurrency(summaryData.reconciliationAudit.discrepancyAmount)}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-stone-100 pb-1.5">
                        <span className="text-stone-500">Formula Sanitized:</span>
                        <span className="font-semibold text-emerald-700">Protected CSV Format</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-lg bg-stone-50 p-2.5 text-center text-xs text-stone-500 border border-stone-200">
                    Source:{' '}
                    <code className="text-stone-700 font-mono text-[11px]">
                      EmployeePayrollSnapshot
                    </code>{' '}
                    records
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SUBTAB 2: COST CENTERS (REP-PAY-02) */}
          {/* ========================================================================= */}
          {subTab === 'COST_CENTERS' && costCenterData && (
            <div className="space-y-6">
              {viewMode === 'CHARTS' ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Department Cost Center Chart */}
                  <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
                    <h3 className="text-sm font-semibold text-stone-900 mb-4">
                      Department Cost Allocations (Gross Pay)
                    </h3>
                    <div className="h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={costCenterData.departments}
                          margin={{ top: 10, right: 10, left: 10, bottom: 25 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis
                            dataKey="name"
                            angle={-25}
                            textAnchor="end"
                            interval={0}
                            tick={{ fontSize: 10 }}
                          />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip
                            formatter={(val: any) => [
                              formatCurrency(Number(val)),
                              'Gross Earnings',
                            ]}
                            contentStyle={{ fontSize: '11px', borderRadius: '8px' }}
                          />
                          <Bar dataKey="earnedGross" fill="#059669" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Branch Cost Center Chart */}
                  <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
                    <h3 className="text-sm font-semibold text-stone-900 mb-4">
                      Branch Cost Center Allocations
                    </h3>
                    <div className="h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={costCenterData.branches}
                          margin={{ top: 10, right: 10, left: 10, bottom: 25 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis
                            dataKey="name"
                            angle={-25}
                            textAnchor="end"
                            interval={0}
                            tick={{ fontSize: 10 }}
                          />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip
                            formatter={(val: any) => [
                              formatCurrency(Number(val)),
                              'Total CTC Cost',
                            ]}
                            contentStyle={{ fontSize: '11px', borderRadius: '8px' }}
                          />
                          <Bar dataKey="totalCtc" fill="#d97706" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Department Table */}
              <div className="rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-stone-200 bg-stone-50/50 flex justify-between items-center">
                  <h3 className="text-xs font-semibold text-stone-900 uppercase tracking-wide">
                    Department Cost Breakdown
                  </h3>
                  <span className="text-xs text-stone-500">Run: {costCenterData.runTitle}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-stone-700">
                    <thead className="border-b border-stone-200 bg-stone-100/70 font-semibold text-stone-700">
                      <tr>
                        <th className="px-4 py-2.5">Cost Center</th>
                        <th className="px-4 py-2.5 text-right">Headcount</th>
                        <th className="px-4 py-2.5 text-right">Gross Earnings</th>
                        <th className="px-4 py-2.5 text-right">Deductions</th>
                        <th className="px-4 py-2.5 text-right">Net Pay</th>
                        <th className="px-4 py-2.5 text-right">Total CTC</th>
                        <th className="px-4 py-2.5 text-right">% of Organization</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {costCenterData.departments.map((dept, idx) => (
                        <tr key={idx} className="hover:bg-stone-50/70">
                          <td className="px-4 py-2 font-medium text-stone-900">{dept.name}</td>
                          <td className="px-4 py-2 text-right">{dept.employeeCount}</td>
                          <td className="px-4 py-2 text-right font-medium">
                            {formatCurrency(dept.earnedGross)}
                          </td>
                          <td className="px-4 py-2 text-right text-rose-600">
                            {formatCurrency(dept.employeeDeductions)}
                          </td>
                          <td className="px-4 py-2 text-right text-emerald-600 font-semibold">
                            {formatCurrency(dept.netPay)}
                          </td>
                          <td className="px-4 py-2 text-right font-bold text-stone-900">
                            {formatCurrency(dept.totalCtc)}
                          </td>
                          <td className="px-4 py-2 text-right text-stone-500">
                            {dept.percentageOfTotalPayroll}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SUBTAB 3: EMPLOYEE-LEVEL REGISTER (REP-PAY-03) */}
          {/* ========================================================================= */}
          {subTab === 'REGISTER' && registerData && (
            <div className="space-y-6">
              {/* Confidentiality Notice */}
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 shadow-sm flex items-start gap-3">
                <Lock className="h-5 w-5 text-amber-700 flex-shrink-0 mt-0.5" />
                <div className="text-xs">
                  <div className="font-semibold text-amber-900">
                    Restricted Salary Register Notice
                  </div>
                  <div className="text-amber-800 mt-0.5">
                    This authorized register contains individual compensation, bank details, and
                    deduction records. Access is audited and logged in compliance with
                    organizational data protection policy.
                  </div>
                </div>
              </div>

              {/* Summary Rollup */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                  <div className="text-xs text-stone-500 uppercase font-medium">
                    Register Employees
                  </div>
                  <div className="text-xl font-bold text-stone-900 mt-1">
                    {registerData.summary.totalEmployees}
                  </div>
                </div>
                <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                  <div className="text-xs text-stone-500 uppercase font-medium">Earned Gross</div>
                  <div className="text-xl font-bold text-stone-900 mt-1">
                    {formatCurrency(registerData.summary.totalEarnedGross)}
                  </div>
                </div>
                <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                  <div className="text-xs text-stone-500 uppercase font-medium">
                    Total Deductions
                  </div>
                  <div className="text-xl font-bold text-rose-600 mt-1">
                    {formatCurrency(registerData.summary.totalDeductions)}
                  </div>
                </div>
                <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                  <div className="text-xs text-stone-500 uppercase font-medium">Net Disbursed</div>
                  <div className="text-xl font-bold text-emerald-600 mt-1">
                    {formatCurrency(registerData.summary.totalNetSalary)}
                  </div>
                </div>
              </div>

              {/* Detailed Register Table */}
              <div className="rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-stone-700">
                    <thead className="border-b border-stone-200 bg-stone-100/70 font-semibold text-stone-700">
                      <tr>
                        <th className="px-4 py-2.5">Emp Code</th>
                        <th className="px-4 py-2.5">Employee Name</th>
                        <th className="px-4 py-2.5">Department</th>
                        <th className="px-4 py-2.5 text-center">Paid / Work Days</th>
                        <th className="px-4 py-2.5 text-right">Base Salary</th>
                        <th className="px-4 py-2.5 text-right">Earned Gross</th>
                        <th className="px-4 py-2.5 text-right">Deductions</th>
                        <th className="px-4 py-2.5 text-right font-bold text-emerald-700">
                          Net Pay
                        </th>
                        <th className="px-4 py-2.5">Masked Account</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {registerData.items.map((emp) => (
                        <tr key={emp.employeeId} className="hover:bg-stone-50/70">
                          <td className="px-4 py-2.5 font-mono text-stone-900">
                            {emp.employeeCode}
                          </td>
                          <td className="px-4 py-2.5 font-medium text-stone-900">
                            {emp.employeeName}
                          </td>
                          <td className="px-4 py-2.5 text-stone-600">{emp.departmentName}</td>
                          <td className="px-4 py-2.5 text-center text-stone-600">
                            {emp.paidDays} / {emp.workingDays}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {formatCurrency(emp.baseSalary)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium">
                            {formatCurrency(emp.earnedGross)}
                          </td>
                          <td className="px-4 py-2.5 text-right text-rose-600">
                            {formatCurrency(emp.totalDeductions)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-bold text-emerald-600">
                            {formatCurrency(emp.netSalary)}
                          </td>
                          <td className="px-4 py-2.5 text-stone-500 font-mono text-[11px]">
                            {emp.bankAccountMasked || '••••••••'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                <div className="px-4 py-3 border-t border-stone-200 bg-stone-50/60 flex items-center justify-between text-xs text-stone-500">
                  <div>
                    Showing page {registerData.pagination.page} of{' '}
                    {registerData.pagination.totalPages} ({registerData.pagination.total} records)
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPage((p) => Math.max(p - 1, 1))}
                      disabled={page <= 1}
                    >
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setPage((p) => Math.min(p + 1, registerData.pagination.totalPages))
                      }
                      disabled={page >= registerData.pagination.totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SUBTAB 4: EARNINGS & DEDUCTIONS BREAKDOWN (REP-PAY-04) */}
          {/* ========================================================================= */}
          {subTab === 'EARNINGS_DEDUCTIONS' && earningsDeductionsData && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Earnings Components */}
                <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-stone-900 mb-3 flex items-center justify-between">
                    <span>Itemized Earnings Components</span>
                    <span className="text-xs text-emerald-700 font-bold">
                      {formatCurrency(earningsDeductionsData.totalGrossEarnings)}
                    </span>
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-stone-700">
                      <thead className="border-b border-stone-200 bg-stone-50 font-semibold text-stone-600">
                        <tr>
                          <th className="px-3 py-2">Component</th>
                          <th className="px-3 py-2 text-right">Beneficiaries</th>
                          <th className="px-3 py-2 text-right">Earned Total</th>
                          <th className="px-3 py-2 text-right">% of Earnings</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {earningsDeductionsData.earnings.map((e, idx) => (
                          <tr key={idx} className="hover:bg-stone-50/50">
                            <td className="px-3 py-2 font-medium text-stone-900">
                              {e.componentName}{' '}
                              <span className="text-stone-400">({e.componentCode})</span>
                            </td>
                            <td className="px-3 py-2 text-right">{e.employeeCount}</td>
                            <td className="px-3 py-2 text-right font-semibold text-emerald-700">
                              {formatCurrency(e.totalEarnedAmount)}
                            </td>
                            <td className="px-3 py-2 text-right text-stone-500">
                              {e.percentageOfCategory}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Deductions Components */}
                <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-stone-900 mb-3 flex items-center justify-between">
                    <span>Statutory & Voluntary Deductions</span>
                    <span className="text-xs text-rose-700 font-bold">
                      {formatCurrency(earningsDeductionsData.totalDeductions)}
                    </span>
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-stone-700">
                      <thead className="border-b border-stone-200 bg-stone-50 font-semibold text-stone-600">
                        <tr>
                          <th className="px-3 py-2">Component</th>
                          <th className="px-3 py-2 text-right">Impacted</th>
                          <th className="px-3 py-2 text-right">Deducted Total</th>
                          <th className="px-3 py-2 text-right">% of Deductions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {earningsDeductionsData.deductions.map((d, idx) => (
                          <tr key={idx} className="hover:bg-stone-50/50">
                            <td className="px-3 py-2 font-medium text-stone-900">
                              {d.componentName}{' '}
                              <span className="text-stone-400">({d.componentCode})</span>
                            </td>
                            <td className="px-3 py-2 text-right">{d.employeeCount}</td>
                            <td className="px-3 py-2 text-right font-semibold text-rose-600">
                              {formatCurrency(d.totalEarnedAmount)}
                            </td>
                            <td className="px-3 py-2 text-right text-stone-500">
                              {d.percentageOfCategory}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Employer Statutory Contributions */}
              <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-stone-900 mb-3 flex items-center justify-between">
                  <span>Employer Contributions (Overhead CTC)</span>
                  <span className="text-xs text-indigo-700 font-bold">
                    {formatCurrency(earningsDeductionsData.totalEmployerContributions)}
                  </span>
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-stone-700">
                    <thead className="border-b border-stone-200 bg-stone-50 font-semibold text-stone-600">
                      <tr>
                        <th className="px-4 py-2">Contribution Name</th>
                        <th className="px-4 py-2 text-right">Enrolled Employees</th>
                        <th className="px-4 py-2 text-right">Total Employer Liability</th>
                        <th className="px-4 py-2 text-right">% of Contribution Overhead</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {earningsDeductionsData.employerContributions.map((ec, idx) => (
                        <tr key={idx} className="hover:bg-stone-50/50">
                          <td className="px-4 py-2 font-medium text-stone-900">
                            {ec.componentName} ({ec.componentCode})
                          </td>
                          <td className="px-4 py-2 text-right">{ec.employeeCount}</td>
                          <td className="px-4 py-2 text-right font-semibold text-indigo-700">
                            {formatCurrency(ec.totalEarnedAmount)}
                          </td>
                          <td className="px-4 py-2 text-right text-stone-500">
                            {ec.percentageOfCategory}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SUBTAB 5: EXCEPTIONS REPORT (REP-PAY-05) */}
          {/* ========================================================================= */}
          {subTab === 'EXCEPTIONS' && exceptionsData && (
            <div className="space-y-6">
              {/* Exceptions Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                  <div className="text-xs text-stone-500 uppercase font-medium">Total Flagged</div>
                  <div className="text-xl font-bold text-stone-900 mt-1">
                    {exceptionsData.total}
                  </div>
                </div>
                <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4 shadow-sm">
                  <div className="text-xs text-rose-700 uppercase font-medium">Blocking Errors</div>
                  <div className="text-xl font-bold text-rose-700 mt-1">
                    {exceptionsData.blockingErrors}
                  </div>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm">
                  <div className="text-xs text-amber-700 uppercase font-medium">Warnings</div>
                  <div className="text-xl font-bold text-amber-700 mt-1">
                    {exceptionsData.warnings}
                  </div>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
                  <div className="text-xs text-emerald-700 uppercase font-medium">Resolved</div>
                  <div className="text-xl font-bold text-emerald-700 mt-1">
                    {exceptionsData.resolved}
                  </div>
                </div>
              </div>

              {/* Exceptions List */}
              <div className="rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-stone-200 bg-stone-50/50 flex justify-between items-center">
                  <h3 className="text-xs font-semibold text-stone-900 uppercase tracking-wide">
                    Payroll Diagnostics & Anomaly Exceptions
                  </h3>
                </div>

                {!exceptionsData.unresolvedWarnings ||
                exceptionsData.unresolvedWarnings.length === 0 ? (
                  <div className="p-8 text-center text-xs text-stone-500">
                    <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600 mb-2" />
                    Clean payroll run. Zero open exceptions or calculation discrepancies detected.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-stone-700">
                      <thead className="border-b border-stone-200 bg-stone-100/70 font-semibold text-stone-700">
                        <tr>
                          <th className="px-4 py-2.5">Category</th>
                          <th className="px-4 py-2.5">Title</th>
                          <th className="px-4 py-2.5">Impacted Employee</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {exceptionsData.unresolvedWarnings.map((exc) => (
                          <tr key={exc.id} className="hover:bg-stone-50/50">
                            <td className="px-4 py-2.5 font-mono text-stone-900">{exc.category}</td>
                            <td className="px-4 py-2.5 text-stone-800 font-medium">{exc.title}</td>
                            <td className="px-4 py-2.5 text-stone-600">
                              {exc.employeeName || 'Run Level'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SUBTAB 6: PERIOD COMPARISON (REP-PAY-06) */}
          {/* ========================================================================= */}
          {subTab === 'COMPARISON' && comparisonData && (
            <div className="space-y-6">
              {/* Variance KPI Comparison Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {comparisonData.variances.map((v, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
                  >
                    <div className="text-xs text-stone-500 uppercase font-medium">{v.metric}</div>
                    <div className="mt-1 flex items-baseline justify-between">
                      <div className="text-lg font-bold text-stone-900">
                        {formatCurrency(v.compareValue)}
                      </div>
                      <div
                        className={`text-xs font-semibold flex items-center gap-0.5 ${
                          v.trend === 'UP'
                            ? 'text-rose-600'
                            : v.trend === 'DOWN'
                              ? 'text-emerald-600'
                              : 'text-stone-500'
                        }`}
                      >
                        {v.trend === 'UP' ? (
                          <TrendingUp className="h-3.5 w-3.5" />
                        ) : v.trend === 'DOWN' ? (
                          <TrendingDown className="h-3.5 w-3.5" />
                        ) : null}
                        {v.percentageChange >= 0
                          ? `+${v.percentageChange}%`
                          : `${v.percentageChange}%`}
                      </div>
                    </div>
                    <div className="mt-1 text-[11px] text-stone-400">
                      Prior: {formatCurrency(v.baseValue)} (Diff: {formatCurrency(v.absoluteChange)}
                      )
                    </div>
                  </div>
                ))}
              </div>

              {/* Movement Drivers Analysis */}
              <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-semibold text-stone-900 mb-3">
                  Headcount & Compensation Movement Drivers
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
                    <div className="text-stone-500 font-medium">New Joiners Impact</div>
                    <div className="text-base font-bold text-emerald-700 mt-1">
                      +{formatCurrency(comparisonData.movementAnalysis.newJoinersGross)}
                    </div>
                    <div className="text-stone-400 mt-0.5">
                      {comparisonData.movementAnalysis.newJoinersCount} new employees
                    </div>
                  </div>

                  <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
                    <div className="text-stone-500 font-medium">Departed Employees Impact</div>
                    <div className="text-base font-bold text-rose-700 mt-1">
                      -{formatCurrency(comparisonData.movementAnalysis.exitsGrossDifference)}
                    </div>
                    <div className="text-stone-400 mt-0.5">
                      {comparisonData.movementAnalysis.exitsCount} exits
                    </div>
                  </div>

                  <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
                    <div className="text-stone-500 font-medium">Annual Increments & Revisions</div>
                    <div className="text-base font-bold text-indigo-700 mt-1">
                      +{formatCurrency(comparisonData.movementAnalysis.compensationIncreasesAmount)}
                    </div>
                    <div className="text-stone-400 mt-0.5">
                      {comparisonData.movementAnalysis.compensationIncreasesCount} employees revised
                    </div>
                  </div>
                </div>
              </div>

              {/* Department Variance Table */}
              <div className="rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-stone-200 bg-stone-50/50">
                  <h3 className="text-xs font-semibold text-stone-900 uppercase tracking-wide">
                    Department Period-over-Period Variances
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-stone-700">
                    <thead className="border-b border-stone-200 bg-stone-100/70 font-semibold text-stone-700">
                      <tr>
                        <th className="px-4 py-2.5">Department</th>
                        <th className="px-4 py-2.5 text-right">Base Headcount</th>
                        <th className="px-4 py-2.5 text-right">Current Headcount</th>
                        <th className="px-4 py-2.5 text-right">Base Gross</th>
                        <th className="px-4 py-2.5 text-right">Current Gross</th>
                        <th className="px-4 py-2.5 text-right">Variance Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {comparisonData.departmentComparisons.map((dept, idx) => (
                        <tr key={idx} className="hover:bg-stone-50/50">
                          <td className="px-4 py-2.5 font-medium text-stone-900">
                            {dept.departmentName}
                          </td>
                          <td className="px-4 py-2.5 text-right">{dept.baseHeadcount}</td>
                          <td className="px-4 py-2.5 text-right">{dept.compareHeadcount}</td>
                          <td className="px-4 py-2.5 text-right">
                            {formatCurrency(dept.baseGross)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium">
                            {formatCurrency(dept.compareGross)}
                          </td>
                          <td
                            className={`px-4 py-2.5 text-right font-semibold ${
                              dept.variance > 0
                                ? 'text-rose-600'
                                : dept.variance < 0
                                  ? 'text-emerald-600'
                                  : 'text-stone-500'
                            }`}
                          >
                            {dept.variance > 0
                              ? `+${formatCurrency(dept.variance)}`
                              : formatCurrency(dept.variance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SUBTAB 7: ADJUSTMENTS & OFFSETS (REP-PAY-07) */}
          {/* ========================================================================= */}
          {subTab === 'ADJUSTMENTS' && adjustmentsData && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                  <div className="text-xs text-stone-500 uppercase font-medium">
                    Total Adjustments
                  </div>
                  <div className="text-xl font-bold text-stone-900 mt-1">
                    {adjustmentsData.summary.totalAdjustments}
                  </div>
                </div>
                <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                  <div className="text-xs text-stone-500 uppercase font-medium">
                    Additions (Arrears/Bonuses)
                  </div>
                  <div className="text-xl font-bold text-emerald-600 mt-1">
                    {formatCurrency(adjustmentsData.summary.totalAdditions)}
                  </div>
                </div>
                <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                  <div className="text-xs text-stone-500 uppercase font-medium">
                    Deductions (Clawbacks)
                  </div>
                  <div className="text-xl font-bold text-rose-600 mt-1">
                    {formatCurrency(adjustmentsData.summary.totalDeductions)}
                  </div>
                </div>
                <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                  <div className="text-xs text-stone-500 uppercase font-medium">
                    Net Adjustment Impact
                  </div>
                  <div className="text-xl font-bold text-indigo-700 mt-1">
                    {formatCurrency(adjustmentsData.summary.netAdjustmentImpact)}
                  </div>
                </div>
              </div>

              {/* Adjustments Table */}
              <div className="rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-stone-700">
                    <thead className="border-b border-stone-200 bg-stone-100/70 font-semibold text-stone-700">
                      <tr>
                        <th className="px-4 py-2.5">Employee</th>
                        <th className="px-4 py-2.5">Adjustment Type</th>
                        <th className="px-4 py-2.5 text-right">Amount</th>
                        <th className="px-4 py-2.5">Reason / Justification</th>
                        <th className="px-4 py-2.5">Status</th>
                        <th className="px-4 py-2.5">Requested By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {adjustmentsData.items.map((adj) => (
                        <tr key={adj.id} className="hover:bg-stone-50/50">
                          <td className="px-4 py-2.5">
                            <div className="font-medium text-stone-900">{adj.employeeName}</div>
                            <div className="font-mono text-[11px] text-stone-500">
                              {adj.employeeCode}
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="font-medium text-stone-800">{adj.adjustmentType}</span>
                            <span className="text-stone-400 text-[11px]">
                              {' '}
                              ({adj.taxable ? 'Taxable' : 'Exempt'})
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold text-stone-900">
                            {formatCurrency(adj.amount)}
                          </td>
                          <td className="px-4 py-2.5 text-stone-600">{adj.reason}</td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${
                                adj.status === 'APPROVED'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-amber-50 text-amber-700'
                              }`}
                            >
                              {adj.status}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-stone-500">{adj.requestedBy}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SUBTAB 8: APPROVAL & FINALIZATION AUDIT TRAIL (REP-PAY-08) */}
          {/* ========================================================================= */}
          {subTab === 'APPROVAL_HISTORY' && approvalHistoryData && (
            <div className="space-y-6">
              <div className="rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-stone-200 bg-stone-50/50 flex justify-between items-center">
                  <h3 className="text-xs font-semibold text-stone-900 uppercase tracking-wide">
                    Workflow Finalization & Approval History
                  </h3>
                  <span className="text-xs text-stone-500">
                    Total Actions Logged: {approvalHistoryData.summary.totalActions}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-stone-700">
                    <thead className="border-b border-stone-200 bg-stone-100/70 font-semibold text-stone-700">
                      <tr>
                        <th className="px-4 py-2.5">Timestamp</th>
                        <th className="px-4 py-2.5">Action</th>
                        <th className="px-4 py-2.5">Status Transition</th>
                        <th className="px-4 py-2.5">Actor & Role</th>
                        <th className="px-4 py-2.5">Compliance Verification</th>
                        <th className="px-4 py-2.5">Auditor Comments</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {approvalHistoryData.items.map((item) => (
                        <tr key={item.id} className="hover:bg-stone-50/50">
                          <td className="px-4 py-2.5 text-stone-500 whitespace-nowrap">
                            {new Date(item.decisionTimestamp).toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 font-semibold text-stone-900">
                            {item.action}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-stone-600 text-[11px]">
                            {item.fromStatus} → {item.toStatus}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="font-medium text-stone-900">{item.actorName}</div>
                            <div className="text-[11px] text-stone-500">
                              {item.actorRole} ({item.actorEmail})
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            {item.isCompliantSeparationOfDuties ? (
                              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-semibold">
                                <CheckCircle2 className="h-3 w-3" />
                                4-Eyes Compliant
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 font-semibold">
                                Single Actor
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-stone-600">{item.comments || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SUBTAB 9: PAYMENT RECONCILIATION & DISBURSEMENT (REP-PAY-09) */}
          {/* ========================================================================= */}
          {subTab === 'PAYMENT_RECONCILIATION' && paymentReconciliationData && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                  <div className="text-xs text-stone-500 uppercase font-medium">Total Payable</div>
                  <div className="text-xl font-bold text-stone-900 mt-1">
                    {formatCurrency(paymentReconciliationData.summary.totalPayable)}
                  </div>
                </div>
                <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                  <div className="text-xs text-stone-500 uppercase font-medium">
                    Total Disbursed
                  </div>
                  <div className="text-xl font-bold text-emerald-600 mt-1">
                    {formatCurrency(paymentReconciliationData.summary.totalDisbursed)}
                  </div>
                </div>
                <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                  <div className="text-xs text-stone-500 uppercase font-medium">
                    Pending Settlement
                  </div>
                  <div className="text-xl font-bold text-amber-600 mt-1">
                    {formatCurrency(paymentReconciliationData.summary.pendingAmount)}
                  </div>
                </div>
                <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                  <div className="text-xs text-stone-500 uppercase font-medium">
                    Reconciled Settlement
                  </div>
                  <div className="text-xl font-bold text-emerald-700 mt-1">
                    {paymentReconciliationData.summary.reconciliationPercentage}%
                  </div>
                </div>
              </div>

              {/* Disbursements Table */}
              <div className="rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-stone-700">
                    <thead className="border-b border-stone-200 bg-stone-100/70 font-semibold text-stone-700">
                      <tr>
                        <th className="px-4 py-2.5">Employee</th>
                        <th className="px-4 py-2.5">Masked Account</th>
                        <th className="px-4 py-2.5 text-right">Net Payable</th>
                        <th className="px-4 py-2.5">Payment Method</th>
                        <th className="px-4 py-2.5">Payment Status</th>
                        <th className="px-4 py-2.5">Reference & Settlement Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {paymentReconciliationData.items.map((item) => (
                        <tr key={item.snapshotId} className="hover:bg-stone-50/50">
                          <td className="px-4 py-2.5">
                            <div className="font-medium text-stone-900">{item.employeeName}</div>
                            <div className="font-mono text-[11px] text-stone-500">
                              {item.employeeCode}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-stone-700 text-[11px]">
                            {item.bankName}: {item.bankAccountMasked}
                          </td>
                          <td className="px-4 py-2.5 text-right font-bold text-emerald-600">
                            {formatCurrency(item.netPayable)}
                          </td>
                          <td className="px-4 py-2.5 text-stone-600">{item.paymentMethod}</td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                                item.paymentStatus === 'PAID'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : item.paymentStatus === 'FAILED'
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {item.paymentStatus}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-stone-500 text-[11px]">
                            {item.paymentReference || 'Batch Settlement'}
                            {item.reconciliationNotes && ` (${item.reconciliationNotes})`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
