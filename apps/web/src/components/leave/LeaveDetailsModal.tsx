'use client';

import React, { useState } from 'react';
import { Button, Dialog, Badge, Textarea } from '@hrms/ui';
import { leaveApi } from '../../lib/api-client';
import {
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  Shield,
  User,
  ArrowRight,
  ExternalLink,
  Ban,
  AlertCircle,
  MessageSquare,
} from 'lucide-react';

export interface LeaveRequestItem {
  id: string;
  organizationId: string;
  employeeId: string;
  employee: {
    id: string;
    employeeCode: string;
    displayName: string;
    avatarUrl?: string | null;
    department?: string | null;
    designation?: string | null;
  };
  leaveTypeId: string;
  leaveType: {
    id: string;
    code: string;
    name: string;
    color?: string | null;
    isPaid: boolean;
    allowHalfDay: boolean;
  };
  leaveYear: number;
  startDate: string;
  endDate: string;
  durationType: 'FULL_DAY' | 'FIRST_HALF' | 'SECOND_HALF';
  chargeableDays: number;
  reason: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  status: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  cancellationReason?: string | null;
  cancelledAt?: string | null;
  approvals: Array<{
    id: string;
    approverId: string;
    approverName: string;
    decision: 'APPROVED' | 'REJECTED';
    comments?: string | null;
    decidedAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

interface LeaveDetailsModalProps {
  request: LeaveRequestItem | null;
  isOpen: boolean;
  onClose: () => void;
  onCancelSuccess: (message: string) => void;
}

export const LeaveDetailsModal: React.FC<LeaveDetailsModalProps> = ({
  request,
  isOpen,
  onClose,
  onCancelSuccess,
}) => {
  const [showCancelPrompt, setShowCancelPrompt] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  if (!request) return null;

  const isCancellable = request.status === 'SUBMITTED' || request.status === 'APPROVED';

  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cancelReason.trim().length < 3) {
      setCancelError('Please provide a cancellation reason (minimum 3 characters).');
      return;
    }

    setCancelling(true);
    setCancelError(null);

    try {
      const res = await leaveApi.cancelRequest(request.id, {
        reason: cancelReason.trim(),
      });

      if (res.success) {
        onCancelSuccess('Leave request has been cancelled and balance reservations reversed.');
        setShowCancelPrompt(false);
        setCancelReason('');
        onClose();
      }
    } catch (err: any) {
      setCancelError(err.message || 'Failed to cancel leave request.');
    } finally {
      setCancelling(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return (
          <Badge variant="success" size="sm">
            Approved
          </Badge>
        );
      case 'SUBMITTED':
        return (
          <Badge variant="warning" size="sm">
            Pending Approval
          </Badge>
        );
      case 'REJECTED':
        return (
          <Badge variant="danger" size="sm">
            Rejected
          </Badge>
        );
      case 'CANCELLED':
        return (
          <Badge variant="default" size="sm">
            Cancelled
          </Badge>
        );
      default:
        return (
          <Badge variant="default" size="sm">
            {status}
          </Badge>
        );
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={() => {
        if (!cancelling) {
          setShowCancelPrompt(false);
          onClose();
        }
      }}
      title="Leave Application Details"
      description={`Request #${request.id.slice(0, 8)} · Submitted on ${new Date(request.createdAt).toLocaleDateString()}`}
      maxWidth="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <div>
            {isCancellable && !showCancelPrompt && (
              <Button
                size="sm"
                variant="outline"
                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 border-rose-200"
                onClick={() => setShowCancelPrompt(true)}
                leftIcon={<Ban className="h-4 w-4" />}
              >
                Cancel Application
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={onClose} disabled={cancelling}>
              Close
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5 py-2">
        {/* Cancel Confirmation Prompt Section */}
        {showCancelPrompt && (
          <div className="p-4 rounded-xl bg-rose-50/80 border border-rose-200 space-y-3 animate-fade-in">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-rose-900">Confirm Leave Cancellation</h4>
                <p className="text-xs text-rose-700 mt-0.5">
                  Cancelling this request will immediately release any reserved or consumed leave
                  balance back into your available account balance.
                </p>
              </div>
            </div>

            <form onSubmit={handleCancelSubmit} className="space-y-3">
              <Textarea
                placeholder="Specify the reason for cancelling this application (required)..."
                rows={2}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                error={cancelError || undefined}
              />

              <div className="flex items-center justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() => {
                    setShowCancelPrompt(false);
                    setCancelError(null);
                  }}
                  disabled={cancelling}
                >
                  Dismiss
                </Button>
                <Button
                  size="sm"
                  type="submit"
                  className="bg-rose-600 hover:bg-rose-700 text-white"
                  isLoading={cancelling}
                >
                  Confirm Cancellation
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Top Summary Card */}
        <div className="p-4 rounded-xl bg-stone-50 border border-stone-200/80 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-stone-900">
                  {request.leaveType.name} ({request.leaveType.code})
                </h3>
                <Badge variant={request.leaveType.isPaid ? 'success' : 'default'} size="sm">
                  {request.leaveType.isPaid ? 'Paid' : 'Unpaid'}
                </Badge>
              </div>
              <p className="text-xs text-stone-500 mt-0.5">
                Leave Year: <strong>{request.leaveYear}</strong>
              </p>
            </div>
            <div>{getStatusBadge(request.status)}</div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-stone-200/60 text-xs">
            <div>
              <span className="text-stone-400 block">Start Date</span>
              <span className="font-semibold text-stone-800">{request.startDate}</span>
            </div>
            <div>
              <span className="text-stone-400 block">End Date</span>
              <span className="font-semibold text-stone-800">{request.endDate}</span>
            </div>
            <div>
              <span className="text-stone-400 block">Duration Mode</span>
              <span className="font-semibold text-stone-800">
                {request.durationType.replace('_', ' ')}
              </span>
            </div>
            <div>
              <span className="text-stone-400 block">Chargeable Days</span>
              <span className="font-bold text-amber-800 text-sm">
                {request.chargeableDays} Day(s)
              </span>
            </div>
          </div>
        </div>

        {/* Reason for Leave & Privacy Shield */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
              Reason for Leave
            </h4>
            <div className="flex items-center gap-1 text-[11px] text-stone-400">
              <Shield className="h-3 w-3 text-stone-400" />
              <span>Restricted Visibility</span>
            </div>
          </div>
          <div className="p-3.5 rounded-lg bg-white border border-stone-200 text-xs text-stone-800 whitespace-pre-wrap leading-relaxed shadow-2xs">
            {request.reason}
          </div>
          <p className="text-[11px] text-stone-400 italic">
            This reason is confidential and viewable only by you, your line manager, and authorized
            HR personnel.
          </p>
        </div>

        {/* Cancellation Notice if Cancelled */}
        {request.status === 'CANCELLED' && (
          <div className="p-3 rounded-lg bg-stone-100 border border-stone-200 text-xs space-y-1">
            <span className="font-semibold text-stone-700 block">Cancellation Note:</span>
            <p className="text-stone-600 italic">
              &ldquo;{request.cancellationReason || 'Cancelled by employee.'}&rdquo;
            </p>
            {request.cancelledAt && (
              <span className="text-[11px] text-stone-400 block mt-1">
                Cancelled on {new Date(request.cancelledAt).toLocaleString()}
              </span>
            )}
          </div>
        )}

        {/* Supporting Document / Attachment */}
        {request.attachmentUrl && (
          <div className="space-y-1.5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
              Supporting Documentation
            </h4>
            <div className="flex items-center justify-between p-3 rounded-lg bg-stone-50 border border-stone-200 text-xs text-stone-700">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-amber-700 shrink-0" />
                <span className="font-medium truncate">
                  {request.attachmentName || 'Supporting_Document.pdf'}
                </span>
              </div>
              <a
                href={request.attachmentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-amber-700 hover:text-amber-800 font-semibold shrink-0 ml-2"
              >
                <span>View Attachment</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        )}

        {/* Approval History & Decision Audit Trail */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500">
            Approval History & Audit Trail
          </h4>
          <div className="rounded-xl border border-stone-200 overflow-hidden divide-y divide-stone-100">
            {/* Step 1: Submission */}
            <div className="p-3 bg-stone-50/50 flex items-start gap-3 text-xs">
              <div className="p-1.5 rounded-full bg-amber-100 text-amber-800 mt-0.5 shrink-0">
                <Clock className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-stone-800">Application Submitted</span>
                  <span className="text-[11px] text-stone-400">
                    {new Date(request.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-stone-500 text-[11px] mt-0.5">
                  Submitted by {request.employee.displayName} ({request.employee.employeeCode})
                </p>
              </div>
            </div>

            {/* Approvals */}
            {request.approvals && request.approvals.length > 0 ? (
              request.approvals.map((appr) => (
                <div key={appr.id} className="p-3 bg-white flex items-start gap-3 text-xs">
                  <div
                    className={`p-1.5 rounded-full mt-0.5 shrink-0 ${
                      appr.decision === 'APPROVED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {appr.decision === 'APPROVED' ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-stone-800">{appr.approverName}</span>
                        <Badge
                          variant={appr.decision === 'APPROVED' ? 'success' : 'danger'}
                          size="sm"
                        >
                          {appr.decision}
                        </Badge>
                      </div>
                      <span className="text-[11px] text-stone-400">
                        {new Date(appr.decidedAt).toLocaleString()}
                      </span>
                    </div>
                    {appr.comments && (
                      <div className="mt-1.5 p-2 rounded bg-stone-50 border border-stone-200/60 text-stone-700 text-[11px] flex items-start gap-1.5">
                        <MessageSquare className="h-3 w-3 text-stone-400 shrink-0 mt-0.5" />
                        <span>&ldquo;{appr.comments}&rdquo;</span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : request.status === 'SUBMITTED' ? (
              <div className="p-3 bg-white flex items-center gap-2 text-xs text-stone-500">
                <Clock className="h-4 w-4 text-amber-600 shrink-0" />
                <span>Awaiting review and decision from reporting supervisor.</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </Dialog>
  );
};
