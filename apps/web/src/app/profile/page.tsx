'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '../../layouts/AppShell';
import { useRole } from '../../context/RoleContext';
import { employeesApi } from '../../lib/api-client';
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
  ExternalLink,
  Clock,
  UserCheck,
} from 'lucide-react';

export default function ProfilePage() {
  const { currentUser, role } = useRole();
  const [employee, setEmployee] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProfile() {
      try {
        const data = await employeesApi.getMe();
        setEmployee(data);
      } catch {
        // Fallback to role context mock persona if unlinked or error
        setEmployee(null);
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, []);

  const displayName = employee ? `${employee.firstName} ${employee.lastName}` : currentUser.name;
  const email = employee?.contact?.workEmail || currentUser.email;
  const empCode = employee?.employeeCode || 'EMP-0042';
  const departmentName = employee?.employment?.department?.name || 'Engineering & Technology';
  const designationName = employee?.employment?.designation?.name || currentUser.title;
  const branchName = employee?.employment?.branch?.name || 'BLR HQ (Bengaluru)';
  const managerName = employee?.employment?.manager?.displayName || 'Rajesh Kumar (Director)';
  const workMode = employee?.employment?.workMode || 'OFFICE';
  const status = employee?.status || 'ACTIVE';

  return (
    <AppShell>
      <div className="space-y-6 max-w-4xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-stone-900">My Profile</h1>
            <p className="text-xs md:text-sm text-stone-500 mt-1">
              Personal details, employment profile, and organization assignments.
            </p>
          </div>
          {employee && (
            <Link href={`/employees/${employee.id}`}>
              <Button variant="outline" size="sm" className="gap-2 text-stone-700">
                <ExternalLink className="h-4 w-4" />
                View Full Employee Record
              </Button>
            </Link>
          )}
        </div>

        {/* Profile Card Header */}
        <div className="bg-white rounded-2xl border border-stone-200/80 p-6 shadow-xs flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <Avatar name={displayName} size="xl" status="online" />
          <div className="flex-1 text-center sm:text-left space-y-1">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <h2 className="text-xl font-bold text-stone-900">{displayName}</h2>
              <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                {role}
              </span>
              <Badge
                variant={
                  status === 'ACTIVE' ? 'success' : status === 'PROBATION' ? 'warning' : 'default'
                }
                size="sm"
              >
                {status}
              </Badge>
            </div>
            <p className="text-sm font-medium text-stone-600">{designationName}</p>
            <div className="pt-2 flex flex-wrap items-center justify-center sm:justify-start gap-4 text-xs text-stone-500">
              <span className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-stone-400" />
                {email}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-stone-400" />
                {branchName}
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-stone-400" />
                Joined{' '}
                {employee?.joiningDate
                  ? new Date(employee.joiningDate).toLocaleDateString()
                  : 'March 2024'}
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
                  <span className="font-mono font-bold text-stone-900">{empCode}</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
                  <span className="text-stone-500">Department</span>
                  <span className="font-semibold text-stone-800">{departmentName}</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
                  <span className="text-stone-500">Designation</span>
                  <span className="font-semibold text-stone-800">{designationName}</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
                  <span className="text-stone-500">Reporting Manager</span>
                  <span className="font-semibold text-amber-700">{managerName}</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
                  <span className="text-stone-500">Work Mode</span>
                  <Badge variant="outline" size="sm">
                    {workMode}
                  </Badge>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-stone-500">Employment Status</span>
                  <Badge variant={status === 'ACTIVE' ? 'success' : 'warning'} size="sm">
                    {status}
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
                  <span className="font-semibold text-stone-800">Argon2id Encrypted Password</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
                  <span className="text-stone-500">Data Access Scope</span>
                  <span className="font-semibold text-stone-800">
                    {role === 'ADMIN'
                      ? 'Global Organization'
                      : role === 'HR'
                        ? 'Organization Operations'
                        : role === 'MANAGER'
                          ? 'Reporting Team Hierarchy'
                          : 'Self Profile'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
                  <span className="text-stone-500">Branch Geofence Prep</span>
                  <span className="font-semibold text-stone-800">{branchName}</span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-stone-500">Account Health</span>
                  <Badge variant="success" size="sm">
                    COMPLIANT
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
