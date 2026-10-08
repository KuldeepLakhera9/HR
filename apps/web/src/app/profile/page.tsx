'use client';

import React from 'react';
import { AppShell } from '../../layouts/AppShell';
import { useRole } from '../../context/RoleContext';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Avatar,
  Button,
} from '@hrms/ui';
import {
  User,
  Mail,
  Phone,
  MapPin,
  Building2,
  Briefcase,
  Calendar,
  ShieldCheck,
} from 'lucide-react';

export default function ProfilePage() {
  const { currentUser, role } = useRole();

  return (
    <AppShell>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-stone-900">My Profile</h1>
          <p className="text-xs md:text-sm text-stone-500 mt-1">
            Personal details, employment profile, and organization assignments.
          </p>
        </div>

        {/* Profile Card Header */}
        <div className="bg-white rounded-2xl border border-stone-200/80 p-6 shadow-xs flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <Avatar name={currentUser.name} size="xl" status="online" />
          <div className="flex-1 text-center sm:text-left space-y-1">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <h2 className="text-xl font-bold text-stone-900">{currentUser.name}</h2>
              <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                {role}
              </span>
            </div>
            <p className="text-sm font-medium text-stone-600">{currentUser.title}</p>
            <div className="pt-2 flex flex-wrap items-center justify-center sm:justify-start gap-4 text-xs text-stone-500">
              <span className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-stone-400" />
                {currentUser.email}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-stone-400" />
                BLR HQ (Bengaluru)
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-stone-400" />
                Joined March 2024
              </span>
            </div>
          </div>
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Employment Details</CardTitle>
              <CardDescription>Core contract and organizational mapping</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3.5 text-xs">
                <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
                  <span className="text-stone-500">Employee ID</span>
                  <span className="font-mono font-bold text-stone-900">EMP-0042</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
                  <span className="text-stone-500">Business Unit</span>
                  <span className="font-semibold text-stone-800">Engineering & Technology</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
                  <span className="text-stone-500">Department</span>
                  <span className="font-semibold text-stone-800">Frontend Core</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
                  <span className="text-stone-500">Reporting Manager</span>
                  <span className="font-semibold text-amber-700">Rajesh Kumar (Director)</span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-stone-500">Employment Status</span>
                  <Badge variant="success" size="sm">
                    Permanent / Full-Time
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Security & Access Scope</CardTitle>
              <CardDescription>Assigned system entitlements</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3.5 text-xs">
                <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
                  <span className="text-stone-500">Primary System Role</span>
                  <span className="font-mono font-bold text-amber-800">{role}</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
                  <span className="text-stone-500">Authentication Method</span>
                  <span className="font-semibold text-stone-800">Self-Hosted Organization SSO</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
                  <span className="text-stone-500">Attendance Geofence</span>
                  <span className="font-semibold text-stone-800">BLR Campus (500m geofence)</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
                  <span className="text-stone-500">Account Health</span>
                  <Badge variant="success" size="sm">
                    COMPLIANT
                  </Badge>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-stone-500">Session Mode</span>
                  <span className="text-stone-600 font-mono text-[11px]">Phase 1 Mock Persona</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
