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
  KPICard,
  DataTable,
} from '@hrms/ui';
import { Building2, MapPin, Briefcase, Users } from 'lucide-react';

export default function OrganizationPage() {
  const branches = [
    {
      id: '1',
      code: 'HQ-BLR',
      name: 'Bengaluru Corporate HQ',
      city: 'Bengaluru',
      headCount: 142,
      status: 'ACTIVE',
    },
    {
      id: '2',
      code: 'BR-HYD',
      name: 'Hyderabad Tech Center',
      city: 'Hyderabad',
      headCount: 88,
      status: 'ACTIVE',
    },
    {
      id: '3',
      code: 'BR-PUN',
      name: 'Pune Innovation Hub',
      city: 'Pune',
      headCount: 54,
      status: 'ACTIVE',
    },
  ];

  const departments = [
    {
      id: '1',
      code: 'ENG',
      name: 'Engineering & Platform',
      head: 'Rajesh Kumar',
      totalMembers: 110,
    },
    { id: '2', code: 'HR', name: 'People & Culture', head: 'Ananya Sharma', totalMembers: 18 },
    { id: '3', code: 'FIN', name: 'Finance & Compliance', head: 'Sunil Rao', totalMembers: 22 },
    { id: '4', code: 'OPS', name: 'Operations & IT', head: 'Pooja Hegde', totalMembers: 35 },
  ];

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-stone-900">Organization Hierarchy</h1>
          <p className="text-xs md:text-sm text-stone-500 mt-1">
            Manage corporate legal entities, regional branches, business units, and designation
            levels.
          </p>
        </div>

        {/* Top KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            title="Total Branches"
            value="3"
            description="All operating normally"
            icon={<MapPin className="h-5 w-5 text-amber-700" />}
          />
          <KPICard
            title="Departments"
            value="8"
            description="Cross-functional units"
            icon={<Building2 className="h-5 w-5 text-amber-700" />}
          />
          <KPICard
            title="Designation Bands"
            value="14"
            description="IC1 to Director levels"
            icon={<Briefcase className="h-5 w-5 text-amber-700" />}
          />
          <KPICard
            title="Total Workforce"
            value="284"
            description="98.2% active"
            change={{ value: '+4.8%', trend: 'up' }}
            icon={<Users className="h-5 w-5 text-amber-700" />}
          />
        </div>

        {/* Branches Section */}
        <Card>
          <CardHeader>
            <CardTitle>Corporate Branches & Locations</CardTitle>
            <CardDescription>Registered physical facilities and geo-zones</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={[
                {
                  key: 'code',
                  header: 'Code',
                  render: (row) => (
                    <span className="font-mono font-medium text-stone-900">{row.code}</span>
                  ),
                },
                { key: 'name', header: 'Branch Name' },
                { key: 'city', header: 'Location / City' },
                {
                  key: 'headCount',
                  header: 'Workforce',
                  render: (row) => <span>{row.headCount} Employees</span>,
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (row) => (
                    <Badge variant={row.status === 'ACTIVE' ? 'success' : 'default'} size="sm">
                      {row.status}
                    </Badge>
                  ),
                },
              ]}
              data={branches}
            />
          </CardContent>
        </Card>

        {/* Departments Section */}
        <Card>
          <CardHeader>
            <CardTitle>Business Units & Departments</CardTitle>
            <CardDescription>Organizational reporting structures</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={[
                {
                  key: 'code',
                  header: 'Dept Code',
                  render: (row) => (
                    <span className="font-mono font-medium text-stone-900">{row.code}</span>
                  ),
                },
                { key: 'name', header: 'Department' },
                { key: 'head', header: 'Department Head' },
                {
                  key: 'totalMembers',
                  header: 'Headcount',
                  render: (row) => <span>{row.totalMembers} Members</span>,
                },
              ]}
              data={departments}
            />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
