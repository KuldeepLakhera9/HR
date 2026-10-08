'use client';

import React, { useState } from 'react';
import { AppShell } from '../../layouts/AppShell';
import {
  Button,
  Input,
  Textarea,
  Select,
  Checkbox,
  Radio,
  Switch,
  Badge,
  Avatar,
  Tooltip,
  Dialog,
  Drawer,
  Dropdown,
  Tabs,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  KPICard,
  StatCard,
  ChartCard,
  Table,
  DataTable,
  Search,
  Filter,
  Pagination,
  EmptyState,
  ErrorState,
  LoadingState,
  Toast,
} from '@hrms/ui';
import { DESIGN_TOKENS } from '@hrms/config';
import {
  Sparkles,
  Users,
  CheckCircle2,
  CalendarDays,
  Clock,
  ArrowRight,
  Download,
  Plus,
  Trash2,
  Settings,
  MoreVertical,
  Layers,
  Palette,
  Shield,
  HelpCircle,
} from 'lucide-react';

export default function DesignSystemPage() {
  const [activeTab, setActiveTab] = useState('components');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [filterValue, setFilterValue] = useState('ALL');
  const [switchChecked, setSwitchChecked] = useState(true);
  const [checkboxChecked, setCheckboxChecked] = useState(true);

  const sampleData = [
    {
      id: '1',
      name: 'Vikram Aditya',
      role: 'Super Administrator',
      status: 'ACTIVE',
      branch: 'BLR Headquarters',
    },
    {
      id: '2',
      name: 'Ananya Sharma',
      role: 'People Operations Lead',
      status: 'ACTIVE',
      branch: 'BLR Headquarters',
    },
    {
      id: '3',
      name: 'Rajesh Kumar',
      role: 'Engineering Director',
      status: 'ON_LEAVE',
      branch: 'BLR Headquarters',
    },
    {
      id: '4',
      name: 'Priya Nair',
      role: 'Senior Frontend Engineer',
      status: 'ACTIVE',
      branch: 'Hyderabad Client DC',
    },
  ];

  const sampleColumns = [
    {
      key: 'name',
      header: 'Employee',
      render: (row: (typeof sampleData)[0]) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={row.name} size="sm" status="online" />
          <div>
            <span className="font-semibold text-stone-900 block leading-tight">{row.name}</span>
            <span className="text-[11px] text-stone-400">{row.role}</span>
          </div>
        </div>
      ),
    },
    { key: 'branch', header: 'Assigned Branch' },
    {
      key: 'status',
      header: 'Status',
      render: (row: (typeof sampleData)[0]) => (
        <Badge variant={row.status === 'ACTIVE' ? 'success' : 'warning'} size="sm">
          {row.status}
        </Badge>
      ),
    },
  ];

  return (
    <AppShell>
      {showToast && (
        <div className="fixed top-5 right-5 z-50">
          <Toast
            type="success"
            title="Design System Action"
            message="Component triggered successfully."
            onClose={() => setShowToast(false)}
          />
        </div>
      )}

      <div className="space-y-8 max-w-6xl pb-16">
        {/* Header Title */}
        <div className="border-b border-stone-200 pb-5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 mb-2">
            <Palette className="h-3.5 w-3.5" /> PeopleOS Design System
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-stone-900">
            HRMS Centralized Design Tokens & UI Library
          </h1>
          <p className="text-sm text-stone-500 mt-1">
            Standardized, accessible, and responsive components built with warm ivory, crisp
            surfaces, and warm amber accents.
          </p>

          <div className="mt-4">
            <Tabs
              activeId={activeTab}
              onChange={setActiveTab}
              items={[
                {
                  id: 'components',
                  label: 'Component Catalog',
                  icon: <Layers className="h-4 w-4" />,
                },
                {
                  id: 'tokens',
                  label: 'Color Tokens & Swatches',
                  icon: <Palette className="h-4 w-4" />,
                },
                {
                  id: 'states',
                  label: 'Feedback & States',
                  icon: <Sparkles className="h-4 w-4" />,
                },
              ]}
            />
          </div>
        </div>

        {activeTab === 'components' && (
          <div className="space-y-8">
            {/* 1. Buttons */}
            <section className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-stone-600">
                1. Buttons & Actions
              </h2>
              <Card>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Button variant="primary">Primary Amber</Button>
                    <Button variant="secondary">Secondary</Button>
                    <Button variant="outline">Outline</Button>
                    <Button variant="ghost">Ghost</Button>
                    <Button variant="danger">Danger</Button>
                    <Button variant="link">Link Button</Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-stone-100">
                    <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />}>
                      Small With Icon
                    </Button>
                    <Button size="md" rightIcon={<ArrowRight className="h-4 w-4" />}>
                      Medium With Icon
                    </Button>
                    <Button size="lg">Large Action</Button>
                    <Button isLoading>Processing...</Button>
                    <Button disabled>Disabled State</Button>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* 2. Form Inputs & Controls */}
            <section className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-stone-600">
                2. Form Controls & Inputs
              </h2>
              <Card>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <Input
                    label="Standard Input"
                    placeholder="Enter text..."
                    helperText="Standard helper annotation"
                  />
                  <Input
                    label="With Left Icon"
                    leftIcon={<Users className="h-4 w-4" />}
                    placeholder="Search employee..."
                  />
                  <Input
                    label="Error Validation State"
                    defaultValue="invalid@email"
                    error="Please enter a valid work email address"
                  />
                  <Select
                    label="Dropdown Select"
                    options={[
                      { label: 'Engineering & Product', value: 'eng' },
                      { label: 'Human Resources', value: 'hr' },
                      { label: 'Finance & Accounts', value: 'fin' },
                    ]}
                  />
                  <div className="md:col-span-2">
                    <Textarea
                      label="Textarea"
                      placeholder="Enter multi-line notes or justification..."
                      rows={3}
                    />
                  </div>
                  <div className="flex flex-col gap-3">
                    <Checkbox
                      label="Checkbox with Label"
                      description="Enables automated monthly leave accumulation"
                      checked={checkboxChecked}
                      onChange={(e) => setCheckboxChecked(e.target.checked)}
                    />
                    <Radio
                      label="Radio Option"
                      description="Select single option"
                      defaultChecked={true}
                    />
                  </div>
                  <div>
                    <Switch
                      label="Geofence Enforcement"
                      description="Requires GPS verification for Office punches"
                      checked={switchChecked}
                      onChange={(e) => setSwitchChecked(e.target.checked)}
                    />
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* 3. Badges, Avatars & Tooltips */}
            <section className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-stone-600">
                3. Badges, Avatars & Tooltips
              </h2>
              <Card>
                <CardContent className="space-y-5">
                  <div>
                    <p className="text-xs font-medium text-stone-500 mb-2.5">
                      Semantic Status Badges
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="default">Default Neutral</Badge>
                      <Badge variant="primary">Warm Amber</Badge>
                      <Badge variant="success">Present / Approved</Badge>
                      <Badge variant="warning">Pending Review</Badge>
                      <Badge variant="danger">Absent / Rejected</Badge>
                      <Badge variant="info">Work From Home</Badge>
                      <Badge variant="purple">Official Visit (OD)</Badge>
                      <Badge variant="outline">Outlined Pill</Badge>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-stone-100 flex flex-wrap items-center gap-6">
                    <div>
                      <p className="text-xs font-medium text-stone-500 mb-2">
                        Avatars with Status Pips
                      </p>
                      <div className="flex items-center gap-3">
                        <Avatar name="Priya Nair" size="sm" status="online" />
                        <Avatar name="Vikram Aditya" size="md" status="online" />
                        <Avatar name="Rajesh Kumar" size="lg" status="away" />
                        <Avatar name="Ananya Sharma" size="xl" status="busy" />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-stone-500 mb-2">Accessible Tooltip</p>
                      <Tooltip content="Geofence coordinates verified within 150m radius">
                        <Button
                          variant="outline"
                          size="sm"
                          leftIcon={<HelpCircle className="h-3.5 w-3.5" />}
                        >
                          Hover for Tooltip
                        </Button>
                      </Tooltip>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* 4. KPI & Metric Cards */}
            <section className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-stone-600">
                4. Metric & KPI Cards
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <KPICard
                  title="Total Employees"
                  value="72"
                  change={{ value: '+4 this month', trend: 'up' }}
                  icon={<Users className="h-5 w-5 text-amber-700" />}
                  iconBg="bg-amber-100"
                />
                <KPICard
                  title="Present Today"
                  value="64"
                  change={{ value: '88.9% rate', trend: 'up' }}
                  icon={<CheckCircle2 className="h-5 w-5 text-emerald-700" />}
                  iconBg="bg-emerald-100"
                />
                <KPICard
                  title="Official Visits"
                  value="4"
                  change={{ value: 'Outdoor Duty', trend: 'neutral' }}
                  icon={<Clock className="h-5 w-5 text-purple-700" />}
                  iconBg="bg-purple-100"
                />
              </div>
            </section>

            {/* 5. Data Tables & Search */}
            <section className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-stone-600">
                5. Clean Data Tables & Filters
              </h2>
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-xl border border-stone-200 bg-white">
                <Search
                  value={searchValue}
                  onChange={setSearchValue}
                  placeholder="Filter records..."
                />
                <Filter
                  label="Status"
                  selectedValue={filterValue}
                  onChange={setFilterValue}
                  options={[
                    { label: 'All Statuses', value: 'ALL' },
                    { label: 'Active', value: 'ACTIVE' },
                    { label: 'On Leave', value: 'ON_LEAVE' },
                  ]}
                />
              </div>
              <DataTable columns={sampleColumns} data={sampleData} />
            </section>

            {/* 6. Overlays: Dialog, Drawer & Dropdown */}
            <section className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-stone-600">
                6. Overlays (Dialog, Drawer, Dropdown)
              </h2>
              <Card>
                <CardContent className="flex flex-wrap items-center gap-4">
                  <Button variant="outline" onClick={() => setIsDialogOpen(true)}>
                    Open Modal Dialog
                  </Button>
                  <Button variant="outline" onClick={() => setIsDrawerOpen(true)}>
                    Open Side Drawer
                  </Button>
                  <Button variant="outline" onClick={() => setShowToast(true)}>
                    Trigger Toast Notification
                  </Button>

                  <Dropdown
                    trigger={
                      <Button
                        variant="secondary"
                        rightIcon={<MoreVertical className="h-3.5 w-3.5" />}
                      >
                        Actions Menu
                      </Button>
                    }
                    items={[
                      {
                        id: '1',
                        label: 'View Profile',
                        icon: <Users className="h-3.5 w-3.5" />,
                        onClick: () => setShowToast(true),
                      },
                      {
                        id: '2',
                        label: 'Settings',
                        icon: <Settings className="h-3.5 w-3.5" />,
                        onClick: () => setShowToast(true),
                      },
                      {
                        id: '3',
                        label: 'Revoke Access',
                        icon: <Trash2 className="h-3.5 w-3.5" />,
                        danger: true,
                        onClick: () => setShowToast(true),
                      },
                    ]}
                  />
                </CardContent>
              </Card>

              {/* Sample Dialog */}
              <Dialog
                isOpen={isDialogOpen}
                onClose={() => setIsDialogOpen(false)}
                title="System Confirmation Dialog"
                description="Are you sure you want to proceed with this operation?"
                footer={
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setIsDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={() => setIsDialogOpen(false)}>
                      Confirm
                    </Button>
                  </div>
                }
              >
                <p className="text-xs text-stone-600">
                  This dialog is rendered through the standardized `@hrms/ui` overlay layer.
                </p>
              </Dialog>

              {/* Sample Drawer */}
              <Drawer
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                title="Slide-Over Detail Drawer"
                footer={
                  <Button size="sm" onClick={() => setIsDrawerOpen(false)}>
                    Done
                  </Button>
                }
              >
                <p className="text-xs text-stone-600">
                  Reusable side-drawer panel ideal for approvals and detailed profile inspections.
                </p>
              </Drawer>
            </section>
          </div>
        )}

        {activeTab === 'tokens' && (
          <div className="space-y-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-stone-600">
              Color Palette & Semantic Tokens
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl border border-stone-200 bg-white">
                <div className="h-16 rounded-lg bg-amber-600 mb-3 shadow-xs" />
                <p className="text-xs font-bold text-stone-900">Primary Amber</p>
                <p className="text-[11px] text-stone-500 font-mono">#D97706 (Amber 600)</p>
              </div>

              <div className="p-4 rounded-xl border border-stone-200 bg-white">
                <div className="h-16 rounded-lg bg-[#FAF8F5] border border-stone-200 mb-3" />
                <p className="text-xs font-bold text-stone-900">Warm Ivory Background</p>
                <p className="text-[11px] text-stone-500 font-mono">#FAF8F5</p>
              </div>

              <div className="p-4 rounded-xl border border-stone-200 bg-white">
                <div className="h-16 rounded-lg bg-white border border-stone-200 mb-3" />
                <p className="text-xs font-bold text-stone-900">Crisp Surface Card</p>
                <p className="text-[11px] text-stone-500 font-mono">#FFFFFF</p>
              </div>

              <div className="p-4 rounded-xl border border-stone-200 bg-white">
                <div className="h-16 rounded-lg bg-[#1C1917] mb-3" />
                <p className="text-xs font-bold text-stone-900">Deep Charcoal Typography</p>
                <p className="text-[11px] text-stone-500 font-mono">#1C1917</p>
              </div>
            </div>

            <div className="p-5 rounded-xl border border-stone-200 bg-white space-y-3">
              <h3 className="text-sm font-semibold text-stone-900">Status Semantics</h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium text-center">
                  Success / Present
                </div>
                <div className="p-3 rounded-lg bg-amber-50 text-amber-900 border border-amber-200 font-medium text-center">
                  Warning / Pending
                </div>
                <div className="p-3 rounded-lg bg-rose-50 text-rose-800 border border-rose-200 font-medium text-center">
                  Danger / Absent
                </div>
                <div className="p-3 rounded-lg bg-sky-50 text-sky-800 border border-sky-200 font-medium text-center">
                  Info / WFH
                </div>
                <div className="p-3 rounded-lg bg-purple-50 text-purple-800 border border-purple-200 font-medium text-center">
                  Official Visit (OD)
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'states' && (
          <div className="space-y-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-stone-600">
              Standardized Feedback States
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Empty State</CardTitle>
                  <CardDescription>When no records match the criteria</CardDescription>
                </CardHeader>
                <CardContent>
                  <EmptyState
                    title="No records found"
                    description="Try adjusting your filters or date range."
                    action={{ label: 'Reset Filter', onClick: () => {} }}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Loading State</CardTitle>
                  <CardDescription>Active network request indicator</CardDescription>
                </CardHeader>
                <CardContent>
                  <LoadingState message="Fetching live attendance roster..." />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Error State</CardTitle>
                  <CardDescription>Resilient error feedback with retry</CardDescription>
                </CardHeader>
                <CardContent>
                  <ErrorState
                    title="Data sync failed"
                    message="Unable to reach local PostgreSQL cluster."
                    onRetry={() => setShowToast(true)}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
