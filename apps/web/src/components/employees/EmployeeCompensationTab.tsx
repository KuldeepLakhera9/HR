'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Button,
  Label,
} from '@hrms/ui';
import {
  Banknote,
  Plus,
  Download,
  Calendar,
  Layers,
  ShieldAlert,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Building,
  Coins,
  RefreshCw,
  Eye,
  Check,
  X,
  Calculator,
} from 'lucide-react';
import { apiClient } from '../../lib/api-client';
import { useAuth } from '../../context/AuthContext';

interface EmployeeCompensationTabProps {
  employeeId: string;
  employee: any;
}

export const EmployeeCompensationTab: React.FC<EmployeeCompensationTabProps> = ({
  employeeId,
  employee,
}) => {
  const { hasRole, hasPermission } = useAuth();

  const canView =
    hasRole('ADMIN') || hasPermission('PAYROLL_VIEW') || hasPermission('PAYROLL_COMPENSATION');

  const canManage =
    hasRole('ADMIN') || hasPermission('PAYROLL_COMPENSATION') || hasPermission('PAYROLL_MANAGE');

  const canApprove =
    hasRole('ADMIN') || hasPermission('PAYROLL_APPROVE') || hasPermission('PAYROLL_MANAGE');

  const canExport =
    hasRole('ADMIN') || hasPermission('PAYROLL_EXPORT') || hasPermission('PAYROLL_COMPENSATION');

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    currentCompensation: any;
    history: any[];
  }>({
    currentCompensation: null,
    history: [],
  });

  const [activeStructures, setActiveStructures] = useState<any[]>([]);

  // Modals state
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({
    structureId: '',
    ctcAnnual: '1200000',
    effectiveFrom: new Date().toISOString().split('T')[0],
    effectiveTo: '',
    changeReason: 'ANNUAL_INCREMENT',
    reason: '',
    notes: '',
    submitForApproval: false,
  });
  const [assignErrors, setAssignErrors] = useState<Record<string, string>>({});
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignPreview, setAssignPreview] = useState<any>(null);

  // Reject modal
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

  // Inspect detail modal
  const [selectedHistoricalRecord, setSelectedHistoricalRecord] = useState<any>(null);

  // Messages
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchCompensationData = useCallback(async () => {
    if (!canView) return;
    try {
      setLoading(true);
      const res = await apiClient.getEmployeeCompensation(employeeId);
      if (res?.data) {
        setData({
          currentCompensation: res.data.currentCompensation,
          history: res.data.history || [],
        });
      }
    } catch (err: any) {
      console.error('Failed to load compensation history', err);
      setErrorMessage(err.message || 'Failed to load compensation history');
    } finally {
      setLoading(false);
    }
  }, [employeeId, canView]);

  const fetchActiveStructures = useCallback(async () => {
    try {
      const res = await apiClient.getSalaryStructures({ status: 'ACTIVE', limit: 50 });
      setActiveStructures(res?.data?.data || []);
      if (res?.data?.data?.length > 0 && !assignForm.structureId) {
        setAssignForm((prev) => ({ ...prev, structureId: res.data.data[0].id }));
      }
    } catch (err) {
      console.error('Failed to load active structures', err);
    }
  }, [assignForm.structureId]);

  useEffect(() => {
    fetchCompensationData();
    if (canManage) {
      fetchActiveStructures();
    }
  }, [fetchCompensationData, fetchActiveStructures, canManage]);

  // Live simulation in modal
  const runModalSimulation = async (structureId: string, annualCtc: number) => {
    if (!structureId || !annualCtc || isNaN(annualCtc)) return;
    try {
      const res = await apiClient.previewSalaryStructure({
        structureId,
        annualCtc: Number(annualCtc),
      });
      setAssignPreview(res.data);
    } catch (err) {
      console.error('Modal simulation failed', err);
    }
  };

  const handleOpenAssignModal = () => {
    setAssignForm({
      structureId: activeStructures[0]?.id || '',
      ctcAnnual: data.currentCompensation?.ctcAnnual
        ? String(data.currentCompensation.ctcAnnual)
        : '1200000',
      effectiveFrom: new Date().toISOString().split('T')[0],
      effectiveTo: '',
      changeReason: data.currentCompensation ? 'ANNUAL_INCREMENT' : 'JOINING',
      reason: '',
      notes: '',
      submitForApproval: false,
    });
    setAssignErrors({});
    setIsAssignModalOpen(true);
    if (activeStructures[0]?.id) {
      runModalSimulation(activeStructures[0].id, 1200000);
    }
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!assignForm.structureId) errors.structureId = 'Salary structure is required';
    if (!assignForm.ctcAnnual || Number(assignForm.ctcAnnual) <= 0)
      errors.ctcAnnual = 'Valid annual CTC greater than 0 is required';
    if (!assignForm.effectiveFrom) errors.effectiveFrom = 'Effective date is required';

    if (Object.keys(errors).length > 0) {
      setAssignErrors(errors);
      return;
    }

    try {
      setAssignSubmitting(true);
      await apiClient.createEmployeeCompensation(employeeId, {
        structureId: assignForm.structureId,
        ctcAnnual: Number(assignForm.ctcAnnual),
        effectiveFrom: new Date(assignForm.effectiveFrom).toISOString(),
        effectiveTo: assignForm.effectiveTo
          ? new Date(assignForm.effectiveTo).toISOString()
          : undefined,
        changeReason: assignForm.changeReason,
        reason: assignForm.reason || undefined,
        notes: assignForm.notes || undefined,
        submitForApproval: assignForm.submitForApproval,
      });

      setIsAssignModalOpen(false);
      setSuccessMessage(
        assignForm.submitForApproval
          ? 'Compensation change submitted for review (Pending Approval).'
          : 'Compensation assignment created and activated successfully.',
      );
      fetchCompensationData();
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save compensation assignment');
      setTimeout(() => setErrorMessage(null), 5000);
    } finally {
      setAssignSubmitting(false);
    }
  };

  const handleApprove = async (id: string) => {
    if (!confirm('Approve and activate this compensation revision?')) return;
    try {
      await apiClient.approveCompensation(id);
      setSuccessMessage('Compensation revision approved and activated.');
      fetchCompensationData();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Approval failed');
    }
  };

  const handleOpenReject = (id: string) => {
    setRejectingId(id);
    setRejectionReason('');
    setIsRejectModalOpen(true);
  };

  const handleConfirmReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingId || !rejectionReason.trim()) return;
    try {
      setRejectSubmitting(true);
      await apiClient.rejectCompensation(rejectingId, {
        rejectionReason: rejectionReason.trim(),
      });
      setIsRejectModalOpen(false);
      setSuccessMessage('Compensation revision rejected.');
      fetchCompensationData();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Rejection failed');
    } finally {
      setRejectSubmitting(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this compensation revision?')) return;
    try {
      await apiClient.cancelCompensation(id);
      setSuccessMessage('Compensation revision cancelled.');
      fetchCompensationData();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Cancellation failed');
    }
  };

  const handleExport = async () => {
    try {
      await apiClient.exportEmployeeCompensation(employeeId);
    } catch (err: any) {
      alert(err.message || 'Export failed');
    }
  };

  // If user does not have permission, show permission alert
  if (!canView) {
    return (
      <Card className="border-amber-200 bg-amber-50/40 p-6">
        <div className="flex items-start gap-4">
          <div className="p-2.5 rounded-lg bg-amber-100 text-amber-800">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-stone-900">Compensation Details Restricted</h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              Access to compensation assignments, salary breakdowns, and increment history is
              strictly restricted to authorized HR, Payroll, and Executive administrators. Team
              management permissions alone do not grant access to individual salary amounts.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const current = data.currentCompensation;

  // Separate earnings, deductions, contributions for current
  const earnings = current?.items?.filter((i: any) => i.component?.type === 'EARNING') || [];
  const deductions = current?.items?.filter((i: any) => i.component?.type === 'DEDUCTION') || [];

  return (
    <div className="space-y-6">
      {/* Notifications */}
      {successMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md text-emerald-800 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}
      {errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-800 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-stone-900">
            Compensation & Salary Administration
          </h2>
          <p className="text-xs text-stone-500">
            Effective-dated salary assignments, approved structure versioning, and increment
            history.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchCompensationData}
            disabled={loading}
            className="h-8 text-xs gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          {canExport && data.history.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              className="h-8 text-xs gap-1.5 text-stone-700"
            >
              <Download className="w-3.5 h-3.5 text-stone-500" />
              Export History
            </Button>
          )}

          {canManage && (
            <Button
              size="sm"
              onClick={handleOpenAssignModal}
              className="h-8 text-xs gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white"
            >
              <Plus className="w-3.5 h-3.5" />
              {current ? 'Revise Compensation' : 'Assign Initial Compensation'}
            </Button>
          )}
        </div>
      </div>

      {/* Current Active Compensation Hero Card */}
      {current ? (
        <Card className="border-stone-200 shadow-xs bg-white overflow-hidden">
          <CardHeader className="pb-3 border-b border-stone-100 bg-stone-50/50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-100 text-emerald-800">
                  <Banknote className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-bold text-stone-900">
                      Current Applicable Compensation
                    </CardTitle>
                    <Badge
                      variant="outline"
                      className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]"
                    >
                      ACTIVE
                    </Badge>
                  </div>
                  <CardDescription className="text-xs text-stone-500 mt-0.5">
                    Structure: <strong>{current.structure?.name}</strong>{' '}
                    <span className="font-mono text-[10px] bg-stone-100 px-1 py-0.5 rounded">
                      {current.structure?.code} v{current.structure?.version}
                    </span>
                  </CardDescription>
                </div>
              </div>

              <div className="text-left sm:text-right text-xs">
                <div className="text-stone-500 text-[11px] flex items-center sm:justify-end gap-1">
                  <Calendar className="w-3.5 h-3.5 text-stone-400" />
                  <span>
                    Effective from:{' '}
                    <strong>{new Date(current.effectiveFrom).toLocaleDateString()}</strong>
                  </span>
                </div>
                <div className="text-stone-400 text-[10px] mt-0.5">
                  Change Reason: {current.changeReason}
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-5 space-y-6">
            {/* Top Stat Pills */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3.5 rounded-lg border border-stone-200 bg-stone-50/60">
                <span className="text-[10px] font-semibold uppercase text-stone-500">
                  Annual Cost to Company (CTC)
                </span>
                <div className="text-lg font-bold font-mono text-stone-900 mt-1">
                  ₹{Number(current.ctcAnnual).toLocaleString('en-IN')}
                </div>
                <span className="text-[10px] text-stone-400">Fixed annual cost</span>
              </div>

              <div className="p-3.5 rounded-lg border border-stone-200 bg-stone-50/60">
                <span className="text-[10px] font-semibold uppercase text-stone-500">
                  Monthly Gross Salary
                </span>
                <div className="text-lg font-bold font-mono text-stone-900 mt-1">
                  ₹{Number(current.grossMonthly).toLocaleString('en-IN')}
                </div>
                <span className="text-[10px] text-stone-400">Before deductions</span>
              </div>

              <div className="p-3.5 rounded-lg border border-amber-200 bg-amber-50/40">
                <span className="text-[10px] font-semibold uppercase text-amber-800">
                  Monthly Deductions
                </span>
                <div className="text-lg font-bold font-mono text-amber-900 mt-1">
                  ₹
                  {deductions
                    .reduce((sum: number, d: any) => sum + Number(d.monthlyAmount), 0)
                    .toLocaleString('en-IN')}
                </div>
                <span className="text-[10px] text-amber-700">PF, PT & Statutory</span>
              </div>

              <div className="p-3.5 rounded-lg border border-emerald-200 bg-emerald-50/60">
                <span className="text-[10px] font-semibold uppercase text-emerald-800 font-bold">
                  Est. Net Take-Home (Monthly)
                </span>
                <div className="text-lg font-bold font-mono text-emerald-900 mt-1">
                  ₹
                  {Math.max(
                    0,
                    Number(current.grossMonthly) -
                      deductions.reduce((sum: number, d: any) => sum + Number(d.monthlyAmount), 0),
                  ).toLocaleString('en-IN')}
                </div>
                <span className="text-[10px] text-emerald-700 font-semibold">
                  Estimated in-hand payout
                </span>
              </div>
            </div>

            {/* Itemized Components Breakdown */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
                Itemized Salary Components
              </h4>

              <div className="border border-stone-200 rounded-lg overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 text-[10px] uppercase font-semibold">
                    <tr>
                      <th className="py-2.5 px-4">Component</th>
                      <th className="py-2.5 px-4">Type</th>
                      <th className="py-2.5 px-4 text-right">Monthly (₹)</th>
                      <th className="py-2.5 px-4 text-right">Annual (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 font-mono text-[11px]">
                    {current.items?.map((item: any) => (
                      <tr key={item.id} className="hover:bg-stone-50/50">
                        <td className="py-2.5 px-4">
                          <span className="font-semibold text-stone-900">
                            {item.component?.code}
                          </span>{' '}
                          <span className="font-sans text-stone-500 text-[11px]">
                            ({item.component?.name})
                          </span>
                        </td>
                        <td className="py-2.5 px-4 font-sans">
                          <Badge
                            variant="outline"
                            className={`text-[9px] ${
                              item.component?.type === 'EARNING'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            {item.component?.type}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-4 text-right font-semibold text-stone-900">
                          ₹{Number(item.monthlyAmount).toLocaleString('en-IN')}
                        </td>
                        <td className="py-2.5 px-4 text-right text-stone-600">
                          ₹{Number(item.annualAmount).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed border-stone-300 p-8 text-center bg-stone-50/50">
          <Banknote className="w-10 h-10 text-stone-400 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-stone-800">No Active Compensation Record</h3>
          <p className="text-xs text-stone-500 mt-1 max-w-md mx-auto">
            This employee does not have an active compensation record assigned yet.
          </p>
          {canManage && (
            <Button
              size="sm"
              onClick={handleOpenAssignModal}
              className="mt-4 text-xs bg-emerald-700 hover:bg-emerald-800 text-white gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Assign Initial Compensation
            </Button>
          )}
        </Card>
      )}

      {/* Historical Assignments Table */}
      <Card className="border-stone-200 shadow-xs overflow-hidden">
        <CardHeader className="pb-3 border-b border-stone-100 bg-stone-50/40">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold text-stone-900">
                Chronological Compensation History ({data.history.length})
              </CardTitle>
              <CardDescription className="text-xs text-stone-500">
                Immutable revision records and approval audit trail.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-stone-700">
            <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 text-[10px] uppercase font-semibold">
              <tr>
                <th className="py-3 px-4">Effective Period</th>
                <th className="py-3 px-4">Structure</th>
                <th className="py-3 px-4">Change Reason</th>
                <th className="py-3 px-4 text-right">Annual CTC (₹)</th>
                <th className="py-3 px-4 text-right">Monthly Gross (₹)</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4">Governance</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data.history.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-stone-400">
                    No compensation records found.
                  </td>
                </tr>
              ) : (
                data.history.map((record) => (
                  <tr key={record.id} className="hover:bg-stone-50/50">
                    <td className="py-3 px-4 text-stone-800">
                      <div className="font-semibold">
                        {new Date(record.effectiveFrom).toLocaleDateString()}
                      </div>
                      <span className="text-[10px] text-stone-400">
                        to{' '}
                        {record.effectiveTo
                          ? new Date(record.effectiveTo).toLocaleDateString()
                          : 'Present'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-stone-900">{record.structure?.name}</div>
                      <span className="font-mono text-[10px] text-stone-400">
                        {record.structure?.code} v{record.structure?.version}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-medium text-stone-700">{record.changeReason}</td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-stone-900">
                      ₹{Number(record.ctcAnnual).toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-stone-700">
                      ₹{Number(record.grossMonthly).toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <Badge
                        variant="outline"
                        className={`text-[9px] font-medium ${
                          record.status === 'APPROVED'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : record.status === 'PENDING_APPROVAL'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : record.status === 'REJECTED'
                                ? 'bg-red-50 text-red-700 border-red-200'
                                : 'bg-stone-100 text-stone-500'
                        }`}
                      >
                        {record.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-[10px] text-stone-500">
                      <div>
                        By:{' '}
                        {record.createdBy
                          ? `${record.createdBy.firstName} ${record.createdBy.lastName}`
                          : 'System'}
                      </div>
                      {record.approvedBy && (
                        <div className="text-stone-400">
                          Appr: {`${record.approvedBy.firstName} ${record.approvedBy.lastName}`}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedHistoricalRecord(record)}
                          className="h-7 px-2 text-[10px] text-stone-600 gap-1"
                          title="Inspect Breakdown"
                        >
                          <Eye className="w-3 h-3" />
                          Inspect
                        </Button>

                        {/* Approval actions for PENDING_APPROVAL */}
                        {canApprove && record.status === 'PENDING_APPROVAL' && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleApprove(record.id)}
                              className="h-7 px-2 text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                              title="Approve Change"
                            >
                              <Check className="w-3 h-3" />
                              Approve
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenReject(record.id)}
                              className="h-7 px-2 text-[10px] text-red-600 border-red-200 hover:bg-red-50"
                              title="Reject Change"
                            >
                              <X className="w-3 h-3" />
                              Reject
                            </Button>
                          </>
                        )}

                        {/* Cancel action for DRAFT/PENDING */}
                        {canManage &&
                          (record.status === 'DRAFT' || record.status === 'PENDING_APPROVAL') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCancel(record.id)}
                              className="h-7 px-1.5 text-[10px] text-stone-400 hover:text-red-600"
                              title="Cancel Proposal"
                            >
                              Cancel
                            </Button>
                          )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Assign / Revise Modal */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-stone-100 flex items-center justify-between bg-stone-50">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-emerald-100 text-emerald-800">
                  <Banknote className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-900">
                    {current ? 'Revise Employee Compensation' : 'Assign Initial Compensation'}
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    Employee: {employee.displayName} ({employee.employeeCode})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAssignModalOpen(false)}
                className="text-stone-400 hover:text-stone-700 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleAssignSubmit} className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="font-semibold text-stone-700">Salary Structure Version *</Label>
                  <select
                    value={assignForm.structureId}
                    onChange={(e) => {
                      const newStructId = e.target.value;
                      setAssignForm({ ...assignForm, structureId: newStructId });
                      runModalSimulation(newStructId, Number(assignForm.ctcAnnual));
                    }}
                    className={`mt-1 w-full px-3 py-2 border rounded-md text-xs bg-white ${
                      assignErrors.structureId ? 'border-red-500' : 'border-stone-300'
                    }`}
                  >
                    {activeStructures.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code} v{s.version})
                      </option>
                    ))}
                  </select>
                  {assignErrors.structureId && (
                    <p className="text-red-500 text-[10px] mt-1">{assignErrors.structureId}</p>
                  )}
                </div>

                <div>
                  <Label className="font-semibold text-stone-700">Annual CTC (₹) *</Label>
                  <input
                    type="number"
                    step="1000"
                    value={assignForm.ctcAnnual}
                    onChange={(e) => {
                      const newCtc = e.target.value;
                      setAssignForm({ ...assignForm, ctcAnnual: newCtc });
                      runModalSimulation(assignForm.structureId, Number(newCtc));
                    }}
                    className={`mt-1 w-full px-3 py-2 border rounded-md font-mono text-xs font-semibold ${
                      assignErrors.ctcAnnual ? 'border-red-500' : 'border-stone-300'
                    }`}
                  />
                  {assignErrors.ctcAnnual && (
                    <p className="text-red-500 text-[10px] mt-1">{assignErrors.ctcAnnual}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="font-semibold text-stone-700">Effective From Date *</Label>
                  <input
                    type="date"
                    value={assignForm.effectiveFrom}
                    onChange={(e) =>
                      setAssignForm({ ...assignForm, effectiveFrom: e.target.value })
                    }
                    className={`mt-1 w-full px-3 py-2 border rounded-md text-xs ${
                      assignErrors.effectiveFrom ? 'border-red-500' : 'border-stone-300'
                    }`}
                  />
                  {assignErrors.effectiveFrom && (
                    <p className="text-red-500 text-[10px] mt-1">{assignErrors.effectiveFrom}</p>
                  )}
                </div>

                <div>
                  <Label className="font-semibold text-stone-700">Change Reason / Type *</Label>
                  <select
                    value={assignForm.changeReason}
                    onChange={(e) => setAssignForm({ ...assignForm, changeReason: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border border-stone-300 rounded-md text-xs bg-white"
                  >
                    <option value="JOINING">Initial Joining</option>
                    <option value="ANNUAL_INCREMENT">Annual Increment</option>
                    <option value="PROMOTION">Promotion</option>
                    <option value="MARKET_CORRECTION">Market Correction</option>
                    <option value="ROLE_CHANGE">Role Change</option>
                    <option value="PROBATION_CONFIRMATION">Probation Confirmation</option>
                    <option value="SPECIAL_ADJUSTMENT">Special Adjustment</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <Label className="font-semibold text-stone-700">
                  Business Justification / Reason
                </Label>
                <input
                  type="text"
                  value={assignForm.reason}
                  onChange={(e) => setAssignForm({ ...assignForm, reason: e.target.value })}
                  placeholder="e.g. FY26 Promotion to Lead Engineer"
                  className="mt-1 w-full px-3 py-2 border border-stone-300 rounded-md text-xs"
                />
              </div>

              <div>
                <Label className="font-semibold text-stone-700">Internal HR / Budget Notes</Label>
                <textarea
                  rows={2}
                  value={assignForm.notes}
                  onChange={(e) => setAssignForm({ ...assignForm, notes: e.target.value })}
                  placeholder="e.g. Approved per Band 4 guidelines"
                  className="mt-1 w-full px-3 py-2 border border-stone-300 rounded-md text-xs"
                />
              </div>

              {/* Submit for approval checkbox */}
              <div className="p-3 bg-stone-50 rounded-lg border border-stone-200">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-stone-800">
                  <input
                    type="checkbox"
                    checked={assignForm.submitForApproval}
                    onChange={(e) =>
                      setAssignForm({ ...assignForm, submitForApproval: e.target.checked })
                    }
                    className="rounded text-emerald-600 focus:ring-0"
                  />
                  <span>Submit for approval (Review Pending) instead of immediate activation</span>
                </label>
              </div>

              {/* Live Preview Panel inside Modal */}
              {assignPreview && (
                <div className="p-3 bg-emerald-50/50 rounded-lg border border-emerald-100 space-y-2">
                  <div className="flex items-center gap-1.5 text-emerald-800 font-semibold text-xs">
                    <Calculator className="w-3.5 h-3.5" />
                    <span>Calculated Simulation Summary</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2 bg-white rounded border border-stone-200">
                      <span className="text-[10px] text-stone-500 block uppercase">
                        Monthly Gross
                      </span>
                      <span className="font-mono font-bold text-stone-900">
                        ₹{Number(assignPreview.summary?.monthlyGross || 0).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="p-2 bg-white rounded border border-stone-200">
                      <span className="text-[10px] text-stone-500 block uppercase">Deductions</span>
                      <span className="font-mono font-bold text-amber-900">
                        ₹
                        {Number(
                          assignPreview.summary?.monthlyEmployeeDeductions || 0,
                        ).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="p-2 bg-emerald-100/60 rounded border border-emerald-200">
                      <span className="text-[10px] text-emerald-800 block uppercase font-semibold">
                        Est. Net Pay
                      </span>
                      <span className="font-mono font-bold text-emerald-900">
                        ₹{Number(assignPreview.summary?.monthlyNetPay || 0).toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-stone-200 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={assignSubmitting}
                  onClick={() => setIsAssignModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={assignSubmitting}
                  className="bg-emerald-700 hover:bg-emerald-800 text-white"
                >
                  {assignSubmitting
                    ? 'Saving...'
                    : assignForm.submitForApproval
                      ? 'Submit for Approval'
                      : 'Save & Activate'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {isRejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4 text-xs">
            <div className="flex items-center gap-2 text-red-600">
              <XCircle className="w-5 h-5 flex-shrink-0" />
              <h3 className="text-sm font-bold text-stone-900">
                Reject Proposed Compensation Revision
              </h3>
            </div>
            <p className="text-stone-600">
              Please provide the official reason for rejecting this proposed compensation
              assignment.
            </p>

            <form onSubmit={handleConfirmReject} className="space-y-3 pt-1">
              <div>
                <Label className="font-semibold text-stone-700">Rejection Reason *</Label>
                <textarea
                  rows={3}
                  required
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="e.g. Proposed increment exceeds departmental budget cap"
                  className="mt-1 w-full px-3 py-2 border border-stone-300 rounded-md text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={rejectSubmitting}
                  onClick={() => setIsRejectModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={rejectSubmitting || !rejectionReason.trim()}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {rejectSubmitting ? 'Rejecting...' : 'Confirm Rejection'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inspect Historical Record Modal */}
      {selectedHistoricalRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto">
            <div className="p-4 border-b border-stone-100 flex items-center justify-between bg-stone-50">
              <div>
                <h3 className="text-sm font-bold text-stone-900">Compensation Revision Details</h3>
                <p className="text-[11px] text-stone-500 font-mono">
                  Effective: {new Date(selectedHistoricalRecord.effectiveFrom).toLocaleDateString()}
                  {' — '}
                  {selectedHistoricalRecord.effectiveTo
                    ? new Date(selectedHistoricalRecord.effectiveTo).toLocaleDateString()
                    : 'Present'}
                </p>
              </div>
              <button
                onClick={() => setSelectedHistoricalRecord(null)}
                className="text-stone-400 hover:text-stone-700 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="p-2.5 bg-stone-50 rounded-lg border border-stone-200">
                  <span className="text-[10px] text-stone-500 uppercase block">Annual CTC</span>
                  <span className="font-mono font-bold text-sm text-stone-900">
                    ₹{Number(selectedHistoricalRecord.ctcAnnual).toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="p-2.5 bg-stone-50 rounded-lg border border-stone-200">
                  <span className="text-[10px] text-stone-500 uppercase block">Monthly Gross</span>
                  <span className="font-mono font-bold text-sm text-stone-900">
                    ₹{Number(selectedHistoricalRecord.grossMonthly).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {selectedHistoricalRecord.reason && (
                <div className="p-2 bg-stone-50 rounded border border-stone-100 text-[11px]">
                  <strong>Justification:</strong> {selectedHistoricalRecord.reason}
                </div>
              )}

              {selectedHistoricalRecord.rejectionReason && (
                <div className="p-2 bg-red-50 rounded border border-red-100 text-red-800 text-[11px]">
                  <strong>Rejection Reason:</strong> {selectedHistoricalRecord.rejectionReason}
                </div>
              )}

              <div className="space-y-2">
                <span className="font-semibold text-stone-800 block text-[11px]">
                  Itemized Components Breakdown
                </span>
                <div className="border border-stone-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 text-[9px] uppercase">
                      <tr>
                        <th className="py-2 px-3">Component</th>
                        <th className="py-2 px-3 text-right">Monthly (₹)</th>
                        <th className="py-2 px-3 text-right">Annual (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 font-mono">
                      {selectedHistoricalRecord.items?.map((item: any) => (
                        <tr key={item.id} className="hover:bg-stone-50/50">
                          <td className="py-1.5 px-3">
                            <span className="font-semibold text-stone-900">
                              {item.component?.code}
                            </span>{' '}
                            <span className="font-sans text-stone-500 text-[10px]">
                              ({item.component?.name})
                            </span>
                          </td>
                          <td className="py-1.5 px-3 text-right font-semibold text-stone-900">
                            ₹{Number(item.monthlyAmount).toLocaleString('en-IN')}
                          </td>
                          <td className="py-1.5 px-3 text-right text-stone-600">
                            ₹{Number(item.annualAmount).toLocaleString('en-IN')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="p-3 bg-stone-50 border-t border-stone-100 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedHistoricalRecord(null)}
                className="text-xs"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
