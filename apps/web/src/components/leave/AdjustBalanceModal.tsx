'use client';

import React, { useState } from 'react';
import { Button, Dialog, Input, Textarea, Badge } from '@hrms/ui';
import { leaveApi } from '../../lib/api-client';
import {
  ShieldAlert,
  AlertCircle,
  CheckCircle2,
  SlidersHorizontal,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';

interface AdjustBalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  leaveTypes: Array<{ id: string; name: string; code: string }>;
  preselectedAccount?: {
    id: string;
    employeeId: string;
    employeeName: string;
    employeeCode: string;
    leaveTypeId: string;
    leaveYear: number;
    closingBalance: number;
  } | null;
}

export const AdjustBalanceModal: React.FC<AdjustBalanceModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  leaveTypes,
  preselectedAccount,
}) => {
  const [employeeId, setEmployeeId] = useState<string>(preselectedAccount?.employeeId || '');
  const [leaveTypeId, setLeaveTypeId] = useState<string>(
    preselectedAccount?.leaveTypeId || leaveTypes[0]?.id || '',
  );
  const [leaveYear, setLeaveYear] = useState<number>(
    preselectedAccount?.leaveYear || new Date().getFullYear(),
  );
  const [adjustmentType, setAdjustmentType] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [amount, setAmount] = useState<string>('1.0');
  const [reason, setReason] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const empId = preselectedAccount?.employeeId || employeeId.trim();
    if (!empId) {
      setError('Please provide a valid Employee ID.');
      return;
    }

    if (!leaveTypeId) {
      setError('Please select a leave type.');
      return;
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      setError('Adjustment amount must be a positive number greater than 0.');
      return;
    }

    if (!reason.trim() || reason.trim().length < 5) {
      setError(
        'A mandatory adjustment reason of at least 5 characters is required for audit integrity.',
      );
      return;
    }

    const finalAmount = adjustmentType === 'CREDIT' ? numericAmount : -numericAmount;

    setSubmitting(true);
    try {
      const res = await leaveApi.adjustBalance({
        employeeId: empId,
        leaveTypeId,
        leaveYear,
        amount: finalAmount,
        reason: reason.trim(),
      });

      if (res?.success) {
        onSuccess(
          `Successfully posted manual ${adjustmentType.toLowerCase()} of ${Math.abs(finalAmount)} day(s) to ledger.`,
        );
        onClose();
      } else {
        setError(res?.message || 'Failed to post balance adjustment.');
      }
    } catch (err: any) {
      setError(err?.message || 'Error executing manual balance adjustment.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Manual Balance Adjustment & Ledger Posting"
      maxWidth="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Warning Banner */}
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs flex items-start gap-2.5">
          <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Audited Immutable Ledger Action</p>
            <p className="mt-0.5 text-amber-800">
              Manual balance adjustments immediately post a signed transaction to the ledger with
              your actor ID and timestamp. Historical entries are never overwritten or deleted.
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Employee Info */}
        {preselectedAccount ? (
          <div className="bg-stone-50 p-3 rounded-lg border border-stone-200 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-semibold text-stone-500 uppercase block">
                Employee
              </span>
              <span className="text-sm font-bold text-stone-800">
                {preselectedAccount.employeeName} ({preselectedAccount.employeeCode})
              </span>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-semibold text-stone-500 uppercase block">
                Current Closing
              </span>
              <span className="text-sm font-black text-amber-700">
                {preselectedAccount.closingBalance}d
              </span>
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Employee ID <span className="text-rose-500">*</span>
            </label>
            <Input
              type="text"
              placeholder="e.g. employee-uuid"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              required
            />
          </div>
        )}

        {/* Leave Type and Year */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Leave Type <span className="text-rose-500">*</span>
            </label>
            <select
              value={leaveTypeId}
              onChange={(e) => setLeaveTypeId(e.target.value)}
              disabled={!!preselectedAccount}
              className="w-full h-10 rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 disabled:bg-stone-100"
            >
              {leaveTypes.map((lt) => (
                <option key={lt.id} value={lt.id}>
                  {lt.name} ({lt.code})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Leave Year <span className="text-rose-500">*</span>
            </label>
            <Input
              type="number"
              min={2020}
              max={2030}
              value={leaveYear}
              onChange={(e) => setLeaveYear(parseInt(e.target.value, 10))}
              disabled={!!preselectedAccount}
              required
            />
          </div>
        </div>

        {/* Adjustment Type: Credit (+) vs Debit (-) */}
        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Operation <span className="text-rose-500">*</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAdjustmentType('CREDIT')}
              className={`py-2 px-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                adjustmentType === 'CREDIT'
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-500/20'
                  : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
              }`}
            >
              <ArrowUpRight className="h-4 w-4 text-emerald-600" />
              <span>Credit Days (+)</span>
            </button>
            <button
              type="button"
              onClick={() => setAdjustmentType('DEBIT')}
              className={`py-2 px-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                adjustmentType === 'DEBIT'
                  ? 'bg-rose-50 border-rose-500 text-rose-800 ring-2 ring-rose-500/20'
                  : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
              }`}
            >
              <ArrowDownLeft className="h-4 w-4 text-rose-600" />
              <span>Debit / Deduct Days (-)</span>
            </button>
          </div>
        </div>

        {/* Amount */}
        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Days Amount <span className="text-rose-500">*</span>
          </label>
          <Input
            type="number"
            step="0.5"
            min="0.5"
            max="30"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>

        {/* Mandatory Reason */}
        <div>
          <label className="block text-xs font-semibold text-stone-700 mb-1">
            Mandatory Adjustment Reason & Audit Note <span className="text-rose-500">*</span>
          </label>
          <Textarea
            rows={3}
            placeholder="e.g. Compensatory off grant for overtime weekend support / Year-end policy correction"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />
          <p className="text-[11px] text-stone-500 mt-1">
            Minimum 5 characters. This rationale will be permanently recorded in the ledger.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? 'Posting Ledger Transaction...' : 'Post Adjustment'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
