'use client';

import React, { useState } from 'react';
import { AppShell } from '../../layouts/AppShell';
import { DataTable, Search, Filter, Button, Badge, Avatar, Dialog, Pagination } from '@hrms/ui';
import { UserPlus, Download, Mail, Phone, Building2 } from 'lucide-react';

interface EmployeeItem {
  id: string;
  code: string;
  name: string;
  email: string;
  department: string;
  designation: string;
  role: string;
  status: 'ACTIVE' | 'ON_PROBATION' | 'NOTICE';
  branch: string;
}

const mockEmployees: EmployeeItem[] = [
  {
    id: '1',
    code: 'EMP001',
    name: 'Vikram Aditya',
    email: 'admin@peopleos.local',
    department: 'Executive',
    designation: 'Chief Technology Officer',
    role: 'ADMIN',
    status: 'ACTIVE',
    branch: 'BLR HQ',
  },
  {
    id: '2',
    code: 'EMP002',
    name: 'Ananya Sharma',
    email: 'hr@peopleos.local',
    department: 'Human Resources',
    designation: 'People Operations Lead',
    role: 'HR',
    status: 'ACTIVE',
    branch: 'BLR HQ',
  },
  {
    id: '3',
    code: 'EMP003',
    name: 'Rajesh Kumar',
    email: 'manager@peopleos.local',
    department: 'Engineering',
    designation: 'Engineering Director',
    role: 'MANAGER',
    status: 'ACTIVE',
    branch: 'BLR HQ',
  },
  {
    id: '4',
    code: 'EMP004',
    name: 'Priya Nair',
    email: 'employee@peopleos.local',
    department: 'Engineering',
    designation: 'Sr. Frontend Engineer',
    role: 'EMPLOYEE',
    status: 'ACTIVE',
    branch: 'BLR HQ',
  },
  {
    id: '5',
    code: 'EMP005',
    name: 'Amitabh Roy',
    email: 'amitabh.roy@peopleos.local',
    department: 'Engineering',
    designation: 'Backend Systems Engineer',
    role: 'EMPLOYEE',
    status: 'ACTIVE',
    branch: 'MUM Tech Park',
  },
  {
    id: '6',
    code: 'EMP006',
    name: 'Neha Gupta',
    email: 'neha.gupta@peopleos.local',
    department: 'Engineering',
    designation: 'DevOps & SRE Engineer',
    role: 'EMPLOYEE',
    status: 'ON_PROBATION',
    branch: 'BLR HQ',
  },
  {
    id: '7',
    code: 'EMP007',
    name: 'Karan Mehra',
    email: 'karan.m@peopleos.local',
    department: 'Operations',
    designation: 'Operations Manager',
    role: 'MANAGER',
    status: 'ACTIVE',
    branch: 'DEL NCR Hub',
  },
];

export default function EmployeesPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [selectedEmp, setSelectedEmp] = useState<EmployeeItem | null>(null);

  const filtered = mockEmployees.filter((emp) => {
    const matchesSearch =
      emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDept = deptFilter === 'ALL' || emp.department === deptFilter;
    return matchesSearch && matchesDept;
  });

  const columns = [
    {
      key: 'employee',
      header: 'Employee',
      render: (row: EmployeeItem) => (
        <div className="flex items-center gap-3">
          <Avatar name={row.name} size="sm" />
          <div>
            <span className="font-semibold text-stone-900 block leading-tight">{row.name}</span>
            <span className="text-xs text-stone-400">{row.email}</span>
          </div>
        </div>
      ),
    },
    { key: 'code', header: 'Emp Code' },
    { key: 'department', header: 'Department' },
    { key: 'designation', header: 'Designation' },
    {
      key: 'status',
      header: 'Status',
      render: (row: EmployeeItem) => (
        <Badge
          variant={
            row.status === 'ACTIVE'
              ? 'success'
              : row.status === 'ON_PROBATION'
                ? 'warning'
                : 'default'
          }
          size="sm"
        >
          {row.status.replace('_', ' ')}
        </Badge>
      ),
    },
    { key: 'branch', header: 'Branch' },
    {
      key: 'actions',
      header: 'Actions',
      render: (row: EmployeeItem) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setSelectedEmp(row)}
          className="text-amber-700 hover:text-amber-800"
        >
          View Profile
        </Button>
      ),
    },
  ];

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-stone-900">
              Employee Directory
            </h1>
            <p className="text-xs md:text-sm text-stone-500 mt-1">
              Manage organization staff, role mappings, branches and department assignments.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" leftIcon={<Download className="h-4 w-4" />}>
              Export CSV
            </Button>
            <Button size="sm" leftIcon={<UserPlus className="h-4 w-4" />}>
              Add Employee
            </Button>
          </div>
        </div>

        {/* Filters and Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-stone-200 bg-white">
          <Search
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Search by name, code, email..."
          />
          <Filter
            label="Department"
            selectedValue={deptFilter}
            onChange={setDeptFilter}
            options={[
              { label: 'All Departments', value: 'ALL' },
              { label: 'Engineering', value: 'Engineering' },
              { label: 'Human Resources', value: 'Human Resources' },
              { label: 'Operations', value: 'Operations' },
              { label: 'Executive', value: 'Executive' },
            ]}
          />
        </div>

        {/* DataTable */}
        <DataTable columns={columns} data={filtered} />
        <Pagination currentPage={1} totalPages={1} onPageChange={() => {}} />

        {/* Details Dialog */}
        <Dialog
          isOpen={!!selectedEmp}
          onClose={() => setSelectedEmp(null)}
          title={selectedEmp?.name}
          description={`${selectedEmp?.designation} • ${selectedEmp?.code}`}
          footer={
            <Button size="sm" onClick={() => setSelectedEmp(null)}>
              Close
            </Button>
          }
        >
          {selectedEmp && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3 p-3 bg-stone-50 rounded-xl">
                <Avatar name={selectedEmp.name} size="lg" />
                <div>
                  <h4 className="text-sm font-bold text-stone-900">{selectedEmp.name}</h4>
                  <p className="text-xs text-stone-500">{selectedEmp.email}</p>
                  <span className="inline-block mt-1 text-[11px] font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                    Role: {selectedEmp.role}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-2.5 rounded-lg border border-stone-200">
                  <span className="text-stone-400 block">Department</span>
                  <span className="font-semibold text-stone-800">{selectedEmp.department}</span>
                </div>
                <div className="p-2.5 rounded-lg border border-stone-200">
                  <span className="text-stone-400 block">Branch</span>
                  <span className="font-semibold text-stone-800">{selectedEmp.branch}</span>
                </div>
                <div className="p-2.5 rounded-lg border border-stone-200">
                  <span className="text-stone-400 block">Status</span>
                  <span className="font-semibold text-emerald-700">{selectedEmp.status}</span>
                </div>
                <div className="p-2.5 rounded-lg border border-stone-200">
                  <span className="text-stone-400 block">Employee Code</span>
                  <span className="font-semibold text-stone-800">{selectedEmp.code}</span>
                </div>
              </div>
            </div>
          )}
        </Dialog>
      </div>
    </AppShell>
  );
}
