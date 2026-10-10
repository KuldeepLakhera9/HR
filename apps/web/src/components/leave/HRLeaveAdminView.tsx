'use client';

import React, { useState, useEffect } from 'react';
import { Button, Input, Badge, Dialog, Textarea } from '@hrms/ui';
import { leaveApi } from '../../lib/api-client';
import {
  BarChart3,
  Scale,
  Settings,
  UserCheck,
  CalendarDays,
  Download,
  RefreshCw,
  Search,
  Filter,
  AlertCircle,
  CheckCircle2,
  SlidersHorizontal,
  History,
  FileSpreadsheet,
  Plus,
  ShieldCheck,
  Eye,
  Building,
  User,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { BalanceLedgerModal } from './BalanceLedgerModal';
import { AdjustBalanceModal } from './AdjustBalanceModal';

interface HRLeaveAdminViewProps {
  currentUserId?: string;
}

export const HRLeaveAdminView: React.FC<HRLeaveAdminViewProps> = ({ currentUserId }) => {
  const [activeSubTab, setActiveSubTab] = useState<
    'reports' | 'reconciliation' | 'policies' | 'assignments' | 'holidays'
  >('reports');

  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Common metadata
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [loadingTypes, setLoadingTypes] = useState<boolean>(false);

  // 1. Reports State
  const [reportsData, setReportsData] = useState<any>(null);
  const [reportsLoading, setReportsLoading] = useState<boolean>(false);
  const [reportStartDate, setReportStartDate] = useState<string>(
    `${new Date().getFullYear()}-01-01`,
  );
  const [reportEndDate, setReportEndDate] = useState<string>(
    new Date().toISOString().split('T')[0],
  );
  const [reportTypeFilter, setReportTypeFilter] = useState<string>('ALL');
  const [reportStatusFilter, setReportStatusFilter] = useState<string>('ALL');
  const [exportingCsv, setExportingCsv] = useState<boolean>(false);

  // 2. Reconciliation State
  const [reconciliationData, setReconciliationData] = useState<any>(null);
  const [reconciliationLoading, setReconciliationLoading] = useState<boolean>(false);
  const [recYear, setRecYear] = useState<number>(new Date().getFullYear());
  const [recTypeFilter, setRecTypeFilter] = useState<string>('ALL');
  const [recDiscrepantOnly, setRecDiscrepantOnly] = useState<boolean>(false);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);

  // Modals state
  const [ledgerModalAccountId, setLedgerModalAccountId] = useState<string | null>(null);
  const [adjustModalOpen, setAdjustModalOpen] = useState<boolean>(false);
  const [preselectedAccount, setPreselectedAccount] = useState<any>(null);

  // 3. Policies & Types State
  const [policies, setPolicies] = useState<any[]>([]);
  const [policiesLoading, setPoliciesLoading] = useState<boolean>(false);
  const [createTypeModalOpen, setCreateTypeModalOpen] = useState<boolean>(false);
  const [createPolicyModalOpen, setCreatePolicyModalOpen] = useState<boolean>(false);

  // 4. Assignments State
  const [assignments, setAssignments] = useState<any[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState<boolean>(false);
  const [assignmentSearch, setAssignmentSearch] = useState<string>('');
  const [assignModalOpen, setAssignModalOpen] = useState<boolean>(false);

  // 5. Holidays State
  const [holidays, setHolidays] = useState<any[]>([]);
  const [holidaysLoading, setHolidaysLoading] = useState<boolean>(false);
  const [holidayYear, setHolidayYear] = useState<number>(new Date().getFullYear());
  const [createHolidayModalOpen, setCreateHolidayModalOpen] = useState<boolean>(false);

  // Forms state
  const [typeForm, setTypeForm] = useState({
    code: '',
    name: '',
    description: '',
    color: '#d97706',
    isPaid: true,
    allowHalfDay: true,
    requiresDoc: false,
    docThresholdDays: 2,
  });

  const [policyForm, setPolicyForm] = useState({
    leaveTypeId: '',
    name: '',
    code: '',
    annualEntitlement: 12,
    accrualFrequency: 'MONTHLY',
    carryForwardLimit: 5,
    minNoticeDays: 1,
    countWeekendsAsLeave: false,
    countHolidaysAsLeave: false,
    allowNegativeBalance: false,
    maxNegativeBalance: 0,
  });

  const [assignForm, setAssignForm] = useState({
    employeeId: '',
    leavePolicyId: '',
    effectiveFrom: `${new Date().getFullYear()}-01-01`,
  });

  const [holidayForm, setHolidayForm] = useState({
    name: '',
    date: new Date().toISOString().split('T')[0],
    isOptional: false,
    description: '',
  });

  // Fetch Leave Types once
  const fetchLeaveTypes = async () => {
    setLoadingTypes(true);
    try {
      const res = await leaveApi.getLeaveTypes();
      if (res?.data) {
        setLeaveTypes(res.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingTypes(false);
    }
  };

  useEffect(() => {
    fetchLeaveTypes();
  }, []);

  // Fetch Reports
  const fetchReports = async () => {
    setReportsLoading(true);
    try {
      const res = await leaveApi.getReports({
        startDate: reportStartDate,
        endDate: reportEndDate,
        leaveTypeId: reportTypeFilter !== 'ALL' ? reportTypeFilter : undefined,
        status: reportStatusFilter !== 'ALL' ? reportStatusFilter : undefined,
      });
      if (res?.data) {
        setReportsData(res.data);
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err?.message || 'Failed to load leave reports.' });
    } finally {
      setReportsLoading(false);
    }
  };

  // Fetch Reconciliation
  const fetchReconciliation = async () => {
    setReconciliationLoading(true);
    try {
      const res = await leaveApi.getBalanceReconciliation({
        leaveYear: recYear,
        leaveTypeId: recTypeFilter !== 'ALL' ? recTypeFilter : undefined,
        discrepantOnly: recDiscrepantOnly,
      });
      if (res?.data) {
        setReconciliationData(res.data);
      }
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err?.message || 'Failed to load balance reconciliation.',
      });
    } finally {
      setReconciliationLoading(false);
    }
  };

  // Fetch Policies
  const fetchPolicies = async () => {
    setPoliciesLoading(true);
    try {
      const res = await leaveApi.getLeavePolicies();
      if (res?.data) {
        setPolicies(res.data);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setPoliciesLoading(false);
    }
  };

  // Fetch Assignments
  const fetchAssignments = async () => {
    setAssignmentsLoading(true);
    try {
      const res = await leaveApi.getPolicyAssignments({
        search: assignmentSearch.trim() || undefined,
      });
      if (res?.data) {
        setAssignments(res.data);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setAssignmentsLoading(false);
    }
  };

  // Fetch Holidays
  const fetchHolidays = async () => {
    setHolidaysLoading(true);
    try {
      const res = await leaveApi.getHolidays({ year: holidayYear });
      if (res?.data) {
        setHolidays(res.data);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setHolidaysLoading(false);
    }
  };

  // Trigger data load based on active sub tab
  useEffect(() => {
    if (activeSubTab === 'reports') fetchReports();
    else if (activeSubTab === 'reconciliation') fetchReconciliation();
    else if (activeSubTab === 'policies') {
      fetchPolicies();
      fetchLeaveTypes();
    } else if (activeSubTab === 'assignments') fetchAssignments();
    else if (activeSubTab === 'holidays') fetchHolidays();
  }, [activeSubTab]);

  // Handle Export CSV
  const handleExportCsv = async () => {
    setExportingCsv(true);
    try {
      const res = await leaveApi.getReports({
        startDate: reportStartDate,
        endDate: reportEndDate,
        leaveTypeId: reportTypeFilter !== 'ALL' ? reportTypeFilter : undefined,
        status: reportStatusFilter !== 'ALL' ? reportStatusFilter : undefined,
        format: 'csv',
      });

      if (res?.data?.csv) {
        const blob = new Blob([res.data.csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', res.data.filename || `leave-report-${reportStartDate}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setNotification({
          type: 'success',
          message: `Exported ${res.data.totalRecords} records to CSV.`,
        });
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err?.message || 'Failed to export CSV.' });
    } finally {
      setExportingCsv(false);
    }
  };

  // Reconcile single account
  const handleReconcileAccount = async (id: string) => {
    setReconcilingId(id);
    try {
      const res = await leaveApi.reconcileAccount(id);
      if (res?.success) {
        setNotification({
          type: 'success',
          message: 'Account successfully reconciled with ledger!',
        });
        fetchReconciliation();
      } else {
        setNotification({ type: 'error', message: res?.message || 'Reconciliation failed.' });
      }
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err?.message || 'Error executing reconciliation.',
      });
    } finally {
      setReconcilingId(null);
    }
  };

  // Create Leave Type
  const handleCreateLeaveType = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await leaveApi.createLeaveType(typeForm);
      if (res?.success) {
        setNotification({ type: 'success', message: 'Leave type created successfully!' });
        setCreateTypeModalOpen(false);
        fetchLeaveTypes();
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err?.message || 'Error creating leave type.' });
    }
  };

  // Create Policy
  const handleCreatePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await leaveApi.createLeavePolicy(policyForm);
      if (res?.success) {
        setNotification({ type: 'success', message: 'Leave policy created successfully!' });
        setCreatePolicyModalOpen(false);
        fetchPolicies();
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err?.message || 'Error creating leave policy.' });
    }
  };

  // Assign Policy
  const handleAssignPolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await leaveApi.assignPolicy(assignForm);
      if (res?.success) {
        setNotification({ type: 'success', message: 'Policy assigned to employee successfully!' });
        setAssignModalOpen(false);
        fetchAssignments();
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err?.message || 'Error assigning policy.' });
    }
  };

  // Create Holiday
  const handleCreateHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await leaveApi.createHoliday(holidayForm);
      if (res?.success) {
        setNotification({ type: 'success', message: 'Holiday created successfully!' });
        setCreateHolidayModalOpen(false);
        fetchHolidays();
      }
    } catch (err: any) {
      setNotification({ type: 'error', message: err?.message || 'Error creating holiday.' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-semibold animate-in fade-in ${
            notification.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-600" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="hover:opacity-75 font-bold uppercase text-[10px] ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Header and Sub Tabs Navigation */}
      <div className="bg-white border border-stone-200 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-stone-900 flex items-center gap-2">
            <Settings className="h-5 w-5 text-amber-600" />
            HR Administration, Balances & Reports
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Manage leave policies, authoritative ledger reconciliation, assignments and organization
            reports
          </p>
        </div>

        {/* Sub-tab pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto bg-stone-100 p-1 rounded-lg">
          <button
            onClick={() => setActiveSubTab('reports')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
              activeSubTab === 'reports'
                ? 'bg-white text-stone-900 shadow-sm'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5 text-amber-600" />
            Analytics & Reports
          </button>

          <button
            onClick={() => setActiveSubTab('reconciliation')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
              activeSubTab === 'reconciliation'
                ? 'bg-white text-stone-900 shadow-sm'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Scale className="h-3.5 w-3.5 text-amber-600" />
            Ledger Reconciliation
          </button>

          <button
            onClick={() => setActiveSubTab('policies')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
              activeSubTab === 'policies'
                ? 'bg-white text-stone-900 shadow-sm'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-amber-600" />
            Policies & Types
          </button>

          <button
            onClick={() => setActiveSubTab('assignments')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
              activeSubTab === 'assignments'
                ? 'bg-white text-stone-900 shadow-sm'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <UserCheck className="h-3.5 w-3.5 text-amber-600" />
            Policy Assignments
          </button>

          <button
            onClick={() => setActiveSubTab('holidays')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
              activeSubTab === 'holidays'
                ? 'bg-white text-stone-900 shadow-sm'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <CalendarDays className="h-3.5 w-3.5 text-amber-600" />
            Holidays
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SUB-TAB 1: ANALYTICS & REPORTS                                             */}
      {/* ========================================================================= */}
      {activeSubTab === 'reports' && (
        <div className="space-y-6">
          {/* Filters Bar */}
          <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase block mb-1">
                  Start Date
                </label>
                <Input
                  type="date"
                  value={reportStartDate}
                  onChange={(e) => setReportStartDate(e.target.value)}
                  className="w-36 h-8 text-xs bg-white"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase block mb-1">
                  End Date
                </label>
                <Input
                  type="date"
                  value={reportEndDate}
                  onChange={(e) => setReportEndDate(e.target.value)}
                  className="w-36 h-8 text-xs bg-white"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase block mb-1">
                  Leave Type
                </label>
                <select
                  value={reportTypeFilter}
                  onChange={(e) => setReportTypeFilter(e.target.value)}
                  className="h-8 text-xs bg-white min-w-[130px] rounded-lg border border-stone-200 px-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
                >
                  <option value="ALL">All Leave Types</option>
                  {leaveTypes.map((lt) => (
                    <option key={lt.id} value={lt.id}>
                      {lt.name} ({lt.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase block mb-1">
                  Status
                </label>
                <select
                  value={reportStatusFilter}
                  onChange={(e) => setReportStatusFilter(e.target.value)}
                  className="h-8 text-xs bg-white min-w-[130px] rounded-lg border border-stone-200 px-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="APPROVED">Approved</option>
                  <option value="SUBMITTED">Pending</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>

              <div className="self-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={fetchReports}
                  disabled={reportsLoading}
                >
                  <Filter className="h-3.5 w-3.5 mr-1" /> Apply Filter
                </Button>
              </div>
            </div>

            <div className="self-end">
              <Button
                size="sm"
                variant="primary"
                onClick={handleExportCsv}
                disabled={exportingCsv || reportsLoading}
                className="gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                {exportingCsv ? 'Exporting CSV...' : 'Export to CSV'}
              </Button>
            </div>
          </div>

          {/* Report KPI Metrics */}
          {reportsData?.summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white border border-stone-200 rounded-xl p-4 shadow-sm">
                <span className="text-xs font-semibold text-stone-500 block">Total Requests</span>
                <span className="text-2xl font-black text-stone-900 mt-1 block">
                  {reportsData.summary.totalRequests}
                </span>
                <span className="text-[11px] text-stone-400 mt-0.5 block">
                  Across selected date window
                </span>
              </div>

              <div className="bg-white border border-emerald-200 rounded-xl p-4 shadow-sm bg-gradient-to-br from-white to-emerald-50/30">
                <span className="text-xs font-semibold text-emerald-800 block">
                  Approved Days Taken
                </span>
                <span className="text-2xl font-black text-emerald-700 mt-1 block">
                  {reportsData.summary.totalApprovedDays}d
                </span>
                <span className="text-[11px] text-emerald-600 mt-0.5 block">
                  Chargeable leave days posted
                </span>
              </div>

              <div className="bg-white border border-amber-200 rounded-xl p-4 shadow-sm bg-gradient-to-br from-white to-amber-50/30">
                <span className="text-xs font-semibold text-amber-800 block">
                  Pending Days in Queue
                </span>
                <span className="text-2xl font-black text-amber-700 mt-1 block">
                  {reportsData.summary.totalPendingDays}d
                </span>
                <span className="text-[11px] text-amber-600 mt-0.5 block">
                  Reserved awaiting decisions
                </span>
              </div>

              <div className="bg-white border border-stone-200 rounded-xl p-4 shadow-sm">
                <span className="text-xs font-semibold text-stone-500 block">
                  Unique Employees on Leave
                </span>
                <span className="text-2xl font-black text-stone-900 mt-1 block">
                  {reportsData.summary.uniqueEmployeesCount}
                </span>
                <span className="text-[11px] text-stone-400 mt-0.5 block">
                  Distinct individuals
                </span>
              </div>
            </div>
          )}

          {/* Visual Breakdowns: By Department & By Leave Type */}
          {reportsData && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Department Breakdown */}
              <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2 mb-4">
                  <Building className="h-4 w-4 text-stone-500" />
                  Leave Usage by Department
                </h3>
                {reportsData.byDepartment?.length === 0 ? (
                  <p className="text-xs text-stone-500 text-center py-6">No departmental data.</p>
                ) : (
                  <div className="space-y-3">
                    {reportsData.byDepartment?.map((dept: any) => (
                      <div key={dept.departmentName} className="text-xs">
                        <div className="flex justify-between font-semibold text-stone-700 mb-1">
                          <span>{dept.departmentName}</span>
                          <span>
                            {dept.approvedDays}d ({dept.requestCount} reqs)
                          </span>
                        </div>
                        <div className="w-full bg-stone-100 rounded-full h-2">
                          <div
                            className="bg-amber-600 h-2 rounded-full"
                            style={{
                              width: `${Math.min(
                                100,
                                reportsData.summary.totalApprovedDays > 0
                                  ? (dept.approvedDays / reportsData.summary.totalApprovedDays) *
                                      100
                                  : 0,
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Leave Type Breakdown */}
              <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-sm">
                <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2 mb-4">
                  <SlidersHorizontal className="h-4 w-4 text-stone-500" />
                  Usage Distribution by Leave Type
                </h3>
                {reportsData.byLeaveType?.length === 0 ? (
                  <p className="text-xs text-stone-500 text-center py-6">No leave type data.</p>
                ) : (
                  <div className="space-y-3">
                    {reportsData.byLeaveType?.map((lt: any) => (
                      <div key={lt.leaveTypeName} className="text-xs">
                        <div className="flex justify-between font-semibold text-stone-700 mb-1">
                          <span className="flex items-center gap-1.5">
                            <span
                              className="w-2.5 h-2.5 rounded-full inline-block"
                              style={{ backgroundColor: lt.color }}
                            />
                            {lt.leaveTypeName} ({lt.code})
                          </span>
                          <span>
                            {lt.approvedDays}d ({lt.requestCount} reqs)
                          </span>
                        </div>
                        <div className="w-full bg-stone-100 rounded-full h-2">
                          <div
                            className="h-2 rounded-full"
                            style={{
                              backgroundColor: lt.color,
                              width: `${Math.min(
                                100,
                                reportsData.summary.totalApprovedDays > 0
                                  ? (lt.approvedDays / reportsData.summary.totalApprovedDays) * 100
                                  : 0,
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Paginated Requests Audit Table */}
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-stone-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-amber-600" />
                Leave Applications Audit Register
              </h3>
              <span className="text-xs text-stone-500">
                {reportsData?.requests?.length || 0} displayed
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 text-stone-700 font-semibold border-b border-stone-200">
                  <tr>
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Leave Type</th>
                    <th className="py-3 px-4">Dates Window</th>
                    <th className="py-3 px-4 text-right">Chargeable</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {reportsLoading ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-stone-500">
                        <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-amber-600" />
                        Loading leave reports...
                      </td>
                    </tr>
                  ) : reportsData?.requests?.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-stone-500">
                        No leave records matched the specified criteria.
                      </td>
                    </tr>
                  ) : (
                    reportsData?.requests?.map((req: any) => (
                      <tr key={req.id} className="hover:bg-stone-50">
                        <td className="py-3 px-4">
                          <div className="font-bold text-stone-900">{req.employeeName}</div>
                          <div className="text-[11px] text-stone-500 font-mono">
                            {req.employeeCode}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-stone-700">{req.department}</td>
                        <td className="py-3 px-4">
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold text-white"
                            style={{ backgroundColor: req.leaveTypeColor || '#d97706' }}
                          >
                            {req.leaveType}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-stone-700">
                          {req.startDate} to {req.endDate}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-stone-800">
                          {req.chargeableDays}d
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Badge
                            variant={
                              req.status === 'APPROVED'
                                ? 'success'
                                : req.status === 'SUBMITTED'
                                  ? 'warning'
                                  : req.status === 'REJECTED'
                                    ? 'danger'
                                    : 'outline'
                            }
                          >
                            {req.status}
                          </Badge>
                        </td>
                        <td
                          className="py-3 px-4 text-stone-600 max-w-xs truncate"
                          title={req.reason}
                        >
                          {req.reason}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 2: BALANCE RECONCILIATION & LEDGER AUDIT                           */}
      {/* ========================================================================= */}
      {activeSubTab === 'reconciliation' && (
        <div className="space-y-6">
          {/* Header Action Strip */}
          <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase block mb-1">
                  Leave Year
                </label>
                <Input
                  type="number"
                  min={2020}
                  max={2030}
                  value={recYear}
                  onChange={(e) => setRecYear(parseInt(e.target.value, 10))}
                  className="w-24 h-8 text-xs bg-white"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase block mb-1">
                  Leave Type
                </label>
                <select
                  value={recTypeFilter}
                  onChange={(e) => setRecTypeFilter(e.target.value)}
                  className="h-8 text-xs bg-white min-w-[130px] rounded-lg border border-stone-200 px-2 text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
                >
                  <option value="ALL">All Leave Types</option>
                  {leaveTypes.map((lt) => (
                    <option key={lt.id} value={lt.id}>
                      {lt.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 pt-4">
                <input
                  type="checkbox"
                  id="discrepantToggle"
                  checked={recDiscrepantOnly}
                  onChange={(e) => setRecDiscrepantOnly(e.target.checked)}
                  className="rounded border-stone-300 text-amber-600 focus:ring-amber-500"
                />
                <label
                  htmlFor="discrepantToggle"
                  className="text-xs font-semibold text-stone-700 cursor-pointer"
                >
                  Show Discrepancies Only
                </label>
              </div>

              <div className="self-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={fetchReconciliation}
                  disabled={reconciliationLoading}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Re-scan Ledger
                </Button>
              </div>
            </div>

            <div className="self-end">
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  setPreselectedAccount(null);
                  setAdjustModalOpen(true);
                }}
                className="gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" /> Manual Balance Adjustment
              </Button>
            </div>
          </div>

          {/* Reconciliation Health Strip */}
          {reconciliationData?.summary && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white border border-stone-200 rounded-xl p-4 shadow-sm">
                <span className="text-xs font-semibold text-stone-500 block">
                  Total Monitored Accounts
                </span>
                <span className="text-2xl font-black text-stone-900 mt-1 block">
                  {reconciliationData.summary.totalAccounts}
                </span>
                <span className="text-[11px] text-stone-400 mt-0.5 block">
                  Annual employee balance records
                </span>
              </div>

              <div className="bg-white border border-emerald-200 rounded-xl p-4 shadow-sm bg-gradient-to-br from-white to-emerald-50/30">
                <span className="text-xs font-semibold text-emerald-800 block">
                  Reconciliation Rate
                </span>
                <span className="text-2xl font-black text-emerald-700 mt-1 block">
                  {reconciliationData.summary.reconciliationRatePercent}%
                </span>
                <span className="text-[11px] text-emerald-600 mt-0.5 block">
                  {reconciliationData.summary.balancedAccounts} perfectly balanced against ledger
                </span>
              </div>

              <div
                className={`bg-white border rounded-xl p-4 shadow-sm ${
                  reconciliationData.summary.discrepantAccounts > 0
                    ? 'border-rose-300 bg-rose-50/20'
                    : 'border-stone-200'
                }`}
              >
                <span
                  className={`text-xs font-semibold block ${
                    reconciliationData.summary.discrepantAccounts > 0
                      ? 'text-rose-800 font-bold'
                      : 'text-stone-500'
                  }`}
                >
                  Detected Discrepancies
                </span>
                <span
                  className={`text-2xl font-black mt-1 block ${
                    reconciliationData.summary.discrepantAccounts > 0
                      ? 'text-rose-700'
                      : 'text-stone-900'
                  }`}
                >
                  {reconciliationData.summary.discrepantAccounts}
                </span>
                <span className="text-[11px] text-stone-400 mt-0.5 block">
                  {reconciliationData.summary.discrepantAccounts > 0
                    ? 'Action recommended: Reconcile or adjust'
                    : 'Zero discrepancies detected'}
                </span>
              </div>
            </div>
          )}

          {/* Reconciliation Accounts Table */}
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 text-stone-700 font-semibold border-b border-stone-200">
                  <tr>
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Leave Type</th>
                    <th className="py-3 px-4 text-right">Stored Closing</th>
                    <th className="py-3 px-4 text-right">Calculated Closing</th>
                    <th className="py-3 px-4 text-right">Discrepancy</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {reconciliationLoading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-stone-500">
                        <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-amber-600" />
                        Auditing balance accounts against ledger...
                      </td>
                    </tr>
                  ) : reconciliationData?.accounts?.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-stone-500">
                        No balance accounts found.
                      </td>
                    </tr>
                  ) : (
                    reconciliationData?.accounts?.map((acc: any) => (
                      <tr
                        key={acc.id}
                        className={`hover:bg-stone-50 ${!acc.isBalanced ? 'bg-rose-50/40' : ''}`}
                      >
                        <td className="py-3 px-4">
                          <div className="font-bold text-stone-900">
                            {acc.employee?.displayName}
                          </div>
                          <div className="text-[11px] text-stone-500 font-mono">
                            {acc.employee?.employeeCode} •{' '}
                            {acc.employee?.employment?.department?.name || 'N/A'}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold text-white"
                            style={{ backgroundColor: acc.leaveType?.color || '#d97706' }}
                          >
                            {acc.leaveType?.name}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-stone-800">
                          {acc.stored.closing}d
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-stone-800">
                          {acc.calculated.closing}d
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono font-bold ${
                            acc.discrepancy !== 0 ? 'text-rose-700' : 'text-emerald-700'
                          }`}
                        >
                          {acc.discrepancy > 0 ? `+${acc.discrepancy}` : acc.discrepancy}d
                        </td>
                        <td className="py-3 px-4 text-center">
                          {acc.isBalanced ? (
                            <Badge variant="success" className="gap-1">
                              <CheckCircle2 className="h-3 w-3" /> RECONCILED
                            </Badge>
                          ) : (
                            <Badge variant="danger" className="gap-1">
                              <AlertCircle className="h-3 w-3" /> DISCREPANT
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-center gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setLedgerModalAccountId(acc.id)}
                              title="Inspect full transaction ledger"
                            >
                              <History className="h-3.5 w-3.5 mr-1" /> Ledger
                            </Button>

                            {!acc.isBalanced && (
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => handleReconcileAccount(acc.id)}
                                disabled={reconcilingId === acc.id}
                              >
                                {reconcilingId === acc.id ? (
                                  <RefreshCw className="h-3 w-3 animate-spin" />
                                ) : (
                                  'Reconcile'
                                )}
                              </Button>
                            )}

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setPreselectedAccount({
                                  id: acc.id,
                                  employeeId: acc.employee.id,
                                  employeeName: acc.employee.displayName,
                                  employeeCode: acc.employee.employeeCode,
                                  leaveTypeId: acc.leaveType.id,
                                  leaveYear: acc.leaveYear,
                                  closingBalance: acc.stored.closing,
                                });
                                setAdjustModalOpen(true);
                              }}
                              title="Manual Adjustment"
                            >
                              <SlidersHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 3: POLICIES & TYPES                                                */}
      {/* ========================================================================= */}
      {activeSubTab === 'policies' && (
        <div className="space-y-8">
          {/* Section: Leave Types */}
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-stone-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-amber-600" />
                  Leave Types Catalog
                </h3>
                <p className="text-xs text-stone-500">
                  Global organizational leave categories and document thresholds
                </p>
              </div>
              <Button size="sm" variant="primary" onClick={() => setCreateTypeModalOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> New Leave Type
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 text-stone-700 font-semibold border-b border-stone-200">
                  <tr>
                    <th className="py-3 px-4">Code</th>
                    <th className="py-3 px-4">Name</th>
                    <th className="py-3 px-4">Paid / Unpaid</th>
                    <th className="py-3 px-4">Half-Day</th>
                    <th className="py-3 px-4">Medical Certificate</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {leaveTypes.map((lt) => (
                    <tr key={lt.id} className="hover:bg-stone-50">
                      <td className="py-3 px-4 font-mono font-bold text-stone-900">{lt.code}</td>
                      <td className="py-3 px-4">
                        <span className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: lt.color }}
                          />
                          <span className="font-semibold text-stone-800">{lt.name}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={lt.isPaid ? 'success' : 'outline'}>
                          {lt.isPaid ? 'PAID' : 'UNPAID'}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-stone-600">
                        {lt.allowHalfDay ? 'Allowed' : 'Disabled'}
                      </td>
                      <td className="py-3 px-4 text-stone-600">
                        {lt.requiresDoc ? `Mandatory if > ${lt.docThresholdDays}d` : 'Not required'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <Badge variant={lt.isActive ? 'primary' : 'outline'}>
                          {lt.isActive ? 'ACTIVE' : 'INACTIVE'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section: Leave Policies */}
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-stone-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                  <Scale className="h-4 w-4 text-amber-600" />
                  Leave Policies Rules & Entitlements
                </h3>
                <p className="text-xs text-stone-500">
                  Accrual frequencies, sandwich rules, carry-forward caps and notice periods
                </p>
              </div>
              <Button size="sm" variant="primary" onClick={() => setCreatePolicyModalOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> New Leave Policy
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 text-stone-700 font-semibold border-b border-stone-200">
                  <tr>
                    <th className="py-3 px-4">Policy Name</th>
                    <th className="py-3 px-4">Leave Type</th>
                    <th className="py-3 px-4 text-right">Annual Entitlement</th>
                    <th className="py-3 px-4">Accrual</th>
                    <th className="py-3 px-4">Notice Days</th>
                    <th className="py-3 px-4">Sandwich Rules</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {policiesLoading ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-stone-500">
                        Loading policies...
                      </td>
                    </tr>
                  ) : policies.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-stone-500">
                        No configured leave policies found.
                      </td>
                    </tr>
                  ) : (
                    policies.map((p) => (
                      <tr key={p.id} className="hover:bg-stone-50">
                        <td className="py-3 px-4 font-bold text-stone-900">{p.name}</td>
                        <td className="py-3 px-4">
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold text-white"
                            style={{ backgroundColor: p.leaveType?.color || '#d97706' }}
                          >
                            {p.leaveType?.name}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-stone-800">
                          {Number(p.annualEntitlement)}d
                        </td>
                        <td className="py-3 px-4 text-stone-600">{p.accrualFrequency}</td>
                        <td className="py-3 px-4 text-stone-600">{p.minNoticeDays} day(s)</td>
                        <td className="py-3 px-4 text-stone-600">
                          {p.countWeekendsAsLeave ? 'Weekends counted' : 'Standard'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Badge variant={p.isActive ? 'primary' : 'outline'}>
                            {p.isActive ? 'ACTIVE' : 'INACTIVE'}
                          </Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 4: POLICY ASSIGNMENTS                                              */}
      {/* ========================================================================= */}
      {activeSubTab === 'assignments' && (
        <div className="space-y-6">
          <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-stone-400" />
                <Input
                  type="text"
                  placeholder="Search employee name or code..."
                  value={assignmentSearch}
                  onChange={(e) => setAssignmentSearch(e.target.value)}
                  className="pl-8 w-64 h-8 text-xs bg-white"
                />
              </div>
              <Button size="sm" variant="outline" onClick={fetchAssignments}>
                Filter
              </Button>
            </div>

            <Button size="sm" variant="primary" onClick={() => setAssignModalOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Assign Policy to Employee
            </Button>
          </div>

          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 text-stone-700 font-semibold border-b border-stone-200">
                  <tr>
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Department / Branch</th>
                    <th className="py-3 px-4">Assigned Policy</th>
                    <th className="py-3 px-4">Leave Type</th>
                    <th className="py-3 px-4">Effective Window</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {assignmentsLoading ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-stone-500">
                        Loading assignments...
                      </td>
                    </tr>
                  ) : assignments.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-stone-500">
                        No policy assignments found.
                      </td>
                    </tr>
                  ) : (
                    assignments.map((as) => (
                      <tr key={as.id} className="hover:bg-stone-50">
                        <td className="py-3 px-4">
                          <div className="font-bold text-stone-900">{as.employee?.displayName}</div>
                          <div className="text-[11px] text-stone-500 font-mono">
                            {as.employee?.employeeCode}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-stone-600">
                          {as.employee?.employment?.department?.name || 'Unassigned'} •{' '}
                          {as.employee?.employment?.branch?.name || 'Main Office'}
                        </td>
                        <td className="py-3 px-4 font-semibold text-stone-800">
                          {as.leavePolicy?.name}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold text-white"
                            style={{
                              backgroundColor: as.leavePolicy?.leaveType?.color || '#d97706',
                            }}
                          >
                            {as.leavePolicy?.leaveType?.name}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-stone-600">
                          {new Date(as.effectiveFrom).toLocaleDateString()} to{' '}
                          {as.effectiveTo
                            ? new Date(as.effectiveTo).toLocaleDateString()
                            : 'Ongoing'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 5: HOLIDAYS                                                        */}
      {/* ========================================================================= */}
      {activeSubTab === 'holidays' && (
        <div className="space-y-6">
          <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase block mb-1">
                  Holiday Year
                </label>
                <Input
                  type="number"
                  min={2020}
                  max={2030}
                  value={holidayYear}
                  onChange={(e) => setHolidayYear(parseInt(e.target.value, 10))}
                  className="w-24 h-8 text-xs bg-white"
                />
              </div>
              <div className="self-end">
                <Button size="sm" variant="outline" onClick={fetchHolidays}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Load Holidays
                </Button>
              </div>
            </div>

            <Button size="sm" variant="primary" onClick={() => setCreateHolidayModalOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Holiday
            </Button>
          </div>

          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 text-stone-700 font-semibold border-b border-stone-200">
                  <tr>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Holiday Observance</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {holidaysLoading ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-stone-500">
                        Loading holidays...
                      </td>
                    </tr>
                  ) : holidays.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-stone-500">
                        No holidays configured for year {holidayYear}.
                      </td>
                    </tr>
                  ) : (
                    holidays.map((h) => (
                      <tr key={h.id} className="hover:bg-stone-50">
                        <td className="py-3 px-4 font-mono font-bold text-stone-900">
                          {new Date(h.date).toLocaleDateString(undefined, {
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </td>
                        <td className="py-3 px-4 font-semibold text-stone-800">{h.name}</td>
                        <td className="py-3 px-4">
                          <Badge variant={h.isOptional ? 'outline' : 'success'}>
                            {h.isOptional ? 'OPTIONAL / RESTRICTED' : 'PUBLIC HOLIDAY'}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-stone-500">{h.description || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODALS                                                                     */}
      {/* ========================================================================= */}

      {/* Balance Ledger Modal */}
      <BalanceLedgerModal
        accountId={ledgerModalAccountId}
        isOpen={!!ledgerModalAccountId}
        onClose={() => setLedgerModalAccountId(null)}
      />

      {/* Adjust Balance Modal */}
      <AdjustBalanceModal
        isOpen={adjustModalOpen}
        onClose={() => {
          setAdjustModalOpen(false);
          setPreselectedAccount(null);
        }}
        onSuccess={(msg) => {
          setNotification({ type: 'success', message: msg });
          fetchReconciliation();
        }}
        leaveTypes={leaveTypes}
        preselectedAccount={preselectedAccount}
      />

      {/* Create Leave Type Modal */}
      <Dialog
        isOpen={createTypeModalOpen}
        onClose={() => setCreateTypeModalOpen(false)}
        title="Create New Leave Type"
        maxWidth="md"
      >
        <form onSubmit={handleCreateLeaveType} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Code</label>
              <Input
                placeholder="e.g. SL, CL, PL"
                value={typeForm.code}
                onChange={(e) => setTypeForm({ ...typeForm, code: e.target.value.toUpperCase() })}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Color (Hex)</label>
              <Input
                type="color"
                value={typeForm.color}
                onChange={(e) => setTypeForm({ ...typeForm, color: e.target.value })}
                className="h-10"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Leave Type Name
            </label>
            <Input
              placeholder="e.g. Sick Leave / Casual Leave"
              value={typeForm.name}
              onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Description</label>
            <Textarea
              rows={2}
              placeholder="Description and policy purpose..."
              value={typeForm.description}
              onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })}
            />
          </div>

          <div className="flex items-center gap-4 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={typeForm.isPaid}
                onChange={(e) => setTypeForm({ ...typeForm, isPaid: e.target.checked })}
              />
              <span>Paid Leave</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={typeForm.allowHalfDay}
                onChange={(e) => setTypeForm({ ...typeForm, allowHalfDay: e.target.checked })}
              />
              <span>Allow Half-Days</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
            <Button type="button" variant="outline" onClick={() => setCreateTypeModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Create Leave Type
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Create Leave Policy Modal */}
      <Dialog
        isOpen={createPolicyModalOpen}
        onClose={() => setCreatePolicyModalOpen(false)}
        title="Create New Leave Policy"
        maxWidth="md"
      >
        <form onSubmit={handleCreatePolicy} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Leave Type</label>
            <select
              value={policyForm.leaveTypeId}
              onChange={(e) => setPolicyForm({ ...policyForm, leaveTypeId: e.target.value })}
              className="w-full h-10 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
              required
            >
              <option value="">Select Leave Type...</option>
              {leaveTypes.map((lt) => (
                <option key={lt.id} value={lt.id}>
                  {lt.name} ({lt.code})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Policy Name</label>
              <Input
                placeholder="e.g. Standard Casual Leave Policy"
                value={policyForm.name}
                onChange={(e) => setPolicyForm({ ...policyForm, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Policy Code</label>
              <Input
                placeholder="e.g. POL-CL-2026"
                value={policyForm.code}
                onChange={(e) =>
                  setPolicyForm({ ...policyForm, code: e.target.value.toUpperCase() })
                }
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Annual Days</label>
              <Input
                type="number"
                min="0"
                value={policyForm.annualEntitlement}
                onChange={(e) =>
                  setPolicyForm({ ...policyForm, annualEntitlement: parseFloat(e.target.value) })
                }
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Accrual</label>
              <select
                value={policyForm.accrualFrequency}
                onChange={(e) => setPolicyForm({ ...policyForm, accrualFrequency: e.target.value })}
                className="w-full h-10 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
              >
                <option value="ANNUAL">Annual Grant</option>
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Notice Days</label>
              <Input
                type="number"
                min="0"
                value={policyForm.minNoticeDays}
                onChange={(e) =>
                  setPolicyForm({ ...policyForm, minNoticeDays: parseInt(e.target.value, 10) })
                }
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
            <Button type="button" variant="outline" onClick={() => setCreatePolicyModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Create Policy
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Assign Policy Modal */}
      <Dialog
        isOpen={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        title="Assign Leave Policy to Employee"
        maxWidth="md"
      >
        <form onSubmit={handleAssignPolicy} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Employee ID</label>
            <Input
              placeholder="e.g. employee-uuid"
              value={assignForm.employeeId}
              onChange={(e) => setAssignForm({ ...assignForm, employeeId: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Leave Policy</label>
            <select
              value={assignForm.leavePolicyId}
              onChange={(e) => setAssignForm({ ...assignForm, leavePolicyId: e.target.value })}
              className="w-full h-10 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600"
              required
            >
              <option value="">Select Leave Policy...</option>
              {policies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.leaveType?.name})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Effective From
            </label>
            <Input
              type="date"
              value={assignForm.effectiveFrom}
              onChange={(e) => setAssignForm({ ...assignForm, effectiveFrom: e.target.value })}
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
            <Button type="button" variant="outline" onClick={() => setAssignModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Assign Policy
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Add Holiday Modal */}
      <Dialog
        isOpen={createHolidayModalOpen}
        onClose={() => setCreateHolidayModalOpen(false)}
        title="Add Public or Regional Holiday"
        maxWidth="md"
      >
        <form onSubmit={handleCreateHoliday} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Holiday Name</label>
            <Input
              placeholder="e.g. Independence Day / Diwali"
              value={holidayForm.name}
              onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Date</label>
            <Input
              type="date"
              value={holidayForm.date}
              onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Description</label>
            <Input
              placeholder="Optional observance notes..."
              value={holidayForm.description}
              onChange={(e) => setHolidayForm({ ...holidayForm, description: e.target.value })}
            />
          </div>

          <div className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              id="optionalHoliday"
              checked={holidayForm.isOptional}
              onChange={(e) => setHolidayForm({ ...holidayForm, isOptional: e.target.checked })}
            />
            <label
              htmlFor="optionalHoliday"
              className="font-semibold text-stone-700 cursor-pointer"
            >
              Optional / Restricted Holiday
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateHolidayModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save Holiday
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};
