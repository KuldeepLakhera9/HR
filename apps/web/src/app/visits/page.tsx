'use client';

import React, { useState } from 'react';
import { AppShell } from '../../layouts/AppShell';
import { DataTable, Button, Badge, Dialog, Input, Textarea, Toast } from '@hrms/ui';
import { Briefcase, MapPin, Calendar, Plus } from 'lucide-react';

interface OfficialVisitItem {
  id: string;
  employeeName: string;
  destination: string;
  city: string;
  purpose: string;
  startDate: string;
  endDate: string;
  status: 'APPROVED' | 'PENDING' | 'COMPLETED';
  geofenceBypassEnabled: boolean;
}

const mockVisits: OfficialVisitItem[] = [
  {
    id: '1',
    employeeName: 'Priya Nair',
    destination: 'Client Tech Center',
    city: 'Hyderabad',
    purpose: 'On-site architecture & load benchmarking',
    startDate: '2026-10-18',
    endDate: '2026-10-19',
    status: 'APPROVED',
    geofenceBypassEnabled: true,
  },
  {
    id: '2',
    employeeName: 'Rajesh Kumar',
    destination: 'Regional Enterprise Hub',
    city: 'Mumbai',
    purpose: 'Q4 Stakeholder Review & Strategy',
    startDate: '2026-10-22',
    endDate: '2026-10-23',
    status: 'PENDING',
    geofenceBypassEnabled: true,
  },
  {
    id: '3',
    employeeName: 'Karan Mehra',
    destination: 'Warehouse Operations',
    city: 'Pune',
    purpose: 'Hardware logistics inspection',
    startDate: '2026-09-28',
    endDate: '2026-09-29',
    status: 'COMPLETED',
    geofenceBypassEnabled: true,
  },
];

export default function VisitsPage() {
  const [isOpen, setIsOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const columns = [
    { key: 'employeeName', header: 'Employee' },
    { key: 'destination', header: 'Destination / Client' },
    { key: 'city', header: 'City' },
    { key: 'purpose', header: 'Purpose of Visit' },
    { key: 'startDate', header: 'Start Date' },
    { key: 'endDate', header: 'End Date' },
    {
      key: 'geofenceBypass',
      header: 'Geofence Bypass',
      render: (row: OfficialVisitItem) => (
        <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
          Allowed
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: OfficialVisitItem) => (
        <Badge
          variant={
            row.status === 'APPROVED' ? 'purple' : row.status === 'PENDING' ? 'warning' : 'default'
          }
          size="sm"
        >
          {row.status}
        </Badge>
      ),
    },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsOpen(false);
    setToastMessage('Official Visit request submitted. Geofence bypass queued for manager review.');
  };

  return (
    <AppShell>
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50">
          <Toast
            type="success"
            title="Official Visit Submitted"
            message={toastMessage}
            onClose={() => setToastMessage(null)}
          />
        </div>
      )}

      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-stone-900">
              Official Visits & Outdoor Duty (OD)
            </h1>
            <p className="text-xs md:text-sm text-stone-500 mt-1">
              Enables staff to perform client visits and outside meetings with policy-compliant
              attendance punch.
            </p>
          </div>
          <Button size="sm" onClick={() => setIsOpen(true)} leftIcon={<Plus className="h-4 w-4" />}>
            New Official Visit
          </Button>
        </div>

        {/* Informative Banner */}
        <div className="p-4 rounded-xl border border-purple-200 bg-purple-50/50 flex items-start gap-3">
          <Briefcase className="h-5 w-5 text-purple-700 shrink-0 mt-0.5" />
          <div className="text-xs text-purple-900">
            <span className="font-semibold block">Outdoor Duty Geofence Architecture</span>
            When an Official Visit is approved, the employee is authorized to punch attendance
            outside standard office geofence coordinates without triggering attendance violations.
          </div>
        </div>

        <DataTable columns={columns} data={mockVisits} />

        {/* Modal */}
        <Dialog
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          title="Request Official Visit (OD)"
          description="Submit client visit or off-site business trip details for manager approval."
          footer={
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSubmit}>
                Submit Request
              </Button>
            </div>
          }
        >
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <Input label="Destination / Client Site" placeholder="e.g. Acme Tech Labs, Hyderabad" />
            <Input label="City / Region" placeholder="e.g. Hyderabad, Telangana" />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Departure Date" type="date" defaultValue="2026-10-20" />
              <Input label="Return Date" type="date" defaultValue="2026-10-21" />
            </div>
            <Textarea
              label="Purpose of Visit"
              placeholder="Brief outline of client meetings, deliverables..."
              rows={3}
            />
          </form>
        </Dialog>
      </div>
    </AppShell>
  );
}
