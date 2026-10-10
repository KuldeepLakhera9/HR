'use client';

import React, { useState } from 'react';
import { Button, Dialog, Badge, Textarea } from '@hrms/ui';
import { leaveApi } from '../../lib/api-client';
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  FileText,
  ExternalLink,
  ShieldCheck,
  User,
  Calendar,
} from 'lucide-react';
import { LeaveRequestItem } from './LeaveDetailsModal';

interface DecideLeaveModalProps {
  request: LeaveRequestItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  currentUserId?: string;
}

export const DecideLeaveModal: React.FC<DecideLeaveModalProps> = ({
  request,
  isOpen,
  onClose,
  onSuccess,
  currentUserId,
}) => {
  const [decision, setDecision] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [comments, setComments] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!request) return null;

  const isSelf = request.employee.id === currentUserId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSelf) {
      setError('Security policy violation: You cannot approve or reject your own leave request.');
      return;
    }

    if (decision === 'REJECTED' && comments.trim().length < 3) {
      setError('Rejection reason is mandatory (minimum 3 characters required).');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await leaveApi.decideRequest(request.id, {
        decision,
        comments: comments.trim() || undefined,
      });

      if (res.success) {
        onSuccess(
          `Leave application for ${request.employee.displayName} has been ${decision.toLowerCase()} successfully.`,
        );
        setComments('');
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to submit decision.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={() => {
        if (!submitting) {
          setError(null);
          onClose();
        }
      }}
      title={decision === 'APPROVED' ? 'Approve Leave Request' : 'Reject Leave Request'}
      description={`Review and decide leave application for ${request.employee.displayName} (${request.employee.employeeCode})`}
      maxWidth="md"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-stone-500">
            Deducting: <strong className="text-stone-800">{request.chargeableDays} Day(s)</strong>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              isLoading={submitting}
              disabled={isSelf}
              className={
                decision === 'APPROVED'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-rose-600 hover:bg-rose-700 text-white'
              }
              leftIcon={
                decision === 'APPROVED' ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )
              }
            >
              {decision === 'APPROVED' ? 'Confirm Approval' : 'Confirm Rejection'}
            </Button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-2">
        {error && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {isSelf && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-xs text-amber-800 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>Self-approval forbidden: You cannot approve or reject your own application.</span>
          </div>
        )}

        {/* Applicant Summary */}
        <div className="p-3 rounded-xl bg-stone-50 border border-stone-200/80 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                {request.employee.displayName.charAt(0)}
              </div>
              <div>
                <span className="font-semibold text-stone-900 block">
                  {request.employee.displayName}
                </span>
                <span className="text-[11px] text-stone-400">
                  {request.employee.department || 'General'} ·{' '}
                  {request.employee.designation || 'Staff'}
                </span>
              </div>
            </div>
            <Badge variant="warning" size="sm">
              Pending Review
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-stone-200/60 text-[11px] text-stone-600">
            <div>
              <span className="text-stone-400 block">Leave Type</span>
              <strong className="text-stone-800">
                {request.leaveType.name} ({request.leaveType.code})
              </strong>
            </div>
            <div>
              <span className="text-stone-400 block">Period & Days</span>
              <strong className="text-stone-800">
                {request.startDate} to {request.endDate} ({request.chargeableDays} days)
              </strong>
            </div>
          </div>
        </div>

        {/* Reason Display */}
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-stone-700">Applicant Reason</label>
          <p className="p-2.5 rounded-lg bg-white border border-stone-200 text-xs text-stone-800 whitespace-pre-wrap">
            {request.reason}
          </p>
        </div>

        {/* Attached Document if any */}
        {request.attachmentUrl && (
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-stone-50 border border-stone-200 text-xs">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-amber-700" />
              <span className="font-medium text-stone-700 truncate max-w-[200px]">
                {request.attachmentName || 'Supporting_Document.pdf'}
              </span>
            </div>
            <a
              href={request.attachmentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-700 hover:text-amber-800 font-semibold flex items-center gap-1 text-[11px]"
            >
              <span>View</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}

        {/* Decision Toggle */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-stone-700 tracking-wide">
            Decision Action
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setDecision('APPROVED');
                setError(null);
              }}
              className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                decision === 'APPROVED'
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-600/30'
                  : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
              }`}
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>Approve Application</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setDecision('REJECTED');
                setError(null);
              }}
              className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                decision === 'REJECTED'
                  ? 'border-rose-600 bg-rose-50 text-rose-900 ring-1 ring-rose-600/30'
                  : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
              }`}
            >
              <XCircle className="h-4 w-4 text-rose-600" />
              <span>Reject Application</span>
            </button>
          </div>
        </div>

        {/* Supervisor Comments / Rejection Reason */}
        <Textarea
          label={
            decision === 'REJECTED' ? 'Mandatory Rejection Reason *' : 'Supervisor Notes (Optional)'
          }
          placeholder={
            decision === 'REJECTED'
              ? 'Specify the reason for rejection (required, minimum 3 characters)...'
              : 'Add optional approval notes or instructions for the employee...'
          }
          rows={3}
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          helperText={
            decision === 'REJECTED'
              ? 'This reason will be recorded in the audit trail and sent to the applicant.'
              : 'Optional comments for internal records.'
          }
        />
      </form>
    </Dialog>
  );
};
