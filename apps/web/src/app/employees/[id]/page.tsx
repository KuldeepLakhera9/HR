'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
} from 'lucide-react';
import { employeesApi, organizationApi } from '../../../lib/api-client';
import { useAuth } from '../../../context/AuthContext';

export default function EmployeeProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { hasPermission } = useAuth();
  const employeeId = params.id as string;

  const [activeTab, setActiveTab] = useState<
    'overview' | 'employment' | 'contact' | 'documents' | 'history'
  >('overview');
  const [employee, setEmployee] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Status transition modal state
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [targetStatus, setTargetStatus] = useState('ACTIVE');
  const [statusReason, setStatusReason] = useState('');
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

  const loadEmployee = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await employeesApi.findOne(employeeId);
      setEmployee(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load employee profile');
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    loadEmployee();
  }, [loadEmployee]);

  const loadLookupsForEdit = async () => {
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
      setManagers((emps.items || []).filter((e: any) => e.id !== employeeId));
    } catch (err) {
      console.error('Failed to load edit lookups:', err);
    }
  };

  const handleOpenEdit = async () => {
    await loadLookupsForEdit();
    setEditForm({
      firstName: employee.firstName || '',
      middleName: employee.middleName || '',
      lastName: employee.lastName || '',
      displayName: employee.displayName || '',
      phone: employee.contact?.phone || '',
      personalEmail: employee.contact?.personalEmail || '',
      address: employee.contact?.address || '',
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
    try {
      await employeesApi.update(employeeId, editForm);
      setIsEditModalOpen(false);
      await loadEmployee();
    } catch (err: any) {
      setEditError(err.message || 'Failed to update employee');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleSaveStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusSubmitting(true);
    setStatusError(null);
    try {
      await employeesApi.transitionStatus(employeeId, {
        status: targetStatus,
        reason: statusReason,
      });
      setIsStatusModalOpen(false);
      setStatusReason('');
      await loadEmployee();
    } catch (err: any) {
      setStatusError(err.message || 'Failed to change status');
    } finally {
      setStatusSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-sm font-medium text-stone-500 animate-pulse">
            Loading employee profile...
          </div>
        </div>
      </AppShell>
    );
  }

  if (error || !employee) {
    return (
      <AppShell>
        <div className="max-w-md mx-auto text-center py-12 space-y-4">
          <div className="p-3 bg-rose-50 text-rose-700 rounded-lg border border-rose-200 text-sm">
            {error || 'Employee not found'}
          </div>
          <Button variant="outline" onClick={() => router.push('/employees')}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Directory
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Top Breadcrumb & Actions */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <button
            onClick={() => router.push('/employees')}
            className="text-xs text-stone-500 hover:text-stone-800 flex items-center gap-1 font-semibold"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Directory
          </button>

          <div className="flex items-center gap-2">
            {hasPermission('EMPLOYEE_UPDATE') && (
              <>
                <Button
                  variant="outline"
                  className="border-stone-200 text-stone-700 hover:bg-stone-50 text-xs"
                  onClick={() => {
                    setTargetStatus(employee.status === 'PROBATION' ? 'ACTIVE' : 'ON_NOTICE');
                    setStatusError(null);
                    setIsStatusModalOpen(true);
                  }}
                >
                  <UserCheck className="h-3.5 w-3.5 mr-1.5 text-stone-500" />
                  Change Status
                </Button>
                <Button
                  className="bg-amber-800 hover:bg-amber-900 text-white text-xs"
                  onClick={handleOpenEdit}
                >
                  <Edit2 className="h-3.5 w-3.5 mr-1.5" />
                  Edit Profile
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Profile Header Hero Card */}
        <Card className="border border-stone-200/80 shadow-xs bg-white overflow-hidden">
          <div className="p-6 flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <Avatar
              name={employee.displayName}
              size="lg"
              className="h-20 w-20 text-lg border-2 border-stone-200"
            />
            <div className="space-y-1.5 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-xl font-bold text-stone-900">{employee.displayName}</h1>
                <Badge
                  variant="outline"
                  className="font-mono text-xs border-stone-300 text-stone-700"
                >
                  {employee.employeeCode}
                </Badge>
                <Badge variant={employee.status === 'ACTIVE' ? 'success' : 'warning'}>
                  {employee.status}
                </Badge>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs text-stone-500">
                <span className="font-medium text-stone-800">
                  {employee.employment?.designation?.title || 'Staff'}
                </span>
                <span>•</span>
                <span>{employee.employment?.department?.name || 'General'}</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-stone-400" />
                  {employee.employment?.branch?.name || 'HQ'}
                </span>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-t border-stone-200 px-6 bg-stone-50/50">
            {(['overview', 'employment', 'contact', 'documents', 'history'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-3 px-4 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors ${
                  activeTab === tab
                    ? 'border-amber-800 text-amber-900 bg-white'
                    : 'border-transparent text-stone-500 hover:text-stone-800'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </Card>

        {/* TAB 1: Overview */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border border-stone-200/80 shadow-xs">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold text-stone-900">
                  Placement Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="flex justify-between py-1.5 border-b border-stone-100">
                  <span className="text-stone-500">Department</span>
                  <span className="font-semibold text-stone-800">
                    {employee.employment?.department?.name}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-stone-100">
                  <span className="text-stone-500">Designation</span>
                  <span className="font-semibold text-stone-800">
                    {employee.employment?.designation?.title}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-stone-100">
                  <span className="text-stone-500">Reporting Manager</span>
                  <span className="font-semibold text-stone-800">
                    {employee.employment?.manager?.displayName || (
                      <span className="text-stone-400 italic">None</span>
                    )}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-stone-100">
                  <span className="text-stone-500">Branch Location</span>
                  <span className="font-semibold text-stone-800">
                    {employee.employment?.branch?.name}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-stone-100">
                  <span className="text-stone-500">Work Mode</span>
                  <Badge variant="outline" className="border-stone-300 text-stone-700">
                    {employee.employment?.workMode}
                  </Badge>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-stone-500">Joining Date</span>
                  <span className="font-semibold text-stone-800">
                    {new Date(employee.joiningDate).toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-stone-200/80 shadow-xs">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-bold text-stone-900">Primary Contact</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="flex justify-between py-1.5 border-b border-stone-100">
                  <span className="text-stone-500">Official Work Email</span>
                  <span className="font-semibold text-stone-800">
                    {employee.contact?.workEmail}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-stone-100">
                  <span className="text-stone-500">Phone</span>
                  <span className="font-semibold text-stone-800">
                    {employee.contact?.phone || 'Not registered'}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-stone-100">
                  <span className="text-stone-500">Personal Email</span>
                  <span className="font-semibold text-stone-800">
                    {employee.contact?.personalEmail || 'Not provided'}
                  </span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-stone-500">Emergency Contact</span>
                  <span className="font-semibold text-stone-800">
                    {employee.emergencyContacts?.[0]
                      ? `${employee.emergencyContacts[0].name} (${employee.emergencyContacts[0].relationship})`
                      : 'None registered'}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* TAB 2: Employment */}
        {activeTab === 'employment' && (
          <Card className="border border-stone-200/80 shadow-xs">
            <CardHeader>
              <CardTitle className="text-sm font-bold text-stone-900">Employment Details</CardTitle>
              <CardDescription className="text-xs">
                Contract terms, reporting structure and timeline
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 text-xs">
              <div>
                <label className="text-stone-400 block mb-1">Employment Type</label>
                <div className="font-semibold text-stone-900">
                  {employee.employment?.employmentType}
                </div>
              </div>
              <div>
                <label className="text-stone-400 block mb-1">Current Lifecycle Status</label>
                <div className="font-semibold text-stone-900">{employee.status}</div>
              </div>
              <div>
                <label className="text-stone-400 block mb-1">Work Mode</label>
                <div className="font-semibold text-stone-900">{employee.employment?.workMode}</div>
              </div>
              <div>
                <label className="text-stone-400 block mb-1">Joining Date</label>
                <div className="font-semibold text-stone-900">
                  {new Date(employee.joiningDate).toLocaleDateString()}
                </div>
              </div>
              <div>
                <label className="text-stone-400 block mb-1">Notice Period</label>
                <div className="font-semibold text-stone-900">
                  {employee.employment?.noticePeriodDays ?? 30} Days
                </div>
              </div>
              <div>
                <label className="text-stone-400 block mb-1">Assigned Manager</label>
                <div className="font-semibold text-stone-900">
                  {employee.employment?.manager?.displayName || 'Direct to Executive'}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* TAB 3: Contact & Address */}
        {activeTab === 'contact' && (
          <div className="space-y-6">
            <Card className="border border-stone-200/80 shadow-xs">
              <CardHeader>
                <CardTitle className="text-sm font-bold text-stone-900">
                  Contact & Address
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
                <div>
                  <label className="text-stone-400 block mb-1">Official Email</label>
                  <div className="font-semibold text-stone-900">{employee.contact?.workEmail}</div>
                </div>
                <div>
                  <label className="text-stone-400 block mb-1">Personal Email</label>
                  <div className="font-semibold text-stone-900">
                    {employee.contact?.personalEmail || 'Not provided'}
                  </div>
                </div>
                <div>
                  <label className="text-stone-400 block mb-1">Phone Number</label>
                  <div className="font-semibold text-stone-900">
                    {employee.contact?.phone || 'Not provided'}
                  </div>
                </div>
                <div>
                  <label className="text-stone-400 block mb-1">City, State</label>
                  <div className="font-semibold text-stone-900">
                    {employee.contact?.city || 'Bengaluru'},{' '}
                    {employee.contact?.state || 'Karnataka'}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Emergency Contacts */}
            <Card className="border border-stone-200/80 shadow-xs">
              <CardHeader>
                <CardTitle className="text-sm font-bold text-stone-900">
                  Emergency Contacts
                </CardTitle>
              </CardHeader>
              <CardContent>
                {employee.emergencyContacts && employee.emergencyContacts.length > 0 ? (
                  <div className="space-y-3">
                    {employee.emergencyContacts.map((c: any) => (
                      <div
                        key={c.id}
                        className="p-3 bg-stone-50 rounded-lg flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-semibold text-stone-900">{c.name}</div>
                          <div className="text-stone-500">{c.relationship}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-stone-800">{c.phone}</div>
                          {c.isPrimary && (
                            <Badge variant="success" className="text-[10px] py-0">
                              PRIMARY
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-stone-400 italic">No emergency contacts listed.</div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* TAB 4: Documents Metadata */}
        {activeTab === 'documents' && (
          <Card className="border border-stone-200/80 shadow-xs">
            <CardHeader>
              <CardTitle className="text-sm font-bold text-stone-900">
                Verification & Documents
              </CardTitle>
              <CardDescription className="text-xs">
                Archived compliance metadata and verified identity credentials
              </CardDescription>
            </CardHeader>
            <CardContent>
              {employee.documents && employee.documents.length > 0 ? (
                <div className="divide-y divide-stone-100 text-xs">
                  {employee.documents.map((doc: any) => (
                    <div key={doc.id} className="py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-amber-800" />
                        <div>
                          <div className="font-semibold text-stone-900">{doc.documentName}</div>
                          <div className="text-stone-500 font-mono text-[11px]">
                            {doc.documentNumber || 'Pending Number'}
                          </div>
                        </div>
                      </div>
                      <div>
                        {doc.isVerified ? (
                          <Badge variant="success">VERIFIED</Badge>
                        ) : (
                          <Badge variant="warning">PENDING</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-stone-400 italic py-4 text-center">
                  No document records attached.
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* TAB 5: History Audit Trail */}
        {activeTab === 'history' && (
          <Card className="border border-stone-200/80 shadow-xs">
            <CardHeader>
              <CardTitle className="text-sm font-bold text-stone-900">
                Employee History Log
              </CardTitle>
              <CardDescription className="text-xs">
                Immutable chronological event trail tracking transfers, promotions, and status
                adjustments
              </CardDescription>
            </CardHeader>
            <CardContent>
              {employee.history && employee.history.length > 0 ? (
                <div className="space-y-4">
                  {employee.history.map((h: any) => (
                    <div
                      key={h.id}
                      className="flex items-start gap-3 p-3 bg-stone-50 rounded-lg text-xs"
                    >
                      <History className="h-4 w-4 text-amber-800 mt-0.5 shrink-0" />
                      <div className="flex-1 space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-stone-900">{h.eventType}</span>
                          <span className="text-[11px] text-stone-400">
                            {new Date(h.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-stone-600">
                          {h.previousValue && (
                            <span>
                              From <strong>{h.previousValue}</strong>{' '}
                            </span>
                          )}
                          {h.newValue && (
                            <span>
                              To <strong>{h.newValue}</strong>
                            </span>
                          )}
                        </div>
                        {h.performedBy && (
                          <div className="text-[11px] text-stone-400">
                            Logged by {h.performedBy.firstName} {h.performedBy.lastName}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-stone-400 italic py-4 text-center">
                  No history records logged yet.
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Status Transition Modal */}
        <Dialog
          isOpen={isStatusModalOpen}
          onClose={() => setIsStatusModalOpen(false)}
          title="Change Employment Status"
          description="Control lifecycle progression in accordance with organizational policies"
        >
          <form onSubmit={handleSaveStatus} className="space-y-4 pt-2">
            {statusError && (
              <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-md">
                {statusError}
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Target Status *
              </label>
              <select
                value={targetStatus}
                onChange={(e) => setTargetStatus(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700 bg-white"
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="ON_NOTICE">ON NOTICE</option>
                <option value="RESIGNED">RESIGNED</option>
                <option value="TERMINATED">TERMINATED</option>
                <option value="EXITED">EXITED</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Reason / Notes
              </label>
              <textarea
                rows={3}
                placeholder="Reason for lifecycle adjustment..."
                value={statusReason}
                onChange={(e) => setStatusReason(e.target.value)}
                className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
              <Button type="button" variant="ghost" onClick={() => setIsStatusModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={statusSubmitting}
                className="bg-amber-800 hover:bg-amber-900 text-white"
              >
                {statusSubmitting ? 'Updating...' : 'Commit Status Change'}
              </Button>
            </div>
          </form>
        </Dialog>

        {/* Edit Employee Modal */}
        <Dialog
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          title="Edit Employee Profile"
          description="Update personal details, reporting managers, or department transfers"
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  First Name
                </label>
                <input
                  type="text"
                  required
                  value={editForm.firstName || ''}
                  onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Last Name</label>
                <input
                  type="text"
                  required
                  value={editForm.lastName || ''}
                  onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Department
                </label>
                <select
                  value={editForm.departmentId || ''}
                  onChange={(e) => setEditForm({ ...editForm, departmentId: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md bg-white"
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
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md bg-white"
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
                <label className="block text-xs font-semibold text-stone-700 mb-1">Branch</label>
                <select
                  value={editForm.branchId || ''}
                  onChange={(e) => setEditForm({ ...editForm, branchId: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md bg-white"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Manager</label>
                <select
                  value={editForm.managerId || ''}
                  onChange={(e) => setEditForm({ ...editForm, managerId: e.target.value || null })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md bg-white"
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
                <label className="block text-xs font-semibold text-stone-700 mb-1">Work Mode</label>
                <select
                  value={editForm.workMode || 'OFFICE'}
                  onChange={(e) => setEditForm({ ...editForm, workMode: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md bg-white"
                >
                  <option value="OFFICE">Office</option>
                  <option value="HYBRID">Hybrid</option>
                  <option value="REMOTE">Remote</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">Phone</label>
                <input
                  type="text"
                  value={editForm.phone || ''}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md"
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
                {editSubmitting ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Dialog>
      </div>
    </AppShell>
  );
}
