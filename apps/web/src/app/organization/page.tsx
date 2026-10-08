'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppShell } from '../../layouts/AppShell';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  KPICard,
  Button,
  DataTable,
  Dialog,
  Search,
} from '@hrms/ui';
import {
  Building2,
  MapPin,
  Briefcase,
  Users,
  Plus,
  Edit2,
  Trash2,
  CheckCircle,
  AlertCircle,
  Globe,
  Mail,
  Phone,
} from 'lucide-react';
import { organizationApi } from '../../lib/api-client';

export default function OrganizationPage() {
  const [activeTab, setActiveTab] = useState<'branches' | 'departments' | 'designations'>(
    'branches',
  );
  const [loading, setLoading] = useState(true);
  const [organization, setOrganization] = useState<any>(null);
  const [branches, setBranches] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [designations, setDesignations] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Modals state
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [isDesigModalOpen, setIsDesigModalOpen] = useState(false);
  const [isOrgModalOpen, setIsOrgModalOpen] = useState(false);

  const [editingItem, setEditingItem] = useState<any>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form states
  const [branchForm, setBranchForm] = useState({
    name: '',
    code: '',
    city: '',
    state: '',
    country: 'India',
    latitude: '',
    longitude: '',
  });

  const [deptForm, setDeptForm] = useState({
    name: '',
    code: '',
    description: '',
  });

  const [desigForm, setDesigForm] = useState({
    title: '',
    code: '',
    departmentId: '',
    level: 1,
    description: '',
  });

  const [orgForm, setOrgForm] = useState({
    name: '',
    legalName: '',
    email: '',
    phone: '',
    website: '',
    city: '',
    state: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [orgData, branchData, deptData, desigData] = await Promise.all([
        organizationApi.getCurrent(),
        organizationApi.getBranches(),
        organizationApi.getDepartments(),
        organizationApi.getDesignations(),
      ]);

      setOrganization(orgData);
      setBranches(branchData || []);
      setDepartments(deptData || []);
      setDesignations(desigData || []);

      if (orgData) {
        setOrgForm({
          name: orgData.name || '',
          legalName: orgData.legalName || '',
          email: orgData.email || '',
          phone: orgData.phone || '',
          website: orgData.website || '',
          city: orgData.city || '',
          state: orgData.state || '',
        });
      }
    } catch (err) {
      console.error('Failed to load organization data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handlers for Branch
  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const payload: any = {
        name: branchForm.name,
        code: branchForm.code,
        city: branchForm.city,
        state: branchForm.state,
        country: branchForm.country,
        latitude: branchForm.latitude ? parseFloat(branchForm.latitude) : undefined,
        longitude: branchForm.longitude ? parseFloat(branchForm.longitude) : undefined,
      };

      if (editingItem) {
        await organizationApi.updateBranch(editingItem.id, payload);
      } else {
        await organizationApi.createBranch(payload);
      }

      setIsBranchModalOpen(false);
      setEditingItem(null);
      await loadData();
    } catch (err: any) {
      setFormError(err.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivateBranch = async (id: string) => {
    if (!confirm('Are you sure you want to deactivate this branch?')) return;
    try {
      await organizationApi.deactivateBranch(id);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to deactivate branch');
    }
  };

  // Handlers for Department
  const handleSaveDept = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      if (editingItem) {
        await organizationApi.updateDepartment(editingItem.id, deptForm);
      } else {
        await organizationApi.createDepartment(deptForm);
      }
      setIsDeptModalOpen(false);
      setEditingItem(null);
      await loadData();
    } catch (err: any) {
      setFormError(err.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivateDept = async (id: string) => {
    if (!confirm('Are you sure you want to deactivate this department?')) return;
    try {
      await organizationApi.deactivateDepartment(id);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to deactivate department');
    }
  };

  // Handlers for Designation
  const handleSaveDesig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const payload: any = {
        title: desigForm.title,
        code: desigForm.code,
        level: Number(desigForm.level),
        description: desigForm.description,
        departmentId: desigForm.departmentId || null,
      };

      if (editingItem) {
        await organizationApi.updateDesignation(editingItem.id, payload);
      } else {
        await organizationApi.createDesignation(payload);
      }
      setIsDesigModalOpen(false);
      setEditingItem(null);
      await loadData();
    } catch (err: any) {
      setFormError(err.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivateDesig = async (id: string) => {
    if (!confirm('Are you sure you want to deactivate this designation?')) return;
    try {
      await organizationApi.deactivateDesignation(id);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to deactivate designation');
    }
  };

  // Handlers for Organization Info
  const handleSaveOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await organizationApi.updateCurrent(orgForm);
      setIsOrgModalOpen(false);
      await loadData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to update organization');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-stone-900">
              {organization?.name || 'Organization Structure'}
            </h1>
            <p className="text-xs md:text-sm text-stone-500 mt-1">
              Manage branches, departments, designations, and workforce hierarchies.
            </p>
          </div>
          <Button
            variant="outline"
            className="border-stone-200 text-stone-700 hover:bg-stone-50"
            onClick={() => {
              setFormError(null);
              setIsOrgModalOpen(true);
            }}
          >
            <Edit2 className="h-4 w-4 mr-2" />
            Edit Organization
          </Button>
        </div>

        {/* Top KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            title="Total Branches"
            value={organization?.stats?.branchesCount ?? branches.length}
            description="Geofence-ready hubs"
            icon={<MapPin className="h-5 w-5 text-amber-700" />}
          />
          <KPICard
            title="Departments"
            value={organization?.stats?.departmentsCount ?? departments.length}
            description="Cross-functional units"
            icon={<Building2 className="h-5 w-5 text-amber-700" />}
          />
          <KPICard
            title="Designations"
            value={organization?.stats?.designationsCount ?? designations.length}
            description="Role bands & levels"
            icon={<Briefcase className="h-5 w-5 text-amber-700" />}
          />
          <KPICard
            title="Total Workforce"
            value={organization?.stats?.employeesCount ?? 8}
            description="Active employees"
            icon={<Users className="h-5 w-5 text-amber-700" />}
          />
        </div>

        {/* Organization Detail Card */}
        {organization && (
          <Card className="border border-stone-200/80 bg-white shadow-xs">
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-wrap items-center gap-6 text-sm text-stone-600">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-stone-400" />
                  <span className="font-medium text-stone-900">{organization.legalName}</span>
                </div>
                {organization.city && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-stone-400" />
                    <span>
                      {organization.city}, {organization.state}
                    </span>
                  </div>
                )}
                {organization.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-stone-400" />
                    <span>{organization.email}</span>
                  </div>
                )}
                {organization.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-stone-400" />
                    <span>{organization.phone}</span>
                  </div>
                )}
                {organization.website && (
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-stone-400" />
                    <a
                      href={organization.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-800 hover:underline"
                    >
                      {organization.website}
                    </a>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs Bar */}
        <div className="flex border-b border-stone-200">
          <button
            onClick={() => {
              setActiveTab('branches');
              setSearchTerm('');
            }}
            className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'branches'
                ? 'border-amber-800 text-amber-900'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            Branches ({branches.length})
          </button>
          <button
            onClick={() => {
              setActiveTab('departments');
              setSearchTerm('');
            }}
            className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'departments'
                ? 'border-amber-800 text-amber-900'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            Departments ({departments.length})
          </button>
          <button
            onClick={() => {
              setActiveTab('designations');
              setSearchTerm('');
            }}
            className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'designations'
                ? 'border-amber-800 text-amber-900'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            Designations ({designations.length})
          </button>
        </div>

        {/* Active Tab Content */}
        {activeTab === 'branches' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="w-full sm:w-72">
                <Search
                  placeholder="Search branches..."
                  value={searchTerm}
                  onChange={(val) => setSearchTerm(val)}
                />
              </div>
              <Button
                className="bg-amber-800 hover:bg-amber-900 text-white"
                onClick={() => {
                  setEditingItem(null);
                  setBranchForm({
                    name: '',
                    code: '',
                    city: '',
                    state: '',
                    country: 'India',
                    latitude: '',
                    longitude: '',
                  });
                  setFormError(null);
                  setIsBranchModalOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Branch
              </Button>
            </div>

            <DataTable
              data={branches.filter(
                (b) =>
                  b.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  b.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  (b.city && b.city.toLowerCase().includes(searchTerm.toLowerCase())),
              )}
              columns={[
                {
                  key: 'code',
                  header: 'Branch Code',
                  render: (item: any) => (
                    <span className="font-mono text-xs font-semibold text-stone-900">
                      {item.code}
                    </span>
                  ),
                },
                {
                  key: 'name',
                  header: 'Branch Name',
                  render: (item: any) => (
                    <div>
                      <div className="font-medium text-stone-900">{item.name}</div>
                      <div className="text-xs text-stone-500">
                        {item.city}, {item.state}
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'coordinates',
                  header: 'Coordinates (Geofence)',
                  render: (item: any) => (
                    <div className="text-xs text-stone-600 font-mono">
                      {item.latitude && item.longitude ? (
                        <span>
                          {Number(item.latitude).toFixed(4)}, {Number(item.longitude).toFixed(4)}
                        </span>
                      ) : (
                        <span className="text-stone-400">Not configured</span>
                      )}
                    </div>
                  ),
                },
                {
                  key: 'employees',
                  header: 'Employees',
                  render: (item: any) => (
                    <Badge variant="default" className="bg-stone-100 text-stone-800 font-semibold">
                      {item.employeeCount ?? 0} members
                    </Badge>
                  ),
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (item: any) => (
                    <Badge variant={item.isActive ? 'success' : 'default'}>
                      {item.isActive ? 'ACTIVE' : 'INACTIVE'}
                    </Badge>
                  ),
                },
                {
                  key: 'actions',
                  header: 'Actions',
                  render: (item: any) => (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingItem(item);
                          setBranchForm({
                            name: item.name,
                            code: item.code,
                            city: item.city || '',
                            state: item.state || '',
                            country: item.country || 'India',
                            latitude: item.latitude?.toString() || '',
                            longitude: item.longitude?.toString() || '',
                          });
                          setFormError(null);
                          setIsBranchModalOpen(true);
                        }}
                      >
                        <Edit2 className="h-3.5 w-3.5 text-stone-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-rose-600 hover:text-rose-700"
                        onClick={() => handleDeactivateBranch(item.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ),
                },
              ]}
            />
          </div>
        )}

        {activeTab === 'departments' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="w-full sm:w-72">
                <Search
                  placeholder="Search departments..."
                  value={searchTerm}
                  onChange={(val) => setSearchTerm(val)}
                />
              </div>
              <Button
                className="bg-amber-800 hover:bg-amber-900 text-white"
                onClick={() => {
                  setEditingItem(null);
                  setDeptForm({ name: '', code: '', description: '' });
                  setFormError(null);
                  setIsDeptModalOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Department
              </Button>
            </div>

            <DataTable
              data={departments.filter(
                (d) =>
                  d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  d.code.toLowerCase().includes(searchTerm.toLowerCase()),
              )}
              columns={[
                {
                  key: 'code',
                  header: 'Code',
                  render: (item: any) => (
                    <span className="font-mono text-xs font-semibold text-stone-900">
                      {item.code}
                    </span>
                  ),
                },
                {
                  key: 'name',
                  header: 'Department',
                  render: (item: any) => (
                    <div>
                      <div className="font-medium text-stone-900">{item.name}</div>
                      <div className="text-xs text-stone-500">
                        {item.description || 'No description'}
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'head',
                  header: 'Department Head',
                  render: (item: any) =>
                    item.departmentHead?.displayName || (
                      <span className="text-stone-400 italic">Not assigned</span>
                    ),
                },
                {
                  key: 'employees',
                  header: 'Employees',
                  render: (item: any) => (
                    <Badge variant="default" className="bg-stone-100 text-stone-800 font-semibold">
                      {item.employeeCount ?? 0} members
                    </Badge>
                  ),
                },
                {
                  key: 'status',
                  header: 'Status',
                  render: (item: any) => (
                    <Badge variant={item.isActive ? 'success' : 'default'}>
                      {item.isActive ? 'ACTIVE' : 'INACTIVE'}
                    </Badge>
                  ),
                },
                {
                  key: 'actions',
                  header: 'Actions',
                  render: (item: any) => (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingItem(item);
                          setDeptForm({
                            name: item.name,
                            code: item.code,
                            description: item.description || '',
                          });
                          setFormError(null);
                          setIsDeptModalOpen(true);
                        }}
                      >
                        <Edit2 className="h-3.5 w-3.5 text-stone-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-rose-600 hover:text-rose-700"
                        onClick={() => handleDeactivateDept(item.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ),
                },
              ]}
            />
          </div>
        )}

        {activeTab === 'designations' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="w-full sm:w-72">
                <Search
                  placeholder="Search designations..."
                  value={searchTerm}
                  onChange={(val) => setSearchTerm(val)}
                />
              </div>
              <Button
                className="bg-amber-800 hover:bg-amber-900 text-white"
                onClick={() => {
                  setEditingItem(null);
                  setDesigForm({
                    title: '',
                    code: '',
                    departmentId: '',
                    level: 1,
                    description: '',
                  });
                  setFormError(null);
                  setIsDesigModalOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Designation
              </Button>
            </div>

            <DataTable
              data={designations.filter(
                (d) =>
                  d.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  d.code.toLowerCase().includes(searchTerm.toLowerCase()),
              )}
              columns={[
                {
                  key: 'code',
                  header: 'Code',
                  render: (item: any) => (
                    <span className="font-mono text-xs font-semibold text-stone-900">
                      {item.code}
                    </span>
                  ),
                },
                {
                  key: 'title',
                  header: 'Designation Title',
                  render: (item: any) => (
                    <div>
                      <div className="font-medium text-stone-900">{item.title}</div>
                      <div className="text-xs text-stone-500">
                        {item.description || 'Standard level'}
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'department',
                  header: 'Department',
                  render: (item: any) => item.department?.name || 'General',
                },
                {
                  key: 'level',
                  header: 'Level',
                  render: (item: any) => (
                    <Badge variant="outline" className="text-amber-800 border-amber-200">
                      Level {item.level ?? 1}
                    </Badge>
                  ),
                },
                {
                  key: 'employees',
                  header: 'Employees',
                  render: (item: any) => (
                    <Badge variant="default" className="bg-stone-100 text-stone-800 font-semibold">
                      {item.employeeCount ?? 0} members
                    </Badge>
                  ),
                },
                {
                  key: 'actions',
                  header: 'Actions',
                  render: (item: any) => (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingItem(item);
                          setDesigForm({
                            title: item.title,
                            code: item.code,
                            departmentId: item.departmentId || '',
                            level: item.level || 1,
                            description: item.description || '',
                          });
                          setFormError(null);
                          setIsDesigModalOpen(true);
                        }}
                      >
                        <Edit2 className="h-3.5 w-3.5 text-stone-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-rose-600 hover:text-rose-700"
                        onClick={() => handleDeactivateDesig(item.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ),
                },
              ]}
            />
          </div>
        )}

        {/* Modal: Branch */}
        <Dialog
          isOpen={isBranchModalOpen}
          onClose={() => setIsBranchModalOpen(false)}
          title={editingItem ? 'Edit Branch' : 'Add New Branch'}
          description="Manage physical office branch details and GPS geofence coordinates"
        >
          <form onSubmit={handleSaveBranch} className="space-y-4 pt-2">
            {formError && (
              <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-md">
                {formError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Branch Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Pune Innovation Hub"
                  value={branchForm.name}
                  onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Branch Code
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. PUN-01"
                  value={branchForm.code}
                  onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md uppercase focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">City</label>
                <input
                  type="text"
                  placeholder="e.g. Pune"
                  value={branchForm.city}
                  onChange={(e) => setBranchForm({ ...branchForm, city: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">State</label>
                <input
                  type="text"
                  placeholder="e.g. Maharashtra"
                  value={branchForm.state}
                  onChange={(e) => setBranchForm({ ...branchForm, state: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Latitude (Geofence)
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 18.5204"
                  value={branchForm.latitude}
                  onChange={(e) => setBranchForm({ ...branchForm, latitude: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Longitude (Geofence)
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 73.8567"
                  value={branchForm.longitude}
                  onChange={(e) => setBranchForm({ ...branchForm, longitude: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
              <Button type="button" variant="ghost" onClick={() => setIsBranchModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-amber-800 hover:bg-amber-900 text-white"
              >
                {submitting ? 'Saving...' : 'Save Branch'}
              </Button>
            </div>
          </form>
        </Dialog>

        {/* Modal: Department */}
        <Dialog
          isOpen={isDeptModalOpen}
          onClose={() => setIsDeptModalOpen(false)}
          title={editingItem ? 'Edit Department' : 'Add New Department'}
          description="Define functional units and strategic teams"
        >
          <form onSubmit={handleSaveDept} className="space-y-4 pt-2">
            {formError && (
              <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-md">
                {formError}
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Department Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Information Security"
                value={deptForm.name}
                onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Department Code
              </label>
              <input
                type="text"
                required
                placeholder="e.g. SEC"
                value={deptForm.code}
                onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md uppercase focus:outline-none focus:ring-1 focus:ring-amber-700"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Description</label>
              <textarea
                rows={3}
                placeholder="Responsibilities, scope and deliverables..."
                value={deptForm.description}
                onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
              <Button type="button" variant="ghost" onClick={() => setIsDeptModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-amber-800 hover:bg-amber-900 text-white"
              >
                {submitting ? 'Saving...' : 'Save Department'}
              </Button>
            </div>
          </form>
        </Dialog>

        {/* Modal: Designation */}
        <Dialog
          isOpen={isDesigModalOpen}
          onClose={() => setIsDesigModalOpen(false)}
          title={editingItem ? 'Edit Designation' : 'Add New Designation'}
          description="Configure job titles, levels, and department associations"
        >
          <form onSubmit={handleSaveDesig} className="space-y-4 pt-2">
            {formError && (
              <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-md">
                {formError}
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Designation Title
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Staff Security Engineer"
                value={desigForm.title}
                onChange={(e) => setDesigForm({ ...desigForm, title: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. STAFF-SEC"
                  value={desigForm.code}
                  onChange={(e) => setDesigForm({ ...desigForm, code: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md uppercase focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Level (1-10)
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={desigForm.level}
                  onChange={(e) => setDesigForm({ ...desigForm, level: Number(e.target.value) })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Department</label>
              <select
                value={desigForm.departmentId}
                onChange={(e) => setDesigForm({ ...desigForm, departmentId: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700 bg-white"
              >
                <option value="">General / All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.code})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
              <Button type="button" variant="ghost" onClick={() => setIsDesigModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-amber-800 hover:bg-amber-900 text-white"
              >
                {submitting ? 'Saving...' : 'Save Designation'}
              </Button>
            </div>
          </form>
        </Dialog>

        {/* Modal: Organization Details */}
        <Dialog
          isOpen={isOrgModalOpen}
          onClose={() => setIsOrgModalOpen(false)}
          title="Edit Organization Details"
          description="Update corporate identification, legal entity name and contact points"
        >
          <form onSubmit={handleSaveOrg} className="space-y-4 pt-2">
            {formError && (
              <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-md">
                {formError}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Company Name
                </label>
                <input
                  type="text"
                  required
                  value={orgForm.name}
                  onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Legal Registered Name
                </label>
                <input
                  type="text"
                  value={orgForm.legalName}
                  onChange={(e) => setOrgForm({ ...orgForm, legalName: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Official Email
                </label>
                <input
                  type="email"
                  value={orgForm.email}
                  onChange={(e) => setOrgForm({ ...orgForm, email: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  value={orgForm.phone}
                  onChange={(e) => setOrgForm({ ...orgForm, phone: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">City</label>
                <input
                  type="text"
                  value={orgForm.city}
                  onChange={(e) => setOrgForm({ ...orgForm, city: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Website</label>
                <input
                  type="text"
                  value={orgForm.website}
                  onChange={(e) => setOrgForm({ ...orgForm, website: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
              <Button type="button" variant="ghost" onClick={() => setIsOrgModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-amber-800 hover:bg-amber-900 text-white"
              >
                {submitting ? 'Saving...' : 'Save Organization'}
              </Button>
            </div>
          </form>
        </Dialog>
      </div>
    </AppShell>
  );
}
