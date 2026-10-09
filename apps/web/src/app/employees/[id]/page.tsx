'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '../../../layouts/AppShell';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Badge,
  Avatar,
  Dialog,
} from '@hrms/ui';
import {
  User,
  Briefcase,
  Mail,
  Phone,
  Calendar,
  Building2,
  MapPin,
  Clock,
  FileText,
  History,
  ShieldCheck,
  Edit2,
  UserCheck,
  ArrowLeft,
  AlertTriangle,
  Lock,
  Plus,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  HelpCircle,
  Share2,
} from 'lucide-react';
import { employeesApi, organizationApi } from '../../../lib/api-client';
import { useAuth } from '../../../context/AuthContext';
import { EmployeeHistoryTimeline } from '../../../components/employees/EmployeeHistoryTimeline';

// Valid lifecycle transitions according to Phase 3 Step 7 state machine
const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  PROBATION: ['ACTIVE', 'TERMINATED', 'RESIGNED'],
  ACTIVE: ['ON_NOTICE', 'RESIGNED', 'TERMINATED'],
  ON_NOTICE: ['EXITED', 'ACTIVE', 'TERMINATED'],
  RESIGNED: ['EXITED', 'ACTIVE', 'ON_NOTICE'],
  TERMINATED: ['EXITED'],
  EXITED: [],
};

export default function EmployeeProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { user: authUser, hasRole, hasPermission } = useAuth();
  const employeeId = params.id as string;

  const [activeTab, setActiveTab] = useState<
    'overview' | 'employment' | 'contact' | 'documents' | 'history'
  >('overview');
  const [employee, setEmployee] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isForbidden, setIsForbidden] = useState(false);

  // Status transition modal state
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [targetStatus, setTargetStatus] = useState('ACTIVE');
  const [statusReason, setStatusReason] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [statusSubmitting, setStatusSubmitting] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Edit modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [branches, setBranches] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [designations, setDesignations] = useState<any[]>([]);
  const [managers, setManagers] = useState<any[]>([]);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Add Emergency Contact modal state
  const [isEmergencyContactModalOpen, setIsEmergencyContactModalOpen] = useState(false);
  const [emergencyForm, setEmergencyForm] = useState({
    name: '',
    relationship: 'Spouse',
    phone: '',
    alternatePhone: '',
    address: '',
    isPrimary: false,
  });
  const [emergencySubmitting, setEmergencySubmitting] = useState(false);

  // Load employee profile
  const loadEmployee = useCallback(async () => {
    setLoading(true);
    setError(null);
    setIsForbidden(false);
    try {
      const data = await employeesApi.findOne(employeeId);
      setEmployee(data);
    } catch (err: any) {
      if (err.message?.includes('Access denied') || err.message?.includes('403')) {
        setIsForbidden(true);
      } else {
        setError(err.message || 'Failed to load employee profile');
      }
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    loadEmployee();
  }, [loadEmployee]);

  // Role permissions computation
  const isAdminOrHr = Boolean(hasRole(['ADMIN', 'HR']) || hasPermission('EMPLOYEE_MANAGE'));
  const isManager = Boolean(hasRole('MANAGER'));
  const isSelf = Boolean(
    authUser &&
    employee &&
    (authUser.id === employee.userId || authUser.employeeCode === employee.employeeCode),
  );

  // Who can edit this profile
  const canEditOrganization = isAdminOrHr;
  const canEditPersonalContact = isAdminOrHr || isSelf;
  const canChangeStatus = isAdminOrHr && employee?.status !== 'EXITED';

  // Valid status transitions for the current employee
  const availableTransitions = useMemo(() => {
    if (!employee?.status) return [];
    return VALID_STATUS_TRANSITIONS[employee.status] || [];
  }, [employee?.status]);

  // Load dropdown lookups for editing
  const loadLookupsForEdit = async () => {
    if (!isAdminOrHr) return;
    try {
      const [brs, depts, desigs, emps] = await Promise.all([
        organizationApi.getBranches({ status: 'active' }),
        organizationApi.getDepartments({ status: 'active' }),
        organizationApi.getDesignations({ status: 'active' }),
        employeesApi.findAll({ limit: 100 }),
      ]);
      setBranches(brs || []);
      setDepartments(depts || []);
      setDesignations(desigs || []);
      setManagers((emps?.items || []).filter((e: any) => e.id !== employeeId));
    } catch (err) {
      console.error('Failed to load edit lookups:', err);
    }
  };

  const handleOpenEdit = async () => {
    if (canEditOrganization) {
      await loadLookupsForEdit();
    }
    setEditForm({
      firstName: employee.firstName || '',
      middleName: employee.middleName || '',
      lastName: employee.lastName || '',
      displayName: employee.displayName || '',
      phone: employee.contact?.phone || '',
      personalEmail: employee.contact?.personalEmail || '',
      alternatePhone: employee.contact?.alternatePhone || '',
      address: employee.contact?.address || '',
      city: employee.contact?.city || '',
      state: employee.contact?.state || '',
      postalCode: employee.contact?.postalCode || '',
      country: employee.contact?.country || 'India',
      branchId: employee.employment?.branchId || '',
      departmentId: employee.employment?.departmentId || '',
      designationId: employee.employment?.designationId || '',
      managerId: employee.employment?.managerId || '',
      workMode: employee.employment?.workMode || 'OFFICE',
      noticePeriodDays: employee.employment?.noticePeriodDays || 30,
    });
    setEditError(null);
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditSubmitting(true);
    setEditError(null);

    // If regular employee, exclude organizational fields to avoid ForbiddenException
    const payload = canEditOrganization
      ? editForm
      : {
          firstName: editForm.firstName,
          middleName: editForm.middleName,
          lastName: editForm.lastName,
          displayName: editForm.displayName,
          phone: editForm.phone,
          personalEmail: editForm.personalEmail,
          alternatePhone: editForm.alternatePhone,
          address: editForm.address,
          city: editForm.city,
          state: editForm.state,
          postalCode: editForm.postalCode,
          country: editForm.country,
        };

    try {
      await employeesApi.update(employeeId, payload);
      setIsEditModalOpen(false);
      await loadEmployee();
    } catch (err: any) {
      setEditError(err.message || 'Failed to update employee profile');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleOpenStatusModal = () => {
    if (availableTransitions.length > 0) {
      setTargetStatus(availableTransitions[0]);
    }
    setStatusReason('');
    setStatusError(null);
    setIsStatusModalOpen(true);
  };

  const handleSaveStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusSubmitting(true);
    setStatusError(null);
    try {
      await employeesApi.transitionStatus(employeeId, {
        status: targetStatus,
        reason: statusReason,
        effectiveDate,
      });
      setIsStatusModalOpen(false);
      setStatusReason('');
      await loadEmployee();
    } catch (err: any) {
      setStatusError(err.message || 'Failed to execute status transition');
    } finally {
      setStatusSubmitting(false);
    }
  };

  const handleSaveEmergencyContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmergencySubmitting(true);
    try {
      const existingContacts = employee?.emergencyContacts || [];
      const updatedContacts = [
        ...existingContacts.map((c: any) => ({
          name: c.name,
          relationship: c.relationship,
          phone: c.phone,
          alternatePhone: c.alternatePhone,
          address: c.address,
          isPrimary: emergencyForm.isPrimary ? false : c.isPrimary,
        })),
        emergencyForm,
      ];

      await employeesApi.update(employeeId, {
        emergencyContacts: updatedContacts,
      });
      setIsEmergencyContactModalOpen(false);
      setEmergencyForm({
        name: '',
        relationship: 'Spouse',
        phone: '',
        alternatePhone: '',
        address: '',
        isPrimary: false,
      });
      await loadEmployee();
    } catch (err: any) {
      alert(err.message || 'Failed to add emergency contact');
    } finally {
      setEmergencySubmitting(false);
    }
  };

  // Helper for tenure calculation
  const calculateTenure = (joiningDateStr?: string) => {
    if (!joiningDateStr) return '—';
    const join = new Date(joiningDateStr);
    const now = new Date();
    const diffMonths =
      (now.getFullYear() - join.getFullYear()) * 12 + (now.getMonth() - join.getMonth());
    if (diffMonths < 1) return 'Less than a month';
    const years = Math.floor(diffMonths / 12);
    const months = diffMonths % 12;
    if (years === 0) return `${months} month${months > 1 ? 's' : ''}`;
    if (months === 0) return `${years} year${years > 1 ? 's' : ''}`;
    return `${years} yr, ${months} mo`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <Badge variant="success">ACTIVE</Badge>;
      case 'PROBATION':
        return <Badge variant="warning">PROBATION</Badge>;
      case 'ON_NOTICE':
        return (
          <Badge variant="default" className="bg-amber-100 text-amber-900 border-amber-300">
            ON NOTICE
          </Badge>
        );
      case 'RESIGNED':
        return (
          <Badge variant="default" className="bg-orange-100 text-orange-900 border-orange-300">
            RESIGNED
          </Badge>
        );
      case 'TERMINATED':
        return <Badge variant="danger">TERMINATED</Badge>;
      case 'EXITED':
        return (
          <Badge variant="default" className="bg-stone-200 text-stone-700 border-stone-300">
            EXITED
          </Badge>
        );
      default:
        return <Badge variant="default">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center min-h-[450px] space-y-3">
          <div className="h-10 w-10 border-3 border-amber-800 border-t-transparent rounded-full animate-spin" />
          <div className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
            Loading profile...
          </div>
        </div>
      </AppShell>
    );
  }

  if (isForbidden) {
    return (
      <AppShell>
        <div className="max-w-lg mx-auto text-center py-16 space-y-4">
          <div className="inline-flex p-3 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
            <Lock className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-stone-900">Access Restricted</h2>
          <p className="text-xs text-stone-500 leading-relaxed max-w-sm mx-auto">
            You do not have administrative or reporting line authorization to access this employee
            profile.
          </p>
          <Button
            variant="outline"
            className="border-stone-300 text-stone-700 hover:bg-stone-50 text-xs"
            onClick={() => router.push('/employees')}
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Return to Directory
          </Button>
        </div>
      </AppShell>
    );
  }

  if (error || !employee) {
    return (
      <AppShell>
        <div className="max-w-md mx-auto text-center py-16 space-y-4">
          <div className="p-4 bg-rose-50 text-rose-800 rounded-xl border border-rose-200 text-xs">
            {error || 'Employee record could not be found'}
          </div>
          <Button
            variant="outline"
            className="border-stone-300 text-stone-700 text-xs"
            onClick={() => router.push('/employees')}
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back to Employee Directory
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Navigation & Header Actions */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <button
            onClick={() => router.push('/employees')}
            className="text-xs text-stone-500 hover:text-stone-900 flex items-center gap-1 font-semibold group transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
            <span>Back to Employee Directory</span>
          </button>

          <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
            {/* Status change action (Admin/HR only) */}
            {canChangeStatus && (
              <Button
                variant="outline"
                className="border-stone-200 text-stone-700 hover:bg-stone-50 text-xs h-9"
                onClick={handleOpenStatusModal}
              >
                <UserCheck className="h-3.5 w-3.5 mr-1.5 text-stone-500" />
                Change Status
              </Button>
            )}

            {/* Edit Profile action (Admin/HR or permitted self) */}
            {(canEditOrganization || canEditPersonalContact) && (
              <Button
                className="bg-amber-800 hover:bg-amber-900 text-white text-xs h-9 shadow-xs"
                onClick={handleOpenEdit}
              >
                <Edit2 className="h-3.5 w-3.5 mr-1.5" />
                {canEditOrganization ? 'Edit Profile' : 'Edit Contact Info'}
              </Button>
            )}
          </div>
        </div>

        {/* Profile Hero Card */}
        <Card className="border border-stone-200/80 shadow-xs bg-white overflow-hidden">
          <div className="p-6 flex flex-col md:flex-row items-start md:items-center gap-6">
            <Avatar
              name={employee.displayName}
              src={employee.profilePhoto}
              size="xl"
              className="h-20 w-20 text-lg border-2 border-stone-100 shadow-xs shrink-0"
            />
            <div className="space-y-2 flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl md:text-2xl font-bold text-stone-900 truncate">
                  {employee.displayName}
                </h1>
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-stone-100 text-stone-700 border border-stone-200">
                  {employee.employeeCode}
                </span>
                {getStatusBadge(employee.status)}
              </div>

              <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-xs text-stone-600">
                <span className="font-medium text-stone-900">
                  {employee.employment?.designation?.title || 'Staff Member'}
                </span>
                <span className="text-stone-300">•</span>
                <span className="flex items-center gap-1 text-stone-600">
                  <Building2 className="h-3.5 w-3.5 text-stone-400" />
                  {employee.employment?.department?.name || 'General Department'}
                </span>
                <span className="text-stone-300">•</span>
                <span className="flex items-center gap-1 text-stone-600">
                  <MapPin className="h-3.5 w-3.5 text-stone-400" />
                  {employee.employment?.branch?.name || 'Main Office'}
                </span>
                <span className="text-stone-300">•</span>
                <Badge
                  variant="outline"
                  className="text-[10px] py-0 px-1.5 border-stone-300 text-stone-600 uppercase font-semibold"
                >
                  {employee.employment?.workMode || 'OFFICE'}
                </Badge>
              </div>
            </div>

            {/* Quick Contact Badge Pills */}
            <div className="flex flex-col sm:flex-row md:flex-col gap-2 shrink-0 w-full md:w-auto pt-2 md:pt-0 border-t md:border-t-0 border-stone-100">
              {employee.contact?.workEmail && (
                <a
                  href={`mailto:${employee.contact.workEmail}`}
                  className="inline-flex items-center gap-2 text-xs text-stone-600 hover:text-amber-800 bg-stone-50 hover:bg-amber-50/50 px-3 py-1.5 rounded-lg border border-stone-200/80 transition-colors"
                >
                  <Mail className="h-3.5 w-3.5 text-stone-400" />
                  <span className="truncate max-w-[200px]">{employee.contact.workEmail}</span>
                </a>
              )}
              {employee.contact?.phone && (
                <a
                  href={`tel:${employee.contact.phone}`}
                  className="inline-flex items-center gap-2 text-xs text-stone-600 hover:text-amber-800 bg-stone-50 hover:bg-amber-50/50 px-3 py-1.5 rounded-lg border border-stone-200/80 transition-colors"
                >
                  <Phone className="h-3.5 w-3.5 text-stone-400" />
                  <span>{employee.contact.phone}</span>
                </a>
              )}
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-t border-stone-200 px-6 bg-stone-50/60 overflow-x-auto scrollbar-none">
            {(
              [
                { id: 'overview', label: 'Overview', count: undefined },
                { id: 'employment', label: 'Employment', count: undefined },
                { id: 'contact', label: 'Contact', count: undefined },
                {
                  id: 'documents',
                  label: 'Documents',
                  count: employee.documents?.length as number | undefined,
                },
                {
                  id: 'history',
                  label: 'History',
                  count: employee.history?.length as number | undefined,
                },
              ] as Array<{
                id: 'overview' | 'employment' | 'contact' | 'documents' | 'history';
                label: string;
                count?: number;
              }>
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-3.5 px-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition-all whitespace-nowrap flex items-center gap-2 ${
                  activeTab === tab.id
                    ? 'border-amber-800 text-amber-900 bg-white font-bold shadow-xs'
                    : 'border-transparent text-stone-500 hover:text-stone-800 hover:bg-stone-100/50'
                }`}
              >
                <span>{tab.label}</span>
                {typeof tab.count === 'number' && tab.count > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      activeTab === tab.id
                        ? 'bg-amber-100 text-amber-900 font-bold'
                        : 'bg-stone-200 text-stone-600'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </Card>

        {/* ------------------------------------------------------------------ */}
        {/* TAB 1: Overview */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Work Placement Card */}
            <Card className="md:col-span-2 border border-stone-200/80 shadow-xs bg-white">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold text-stone-900 flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-amber-800" />
                  Work Placement & Role
                </CardTitle>
                <CardDescription className="text-xs text-stone-500">
                  Current organizational structure and reporting assignments
                </CardDescription>
              </CardHeader>
              <CardContent className="divide-y divide-stone-100 text-xs">
                <div className="grid grid-cols-3 py-2.5">
                  <span className="text-stone-500">Department</span>
                  <span className="col-span-2 font-semibold text-stone-900">
                    {employee.employment?.department?.name || 'General Department'}
                  </span>
                </div>
                <div className="grid grid-cols-3 py-2.5">
                  <span className="text-stone-500">Designation</span>
                  <span className="col-span-2 font-semibold text-stone-900">
                    {employee.employment?.designation?.title || 'Staff Member'}
                  </span>
                </div>
                <div className="grid grid-cols-3 py-2.5">
                  <span className="text-stone-500">Branch Office</span>
                  <span className="col-span-2 font-semibold text-stone-900">
                    {employee.employment?.branch?.name || 'Corporate HQ'}
                  </span>
                </div>
                <div className="grid grid-cols-3 py-2.5">
                  <span className="text-stone-500">Reporting Manager</span>
                  <span className="col-span-2 text-stone-900">
                    {employee.employment?.manager ? (
                      <Link
                        href={`/employees/${employee.employment.manager.id}`}
                        className="font-semibold text-amber-800 hover:text-amber-900 hover:underline inline-flex items-center gap-1"
                      >
                        {employee.employment.manager.displayName}
                        <span className="text-stone-400 font-normal">
                          ({employee.employment.manager.employeeCode})
                        </span>
                      </Link>
                    ) : (
                      <span className="text-stone-400 italic">Direct to Executive</span>
                    )}
                  </span>
                </div>
                <div className="grid grid-cols-3 py-2.5">
                  <span className="text-stone-500">Work Mode</span>
                  <div className="col-span-2">
                    <Badge variant="outline" className="border-stone-300 text-stone-700">
                      {employee.employment?.workMode || 'OFFICE'}
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-3 py-2.5">
                  <span className="text-stone-500">Tenure</span>
                  <span className="col-span-2 font-semibold text-stone-900">
                    {calculateTenure(employee.joiningDate)} (Joined{' '}
                    {new Date(employee.joiningDate).toLocaleDateString()})
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Quick Summary Sidebar */}
            <div className="space-y-6">
              <Card className="border border-stone-200/80 shadow-xs bg-white">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold text-stone-900 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-800" />
                    Lifecycle & Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-stone-100">
                    <span className="text-stone-500">Status</span>
                    {getStatusBadge(employee.status)}
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-stone-100">
                    <span className="text-stone-500">Type</span>
                    <span className="font-semibold text-stone-800">
                      {employee.employment?.employmentType || 'FULL_TIME'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-stone-100">
                    <span className="text-stone-500">Notice Period</span>
                    <span className="font-semibold text-stone-800">
                      {employee.employment?.noticePeriodDays ?? 30} Days
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-stone-500">Joined Date</span>
                    <span className="font-semibold text-stone-800">
                      {new Date(employee.joiningDate).toLocaleDateString()}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Direct Reports preview if manager */}
              {employee.managedEmployments && employee.managedEmployments.length > 0 && (
                <Card className="border border-stone-200/80 shadow-xs bg-white">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                      Reporting Team ({employee.managedEmployments.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    {employee.managedEmployments.slice(0, 4).map((sub: any) => (
                      <Link
                        key={sub.id}
                        href={`/employees/${sub.employeeId}`}
                        className="flex items-center justify-between p-2 rounded-lg bg-stone-50 hover:bg-amber-50/50 transition-colors"
                      >
                        <span className="font-medium text-stone-800">Direct Report</span>
                        <ChevronRight className="h-3.5 w-3.5 text-stone-400" />
                      </Link>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* TAB 2: Employment */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === 'employment' && (
          <div className="space-y-6">
            <Card className="border border-stone-200/80 shadow-xs bg-white">
              <CardHeader>
                <CardTitle className="text-sm font-bold text-stone-900">
                  Employment Master Records
                </CardTitle>
                <CardDescription className="text-xs text-stone-500">
                  Full organizational placement, contract details, and dates
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 text-xs">
                {/* Organization Details */}
                <div className="space-y-1">
                  <label className="text-stone-400 block text-[11px] uppercase font-semibold">
                    Organization Tenant
                  </label>
                  <div className="font-semibold text-stone-900">
                    {employee.organization?.name || 'Primary Organization'}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-stone-400 block text-[11px] uppercase font-semibold">
                    Branch Office
                  </label>
                  <div className="font-semibold text-stone-900">
                    {employee.employment?.branch?.name || 'HQ'}
                  </div>
                  {employee.employment?.branch?.code && (
                    <div className="text-[11px] text-stone-500 font-mono">
                      Code: {employee.employment.branch.code}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-stone-400 block text-[11px] uppercase font-semibold">
                    Department
                  </label>
                  <div className="font-semibold text-stone-900">
                    {employee.employment?.department?.name || 'General'}
                  </div>
                  {employee.employment?.department?.code && (
                    <div className="text-[11px] text-stone-500 font-mono">
                      Code: {employee.employment.department.code}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-stone-400 block text-[11px] uppercase font-semibold">
                    Designation
                  </label>
                  <div className="font-semibold text-stone-900">
                    {employee.employment?.designation?.title || 'Staff Member'}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-stone-400 block text-[11px] uppercase font-semibold">
                    Reporting Manager
                  </label>
                  <div className="font-semibold text-stone-900">
                    {employee.employment?.manager?.displayName || (
                      <span className="text-stone-400 italic">Direct to Executive</span>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-stone-400 block text-[11px] uppercase font-semibold">
                    Employment Type
                  </label>
                  <div className="font-semibold text-stone-900">
                    {employee.employment?.employmentType || 'FULL_TIME'}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-stone-400 block text-[11px] uppercase font-semibold">
                    Work Mode
                  </label>
                  <Badge variant="outline" className="border-stone-300 text-stone-700">
                    {employee.employment?.workMode || 'OFFICE'}
                  </Badge>
                </div>

                <div className="space-y-1">
                  <label className="text-stone-400 block text-[11px] uppercase font-semibold">
                    Joining Date
                  </label>
                  <div className="font-semibold text-stone-900">
                    {new Date(employee.joiningDate).toLocaleDateString()}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-stone-400 block text-[11px] uppercase font-semibold">
                    Notice Period
                  </label>
                  <div className="font-semibold text-stone-900">
                    {employee.employment?.noticePeriodDays ?? 30} Days
                  </div>
                </div>

                {employee.exitDate && (
                  <div className="space-y-1">
                    <label className="text-stone-400 block text-[11px] uppercase font-semibold">
                      Exit Date
                    </label>
                    <div className="font-semibold text-rose-700">
                      {new Date(employee.exitDate).toLocaleDateString()}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* System Account Card (Visible to Admin/HR or Self) */}
            {(isAdminOrHr || isSelf) && (
              <Card className="border border-stone-200/80 shadow-xs bg-white">
                <CardHeader>
                  <CardTitle className="text-sm font-bold text-stone-900 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-amber-800" />
                    Identity & Auth Credentials
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-xs">
                  <div>
                    <label className="text-stone-400 block mb-1">User Account ID</label>
                    <div className="font-mono text-stone-700 text-[11px]">
                      {employee.userId || 'No linked user ID'}
                    </div>
                  </div>
                  <div>
                    <label className="text-stone-400 block mb-1">Account Status</label>
                    <Badge variant={employee.isActive ? 'success' : 'danger'}>
                      {employee.isActive ? 'ACTIVE ACCOUNT' : 'DEACTIVATED'}
                    </Badge>
                  </div>
                  <div>
                    <label className="text-stone-400 block mb-1">Employee Unique Key</label>
                    <div className="font-mono text-stone-800 font-semibold">
                      {employee.employeeCode}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* TAB 3: Contact */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === 'contact' && (
          <div className="space-y-6">
            {/* Work & Personal Details */}
            <Card className="border border-stone-200/80 shadow-xs bg-white">
              <CardHeader className="flex flex-row justify-between items-center">
                <div>
                  <CardTitle className="text-sm font-bold text-stone-900">
                    Contact Information
                  </CardTitle>
                  <CardDescription className="text-xs text-stone-500">
                    Official communication channels and personal coordinates
                  </CardDescription>
                </div>
                {canEditPersonalContact && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-stone-200 text-stone-700 text-xs h-8"
                    onClick={handleOpenEdit}
                  >
                    <Edit2 className="h-3 w-3 mr-1" /> Edit Contact
                  </Button>
                )}
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 text-xs">
                <div>
                  <label className="text-stone-400 block mb-1">Official Work Email</label>
                  <div className="font-semibold text-stone-900">
                    {employee.contact?.workEmail || '—'}
                  </div>
                </div>

                <div>
                  <label className="text-stone-400 block mb-1">Work Phone</label>
                  <div className="font-semibold text-stone-900">
                    {employee.contact?.phone || 'Not registered'}
                  </div>
                </div>

                {/* Personal Email: Guarded based on role */}
                <div>
                  <label className="text-stone-400 block mb-1">Personal Email</label>
                  {isAdminOrHr || isSelf ? (
                    <div className="font-semibold text-stone-900">
                      {employee.contact?.personalEmail || 'Not provided'}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-stone-400 italic">
                      <Lock className="h-3 w-3 text-stone-400" />
                      <span>Confidential</span>
                    </div>
                  )}
                </div>

                {/* Home Address: Guarded based on role */}
                <div className="sm:col-span-2 md:col-span-3 pt-2 border-t border-stone-100">
                  <label className="text-stone-400 block mb-1">Residential Address</label>
                  {isAdminOrHr || isSelf ? (
                    <div className="font-medium text-stone-800 leading-relaxed">
                      {employee.contact?.address ? (
                        <>
                          {employee.contact.address}
                          {employee.contact.city && `, ${employee.contact.city}`}
                          {employee.contact.state && `, ${employee.contact.state}`}
                          {employee.contact.postalCode && ` - ${employee.contact.postalCode}`}
                          {employee.contact.country && `, ${employee.contact.country}`}
                        </>
                      ) : (
                        <span className="text-stone-400 italic">
                          No residential address registered.
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-stone-400 italic">
                      <Lock className="h-3 w-3 text-stone-400" />
                      <span>Confidential (Restricted to HR & Employee)</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Emergency Contacts */}
            <Card className="border border-stone-200/80 shadow-xs bg-white">
              <CardHeader className="flex flex-row justify-between items-center">
                <div>
                  <CardTitle className="text-sm font-bold text-stone-900">
                    Emergency Contacts
                  </CardTitle>
                  <CardDescription className="text-xs text-stone-500">
                    Designated next-of-kin or emergency contacts for urgent incidents
                  </CardDescription>
                </div>
                {canEditPersonalContact && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-stone-200 text-stone-700 text-xs h-8"
                    onClick={() => setIsEmergencyContactModalOpen(true)}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Add Contact
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {employee.emergencyContacts && employee.emergencyContacts.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {employee.emergencyContacts.map((c: any) => (
                      <div
                        key={c.id}
                        className="p-3.5 bg-stone-50 rounded-xl border border-stone-200/70 flex items-start justify-between text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-stone-900">{c.name}</span>
                            {c.isPrimary && (
                              <Badge variant="success" className="text-[10px] py-0 px-1.5">
                                PRIMARY
                              </Badge>
                            )}
                          </div>
                          <div className="text-stone-500 font-medium">{c.relationship}</div>
                          {c.address && (
                            <div className="text-stone-400 text-[11px]">{c.address}</div>
                          )}
                        </div>
                        <div className="text-right font-mono font-semibold text-stone-800">
                          {c.phone}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-stone-400 italic py-6 text-center">
                    No emergency contacts registered yet.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* TAB 4: Documents */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === 'documents' && (
          <Card className="border border-stone-200/80 shadow-xs bg-white">
            <CardHeader>
              <CardTitle className="text-sm font-bold text-stone-900 flex items-center gap-2">
                <FileText className="h-4 w-4 text-amber-800" />
                Compliance & Verification Documents
              </CardTitle>
              <CardDescription className="text-xs text-stone-500">
                Identity credentials, educational records, and regulatory compliance metadata
              </CardDescription>
            </CardHeader>
            <CardContent>
              {employee.documents && employee.documents.length > 0 ? (
                <div className="divide-y divide-stone-100 text-xs">
                  {employee.documents.map((doc: any) => (
                    <div key={doc.id} className="py-3.5 flex items-center justify-between">
                      <div className="flex items-center gap-3.5">
                        <div className="p-2.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="font-semibold text-stone-900 text-sm">
                            {doc.documentName}
                          </div>
                          <div className="flex items-center gap-3 text-stone-500 text-[11px] mt-0.5">
                            <span className="font-mono">{doc.documentNumber || 'Ref Pending'}</span>
                            <span>•</span>
                            <span>Type: {doc.documentType}</span>
                            {doc.expiryDate && (
                              <>
                                <span>•</span>
                                <span>
                                  Expires: {new Date(doc.expiryDate).toLocaleDateString()}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {doc.isVerified ? (
                          <Badge variant="success" className="flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> VERIFIED
                          </Badge>
                        ) : (
                          <Badge variant="warning" className="flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" /> PENDING VERIFICATION
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center space-y-2">
                  <div className="p-3 bg-stone-100 text-stone-400 rounded-full inline-flex">
                    <FileText className="h-6 w-6" />
                  </div>
                  <div className="text-xs font-semibold text-stone-700">No documents on file</div>
                  <div className="text-[11px] text-stone-400 max-w-sm mx-auto">
                    No compliance or identity documents metadata records are currently attached.
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* TAB 5: History */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === 'history' && (
          <Card className="border border-stone-200/80 shadow-xs bg-white">
            <CardHeader className="pb-4 border-b border-stone-100">
              <CardTitle className="text-base font-bold text-stone-900 flex items-center gap-2">
                <History className="h-5 w-5 text-amber-800" />
                Employee Career & Lifecycle History
              </CardTitle>
              <CardDescription className="text-xs text-stone-500 mt-0.5">
                Immutable chronological event trail tracking organizational placements, promotions,
                transfers, and lifecycle status transitions.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <EmployeeHistoryTimeline
                initialHistory={employee.history || []}
                employeeId={employee.id}
                employeeName={employee.displayName}
              />
            </CardContent>
          </Card>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Status Transition Dialog (Controlled State Machine) */}
        {/* ------------------------------------------------------------------ */}
        <Dialog
          isOpen={isStatusModalOpen}
          onClose={() => setIsStatusModalOpen(false)}
          title="Transition Employee Status"
          description="Update lifecycle status in accordance with strict state-machine rules"
        >
          <form onSubmit={handleSaveStatus} className="space-y-4 pt-2">
            {statusError && (
              <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-md">
                {statusError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Current Status
              </label>
              <div className="p-2 rounded bg-stone-100 text-xs font-bold text-stone-800">
                {employee.status}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Permitted Next Status *
              </label>
              {availableTransitions.length > 0 ? (
                <select
                  value={targetStatus}
                  onChange={(e) => setTargetStatus(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700 bg-white"
                >
                  {availableTransitions.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-xs text-stone-500 p-2 bg-stone-50 rounded border border-stone-200">
                  This employee is in a terminal lifecycle state ({employee.status}). No transitions
                  allowed.
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Effective Date
              </label>
              <input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Reason / Audit Log Note *
              </label>
              <textarea
                rows={3}
                required
                placeholder="Reason for lifecycle transition (e.g. Probation review cleared)..."
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
              <Button type="button" variant="ghost" onClick={() => setIsStatusModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={statusSubmitting || availableTransitions.length === 0}
                className="bg-amber-800 hover:bg-amber-900 text-white"
              >
                {statusSubmitting ? 'Updating...' : 'Commit Status Transition'}
              </Button>
            </div>
          </form>
        </Dialog>

        {/* ------------------------------------------------------------------ */}
        {/* Edit Profile Dialog */}
        {/* ------------------------------------------------------------------ */}
        <Dialog
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          title={
            canEditOrganization ? 'Edit Employee Profile' : 'Edit Personal Contact Information'
          }
          description={
            canEditOrganization
              ? 'Update master details, organizational assignment, or contact coordinates'
              : 'Update your personal phone number, secondary email, and residential address'
          }
        >
          <form
            onSubmit={handleSaveEdit}
            className="space-y-4 pt-2 max-h-[70vh] overflow-y-auto px-1"
          >
            {editError && (
              <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-md">
                {editError}
              </div>
            )}

            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  First Name *
                </label>
                <input
                  type="text"
                  required
                  value={editForm.firstName || ''}
                  onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Last Name *
                </label>
                <input
                  type="text"
                  required
                  value={editForm.lastName || ''}
                  onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg"
                />
              </div>
            </div>

            {/* Organizational Assignment (Admin/HR Only) */}
            {canEditOrganization && (
              <>
                <div className="pt-2 border-t border-stone-100">
                  <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block mb-2">
                    Organizational Structure (HR Admin Only)
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Department
                    </label>
                    <select
                      value={editForm.departmentId || ''}
                      onChange={(e) => setEditForm({ ...editForm, departmentId: e.target.value })}
                      className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg bg-white"
                    >
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Designation
                    </label>
                    <select
                      value={editForm.designationId || ''}
                      onChange={(e) => setEditForm({ ...editForm, designationId: e.target.value })}
                      className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg bg-white"
                    >
                      {designations.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Branch
                    </label>
                    <select
                      value={editForm.branchId || ''}
                      onChange={(e) => setEditForm({ ...editForm, branchId: e.target.value })}
                      className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg bg-white"
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Reporting Manager
                    </label>
                    <select
                      value={editForm.managerId || ''}
                      onChange={(e) =>
                        setEditForm({ ...editForm, managerId: e.target.value || null })
                      }
                      className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg bg-white"
                    >
                      <option value="">None (Top Level)</option>
                      {managers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.displayName} ({m.employeeCode})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Work Mode
                    </label>
                    <select
                      value={editForm.workMode || 'OFFICE'}
                      onChange={(e) => setEditForm({ ...editForm, workMode: e.target.value })}
                      className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg bg-white"
                    >
                      <option value="OFFICE">Office</option>
                      <option value="HYBRID">Hybrid</option>
                      <option value="REMOTE">Remote</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Notice Period (Days)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={editForm.noticePeriodDays || 30}
                      onChange={(e) =>
                        setEditForm({ ...editForm, noticePeriodDays: Number(e.target.value) })
                      }
                      className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Contact Details */}
            <div className="pt-2 border-t border-stone-100">
              <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider block mb-2">
                Personal Contact & Coordinates
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Phone</label>
                <input
                  type="text"
                  value={editForm.phone || ''}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Personal Email
                </label>
                <input
                  type="email"
                  value={editForm.personalEmail || ''}
                  onChange={(e) => setEditForm({ ...editForm, personalEmail: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Street Address
              </label>
              <input
                type="text"
                value={editForm.address || ''}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">City</label>
                <input
                  type="text"
                  value={editForm.city || ''}
                  onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">State</label>
                <input
                  type="text"
                  value={editForm.state || ''}
                  onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Postal Code
                </label>
                <input
                  type="text"
                  value={editForm.postalCode || ''}
                  onChange={(e) => setEditForm({ ...editForm, postalCode: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
              <Button type="button" variant="ghost" onClick={() => setIsEditModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={editSubmitting}
                className="bg-amber-800 hover:bg-amber-900 text-white"
              >
                {editSubmitting ? 'Saving...' : 'Save Profile Changes'}
              </Button>
            </div>
          </form>
        </Dialog>

        {/* ------------------------------------------------------------------ */}
        {/* Add Emergency Contact Dialog */}
        {/* ------------------------------------------------------------------ */}
        <Dialog
          isOpen={isEmergencyContactModalOpen}
          onClose={() => setIsEmergencyContactModalOpen(false)}
          title="Add Emergency Contact"
          description="Register next-of-kin contact coordinates for emergency situations"
        >
          <form onSubmit={handleSaveEmergencyContact} className="space-y-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={emergencyForm.name}
                onChange={(e) => setEmergencyForm({ ...emergencyForm, name: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Relationship *
                </label>
                <select
                  value={emergencyForm.relationship}
                  onChange={(e) =>
                    setEmergencyForm({ ...emergencyForm, relationship: e.target.value })
                  }
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg bg-white"
                >
                  <option value="Spouse">Spouse</option>
                  <option value="Parent">Parent</option>
                  <option value="Sibling">Sibling</option>
                  <option value="Child">Child</option>
                  <option value="Friend">Friend</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Phone Number *
                </label>
                <input
                  type="text"
                  required
                  value={emergencyForm.phone}
                  onChange={(e) => setEmergencyForm({ ...emergencyForm, phone: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Alternate Phone
              </label>
              <input
                type="text"
                value={emergencyForm.alternatePhone}
                onChange={(e) =>
                  setEmergencyForm({ ...emergencyForm, alternatePhone: e.target.value })
                }
                className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Address</label>
              <input
                type="text"
                value={emergencyForm.address}
                onChange={(e) => setEmergencyForm({ ...emergencyForm, address: e.target.value })}
                className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="isPrimary"
                checked={emergencyForm.isPrimary}
                onChange={(e) =>
                  setEmergencyForm({ ...emergencyForm, isPrimary: e.target.checked })
                }
                className="rounded border-stone-300 text-amber-800 focus:ring-amber-800"
              />
              <label htmlFor="isPrimary" className="text-xs text-stone-700 font-medium">
                Set as primary emergency contact
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsEmergencyContactModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={emergencySubmitting}
                className="bg-amber-800 hover:bg-amber-900 text-white"
              >
                {emergencySubmitting ? 'Adding...' : 'Add Contact'}
              </Button>
            </div>
          </form>
        </Dialog>
      </div>
    </AppShell>
  );
}
