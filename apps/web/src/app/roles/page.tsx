'use client';

import React from 'react';
import { AppShell } from '../../layouts/AppShell';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  DataTable,
} from '@hrms/ui';
import { Shield, ShieldCheck, UserCheck, Briefcase, User, Key } from 'lucide-react';

export default function RolesAccessPage() {
  const roles = [
    {
      id: '1',
      code: 'ADMIN',
      name: 'Super Administrator',
      description:
        'Unrestricted system privileges, organization controls, tenant configs, and audit logs.',
      usersCount: 2,
      permissionsCount: 42,
    },
    {
      id: '2',
      code: 'HR',
      name: 'People Operations (HR)',
      description:
        'Workforce management, attendance regularizations, leave policies, document vault, and MIS.',
      usersCount: 5,
      permissionsCount: 28,
    },
    {
      id: '3',
      code: 'MANAGER',
      name: 'Team Manager',
      description:
        'Departmental oversight, team attendance, official visit sign-offs, and leave approvals.',
      usersCount: 16,
      permissionsCount: 18,
    },
    {
      id: '4',
      code: 'EMPLOYEE',
      name: 'Individual Contributor',
      description:
        'Self-service attendance check-in, leave requests, document repository, and personal profile.',
      usersCount: 261,
      permissionsCount: 8,
    },
  ];

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-stone-900">Roles & Access Control</h1>
          <p className="text-xs md:text-sm text-stone-500 mt-1">
            Role-Based Access Control (RBAC) definitions and granular permission assignments.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {roles.map((r) => (
            <div
              key={r.code}
              className="bg-white p-5 rounded-xl border border-stone-200/80 shadow-xs space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                  {r.code}
                </span>
                <span className="text-[11px] font-semibold text-stone-400">
                  {r.usersCount} Assigned
                </span>
              </div>
              <div>
                <h3 className="text-sm font-bold text-stone-900">{r.name}</h3>
                <p className="text-xs text-stone-500 mt-1 leading-relaxed">{r.description}</p>
              </div>
              <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-xs text-stone-500">
                <span className="flex items-center gap-1">
                  <Key className="h-3.5 w-3.5 text-amber-600" />
                  {r.permissionsCount} Permissions
                </span>
                <Badge variant="primary" size="sm">
                  Active
                </Badge>
              </div>
            </div>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>RBAC Permission Matrix</CardTitle>
            <CardDescription>
              Foundational permission bindings for self-hosted deployment
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={[
                {
                  key: 'code',
                  header: 'Role Code',
                  render: (row) => (
                    <span className="font-mono font-bold text-stone-900">{row.code}</span>
                  ),
                },
                { key: 'name', header: 'Role Title' },
                { key: 'description', header: 'Access Scope' },
                {
                  key: 'usersCount',
                  header: 'Active Users',
                  render: (row) => <span>{row.usersCount} users</span>,
                },
                {
                  key: 'status',
                  header: 'Governance',
                  render: () => (
                    <Badge variant="success" size="sm">
                      ENFORCED
                    </Badge>
                  ),
                },
              ]}
              data={roles}
            />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
