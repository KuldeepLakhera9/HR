'use client';

import React, { useState } from 'react';
import { AppShell } from '../../layouts/AppShell';
import { DataTable, Button, Badge, Dialog, Input, Select, Textarea, Toast } from '@hrms/ui';
import { CalendarPlus, Calendar, Clock, CheckCircle } from 'lucide-react';

interface LeaveRequestItem {
  id: string;
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
}

const mockRequests: LeaveRequestItem[] = [
  {
    id: '1',
    employeeName: 'Priya Nair',
    leaveType: 'Casual Leave',
    startDate: '2026-10-29',
    endDate: '2026-10-31',
    days: 3,
    reason: 'Family Diwali festival celebrations',
    status: 'APPROVED',
  },
  {
    id: '2',
    employeeName: 'Siddharth Rao',
    leaveType: 'Privilege Leave',
    startDate: '2026-10-14',
    endDate: '2026-10-15',
    days: 2,
    reason: 'Personal errands and family trip',
    status: 'PENDING',
  },
  {
    id: '3',
    employeeName: 'Karan Mehra',
    leaveType: 'Sick Leave',
    startDate: '2026-10-06',
    endDate: '2026-10-07',
    days: 2,
    reason: 'Viral fever and medical rest',
    status: 'APPROVED',
  },
  {
    id: '4',
    employeeName: 'Neha Gupta',
    leaveType: 'Casual Leave',
    startDate: '2026-10-02',
    endDate: '2026-10-02',
    days: 1,
    reason: 'Government bank appointment',
    status: 'APPROVED',
  },
];

export default function LeavePage() {
  const [isApplyOpen, setIsApplyOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const columns = [
    { key: 'employeeName', header: 'Employee' },
    { key: 'leaveType', header: 'Leave Type' },
    { key: 'startDate', header: 'Start Date' },
    { key: 'endDate', header: 'End Date' },
    { key: 'days', header: 'Days' },
    { key: 'reason', header: 'Reason' },
    {
      key: 'status',
      header: 'Status',
      render: (row: LeaveRequestItem) => (
        <Badge
          variant={
            row.status === 'APPROVED' ? 'success' : row.status === 'PENDING' ? 'warning' : 'danger'
          }
          size="sm"
        >
          {row.status}
        </Badge>
      ),
    },
  ];

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    setIsApplyOpen(false);
    setToastMessage('Leave application submitted for supervisor approval.');
  };

  return (
    <AppShell>
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50">
          <Toast
            type="success"
            title="Leave Submitted"
            message={toastMessage}
            onClose={() => setToastMessage(null)}
          />
        </div>
      )}

      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-stone-900">
              Leave & Holidays Management
            </h1>
            <p className="text-xs md:text-sm text-stone-500 mt-1">
              Apply for leave, manage entitlement balances and track organization holiday calendars.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setIsApplyOpen(true)}
            leftIcon={<CalendarPlus className="h-4 w-4" />}
          >
            Apply For Leave
          </Button>
        </div>

        {/* Leave Entitlements Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-stone-200 bg-white">
            <span className="text-xs font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded">
              Casual Leave (CL)
            </span>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-2xl font-bold text-stone-900">8 Remaining</span>
              <span className="text-xs text-stone-400">Total: 12</span>
            </div>
            <p className="text-[11px] text-stone-500 mt-1">4 days utilized this calendar year</p>
          </div>

          <div className="p-4 rounded-xl border border-stone-200 bg-white">
            <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">
              Sick Leave (SL)
            </span>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-2xl font-bold text-stone-900">10 Remaining</span>
              <span className="text-xs text-stone-400">Total: 10</span>
            </div>
            <p className="text-[11px] text-stone-500 mt-1">0 days utilized this calendar year</p>
          </div>

          <div className="p-4 rounded-xl border border-stone-200 bg-white">
            <span className="text-xs font-semibold text-sky-800 bg-sky-50 px-2 py-0.5 rounded">
              Privilege Leave (PL)
            </span>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-2xl font-bold text-stone-900">14 Remaining</span>
              <span className="text-xs text-stone-400">Total: 18</span>
            </div>
            <p className="text-[11px] text-stone-500 mt-1">Carried forward: 6 days</p>
          </div>
        </div>

        {/* Leave Requests Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-stone-900">Leave Requests History</h3>
            <span className="text-xs text-stone-500">Showing recent applications</span>
          </div>
          <DataTable columns={columns} data={mockRequests} />
        </div>

        {/* Apply Leave Modal */}
        <Dialog
          isOpen={isApplyOpen}
          onClose={() => setIsApplyOpen(false)}
          title="Apply for Leave"
          description="Submit leave request to your reporting manager for approval."
          footer={
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setIsApplyOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleApply}>
                Submit Request
              </Button>
            </div>
          }
        >
          <form onSubmit={handleApply} className="space-y-4 py-2">
            <Select
              label="Leave Type"
              options={[
                { label: 'Casual Leave (CL) - 8 days available', value: 'CL' },
                { label: 'Sick Leave (SL) - 10 days available', value: 'SL' },
                { label: 'Privilege Leave (PL) - 14 days available', value: 'PL' },
              ]}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Start Date" type="date" defaultValue="2026-10-15" />
              <Input label="End Date" type="date" defaultValue="2026-10-16" />
            </div>
            <Textarea
              label="Reason for Leave"
              placeholder="Provide context for manager review..."
              rows={3}
            />
          </form>
        </Dialog>
      </div>
    </AppShell>
  );
}
