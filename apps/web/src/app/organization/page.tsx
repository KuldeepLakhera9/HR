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
  EmptyState,
  ErrorState,
  LoadingState,
  Toast,
} from '@hrms/ui';
import {
  Building2,
  MapPin,
  Briefcase,
  Users,
  Plus,
  Edit2,
  Power,
  AlertTriangle,
  Globe,
  Mail,
  Phone,
  RefreshCw,
  CheckCircle2,
  Calendar,
  Layers,
  Filter as FilterIcon,
} from 'lucide-react';
import { organizationApi } from '../../lib/api-client';

type TabType = 'organization' | 'branches' | 'departments' | 'designations';
type StatusFilter = 'all' | 'active' | 'inactive';

interface ConfirmActionState {
  isOpen: boolean;
  type: 'branch' | 'department' | 'designation' | 'organization';
  action: 'activate' | 'deactivate';
  id: string;
  name: string;
  code?: string;
  warningNote?: string;
}

export default function OrganizationPage() {
  const [activeTab, setActiveTab] = useState<TabType>('organization');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Core Data
  const [organization, setOrganization] = useState<any>(null);
  const [branches, setBranches] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [designations, setDesignations] = useState<any[]>([]);

  // Search & Filter States
  const [branchSearch, setBranchSearch] = useState('');
  const [branchStatus, setBranchStatus] = useState<StatusFilter>('all');

  const [deptSearch, setDeptSearch] = useState('');
  const [deptStatus, setDeptStatus] = useState<StatusFilter>('all');

  const [desigSearch, setDesigSearch] = useState('');
  const [desigStatus, setDesigStatus] = useState<StatusFilter>('all');
  const [desigDeptFilter, setDesigDeptFilter] = useState<string>('all');

  // Modals
  const [isOrgModalOpen, setIsOrgModalOpen] = useState(false);
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [isDesigModalOpen, setIsDesigModalOpen] = useState(false);

  // Confirmation Dialog
  const [confirmDialog, setConfirmDialog] = useState<ConfirmActionState>({
    isOpen: false,
    type: 'branch',
    action: 'deactivate',
    id: '',
    name: '',
  });
  const [confirmReason, setConfirmReason] = useState('');
  const [actionSubmitting, setActionSubmitting] = useState(false);

  // Editing state & form error
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Toast feedback
  const [toast, setToast] = useState<{
    type: 'success' | 'error' | 'info';
    title: string;
    message?: string;
  } | null>(null);

  // Forms
  const [orgForm, setOrgForm] = useState({
    name: '',
    legalName: '',
    email: '',
    phone: '',
    website: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    country: 'India',
    postalCode: '',
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    fiscalYearStartMonth: 4,
  });

  const [branchForm, setBranchForm] = useState({
    name: '',
    code: '',
    addressLine1: '',
    city: '',
    state: '',
    country: 'India',
    timezone: 'Asia/Kolkata',
    latitude: '',
    longitude: '',
    geofenceRadiusMeters: 100,
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

  // Load Data
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [orgData, branchData, deptData, desigData] = await Promise.all([
        organizationApi.getCurrent(),
        organizationApi.getBranches({ status: 'all' }),
        organizationApi.getDepartments({ status: 'all' }),
        organizationApi.getDesignations({ status: 'all' }),
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
          addressLine1: orgData.addressLine1 || '',
          addressLine2: orgData.addressLine2 || '',
          city: orgData.city || '',
          state: orgData.state || '',
          country: orgData.country || 'India',
          postalCode: orgData.postalCode || '',
          timezone: orgData.timezone || 'Asia/Kolkata',
          currency: orgData.currency || 'INR',
          fiscalYearStartMonth: orgData.fiscalYearStartMonth || 4,
        });
      }
    } catch (err: any) {
      console.error('Failed to load organization data:', err);
      setError(err.message || 'Failed to load organization records. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const showToast = (type: 'success' | 'error' | 'info', title: string, message?: string) => {
    setToast({ type, title, message });
    setTimeout(() => setToast(null), 4000);
  };

  // ---------------------------------------------------------------------------
  // Handlers: Organization
  // ---------------------------------------------------------------------------
  const handleSaveOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await organizationApi.updateCurrent(orgForm);
      setIsOrgModalOpen(false);
      showToast('success', 'Organization updated', 'Changes have been saved successfully.');
      await loadData();
    } catch (err: any) {
      setFormError(err.message || 'Failed to update organization');
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Handlers: Branch
  // ---------------------------------------------------------------------------
  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const payload: any = {
        name: branchForm.name.trim(),
        code: branchForm.code.trim().toUpperCase(),
        addressLine1: branchForm.addressLine1.trim(),
        city: branchForm.city.trim(),
        state: branchForm.state.trim(),
        country: branchForm.country.trim(),
        timezone: branchForm.timezone,
        geofenceRadiusMeters: Number(branchForm.geofenceRadiusMeters) || 100,
        latitude: branchForm.latitude ? parseFloat(branchForm.latitude) : undefined,
        longitude: branchForm.longitude ? parseFloat(branchForm.longitude) : undefined,
      };

      if (editingItem) {
        await organizationApi.updateBranch(editingItem.id, payload);
        showToast('success', 'Branch updated', `${payload.name} was successfully updated.`);
      } else {
        await organizationApi.createBranch(payload);
        showToast('success', 'Branch created', `${payload.name} has been added.`);
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

  // ---------------------------------------------------------------------------
  // Handlers: Department
  // ---------------------------------------------------------------------------
  const handleSaveDept = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const payload = {
        name: deptForm.name.trim(),
        code: deptForm.code.trim().toUpperCase(),
        description: deptForm.description.trim() || undefined,
      };

      if (editingItem) {
        await organizationApi.updateDepartment(editingItem.id, payload);
        showToast('success', 'Department updated', `${payload.name} was successfully updated.`);
      } else {
        await organizationApi.createDepartment(payload);
        showToast('success', 'Department created', `${payload.name} has been added.`);
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

  // ---------------------------------------------------------------------------
  // Handlers: Designation
  // ---------------------------------------------------------------------------
  const handleSaveDesig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const payload: any = {
        title: desigForm.title.trim(),
        code: desigForm.code.trim().toUpperCase(),
        level: Number(desigForm.level),
        description: desigForm.description.trim() || undefined,
        departmentId: desigForm.departmentId || null,
      };

      if (editingItem) {
        await organizationApi.updateDesignation(editingItem.id, payload);
        showToast('success', 'Designation updated', `${payload.title} was successfully updated.`);
      } else {
        await organizationApi.createDesignation(payload);
        showToast('success', 'Designation created', `${payload.title} has been added.`);
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

  // ---------------------------------------------------------------------------
  // Handlers: Activation / Deactivation Confirmation Dialog
  // ---------------------------------------------------------------------------
  const promptConfirmAction = (
    type: 'branch' | 'department' | 'designation',
    action: 'activate' | 'deactivate',
    item: any,
  ) => {
    let warningNote = '';
    const empCount = item.employeeCount ?? 0;
    if (action === 'deactivate') {
      if (empCount > 0) {
        warningNote = `Notice: This entity currently has ${empCount} active employee${
          empCount > 1 ? 's' : ''
        } assigned. Deactivation will preserve all historical logs without physical deletion.`;
      } else {
        warningNote = 'Deactivation will hide this entity from new employee selection workflows.';
      }
    } else {
      warningNote = 'Activating will immediately re-enable this entity across the platform.';
    }

    setConfirmReason('');
    setConfirmDialog({
      isOpen: true,
      type,
      action,
      id: item.id,
      name: item.name || item.title,
      code: item.code,
      warningNote,
    });
  };

  const handleExecuteConfirmAction = async () => {
    setActionSubmitting(true);
    const { type, action, id, name } = confirmDialog;
    try {
      if (type === 'branch') {
        if (action === 'activate') {
          await organizationApi.activateBranch(id);
        } else {
          await organizationApi.deactivateBranch(id, confirmReason || undefined);
        }
      } else if (type === 'department') {
        if (action === 'activate') {
          await organizationApi.activateDepartment(id);
        } else {
          await organizationApi.deactivateDepartment(id, confirmReason || undefined);
        }
      } else if (type === 'designation') {
        if (action === 'activate') {
          await organizationApi.activateDesignation(id);
        } else {
          await organizationApi.deactivateDesignation(id, confirmReason || undefined);
        }
      }

      showToast(
        'success',
        `${type.charAt(0).toUpperCase() + type.slice(1)} ${
          action === 'activate' ? 'Activated' : 'Deactivated'
        }`,
        `${name} has been ${action === 'activate' ? 'activated' : 'deactivated'}.`,
      );
      setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
      await loadData();
    } catch (err: any) {
      showToast(
        'error',
        `Failed to ${action} ${type}`,
        err.message || 'The operation could not be completed.',
      );
    } finally {
      setActionSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Filtered Lists
  // ---------------------------------------------------------------------------
  const filteredBranches = branches.filter((b) => {
    const matchesSearch =
      b.name.toLowerCase().includes(branchSearch.toLowerCase()) ||
      b.code.toLowerCase().includes(branchSearch.toLowerCase()) ||
      (b.city && b.city.toLowerCase().includes(branchSearch.toLowerCase()));

    if (!matchesSearch) return false;
    if (branchStatus === 'active') return b.isActive;
    if (branchStatus === 'inactive') return !b.isActive;
    return true;
  });

  const filteredDepartments = departments.filter((d) => {
    const matchesSearch =
      d.name.toLowerCase().includes(deptSearch.toLowerCase()) ||
      d.code.toLowerCase().includes(deptSearch.toLowerCase()) ||
      (d.description && d.description.toLowerCase().includes(deptSearch.toLowerCase()));

    if (!matchesSearch) return false;
    if (deptStatus === 'active') return d.isActive;
    if (deptStatus === 'inactive') return !d.isActive;
    return true;
  });

  const filteredDesignations = designations.filter((d) => {
    const matchesSearch =
      d.title.toLowerCase().includes(desigSearch.toLowerCase()) ||
      d.code.toLowerCase().includes(desigSearch.toLowerCase());

    if (!matchesSearch) return false;
    if (desigStatus === 'active') return d.isActive;
    if (desigStatus === 'inactive') return !d.isActive;
    if (desigDeptFilter !== 'all' && d.departmentId !== desigDeptFilter) return false;
    return true;
  });

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Floating Toast Notification */}
        {toast && (
          <div className="fixed top-5 right-5 z-50 animate-fade-in">
            <Toast
              type={toast.type}
              title={toast.title}
              message={toast.message}
              onClose={() => setToast(null)}
            />
          </div>
        )}

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-stone-900">
              {organization?.name || 'Organization Structure'}
            </h1>
            <p className="text-xs md:text-sm text-stone-500 mt-1">
              Configure corporate identity, branch geofences, functional units, and role
              hierarchies.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={loading}
              className="border-stone-200 text-stone-700 hover:bg-stone-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-stone-200 text-stone-700 hover:bg-stone-50"
              onClick={() => {
                setFormError(null);
                setIsOrgModalOpen(true);
              }}
            >
              <Edit2 className="h-3.5 w-3.5 mr-1.5" />
              Edit Organization
            </Button>
          </div>
        </div>

        {/* Top KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            title="Total Branches"
            value={branches.length}
            description={`${branches.filter((b) => b.isActive).length} active geofences`}
            icon={<MapPin className="h-5 w-5 text-amber-700" />}
          />
          <KPICard
            title="Departments"
            value={departments.length}
            description={`${departments.filter((d) => d.isActive).length} active divisions`}
            icon={<Building2 className="h-5 w-5 text-amber-700" />}
          />
          <KPICard
            title="Designations"
            value={designations.length}
            description={`${designations.filter((d) => d.isActive).length} active levels`}
            icon={<Briefcase className="h-5 w-5 text-amber-700" />}
          />
          <KPICard
            title="Workforce Size"
            value={organization?.stats?.employeesCount ?? 8}
            description="Active employees registered"
            icon={<Users className="h-5 w-5 text-amber-700" />}
          />
        </div>

        {/* Global Loading / Error State Handling */}
        {error && !loading && (
          <ErrorState
            title="Unable to load organization records"
            message={error}
            onRetry={loadData}
          />
        )}

        {/* Navigation Tabs */}
        <div className="flex border-b border-stone-200 bg-white rounded-t-lg px-2 shadow-2xs">
          <button
            onClick={() => setActiveTab('organization')}
            className={`px-4 py-3 text-xs md:text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'organization'
                ? 'border-amber-800 text-amber-900 bg-amber-50/40'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <Building2 className="h-4 w-4" />
            Organization
          </button>
          <button
            onClick={() => setActiveTab('branches')}
            className={`px-4 py-3 text-xs md:text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'branches'
                ? 'border-amber-800 text-amber-900 bg-amber-50/40'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <MapPin className="h-4 w-4" />
            Branches ({branches.length})
          </button>
          <button
            onClick={() => setActiveTab('departments')}
            className={`px-4 py-3 text-xs md:text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'departments'
                ? 'border-amber-800 text-amber-900 bg-amber-50/40'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <Layers className="h-4 w-4" />
            Departments ({departments.length})
          </button>
          <button
            onClick={() => setActiveTab('designations')}
            className={`px-4 py-3 text-xs md:text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'designations'
                ? 'border-amber-800 text-amber-900 bg-amber-50/40'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <Briefcase className="h-4 w-4" />
            Designations ({designations.length})
          </button>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* TAB 1: ORGANIZATION PROFILE                                      */}
        {/* ----------------------------------------------------------------- */}
        {activeTab === 'organization' && (
          <div className="space-y-6">
            {loading ? (
              <LoadingState message="Loading organization profile..." />
            ) : !organization ? (
              <EmptyState
                title="No Organization Found"
                description="Initialize or configure your organization settings."
                action={{
                  label: 'Setup Organization',
                  onClick: () => setIsOrgModalOpen(true),
                }}
              />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Profile Info */}
                <div className="lg:col-span-2 space-y-6">
                  <Card className="border border-stone-200/80 bg-white shadow-xs">
                    <CardHeader className="flex flex-row items-center justify-between pb-3">
                      <div>
                        <CardTitle className="text-base font-semibold text-stone-900">
                          Corporate Profile
                        </CardTitle>
                        <CardDescription className="text-xs text-stone-500">
                          Registered legal entity details and operational headquarters
                        </CardDescription>
                      </div>
                      <Badge variant={organization.isActive ? 'success' : 'default'}>
                        {organization.isActive ? 'ACTIVE ENTITY' : 'INACTIVE'}
                      </Badge>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-1">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        <div className="p-3 bg-stone-50 rounded-lg border border-stone-100">
                          <span className="text-stone-400 uppercase tracking-wider block font-semibold text-[10px]">
                            Brand Name
                          </span>
                          <span className="text-stone-900 font-semibold text-sm mt-0.5 block">
                            {organization.name}
                          </span>
                        </div>
                        <div className="p-3 bg-stone-50 rounded-lg border border-stone-100">
                          <span className="text-stone-400 uppercase tracking-wider block font-semibold text-[10px]">
                            Legal Registered Name
                          </span>
                          <span className="text-stone-900 font-medium text-sm mt-0.5 block">
                            {organization.legalName || 'Same as Brand'}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                        <div className="flex items-center gap-2.5 p-3 rounded-lg border border-stone-100">
                          <Mail className="h-4 w-4 text-stone-400 shrink-0" />
                          <div className="truncate">
                            <span className="text-stone-400 block text-[10px] uppercase font-semibold">
                              Official Email
                            </span>
                            <span className="text-stone-800 font-medium truncate block">
                              {organization.email || 'Not configured'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5 p-3 rounded-lg border border-stone-100">
                          <Phone className="h-4 w-4 text-stone-400 shrink-0" />
                          <div className="truncate">
                            <span className="text-stone-400 block text-[10px] uppercase font-semibold">
                              Direct Contact
                            </span>
                            <span className="text-stone-800 font-medium truncate block">
                              {organization.phone || 'Not configured'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5 p-3 rounded-lg border border-stone-100">
                          <Globe className="h-4 w-4 text-stone-400 shrink-0" />
                          <div className="truncate">
                            <span className="text-stone-400 block text-[10px] uppercase font-semibold">
                              Web Portal
                            </span>
                            {organization.website ? (
                              <a
                                href={organization.website}
                                target="_blank"
                                rel="noreferrer"
                                className="text-amber-800 hover:underline font-medium truncate block"
                              >
                                {organization.website}
                              </a>
                            ) : (
                              <span className="text-stone-400 block">Not configured</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="p-3 bg-stone-50/70 rounded-lg border border-stone-100 text-xs">
                        <span className="text-stone-400 uppercase tracking-wider block font-semibold text-[10px] mb-1">
                          Headquarters Address
                        </span>
                        <p className="text-stone-800 leading-relaxed font-medium">
                          {[
                            organization.addressLine1,
                            organization.addressLine2,
                            organization.city,
                            organization.state,
                            organization.postalCode,
                            organization.country,
                          ]
                            .filter(Boolean)
                            .join(', ') || 'No physical address specified'}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Financial & Regional Configurations */}
                  <Card className="border border-stone-200/80 bg-white shadow-xs">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base font-semibold text-stone-900">
                        Operational Settings
                      </CardTitle>
                      <CardDescription className="text-xs text-stone-500">
                        Timezones, fiscal year conventions, and currency localization
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs pt-1">
                      <div className="p-3 rounded-lg border border-stone-100 bg-stone-50/50">
                        <span className="text-stone-400 uppercase text-[10px] font-semibold block">
                          Operating Timezone
                        </span>
                        <span className="text-stone-900 font-semibold mt-1 block">
                          {organization.timezone || 'Asia/Kolkata'}
                        </span>
                      </div>
                      <div className="p-3 rounded-lg border border-stone-100 bg-stone-50/50">
                        <span className="text-stone-400 uppercase text-[10px] font-semibold block">
                          Default Currency
                        </span>
                        <span className="text-stone-900 font-semibold mt-1 block">
                          {organization.currency || 'INR'}
                        </span>
                      </div>
                      <div className="p-3 rounded-lg border border-stone-100 bg-stone-50/50">
                        <span className="text-stone-400 uppercase text-[10px] font-semibold block">
                          Fiscal Year Start
                        </span>
                        <span className="text-stone-900 font-semibold mt-1 block flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-amber-700" />
                          Month {organization.fiscalYearStartMonth || 4} (April)
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Right Side Overview Summary */}
                <div className="space-y-6">
                  <Card className="border border-stone-200/80 bg-white shadow-xs">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold text-stone-900">
                        Structural Overview
                      </CardTitle>
                      <CardDescription className="text-xs text-stone-500">
                        Distribution across modules
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-2">
                      <div className="flex items-center justify-between p-2.5 rounded-lg border border-stone-100 bg-stone-50/60">
                        <span className="text-xs text-stone-600 font-medium">Branch Locations</span>
                        <Badge variant="outline" className="font-semibold text-stone-800">
                          {branches.length} Registered
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between p-2.5 rounded-lg border border-stone-100 bg-stone-50/60">
                        <span className="text-xs text-stone-600 font-medium">Departments</span>
                        <Badge variant="outline" className="font-semibold text-stone-800">
                          {departments.length} Units
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between p-2.5 rounded-lg border border-stone-100 bg-stone-50/60">
                        <span className="text-xs text-stone-600 font-medium">Role Bands</span>
                        <Badge variant="outline" className="font-semibold text-stone-800">
                          {designations.length} Tiers
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between p-2.5 rounded-lg border border-stone-100 bg-stone-50/60">
                        <span className="text-xs text-stone-600 font-medium">System Status</span>
                        <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Healthy & Ready
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/50 space-y-2">
                    <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                      Workforce Geofencing Ready
                    </h4>
                    <p className="text-xs text-amber-800 leading-relaxed">
                      Branch coordinates and geofence radii configured in this module will
                      automatically govern Phase 4 Attendance checking and physical check-in
                      validation.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* TAB 2: BRANCHES                                                   */}
        {/* ----------------------------------------------------------------- */}
        {activeTab === 'branches' && (
          <div className="space-y-4">
            {/* Action Bar */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-white p-3 rounded-xl border border-stone-200 shadow-2xs">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto">
                <Search
                  placeholder="Search branch name, code, city..."
                  value={branchSearch}
                  onChange={(val) => setBranchSearch(val)}
                  className="w-full sm:w-64"
                />
                <div className="flex items-center gap-1.5 text-xs text-stone-500 font-medium shrink-0">
                  <FilterIcon className="h-3.5 w-3.5" />
                  <select
                    value={branchStatus}
                    onChange={(e) => setBranchStatus(e.target.value as StatusFilter)}
                    className="h-9 px-2.5 rounded-lg border border-stone-200 bg-white text-xs font-medium text-stone-700 focus:outline-none focus:ring-1 focus:ring-amber-700"
                  >
                    <option value="all">All Statuses ({branches.length})</option>
                    <option value="active">
                      Active Only ({branches.filter((b) => b.isActive).length})
                    </option>
                    <option value="inactive">
                      Inactive Only ({branches.filter((b) => !b.isActive).length})
                    </option>
                  </select>
                </div>
              </div>
              <Button
                className="bg-amber-800 hover:bg-amber-900 text-white shrink-0 w-full md:w-auto"
                onClick={() => {
                  setEditingItem(null);
                  setBranchForm({
                    name: '',
                    code: '',
                    addressLine1: '',
                    city: '',
                    state: '',
                    country: 'India',
                    timezone: 'Asia/Kolkata',
                    latitude: '',
                    longitude: '',
                    geofenceRadiusMeters: 100,
                  });
                  setFormError(null);
                  setIsBranchModalOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Add Branch
              </Button>
            </div>

            {loading ? (
              <LoadingState message="Loading branch locations..." />
            ) : filteredBranches.length === 0 ? (
              <EmptyState
                title={
                  branchSearch || branchStatus !== 'all'
                    ? 'No matching branches'
                    : 'No Branches Configured'
                }
                description={
                  branchSearch || branchStatus !== 'all'
                    ? 'Try adjusting your search query or status filter to see branch results.'
                    : 'Get started by creating your primary office or hub location.'
                }
                action={
                  branchSearch || branchStatus !== 'all'
                    ? {
                        label: 'Reset Filters',
                        onClick: () => {
                          setBranchSearch('');
                          setBranchStatus('all');
                        },
                      }
                    : {
                        label: 'Add First Branch',
                        onClick: () => {
                          setEditingItem(null);
                          setBranchForm({
                            name: '',
                            code: '',
                            addressLine1: '',
                            city: '',
                            state: '',
                            country: 'India',
                            timezone: 'Asia/Kolkata',
                            latitude: '',
                            longitude: '',
                            geofenceRadiusMeters: 100,
                          });
                          setIsBranchModalOpen(true);
                        },
                      }
                }
              />
            ) : (
              <DataTable
                data={filteredBranches}
                columns={[
                  {
                    key: 'code',
                    header: 'Branch Code',
                    render: (item: any) => (
                      <span className="font-mono text-xs font-semibold text-stone-900 px-2 py-0.5 bg-stone-100 rounded border border-stone-200">
                        {item.code}
                      </span>
                    ),
                  },
                  {
                    key: 'name',
                    header: 'Branch Name',
                    render: (item: any) => (
                      <div>
                        <div className="font-semibold text-stone-900 text-xs sm:text-sm">
                          {item.name}
                        </div>
                        <div className="text-[11px] text-stone-500 flex items-center gap-1 mt-0.5">
                          <MapPin className="h-3 w-3 text-stone-400" />
                          {[item.city, item.state, item.country].filter(Boolean).join(', ')}
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: 'geofence',
                    header: 'Geofence Coordinates',
                    render: (item: any) => {
                      const lat = item.latitude ?? item.geofenceLat;
                      const lng = item.longitude ?? item.geofenceLng;
                      const radius = item.geofenceRadiusMeters ?? 100;
                      return (
                        <div className="text-xs">
                          {lat && lng ? (
                            <div>
                              <span className="font-mono text-[11px] text-stone-700 block">
                                {Number(lat).toFixed(4)}°, {Number(lng).toFixed(4)}°
                              </span>
                              <span className="text-[10px] text-stone-400 block mt-0.5">
                                Radius: {radius}m
                              </span>
                            </div>
                          ) : (
                            <span className="text-stone-400 italic text-xs">Unspecified</span>
                          )}
                        </div>
                      );
                    },
                  },
                  {
                    key: 'employees',
                    header: 'Assigned Workforce',
                    render: (item: any) => (
                      <Badge
                        variant="default"
                        className="bg-stone-100 text-stone-800 font-semibold text-xs"
                      >
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
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Edit Branch"
                          onClick={() => {
                            setEditingItem(item);
                            setBranchForm({
                              name: item.name,
                              code: item.code,
                              addressLine1: item.addressLine1 || '',
                              city: item.city || '',
                              state: item.state || '',
                              country: item.country || 'India',
                              timezone: item.timezone || 'Asia/Kolkata',
                              latitude: (item.latitude ?? item.geofenceLat)?.toString() || '',
                              longitude: (item.longitude ?? item.geofenceLng)?.toString() || '',
                              geofenceRadiusMeters: item.geofenceRadiusMeters ?? 100,
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
                          title={item.isActive ? 'Deactivate Branch' : 'Activate Branch'}
                          className={
                            item.isActive
                              ? 'text-rose-600 hover:text-rose-700 hover:bg-rose-50'
                              : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
                          }
                          onClick={() =>
                            promptConfirmAction(
                              'branch',
                              item.isActive ? 'deactivate' : 'activate',
                              item,
                            )
                          }
                        >
                          <Power className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ),
                  },
                ]}
              />
            )}
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* TAB 3: DEPARTMENTS                                                */}
        {/* ----------------------------------------------------------------- */}
        {activeTab === 'departments' && (
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-white p-3 rounded-xl border border-stone-200 shadow-2xs">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto">
                <Search
                  placeholder="Search department name or code..."
                  value={deptSearch}
                  onChange={(val) => setDeptSearch(val)}
                  className="w-full sm:w-64"
                />
                <div className="flex items-center gap-1.5 text-xs text-stone-500 font-medium shrink-0">
                  <FilterIcon className="h-3.5 w-3.5" />
                  <select
                    value={deptStatus}
                    onChange={(e) => setDeptStatus(e.target.value as StatusFilter)}
                    className="h-9 px-2.5 rounded-lg border border-stone-200 bg-white text-xs font-medium text-stone-700 focus:outline-none focus:ring-1 focus:ring-amber-700"
                  >
                    <option value="all">All Statuses ({departments.length})</option>
                    <option value="active">
                      Active Only ({departments.filter((d) => d.isActive).length})
                    </option>
                    <option value="inactive">
                      Inactive Only ({departments.filter((d) => !d.isActive).length})
                    </option>
                  </select>
                </div>
              </div>
              <Button
                className="bg-amber-800 hover:bg-amber-900 text-white shrink-0 w-full md:w-auto"
                onClick={() => {
                  setEditingItem(null);
                  setDeptForm({ name: '', code: '', description: '' });
                  setFormError(null);
                  setIsDeptModalOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Add Department
              </Button>
            </div>

            {loading ? (
              <LoadingState message="Loading departments..." />
            ) : filteredDepartments.length === 0 ? (
              <EmptyState
                title={
                  deptSearch || deptStatus !== 'all'
                    ? 'No matching departments'
                    : 'No Departments Found'
                }
                description={
                  deptSearch || deptStatus !== 'all'
                    ? 'Adjust your search or filter settings to view departments.'
                    : 'Create your organization departments to organize workforce teams.'
                }
                action={
                  deptSearch || deptStatus !== 'all'
                    ? {
                        label: 'Reset Filters',
                        onClick: () => {
                          setDeptSearch('');
                          setDeptStatus('all');
                        },
                      }
                    : {
                        label: 'Add First Department',
                        onClick: () => {
                          setEditingItem(null);
                          setDeptForm({ name: '', code: '', description: '' });
                          setIsDeptModalOpen(true);
                        },
                      }
                }
              />
            ) : (
              <DataTable
                data={filteredDepartments}
                columns={[
                  {
                    key: 'code',
                    header: 'Code',
                    render: (item: any) => (
                      <span className="font-mono text-xs font-semibold text-stone-900 px-2 py-0.5 bg-stone-100 rounded border border-stone-200">
                        {item.code}
                      </span>
                    ),
                  },
                  {
                    key: 'name',
                    header: 'Department Name',
                    render: (item: any) => (
                      <div>
                        <div className="font-semibold text-stone-900 text-xs sm:text-sm">
                          {item.name}
                        </div>
                        <div className="text-[11px] text-stone-500 line-clamp-1 mt-0.5">
                          {item.description || 'No description provided'}
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: 'head',
                    header: 'Department Head',
                    render: (item: any) =>
                      item.departmentHead ? (
                        <div className="text-xs">
                          <span className="font-medium text-stone-900 block">
                            {item.departmentHead.displayName ||
                              `${item.departmentHead.firstName} ${item.departmentHead.lastName}`}
                          </span>
                          <span className="text-[10px] text-stone-400 block">
                            {item.departmentHead.email}
                          </span>
                        </div>
                      ) : (
                        <span className="text-stone-400 italic text-xs">Unassigned</span>
                      ),
                  },
                  {
                    key: 'designations',
                    header: 'Designations',
                    render: (item: any) => (
                      <span className="text-xs font-medium text-stone-700">
                        {item._count?.designations ??
                          designations.filter((d) => d.departmentId === item.id).length}{' '}
                        roles
                      </span>
                    ),
                  },
                  {
                    key: 'employees',
                    header: 'Members',
                    render: (item: any) => (
                      <Badge
                        variant="default"
                        className="bg-stone-100 text-stone-800 font-semibold text-xs"
                      >
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
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Edit Department"
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
                          title={item.isActive ? 'Deactivate Department' : 'Activate Department'}
                          className={
                            item.isActive
                              ? 'text-rose-600 hover:text-rose-700 hover:bg-rose-50'
                              : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
                          }
                          onClick={() =>
                            promptConfirmAction(
                              'department',
                              item.isActive ? 'deactivate' : 'activate',
                              item,
                            )
                          }
                        >
                          <Power className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ),
                  },
                ]}
              />
            )}
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* TAB 4: DESIGNATIONS                                               */}
        {/* ----------------------------------------------------------------- */}
        {activeTab === 'designations' && (
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-white p-3 rounded-xl border border-stone-200 shadow-2xs">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto flex-wrap">
                <Search
                  placeholder="Search designation title or code..."
                  value={desigSearch}
                  onChange={(val) => setDesigSearch(val)}
                  className="w-full sm:w-56"
                />
                <div className="flex items-center gap-1.5 text-xs text-stone-500 font-medium shrink-0">
                  <span className="text-[11px] uppercase font-semibold text-stone-400">Dept:</span>
                  <select
                    value={desigDeptFilter}
                    onChange={(e) => setDesigDeptFilter(e.target.value)}
                    className="h-9 px-2.5 rounded-lg border border-stone-200 bg-white text-xs font-medium text-stone-700 focus:outline-none focus:ring-1 focus:ring-amber-700 max-w-[160px]"
                  >
                    <option value="all">All Departments</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-stone-500 font-medium shrink-0">
                  <FilterIcon className="h-3.5 w-3.5" />
                  <select
                    value={desigStatus}
                    onChange={(e) => setDesigStatus(e.target.value as StatusFilter)}
                    className="h-9 px-2.5 rounded-lg border border-stone-200 bg-white text-xs font-medium text-stone-700 focus:outline-none focus:ring-1 focus:ring-amber-700"
                  >
                    <option value="all">All Statuses ({designations.length})</option>
                    <option value="active">
                      Active Only ({designations.filter((d) => d.isActive).length})
                    </option>
                    <option value="inactive">
                      Inactive Only ({designations.filter((d) => !d.isActive).length})
                    </option>
                  </select>
                </div>
              </div>
              <Button
                className="bg-amber-800 hover:bg-amber-900 text-white shrink-0 w-full md:w-auto"
                onClick={() => {
                  setEditingItem(null);
                  setDesigForm({
                    title: '',
                    code: '',
                    departmentId: departments[0]?.id || '',
                    level: 1,
                    description: '',
                  });
                  setFormError(null);
                  setIsDesigModalOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Add Designation
              </Button>
            </div>

            {loading ? (
              <LoadingState message="Loading designations..." />
            ) : filteredDesignations.length === 0 ? (
              <EmptyState
                title={
                  desigSearch || desigStatus !== 'all' || desigDeptFilter !== 'all'
                    ? 'No matching designations'
                    : 'No Designations Configured'
                }
                description={
                  desigSearch || desigStatus !== 'all' || desigDeptFilter !== 'all'
                    ? 'Try relaxing your filter criteria or search keyword.'
                    : 'Configure role titles, hierarchy levels, and job bands.'
                }
                action={
                  desigSearch || desigStatus !== 'all' || desigDeptFilter !== 'all'
                    ? {
                        label: 'Reset Filters',
                        onClick: () => {
                          setDesigSearch('');
                          setDesigStatus('all');
                          setDesigDeptFilter('all');
                        },
                      }
                    : {
                        label: 'Add First Designation',
                        onClick: () => {
                          setEditingItem(null);
                          setDesigForm({
                            title: '',
                            code: '',
                            departmentId: departments[0]?.id || '',
                            level: 1,
                            description: '',
                          });
                          setIsDesigModalOpen(true);
                        },
                      }
                }
              />
            ) : (
              <DataTable
                data={filteredDesignations}
                columns={[
                  {
                    key: 'code',
                    header: 'Code',
                    render: (item: any) => (
                      <span className="font-mono text-xs font-semibold text-stone-900 px-2 py-0.5 bg-stone-100 rounded border border-stone-200">
                        {item.code}
                      </span>
                    ),
                  },
                  {
                    key: 'title',
                    header: 'Designation Title',
                    render: (item: any) => (
                      <div>
                        <div className="font-semibold text-stone-900 text-xs sm:text-sm">
                          {item.title}
                        </div>
                        <div className="text-[11px] text-stone-500 line-clamp-1 mt-0.5">
                          {item.description || 'Standard role level'}
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: 'department',
                    header: 'Department',
                    render: (item: any) => (
                      <span className="text-xs font-medium text-stone-700">
                        {item.department?.name || 'General / All'}
                      </span>
                    ),
                  },
                  {
                    key: 'level',
                    header: 'Band / Level',
                    render: (item: any) => (
                      <Badge variant="outline" className="text-amber-800 border-amber-200 text-xs">
                        Level {item.level ?? 1}
                      </Badge>
                    ),
                  },
                  {
                    key: 'employees',
                    header: 'Holders',
                    render: (item: any) => (
                      <Badge
                        variant="default"
                        className="bg-stone-100 text-stone-800 font-semibold text-xs"
                      >
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
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Edit Designation"
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
                          title={item.isActive ? 'Deactivate Designation' : 'Activate Designation'}
                          className={
                            item.isActive
                              ? 'text-rose-600 hover:text-rose-700 hover:bg-rose-50'
                              : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
                          }
                          onClick={() =>
                            promptConfirmAction(
                              'designation',
                              item.isActive ? 'deactivate' : 'activate',
                              item,
                            )
                          }
                        >
                          <Power className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ),
                  },
                ]}
              />
            )}
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* MODAL 1: ORGANIZATION DETAILS                                     */}
        {/* ----------------------------------------------------------------- */}
        <Dialog
          isOpen={isOrgModalOpen}
          onClose={() => setIsOrgModalOpen(false)}
          title="Edit Organization Profile"
          description="Update primary corporate identification, headquarters and operating conventions"
          maxWidth="lg"
        >
          <form onSubmit={handleSaveOrg} className="space-y-4 pt-2">
            {formError && (
              <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg">
                {formError}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Brand / Trade Name *
                </label>
                <input
                  type="text"
                  required
                  value={orgForm.name}
                  onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Legal Registered Entity Name
                </label>
                <input
                  type="text"
                  value={orgForm.legalName}
                  onChange={(e) => setOrgForm({ ...orgForm, legalName: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Official Email
                </label>
                <input
                  type="email"
                  value={orgForm.email}
                  onChange={(e) => setOrgForm({ ...orgForm, email: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700"
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
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Website URL
                </label>
                <input
                  type="text"
                  value={orgForm.website}
                  onChange={(e) => setOrgForm({ ...orgForm, website: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Head Office Address
              </label>
              <input
                type="text"
                placeholder="Address line 1..."
                value={orgForm.addressLine1}
                onChange={(e) => setOrgForm({ ...orgForm, addressLine1: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">City</label>
                <input
                  type="text"
                  value={orgForm.city}
                  onChange={(e) => setOrgForm({ ...orgForm, city: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">State</label>
                <input
                  type="text"
                  value={orgForm.state}
                  onChange={(e) => setOrgForm({ ...orgForm, state: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Postal Code
                </label>
                <input
                  type="text"
                  value={orgForm.postalCode}
                  onChange={(e) => setOrgForm({ ...orgForm, postalCode: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Country</label>
                <input
                  type="text"
                  value={orgForm.country}
                  onChange={(e) => setOrgForm({ ...orgForm, country: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-stone-100">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Timezone</label>
                <input
                  type="text"
                  value={orgForm.timezone}
                  onChange={(e) => setOrgForm({ ...orgForm, timezone: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Currency</label>
                <input
                  type="text"
                  value={orgForm.currency}
                  onChange={(e) => setOrgForm({ ...orgForm, currency: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Fiscal Start Month
                </label>
                <select
                  value={orgForm.fiscalYearStartMonth}
                  onChange={(e) =>
                    setOrgForm({ ...orgForm, fiscalYearStartMonth: Number(e.target.value) })
                  }
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700 bg-white"
                >
                  <option value={1}>January (1)</option>
                  <option value={4}>April (4 - Standard)</option>
                  <option value={7}>July (7)</option>
                  <option value={10}>October (10)</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
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

        {/* ----------------------------------------------------------------- */}
        {/* MODAL 2: BRANCH (CREATE / EDIT)                                   */}
        {/* ----------------------------------------------------------------- */}
        <Dialog
          isOpen={isBranchModalOpen}
          onClose={() => setIsBranchModalOpen(false)}
          title={editingItem ? 'Edit Branch' : 'Add New Branch'}
          description="Manage physical office branch details and geofence coordinates for automated attendance"
          maxWidth="lg"
        >
          <form onSubmit={handleSaveBranch} className="space-y-4 pt-2">
            {formError && (
              <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg">
                {formError}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Branch Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Pune Innovation Hub"
                  value={branchForm.name}
                  onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Branch Code *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. PUN-01"
                  value={branchForm.code}
                  onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg uppercase focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Street Address
              </label>
              <input
                type="text"
                placeholder="e.g. Magarpatta Cybercity, Tower 7"
                value={branchForm.addressLine1}
                onChange={(e) => setBranchForm({ ...branchForm, addressLine1: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">City</label>
                <input
                  type="text"
                  placeholder="e.g. Pune"
                  value={branchForm.city}
                  onChange={(e) => setBranchForm({ ...branchForm, city: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">State</label>
                <input
                  type="text"
                  placeholder="e.g. Maharashtra"
                  value={branchForm.state}
                  onChange={(e) => setBranchForm({ ...branchForm, state: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Country</label>
                <input
                  type="text"
                  placeholder="e.g. India"
                  value={branchForm.country}
                  onChange={(e) => setBranchForm({ ...branchForm, country: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>
            </div>

            <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-200/80 space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                <MapPin className="h-4 w-4 text-amber-700" />
                Attendance Geofencing Coordinates
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                    Latitude (-90 to 90)
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="18.5204"
                    value={branchForm.latitude}
                    onChange={(e) => setBranchForm({ ...branchForm, latitude: e.target.value })}
                    className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                    Longitude (-180 to 180)
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="73.8567"
                    value={branchForm.longitude}
                    onChange={(e) => setBranchForm({ ...branchForm, longitude: e.target.value })}
                    className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-stone-700 mb-1">
                    Radius (Meters)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={5000}
                    value={branchForm.geofenceRadiusMeters}
                    onChange={(e) =>
                      setBranchForm({ ...branchForm, geofenceRadiusMeters: Number(e.target.value) })
                    }
                    className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700 bg-white"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
              <Button type="button" variant="ghost" onClick={() => setIsBranchModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-amber-800 hover:bg-amber-900 text-white"
              >
                {submitting ? 'Saving...' : editingItem ? 'Update Branch' : 'Create Branch'}
              </Button>
            </div>
          </form>
        </Dialog>

        {/* ----------------------------------------------------------------- */}
        {/* MODAL 3: DEPARTMENT (CREATE / EDIT)                               */}
        {/* ----------------------------------------------------------------- */}
        <Dialog
          isOpen={isDeptModalOpen}
          onClose={() => setIsDeptModalOpen(false)}
          title={editingItem ? 'Edit Department' : 'Add New Department'}
          description="Define functional units and strategic teams"
          maxWidth="md"
        >
          <form onSubmit={handleSaveDept} className="space-y-4 pt-2">
            {formError && (
              <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg">
                {formError}
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Department Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Information Technology"
                value={deptForm.name}
                onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Department Code *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. IT"
                value={deptForm.code}
                onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg uppercase focus:outline-none focus:ring-1 focus:ring-amber-700"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Description</label>
              <textarea
                rows={3}
                placeholder="Responsibilities, scope, and deliverables..."
                value={deptForm.description}
                onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700"
              />
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
              <Button type="button" variant="ghost" onClick={() => setIsDeptModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-amber-800 hover:bg-amber-900 text-white"
              >
                {submitting ? 'Saving...' : editingItem ? 'Update Department' : 'Create Department'}
              </Button>
            </div>
          </form>
        </Dialog>

        {/* ----------------------------------------------------------------- */}
        {/* MODAL 4: DESIGNATION (CREATE / EDIT)                              */}
        {/* ----------------------------------------------------------------- */}
        <Dialog
          isOpen={isDesigModalOpen}
          onClose={() => setIsDesigModalOpen(false)}
          title={editingItem ? 'Edit Designation' : 'Add New Designation'}
          description="Configure job titles, levels, and department associations"
          maxWidth="md"
        >
          <form onSubmit={handleSaveDesig} className="space-y-4 pt-2">
            {formError && (
              <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg">
                {formError}
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Designation Title *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Lead Software Architect"
                value={desigForm.title}
                onChange={(e) => setDesigForm({ ...desigForm, title: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Designation Code *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ARCH-01"
                  value={desigForm.code}
                  onChange={(e) => setDesigForm({ ...desigForm, code: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg uppercase focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Level Band (1 - 10) *
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  required
                  value={desigForm.level}
                  onChange={(e) => setDesigForm({ ...desigForm, level: Number(e.target.value) })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Department</label>
              <select
                value={desigForm.departmentId}
                onChange={(e) => setDesigForm({ ...desigForm, departmentId: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700 bg-white"
              >
                <option value="">General / All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Description</label>
              <textarea
                rows={2}
                placeholder="Scope of work, seniority requirements..."
                value={desigForm.description}
                onChange={(e) => setDesigForm({ ...desigForm, description: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700"
              />
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
              <Button type="button" variant="ghost" onClick={() => setIsDesigModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-amber-800 hover:bg-amber-900 text-white"
              >
                {submitting
                  ? 'Saving...'
                  : editingItem
                    ? 'Update Designation'
                    : 'Create Designation'}
              </Button>
            </div>
          </form>
        </Dialog>

        {/* ----------------------------------------------------------------- */}
        {/* CONFIRMATION DIALOG: ACTIVATE / DEACTIVATE                        */}
        {/* ----------------------------------------------------------------- */}
        <Dialog
          isOpen={confirmDialog.isOpen}
          onClose={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
          title={`Confirm ${confirmDialog.action === 'activate' ? 'Activation' : 'Deactivation'}`}
          description={`Please verify this organizational state change`}
          maxWidth="sm"
        >
          <div className="space-y-4 pt-2">
            <div className="flex items-start gap-3 p-3 bg-amber-50/70 border border-amber-200 rounded-xl">
              <AlertTriangle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900">
                <p className="font-semibold">
                  {confirmDialog.action === 'activate' ? 'Activate' : 'Deactivate'}{' '}
                  {confirmDialog.type}: <span className="underline">{confirmDialog.name}</span>
                </p>
                {confirmDialog.warningNote && (
                  <p className="mt-1 text-stone-600 leading-relaxed">{confirmDialog.warningNote}</p>
                )}
              </div>
            </div>

            {confirmDialog.action === 'deactivate' && (
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Reason for Deactivation (Optional Audit Note)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Office consolidation, department merger..."
                  value={confirmReason}
                  onChange={(e) => setConfirmReason(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
              <Button
                type="button"
                variant="ghost"
                disabled={actionSubmitting}
                onClick={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={actionSubmitting}
                className={
                  confirmDialog.action === 'activate'
                    ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
                    : 'bg-rose-700 hover:bg-rose-800 text-white'
                }
                onClick={handleExecuteConfirmAction}
              >
                {actionSubmitting
                  ? 'Processing...'
                  : confirmDialog.action === 'activate'
                    ? 'Confirm Activate'
                    : 'Confirm Deactivate'}
              </Button>
            </div>
          </div>
        </Dialog>
      </div>
    </AppShell>
  );
}
