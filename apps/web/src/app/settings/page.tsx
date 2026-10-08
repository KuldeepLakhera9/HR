'use client';

import React, { useState } from 'react';
import { AppShell } from '../../layouts/AppShell';
import {
  Input,
  Switch,
  Button,
  Badge,
  Toast,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@hrms/ui';
import { Settings, Save, ShieldCheck, MapPin } from 'lucide-react';

export default function SettingsPage() {
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleSave = () => {
    setToastMessage('System settings and attendance rules saved successfully.');
  };

  return (
    <AppShell>
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50">
          <Toast
            type="success"
            title="Settings Saved"
            message={toastMessage}
            onClose={() => setToastMessage(null)}
          />
        </div>
      )}

      <div className="max-w-4xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-stone-900">
              System Settings & Governance
            </h1>
            <p className="text-xs md:text-sm text-stone-500 mt-1">
              Organization parameters, geofence radius coordinates, and self-hosted server controls.
            </p>
          </div>
          <Button size="sm" onClick={handleSave} leftIcon={<Save className="h-4 w-4" />}>
            Save Changes
          </Button>
        </div>

        {/* Organization Information */}
        <Card>
          <CardHeader>
            <CardTitle>Organization Identity</CardTitle>
            <CardDescription>
              Legal corporate entity name, base timezone, and currency
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Organization Name" defaultValue="PeopleOS Technologies Inc." />
              <Input label="Organization Code" defaultValue="PEOPLEOS" disabled />
              <Input label="Default Timezone" defaultValue="Asia/Kolkata (IST)" />
              <Input label="Operating Currency" defaultValue="INR (₹)" />
            </div>
          </CardContent>
        </Card>

        {/* Geofence & Attendance Rules */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Attendance Geofence Configuration</CardTitle>
                <CardDescription>
                  Controls perimeter enforcement for Office punches.
                </CardDescription>
              </div>
              <Badge variant="success">Geofencing Active</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Switch
                label="Enforce GPS Geofence for Office Attendance"
                description="Requires employees to be within verified branch perimeter when attendance mode is Office."
                defaultChecked={true}
              />

              <Switch
                label="Allow Outdoor Duty (Official Visit) Geofence Bypass"
                description="Permits punches outside geofence when manager-approved Official Visit is active."
                defaultChecked={true}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <Input
                  label="HQ Geofence Radius (Meters)"
                  type="number"
                  defaultValue="150"
                  helperText="Allowed circular radius around branch coordinates."
                />
                <Input
                  label="Attendance Grace Period (Minutes)"
                  type="number"
                  defaultValue="15"
                  helperText="Minutes allowed after scheduled shift before flagging late."
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Data Protection & Self-Hosting */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" /> Self-Hosted Data Center Controls
            </CardTitle>
            <CardDescription>
              All user data, attendance GPS captures, documents, and audit logs are stored strictly
              inside your organization's PostgreSQL and local storage cluster without external cloud
              dependencies.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-stone-700">Storage Location:</span>
              <span className="text-xs bg-stone-100 text-stone-800 px-2 py-0.5 rounded font-mono">
                /var/lib/postgresql/data (Mounted Volume)
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
