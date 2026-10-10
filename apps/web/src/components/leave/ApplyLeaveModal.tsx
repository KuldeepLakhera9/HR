'use client';

import React, { useState, useEffect, useId } from 'react';
import { Button, Dialog, Input, Select, Textarea, Badge } from '@hrms/ui';
import { leaveApi } from '../../lib/api-client';
import {
  Calendar,
  Clock,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  UploadCloud,
  FileText,
  Info,
  CalendarDays,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';

export interface LeaveBalanceItem {
  leaveType: {
    id: string;
    code: string;
    name: string;
    description?: string | null;
    color?: string | null;
    isPaid: boolean;
    allowHalfDay: boolean;
    requiresDoc?: boolean;
    docThresholdDays?: number;
  };
  leaveYear: number;
  openingBalance: number;
  accruedBalance: number;
  allocatedBalance: number;
  usedBalance: number;
  pendingBalance: number;
  closingBalance: number;
}

export interface CalculationPreview {
  chargeableDays: number;
  totalCalendarDays: number;
  weekendDays: number;
  holidayDays: number;
  holidaysEncountered: Array<{ name: string; date: string }>;
  isSandwichApplied: boolean;
  isValid: boolean;
  errors: Array<{ field?: string; code: string; message: string }>;
  warnings: Array<{ code: string; message: string }>;
  hasSufficientBalance: boolean;
  availableBalance: number;
  pendingBalance: number;
  policy?: {
    id: string;
    name: string;
    minNoticeDays: number;
    maxConsecutiveDays?: number | null;
  };
}

interface ApplyLeaveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  balances: LeaveBalanceItem[];
}

export const ApplyLeaveModal: React.FC<ApplyLeaveModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  balances,
}) => {
  // Form state
  const [selectedTypeId, setSelectedTypeId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [durationType, setDurationType] = useState<'FULL_DAY' | 'FIRST_HALF' | 'SECOND_HALF'>(
    'FULL_DAY',
  );
  const [reason, setReason] = useState<string>('');
  const [attachmentName, setAttachmentName] = useState<string>('');
  const [attachmentUrl, setAttachmentUrl] = useState<string>('');

  // UI / Calculation states
  const [calculating, setCalculating] = useState<boolean>(false);
  const [preview, setPreview] = useState<CalculationPreview | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [confirmStep, setConfirmStep] = useState<boolean>(false);

  // Initialize selected type and default dates
  useEffect(() => {
    if (isOpen) {
      if (balances.length > 0 && !selectedTypeId) {
        setSelectedTypeId(balances[0].leaveType.id);
      }
      const today = new Date().toISOString().split('T')[0];
      if (!startDate) setStartDate(today);
      if (!endDate) setEndDate(today);
      setConfirmStep(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, balances]);

  const selectedBalance = balances.find((b) => b.leaveType.id === selectedTypeId);
  const allowHalfDay = selectedBalance?.leaveType.allowHalfDay ?? true;

  // When half-day is selected, auto-sync end date to start date (single-day rule)
  const handleDurationChange = (type: 'FULL_DAY' | 'FIRST_HALF' | 'SECOND_HALF') => {
    setDurationType(type);
    if (type !== 'FULL_DAY' && startDate) {
      setEndDate(startDate);
    }
  };

  const handleStartDateChange = (val: string) => {
    setStartDate(val);
    if (durationType !== 'FULL_DAY' || !endDate || endDate < val) {
      setEndDate(val);
    }
  };

  // Live Server Pre-Flight Calculation Evaluation
  useEffect(() => {
    if (!isOpen || !selectedTypeId || !startDate || !endDate) {
      setPreview(null);
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      setCalculating(true);
      setCalcError(null);

      try {
        const res = await leaveApi.calculate({
          leaveTypeId: selectedTypeId,
          startDate,
          endDate,
          durationType,
        });

        if (active && res.success && res.data) {
          setPreview(res.data);
        }
      } catch (err: any) {
        if (active) {
          setCalcError(err.message || 'Unable to evaluate leave duration.');
          setPreview(null);
        }
      } finally {
        if (active) {
          setCalculating(false);
        }
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [isOpen, selectedTypeId, startDate, endDate, durationType]);

  // Handle mock attachment upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAttachmentName(file.name);
      // In self-hosted environment, simulate secure uploaded artifact URL
      setAttachmentUrl(
        `https://storage.hrms.internal/leave-attachments/${Date.now()}_${encodeURIComponent(file.name)}`,
      );
    }
  };

  // Validation before proceeding to confirmation
  const isFormValid =
    Boolean(selectedTypeId) &&
    Boolean(startDate) &&
    Boolean(endDate) &&
    reason.trim().length >= 3 &&
    preview?.isValid === true &&
    preview?.chargeableDays > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;

    if (!confirmStep) {
      setConfirmStep(true);
      return;
    }

    setSubmitting(true);
    try {
      const res = await leaveApi.apply({
        leaveTypeId: selectedTypeId,
        startDate,
        endDate,
        durationType,
        reason: reason.trim(),
        attachmentUrl: attachmentUrl || undefined,
        attachmentName: attachmentName || undefined,
      });

      if (res.success) {
        onSuccess(
          `Leave application for ${preview?.chargeableDays} day(s) submitted successfully for supervisor approval.`,
        );
        onClose();
        // Reset state
        setReason('');
        setAttachmentName('');
        setAttachmentUrl('');
        setConfirmStep(false);
      }
    } catch (err: any) {
      setCalcError(err.message || 'Failed to submit leave application.');
      setConfirmStep(false);
    } finally {
      setSubmitting(false);
    }
  };

  const leaveTypeOptions = balances.map((b) => ({
    label: `${b.leaveType.name} (${b.leaveType.code}) — ${b.closingBalance} days available`,
    value: b.leaveType.id,
  }));

  const requiresDocument =
    (selectedBalance?.leaveType.requiresDoc || false) &&
    (preview?.chargeableDays ?? 0) >= (selectedBalance?.leaveType.docThresholdDays ?? 3);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={() => {
        if (!submitting) {
          setConfirmStep(false);
          onClose();
        }
      }}
      title={confirmStep ? 'Confirm Leave Submission' : 'Apply for Leave'}
      description={
        confirmStep
          ? 'Please review your application summary and authoritative balance deduction before submitting.'
          : 'Submit a server-validated leave application to your reporting manager.'
      }
      maxWidth="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-stone-500">
            {preview && !confirmStep && (
              <span>
                Calculated:{' '}
                <strong className="text-stone-800">{preview.chargeableDays} day(s)</strong>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {confirmStep ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmStep(false)}
                  disabled={submitting}
                >
                  Back to Form
                </Button>
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  isLoading={submitting}
                  leftIcon={<ShieldCheck className="h-4 w-4" />}
                >
                  Confirm & Submit
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={onClose} disabled={submitting}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={!isFormValid || calculating}
                  rightIcon={<ArrowRight className="h-4 w-4" />}
                >
                  Review Application
                </Button>
              </>
            )}
          </div>
        </div>
      }
    >
      {confirmStep ? (
        /* Confirmation Screen */
        <div className="space-y-4 py-2">
          <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200/80 space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-amber-100 text-amber-800 shrink-0 mt-0.5">
                <CalendarDays className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-stone-900">
                  {selectedBalance?.leaveType.name} ({selectedBalance?.leaveType.code})
                </h4>
                <p className="text-xs text-stone-600">
                  {startDate === endDate ? (
                    <span>
                      Date: <strong>{startDate}</strong> ({durationType.replace('_', ' ')})
                    </span>
                  ) : (
                    <span>
                      Period: <strong>{startDate}</strong> to <strong>{endDate}</strong>
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2 border-t border-amber-200/60 text-xs">
              <div>
                <span className="text-stone-500 block">Chargeable Days</span>
                <span className="font-bold text-stone-900 text-sm">
                  {preview?.chargeableDays} Days
                </span>
              </div>
              <div>
                <span className="text-stone-500 block">Available Balance</span>
                <span className="font-semibold text-stone-700">
                  {preview?.availableBalance} Days
                </span>
              </div>
              <div>
                <span className="text-stone-500 block">Post-Deduction Balance</span>
                <span className="font-semibold text-emerald-700">
                  {Number(preview?.availableBalance ?? 0) - Number(preview?.chargeableDays ?? 0)}{' '}
                  Days
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h5 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
              Reason for Leave
            </h5>
            <p className="text-xs text-stone-700 bg-stone-50 p-3 rounded-lg border border-stone-200 whitespace-pre-wrap">
              {reason}
            </p>
          </div>

          {attachmentName && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-stone-50 border border-stone-200 text-xs text-stone-700">
              <FileText className="h-4 w-4 text-stone-500 shrink-0" />
              <span className="font-medium truncate">{attachmentName}</span>
              <Badge variant="default" size="sm" className="ml-auto">
                Attached
              </Badge>
            </div>
          )}

          <div className="p-3 rounded-lg bg-blue-50/70 border border-blue-200/80 text-xs text-blue-800 flex items-start gap-2.5">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-600" />
            <span>
              Upon submission, <strong>{preview?.chargeableDays} day(s)</strong> will be placed in
              pending reservation on your authoritative balance ledger. Your reporting supervisor
              will be notified immediately.
            </span>
          </div>

          {calcError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{calcError}</span>
            </div>
          )}
        </div>
      ) : (
        /* Form Screen */
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {calcError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{calcError}</span>
            </div>
          )}

          {/* Leave Type Selector */}
          <Select
            label="Leave Type"
            value={selectedTypeId}
            onChange={(e) => setSelectedTypeId(e.target.value)}
            options={leaveTypeOptions}
            placeholder="Select leave category..."
          />

          {/* Duration Type selector */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-stone-700 tracking-wide">
              Duration Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleDurationChange('FULL_DAY')}
                className={`py-2 px-3 text-xs font-medium rounded-lg border text-center transition-all ${
                  durationType === 'FULL_DAY'
                    ? 'border-amber-600 bg-amber-50 text-amber-900 font-semibold ring-1 ring-amber-600/30'
                    : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                }`}
              >
                Full Day
              </button>
              <button
                type="button"
                disabled={!allowHalfDay}
                onClick={() => handleDurationChange('FIRST_HALF')}
                className={`py-2 px-3 text-xs font-medium rounded-lg border text-center transition-all ${
                  !allowHalfDay
                    ? 'opacity-40 cursor-not-allowed bg-stone-100 border-stone-200 text-stone-400'
                    : durationType === 'FIRST_HALF'
                      ? 'border-amber-600 bg-amber-50 text-amber-900 font-semibold ring-1 ring-amber-600/30'
                      : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                }`}
              >
                First Half (AM)
              </button>
              <button
                type="button"
                disabled={!allowHalfDay}
                onClick={() => handleDurationChange('SECOND_HALF')}
                className={`py-2 px-3 text-xs font-medium rounded-lg border text-center transition-all ${
                  !allowHalfDay
                    ? 'opacity-40 cursor-not-allowed bg-stone-100 border-stone-200 text-stone-400'
                    : durationType === 'SECOND_HALF'
                      ? 'border-amber-600 bg-amber-50 text-amber-900 font-semibold ring-1 ring-amber-600/30'
                      : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                }`}
              >
                Second Half (PM)
              </button>
            </div>
            {!allowHalfDay && (
              <p className="text-[11px] text-stone-400">
                Half-day leaves are disabled for this category per organization policy.
              </p>
            )}
          </div>

          {/* Date Range Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Start Date"
              type="date"
              value={startDate}
              onChange={(e) => handleStartDateChange(e.target.value)}
              leftIcon={<Calendar className="h-4 w-4" />}
            />
            <Input
              label="End Date"
              type="date"
              value={endDate}
              min={startDate}
              disabled={durationType !== 'FULL_DAY'}
              onChange={(e) => setEndDate(e.target.value)}
              leftIcon={<Calendar className="h-4 w-4" />}
              helperText={
                durationType !== 'FULL_DAY'
                  ? 'Half-day is restricted to a single calendar day'
                  : undefined
              }
            />
          </div>

          {/* Real-time Server Calculation & Breakdown Card */}
          {calculating ? (
            <div className="p-3.5 rounded-lg bg-stone-50 border border-stone-200 flex items-center justify-center gap-2 text-xs text-stone-500">
              <Clock className="h-4 w-4 animate-spin text-amber-600" />
              <span>Evaluating leave schedule and checking holidays...</span>
            </div>
          ) : preview ? (
            <div className="space-y-2">
              <div
                className={`p-3.5 rounded-xl border text-xs transition-all ${
                  preview.isValid
                    ? 'bg-amber-50/60 border-amber-200/90'
                    : 'bg-rose-50/80 border-rose-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {preview.isValid ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                    )}
                    <span className="font-semibold text-stone-900">
                      Chargeable Leave:{' '}
                      <span className="text-amber-800 text-sm font-bold">
                        {preview.chargeableDays} Day(s)
                      </span>
                    </span>
                  </div>
                  <Badge variant={preview.isValid ? 'success' : 'danger'} size="sm">
                    {preview.isValid ? 'Valid' : 'Action Required'}
                  </Badge>
                </div>

                {/* Exclusions and schedule breakdown */}
                <div className="mt-2.5 pt-2 border-t border-stone-200/60 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-stone-600">
                  <div>
                    <span className="text-stone-400 block">Total Calendar</span>
                    <strong>{preview.totalCalendarDays} days</strong>
                  </div>
                  <div>
                    <span className="text-stone-400 block">Weekends Skipped</span>
                    <strong>{preview.weekendDays} days</strong>
                  </div>
                  <div>
                    <span className="text-stone-400 block">Holidays Skipped</span>
                    <strong>{preview.holidayDays} days</strong>
                  </div>
                  <div>
                    <span className="text-stone-400 block">Available After</span>
                    <strong>
                      {Math.max(0, preview.availableBalance - preview.chargeableDays)} days
                    </strong>
                  </div>
                </div>

                {/* Holidays encountered tag */}
                {preview.holidaysEncountered && preview.holidaysEncountered.length > 0 && (
                  <div className="mt-2 text-[11px] text-stone-600 flex items-center gap-1.5 flex-wrap">
                    <span className="text-stone-400">Gazetted Holidays:</span>
                    {preview.holidaysEncountered.map((h, idx) => (
                      <span
                        key={idx}
                        className="px-1.5 py-0.5 rounded bg-emerald-100/80 text-emerald-800 font-medium"
                      >
                        {h.name} ({h.date})
                      </span>
                    ))}
                  </div>
                )}

                {/* Sandwich rule warning */}
                {preview.isSandwichApplied && (
                  <div className="mt-2 p-2 rounded bg-amber-100/70 border border-amber-300/50 text-[11px] text-amber-900 flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-700" />
                    <span>
                      <strong>Sandwich Rule Applied:</strong> Non-working days or weekends falling
                      within your leave period are counted as chargeable leave per organizational
                      policy.
                    </span>
                  </div>
                )}

                {/* Validation Warnings */}
                {preview.warnings && preview.warnings.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {preview.warnings.map((w, idx) => (
                      <p key={idx} className="text-[11px] text-amber-800 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        {w.message}
                      </p>
                    ))}
                  </div>
                )}

                {/* Structured Validation Errors from Server */}
                {preview.errors && preview.errors.length > 0 && (
                  <div className="mt-2 space-y-1 pt-1.5 border-t border-rose-200">
                    {preview.errors.map((err, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded bg-rose-100/80 text-[11px] text-rose-800 flex items-start gap-1.5 font-medium"
                      >
                        <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-rose-600" />
                        <span>{err.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* Reason for Leave */}
          <Textarea
            label="Reason for Leave *"
            placeholder="Explain the context or reason for this leave application..."
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            helperText="Minimum 3 characters. This information is shared confidentially with your reporting manager."
          />

          {/* Document / Medical Certificate Attachment */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-stone-700 tracking-wide">
                Supporting Document{' '}
                {requiresDocument ? (
                  <span className="text-rose-600">*</span>
                ) : (
                  <span className="text-stone-400 font-normal">(Optional)</span>
                )}
              </label>
              {requiresDocument && (
                <Badge variant="warning" size="sm">
                  Mandatory for &ge;{selectedBalance?.leaveType.docThresholdDays ?? 3} days
                </Badge>
              )}
            </div>

            <div className="border border-dashed border-stone-300 rounded-lg p-3 bg-stone-50/70 hover:bg-stone-100/50 transition-colors flex flex-col items-center justify-center text-center">
              <UploadCloud className="h-6 w-6 text-stone-400 mb-1" />
              <label className="cursor-pointer text-xs font-semibold text-amber-700 hover:text-amber-800">
                <span>Upload attachment (PDF, PNG, JPG)</span>
                <input
                  type="file"
                  className="sr-only"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={handleFileChange}
                />
              </label>
              <p className="text-[11px] text-stone-400 mt-0.5">
                Max 10MB file size · Secure self-hosted storage
              </p>
            </div>

            {attachmentName && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 mt-1.5">
                <FileText className="h-4 w-4 shrink-0 text-emerald-600" />
                <span className="font-medium truncate">{attachmentName}</span>
                <button
                  type="button"
                  onClick={() => {
                    setAttachmentName('');
                    setAttachmentUrl('');
                  }}
                  className="text-stone-400 hover:text-stone-600 text-xs ml-auto"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        </form>
      )}
    </Dialog>
  );
};
