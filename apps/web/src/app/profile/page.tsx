'use client';

import React, { useEffect, useState, useTransition } from 'react';
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
  Lock,
  Edit3,
  CheckCircle2,
  XCircle,
  AlertCircle,
  History,
  Plus,
  Trash2,
  X,
  FileText,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';

interface EmergencyContactFormItem {
  name: string;
  relationship: string;
  phone: string;
  alternatePhone?: string;
  address?: string;
  isPrimary?: boolean;
}

export default function ProfilePage() {
  const { currentUser, role } = useRole();
  const [employee, setEmployee] = useState<any | null>(null);
  const [changeRequests, setChangeRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'history'>('overview');
  const [isPending, startTransition] = useTransition();

  // Modal state for submitting a change request
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form state
  const [personalEmail, setPersonalEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateVal, setStateVal] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('India');
  const [reason, setReason] = useState('');
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContactFormItem[]>([]);

  // Action status state
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [empData, reqsData] = await Promise.all([
        employeesApi.getMe().catch(() => null),
        employeesApi.getMyProfileChangeRequests().catch(() => []),
      ]);
      setEmployee(empData);
      setChangeRequests(reqsData || []);

      if (empData) {
        // Pre-populate form initial state
        setPersonalEmail(empData.contact?.personalEmail || '');
        setPhone(empData.contact?.phone || '');
        setAlternatePhone(empData.contact?.alternatePhone || '');
        setAddress(empData.contact?.address || '');
        setCity(empData.contact?.city || '');
        setStateVal(empData.contact?.state || '');
        setPostalCode(empData.contact?.postalCode || '');
        setCountry(empData.contact?.country || 'India');

        if (Array.isArray(empData.emergencyContacts) && empData.emergencyContacts.length > 0) {
          setEmergencyContacts(
            empData.emergencyContacts.map((c: any) => ({
              name: c.name,
              relationship: c.relationship,
              phone: c.phone,
              alternatePhone: c.alternatePhone || '',
              address: c.address || '',
              isPrimary: !!c.isPrimary,
            })),
          );
        } else {
          setEmergencyContacts([]);
        }
      }
    } catch (err: any) {
      console.error('Failed to load profile data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openEditModal = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    if (employee) {
      setPersonalEmail(employee.contact?.personalEmail || '');
      setPhone(employee.contact?.phone || '');
      setAlternatePhone(employee.contact?.alternatePhone || '');
      setAddress(employee.contact?.address || '');
      setCity(employee.contact?.city || '');
      setStateVal(employee.contact?.state || '');
      setPostalCode(employee.contact?.postalCode || '');
      setCountry(employee.contact?.country || 'India');
      setReason('');

      if (Array.isArray(employee.emergencyContacts) && employee.emergencyContacts.length > 0) {
        setEmergencyContacts(
          employee.emergencyContacts.map((c: any) => ({
            name: c.name,
            relationship: c.relationship,
            phone: c.phone,
            alternatePhone: c.alternatePhone || '',
            address: c.address || '',
            isPrimary: !!c.isPrimary,
          })),
        );
      } else {
        setEmergencyContacts([
          { name: '', relationship: '', phone: '', alternatePhone: '', isPrimary: true },
        ]);
      }
    }
    setIsModalOpen(true);
  };

  const handleAddEmergencyContact = () => {
    setEmergencyContacts([
      ...emergencyContacts,
      {
        name: '',
        relationship: '',
        phone: '',
        alternatePhone: '',
        isPrimary: emergencyContacts.length === 0,
      },
    ]);
  };

  const handleRemoveEmergencyContact = (index: number) => {
    setEmergencyContacts(emergencyContacts.filter((_, i) => i !== index));
  };

  const handleEmergencyContactChange = (
    index: number,
    field: keyof EmergencyContactFormItem,
    val: any,
  ) => {
    const updated = [...emergencyContacts];
    updated[index] = { ...updated[index], [field]: val };
    // If setting isPrimary to true, set others to false
    if (field === 'isPrimary' && val === true) {
      updated.forEach((c, i) => {
        if (i !== index) c.isPrimary = false;
      });
    }
    setEmergencyContacts(updated);
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSubmitting(true);

    try {
      // Validate emergency contacts have required fields if any entered
      for (const c of emergencyContacts) {
        if (!c.name.trim() || !c.relationship.trim() || !c.phone.trim()) {
          setErrorMessage(
            'Each emergency contact must have a name, relationship, and phone number.',
          );
          setSubmitting(false);
          return;
        }
      }

      const payload = {
        personalEmail: personalEmail.trim() || undefined,
        phone: phone.trim() || undefined,
        alternatePhone: alternatePhone.trim() || undefined,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        state: stateVal.trim() || undefined,
        postalCode: postalCode.trim() || undefined,
        country: country.trim() || undefined,
        emergencyContacts: emergencyContacts.map((c) => ({
          name: c.name.trim(),
          relationship: c.relationship.trim(),
          phone: c.phone.trim(),
          alternatePhone: c.alternatePhone?.trim() || undefined,
          address: c.address?.trim() || undefined,
          isPrimary: !!c.isPrimary,
        })),
        reason: reason.trim() || undefined,
      };

      await employeesApi.createProfileChangeRequest(payload);
      setSuccessMessage('Profile change request successfully submitted for HR approval.');
      setIsModalOpen(false);
      setActiveTab('history');
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to submit profile change request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelRequest = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this pending profile change request?')) {
      return;
    }
    setCancellingId(id);
    try {
      await employeesApi.cancelProfileChangeRequest(id);
      setSuccessMessage('Profile change request cancelled successfully.');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel profile change request.');
    } finally {
      setCancellingId(null);
    }
  };

  const hasPendingRequest = changeRequests.some((r) => r.status === 'PENDING');

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
      <div className="space-y-6 max-w-5xl pb-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-stone-900">My Profile</h1>
            <p className="text-xs md:text-sm text-stone-500 mt-1">
              Personal contact details, employment records, and self-service profile update
              requests.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadData()}
              className="gap-2 text-stone-700 hover:bg-stone-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={openEditModal}
              disabled={hasPendingRequest}
              className="gap-2 bg-amber-600 hover:bg-amber-700 text-white font-medium shadow-xs"
              title={
                hasPendingRequest
                  ? 'You already have a pending request awaiting HR review'
                  : 'Request changes to contact details'
              }
            >
              <Edit3 className="h-3.5 w-3.5" />
              Request Profile Update
            </Button>
          </div>
        </div>

        {/* Global Notifications / Alert Banners */}
        {hasPendingRequest && (
          <div className="rounded-xl bg-amber-50 border border-amber-200/80 p-4 flex items-start gap-3 shadow-2xs">
            <Clock className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs md:text-sm">
              <span className="font-semibold text-amber-900">
                Profile Change Request Pending Review:
              </span>{' '}
              <span className="text-amber-800">
                You have a submitted contact update currently awaiting HR decision. Proposed changes
                are safely staged and will only update authoritative records upon approval.
              </span>
            </div>
            <button
              onClick={() => setActiveTab('history')}
              className="text-xs font-semibold text-amber-900 underline hover:text-amber-950 shrink-0"
            >
              View in History
            </button>
          </div>
        )}

        {successMessage && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 flex items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-2 text-xs md:text-sm text-emerald-800">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-emerald-700 hover:text-emerald-900 text-xs font-semibold"
            >
              Dismiss
            </button>
          </div>
        )}

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
                  ? new Date(employee.joiningDate).toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })
                  : 'March 2024'}
              </span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-stone-200 flex gap-4 text-sm font-medium">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-3 px-1 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'overview'
                ? 'border-amber-600 text-amber-800 font-semibold'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <User className="h-4 w-4" />
            Profile Overview
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`pb-3 px-1 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'history'
                ? 'border-amber-600 text-amber-800 font-semibold'
                : 'border-transparent text-stone-500 hover:text-stone-800'
            }`}
          >
            <History className="h-4 w-4" />
            Request History
            {changeRequests.length > 0 && (
              <span className="ml-1.5 px-2 py-0.2 rounded-full text-xs bg-stone-100 text-stone-700 font-bold">
                {changeRequests.length}
              </span>
            )}
          </button>
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Protected Organizational Details & Personal Contacts Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Read-Only Organizational Information */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <span>Employment & Organization</span>
                      </CardTitle>
                      <CardDescription>Managed and verified by HR department</CardDescription>
                    </div>
                    <Badge variant="outline" size="sm" className="gap-1 text-stone-500 bg-stone-50">
                      <Lock className="h-3 w-3" /> Read-Only
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3.5 text-xs">
                    <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
                      <span className="text-stone-500 flex items-center gap-1.5">
                        <Lock className="h-3 w-3 text-stone-400" /> Employee ID
                      </span>
                      <span className="font-mono font-bold text-stone-900">{empCode}</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
                      <span className="text-stone-500 flex items-center gap-1.5">
                        <Lock className="h-3 w-3 text-stone-400" /> Department
                      </span>
                      <span className="font-semibold text-stone-800">{departmentName}</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
                      <span className="text-stone-500 flex items-center gap-1.5">
                        <Lock className="h-3 w-3 text-stone-400" /> Designation
                      </span>
                      <span className="font-semibold text-stone-800">{designationName}</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
                      <span className="text-stone-500 flex items-center gap-1.5">
                        <Lock className="h-3 w-3 text-stone-400" /> Reporting Manager
                      </span>
                      <span className="font-semibold text-amber-800">{managerName}</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
                      <span className="text-stone-500 flex items-center gap-1.5">
                        <Lock className="h-3 w-3 text-stone-400" /> Office Branch
                      </span>
                      <span className="font-semibold text-stone-800">{branchName}</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
                      <span className="text-stone-500 flex items-center gap-1.5">
                        <Lock className="h-3 w-3 text-stone-400" /> Work Mode
                      </span>
                      <Badge variant="outline" size="sm">
                        {workMode}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between py-1.5">
                      <span className="text-stone-500 flex items-center gap-1.5">
                        <Lock className="h-3 w-3 text-stone-400" /> Official Work Email
                      </span>
                      <span className="font-mono text-stone-800">{email}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Personal Contact Details (Editable via Request) */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Personal Contact Details</CardTitle>
                      <CardDescription>Direct communication & residential address</CardDescription>
                    </div>
                    <Badge
                      variant="outline"
                      size="sm"
                      className="gap-1 text-amber-700 bg-amber-50/60 border-amber-200"
                    >
                      <Edit3 className="h-3 w-3" /> Updatable via HR
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3.5 text-xs">
                    <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
                      <span className="text-stone-500">Personal Email</span>
                      <span className="font-semibold text-stone-900">
                        {employee?.contact?.personalEmail || (
                          <span className="text-stone-400 italic">Not specified</span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
                      <span className="text-stone-500">Mobile Phone</span>
                      <span className="font-semibold text-stone-900">
                        {employee?.contact?.phone || (
                          <span className="text-stone-400 italic">Not specified</span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
                      <span className="text-stone-500">Alternate Phone</span>
                      <span className="font-semibold text-stone-900">
                        {employee?.contact?.alternatePhone || (
                          <span className="text-stone-400 italic">None</span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
                      <span className="text-stone-500">Address</span>
                      <span className="font-semibold text-stone-900 max-w-[220px] text-right truncate">
                        {employee?.contact?.address || (
                          <span className="text-stone-400 italic">Not specified</span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 border-b border-stone-100">
                      <span className="text-stone-500">City & State</span>
                      <span className="font-semibold text-stone-900">
                        {[employee?.contact?.city, employee?.contact?.state]
                          .filter(Boolean)
                          .join(', ') || (
                          <span className="text-stone-400 italic">Not specified</span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1.5">
                      <span className="text-stone-500">Postal Code & Country</span>
                      <span className="font-semibold text-stone-900">
                        {[employee?.contact?.postalCode, employee?.contact?.country || 'India']
                          .filter(Boolean)
                          .join(', ')}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Emergency Contacts Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Emergency Contacts</CardTitle>
                    <CardDescription>
                      Designated contacts notified in medical or urgent workplace situations
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={openEditModal}
                    disabled={hasPendingRequest}
                    className="gap-1.5 text-xs text-amber-800 hover:text-amber-900 border-amber-200"
                  >
                    <Edit3 className="h-3 w-3" /> Update Contacts
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {Array.isArray(employee?.emergencyContacts) &&
                employee.emergencyContacts.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {employee.emergencyContacts.map((contact: any, index: number) => (
                      <div
                        key={contact.id || index}
                        className="rounded-xl border border-stone-200 bg-stone-50/50 p-4 space-y-2 relative"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-stone-900 text-sm">{contact.name}</span>
                          {contact.isPrimary && (
                            <Badge variant="success" size="sm">
                              Primary
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs space-y-1 text-stone-600">
                          <p>
                            <span className="text-stone-400">Relation:</span>{' '}
                            <span className="font-medium text-stone-700">
                              {contact.relationship}
                            </span>
                          </p>
                          <p>
                            <span className="text-stone-400">Phone:</span>{' '}
                            <span className="font-mono font-medium text-stone-800">
                              {contact.phone}
                            </span>
                          </p>
                          {contact.alternatePhone && (
                            <p>
                              <span className="text-stone-400">Alt:</span>{' '}
                              <span className="font-mono text-stone-700">
                                {contact.alternatePhone}
                              </span>
                            </p>
                          )}
                          {contact.address && (
                            <p className="truncate text-stone-500">
                              <span className="text-stone-400">Address:</span> {contact.address}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-stone-200 p-8 text-center text-stone-500 space-y-2">
                    <AlertCircle className="h-8 w-8 text-stone-400 mx-auto" />
                    <p className="text-sm font-medium">No emergency contacts registered yet.</p>
                    <p className="text-xs text-stone-400">
                      Click &quot;Request Profile Update&quot; above to submit emergency contact
                      details for HR review.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* TAB 2: REQUEST HISTORY */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Profile Change Request History</CardTitle>
                    <CardDescription>
                      Audit log of submitted contact updates, reviews, and decisions
                    </CardDescription>
                  </div>
                  <Button
                    size="sm"
                    onClick={openEditModal}
                    disabled={hasPendingRequest}
                    className="gap-2 bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs shadow-xs"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New Request
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {changeRequests.length === 0 ? (
                  <div className="py-12 text-center text-stone-500 space-y-3">
                    <History className="h-10 w-10 text-stone-300 mx-auto" />
                    <p className="text-sm font-medium">No profile change requests found.</p>
                    <p className="text-xs text-stone-400 max-w-md mx-auto">
                      Any contact or emergency contact modifications you submit will appear here
                      with full review timestamps, reviewer decisions, and audit history.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-stone-100">
                    {changeRequests.map((req) => {
                      const isPendingItem = req.status === 'PENDING';
                      const isApproved = req.status === 'APPROVED';
                      const isRejected = req.status === 'REJECTED';
                      const isCancelled = req.status === 'CANCELLED';

                      const proposed = (req.data || {}) as Record<string, any>;
                      const currentSnap = (req.currentData || {}) as Record<string, any>;

                      return (
                        <div key={req.id} className="py-5 space-y-3">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div className="flex items-center gap-3">
                              <Badge
                                variant={
                                  isApproved
                                    ? 'success'
                                    : isPendingItem
                                      ? 'warning'
                                      : isRejected
                                        ? 'danger'
                                        : 'default'
                                }
                                size="sm"
                              >
                                {req.status}
                              </Badge>
                              <span className="text-xs font-semibold text-stone-900">
                                Submitted{' '}
                                {new Date(req.submittedAt).toLocaleDateString('en-GB', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>

                            <div className="flex items-center gap-3">
                              {isPendingItem && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleCancelRequest(req.id)}
                                  disabled={cancellingId === req.id}
                                  className="text-xs text-rose-700 hover:text-rose-800 border-rose-200 hover:bg-rose-50"
                                >
                                  {cancellingId === req.id ? 'Cancelling...' : 'Cancel Request'}
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* Reason and reviewer notes */}
                          {req.reason && (
                            <p className="text-xs text-stone-600 bg-stone-50/80 p-2.5 rounded-lg border border-stone-200/60">
                              <span className="font-semibold text-stone-700">
                                Requester Reason:
                              </span>{' '}
                              {req.reason}
                            </p>
                          )}

                          {req.reviewNotes && (
                            <p
                              className={`text-xs p-2.5 rounded-lg border ${
                                isApproved
                                  ? 'bg-emerald-50/60 border-emerald-200 text-emerald-800'
                                  : 'bg-rose-50/60 border-rose-200 text-rose-800'
                              }`}
                            >
                              <span className="font-semibold">Reviewer Notes:</span>{' '}
                              {req.reviewNotes}
                              {req.reviewer && (
                                <span className="block mt-0.5 text-stone-500 font-normal">
                                  Reviewed by {req.reviewer.firstName} {req.reviewer.lastName} on{' '}
                                  {new Date(req.reviewedAt).toLocaleDateString()}
                                </span>
                              )}
                            </p>
                          )}

                          {/* Proposed changes snapshot table */}
                          <div className="text-xs bg-stone-50/50 rounded-xl p-3 border border-stone-200/60 space-y-2">
                            <span className="font-semibold text-stone-700 block">
                              Requested Updates Staging:
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-stone-600">
                              {proposed.personalEmail !== undefined && (
                                <div>
                                  <span className="text-stone-400">Personal Email:</span>{' '}
                                  <span className="font-medium text-stone-900">
                                    {proposed.personalEmail || '(cleared)'}
                                  </span>
                                </div>
                              )}
                              {proposed.phone !== undefined && (
                                <div>
                                  <span className="text-stone-400">Phone:</span>{' '}
                                  <span className="font-medium text-stone-900">
                                    {proposed.phone || '(cleared)'}
                                  </span>
                                </div>
                              )}
                              {proposed.alternatePhone !== undefined && (
                                <div>
                                  <span className="text-stone-400">Alternate Phone:</span>{' '}
                                  <span className="font-medium text-stone-900">
                                    {proposed.alternatePhone || '(cleared)'}
                                  </span>
                                </div>
                              )}
                              {proposed.address !== undefined && (
                                <div>
                                  <span className="text-stone-400">Address:</span>{' '}
                                  <span className="font-medium text-stone-900">
                                    {[
                                      proposed.address,
                                      proposed.city,
                                      proposed.state,
                                      proposed.postalCode,
                                    ]
                                      .filter(Boolean)
                                      .join(', ')}
                                  </span>
                                </div>
                              )}
                              {Array.isArray(proposed.emergencyContacts) && (
                                <div className="sm:col-span-2">
                                  <span className="text-stone-400">
                                    Emergency Contacts ({proposed.emergencyContacts.length}):
                                  </span>{' '}
                                  <span className="font-medium text-stone-900">
                                    {proposed.emergencyContacts
                                      .map((c: any) => `${c.name} (${c.relationship}: ${c.phone})`)
                                      .join('; ')}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* MODAL: SUBMIT PROFILE CHANGE REQUEST */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-xs overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-2xl w-full border border-stone-200 shadow-xl overflow-hidden my-8">
              <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50/50">
                <div>
                  <h3 className="font-bold text-stone-900 text-base">Request Profile Update</h3>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Proposed contact details will be staged and sent to HR for approval.
                  </p>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-stone-400 hover:text-stone-600 rounded-lg p-1.5 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSubmitRequest} className="p-6 space-y-5">
                {errorMessage && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <div className="rounded-xl bg-amber-50/60 border border-amber-200/60 p-3 text-xs text-amber-800 flex items-start gap-2">
                  <ShieldCheck className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    <strong>Strict Access Control:</strong> Protected fields (employee code, role,
                    designation, department, reporting manager, salary, and employment status)
                    cannot be modified via self-service.
                  </span>
                </div>

                {/* Personal Contact Details */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                    Contact Details
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-stone-700 font-semibold mb-1">
                        Personal Email
                      </label>
                      <input
                        type="email"
                        value={personalEmail}
                        onChange={(e) => setPersonalEmail(e.target.value)}
                        placeholder="you.personal@gmail.com"
                        className="w-full px-3 py-2 rounded-lg border border-stone-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-stone-700 font-semibold mb-1">
                        Mobile Phone
                      </label>
                      <input
                        type="text"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+91 98765 43210"
                        className="w-full px-3 py-2 rounded-lg border border-stone-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-stone-700 font-semibold mb-1">
                        Alternate Phone
                      </label>
                      <input
                        type="text"
                        value={alternatePhone}
                        onChange={(e) => setAlternatePhone(e.target.value)}
                        placeholder="+91 98765 43211"
                        className="w-full px-3 py-2 rounded-lg border border-stone-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-stone-700 font-semibold mb-1">Country</label>
                      <input
                        type="text"
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        placeholder="India"
                        className="w-full px-3 py-2 rounded-lg border border-stone-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-xs"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-stone-700 font-semibold mb-1">
                        Residential Address
                      </label>
                      <input
                        type="text"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="Flat / House No., Street, Area"
                        className="w-full px-3 py-2 rounded-lg border border-stone-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-stone-700 font-semibold mb-1">City</label>
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="Bengaluru"
                        className="w-full px-3 py-2 rounded-lg border border-stone-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-stone-700 font-semibold mb-1">
                        State / Province
                      </label>
                      <input
                        type="text"
                        value={stateVal}
                        onChange={(e) => setStateVal(e.target.value)}
                        placeholder="Karnataka"
                        className="w-full px-3 py-2 rounded-lg border border-stone-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-stone-700 font-semibold mb-1">Postal Code</label>
                      <input
                        type="text"
                        value={postalCode}
                        onChange={(e) => setPostalCode(e.target.value)}
                        placeholder="560001"
                        className="w-full px-3 py-2 rounded-lg border border-stone-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Emergency Contacts Section */}
                <div className="space-y-3 pt-2 border-t border-stone-100">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                      Emergency Contacts
                    </h4>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddEmergencyContact}
                      className="gap-1 text-xs py-1 text-stone-700"
                    >
                      <Plus className="h-3 w-3" /> Add Contact
                    </Button>
                  </div>

                  {emergencyContacts.map((contact, index) => (
                    <div
                      key={index}
                      className="rounded-xl border border-stone-200 bg-stone-50/40 p-3 space-y-3 relative"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-stone-800">
                          Contact #{index + 1}
                        </span>
                        {emergencyContacts.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveEmergencyContact(index)}
                            className="text-stone-400 hover:text-rose-600 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                        <div>
                          <label className="block text-stone-600 font-medium mb-1">
                            Full Name *
                          </label>
                          <input
                            type="text"
                            required
                            value={contact.name}
                            onChange={(e) =>
                              handleEmergencyContactChange(index, 'name', e.target.value)
                            }
                            placeholder="Relative Name"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs focus:ring-1 focus:ring-amber-500"
                          />
                        </div>
                        <div>
                          <label className="block text-stone-600 font-medium mb-1">
                            Relationship *
                          </label>
                          <input
                            type="text"
                            required
                            value={contact.relationship}
                            onChange={(e) =>
                              handleEmergencyContactChange(index, 'relationship', e.target.value)
                            }
                            placeholder="Spouse / Parent / Sibling"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs focus:ring-1 focus:ring-amber-500"
                          />
                        </div>
                        <div>
                          <label className="block text-stone-600 font-medium mb-1">Phone *</label>
                          <input
                            type="text"
                            required
                            value={contact.phone}
                            onChange={(e) =>
                              handleEmergencyContactChange(index, 'phone', e.target.value)
                            }
                            placeholder="+91 98765 43210"
                            className="w-full px-2.5 py-1.5 rounded-lg border border-stone-200 text-xs focus:ring-1 focus:ring-amber-500"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="checkbox"
                          id={`primary-${index}`}
                          checked={contact.isPrimary}
                          onChange={(e) =>
                            handleEmergencyContactChange(index, 'isPrimary', e.target.checked)
                          }
                          className="rounded text-amber-600 focus:ring-amber-500 h-3.5 w-3.5"
                        />
                        <label
                          htmlFor={`primary-${index}`}
                          className="text-xs text-stone-600 cursor-pointer"
                        >
                          Designate as Primary Emergency Contact
                        </label>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Reason for Change */}
                <div className="space-y-1.5 pt-2 border-t border-stone-100">
                  <label className="block text-stone-700 font-semibold text-xs">
                    Reason for Update (Reviewed by HR)
                  </label>
                  <textarea
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Relocated to new residence in Indiranagar; updated emergency phone number."
                    className="w-full px-3 py-2 rounded-lg border border-stone-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-xs resize-none"
                  />
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-200">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsModalOpen(false)}
                    disabled={submitting}
                    className="text-xs text-stone-600"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="text-xs bg-amber-600 hover:bg-amber-700 text-white font-semibold shadow-xs"
                  >
                    {submitting ? 'Submitting Request...' : 'Submit for HR Review'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
