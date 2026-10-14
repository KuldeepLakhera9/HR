'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '../../../layouts/AppShell';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Badge } from '@hrms/ui';
import {
  User,
  Briefcase,
  Mail,
  Phone,
  ShieldAlert,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Save,
  AlertCircle,
  ShieldCheck,
  Eye,
  EyeOff,
  KeyRound,
} from 'lucide-react';
import { employeesApi, organizationApi } from '../../../lib/api-client';
import { RoleType } from '@hrms/types';

const STEPS = [
  { id: 1, title: 'Basic Information', icon: User },
  { id: 2, title: 'Employment', icon: Briefcase },
  { id: 3, title: 'Contact', icon: Mail },
  { id: 4, title: 'Emergency Contact', icon: ShieldAlert },
  { id: 5, title: 'Review & Submit', icon: CheckCircle },
];

export default function AddEmployeePage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showInitialPassword, setShowInitialPassword] = useState(false);

  // Lookups
  const [branches, setBranches] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [designations, setDesignations] = useState<any[]>([]);
  const [managers, setManagers] = useState<any[]>([]);

  // Form State
  const [formData, setFormData] = useState({
    // Step 1: Basic
    employeeCode: '',
    firstName: '',
    middleName: '',
    lastName: '',
    displayName: '',
    dateOfBirth: '',
    gender: 'PREFER_NOT_TO_SAY',
    joiningDate: new Date().toISOString().split('T')[0],

    // Step 2: Employment
    branchId: '',
    departmentId: '',
    designationId: '',
    customDesignation: '',
    managerId: '',
    employmentType: 'FULL_TIME',
    employmentStatus: 'PROBATION',
    workMode: 'OFFICE',
    noticePeriodDays: 30,

    // Step 3: Contact
    workEmail: '',
    personalEmail: '',
    phone: '',
    alternatePhone: '',
    address: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'India',

    // Step 4: Emergency Contact
    emergencyName: '',
    emergencyRelationship: 'Spouse / Parent',
    emergencyPhone: '',
    emergencyAddress: '',

    // Login account & credentials
    createLoginAccount: true,
    initialPassword: 'Password@123',
    role: 'EMPLOYEE' as RoleType,
  });

  useEffect(() => {
    async function loadLookups() {
      try {
        const [brs, depts, desigs, emps] = await Promise.all([
          organizationApi.getBranches({ status: 'active' }),
          organizationApi.getDepartments({ status: 'active' }),
          organizationApi.getDesignations({ status: 'active' }),
          employeesApi.findAll({ limit: 100 }),
        ]);

        // Prioritize and display ADT-AI Training Foundation branch
        const adtBranches = (brs || []).filter(
          (b: any) =>
            b.name.toLowerCase().includes('adt') ||
            b.code.toLowerCase().includes('adt') ||
            b.name.toLowerCase().includes('training foundation'),
        );
        const resolvedBranches = adtBranches.length > 0 ? adtBranches : brs || [];

        setBranches(resolvedBranches);
        setDepartments(depts || []);
        setDesignations(desigs || []);
        setManagers(emps.items || []);

        // Pre-select defaults
        if (resolvedBranches.length > 0)
          setFormData((prev) => ({ ...prev, branchId: prev.branchId || resolvedBranches[0].id }));
        if (depts && depts.length > 0)
          setFormData((prev) => ({ ...prev, departmentId: prev.departmentId || depts[0].id }));
        if (desigs && desigs.length > 0)
          setFormData((prev) => ({ ...prev, designationId: prev.designationId || desigs[0].id }));
      } catch (err) {
        console.error('Failed to load form lookups:', err);
      }
    }
    loadLookups();
  }, []);

  const validateStep = (step: number): boolean => {
    setErrorMessage(null);
    if (step === 1) {
      if (!formData.employeeCode.trim()) {
        setErrorMessage('Employee Code is required.');
        return false;
      }
      if (!formData.firstName.trim() || !formData.lastName.trim()) {
        setErrorMessage('First Name and Last Name are required.');
        return false;
      }
    }
    if (step === 2) {
      if (!formData.branchId || !formData.departmentId || !formData.designationId) {
        setErrorMessage('Branch, Department, and Designation are all mandatory.');
        return false;
      }
      if (formData.designationId === 'OTHER' && !formData.customDesignation.trim()) {
        setErrorMessage('Please enter the manual designation answer.');
        return false;
      }
    }
    if (step === 3) {
      if (!formData.workEmail.trim()) {
        setErrorMessage('Official Work Email is required.');
        return false;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.workEmail)) {
        setErrorMessage('Please provide a valid work email address format.');
        return false;
      }
    }
    if (step === 4) {
      if (!formData.emergencyName.trim() || !formData.emergencyPhone.trim()) {
        setErrorMessage('Primary emergency contact name and phone number are required.');
        return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((s) => Math.min(STEPS.length, s + 1));
    }
  };

  const handleBack = () => {
    setErrorMessage(null);
    setCurrentStep((s) => Math.max(1, s - 1));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      let resolvedDesignationId = formData.designationId;

      if (formData.designationId === 'OTHER' && formData.customDesignation.trim()) {
        const customTitle = formData.customDesignation.trim();
        const existing = designations.find(
          (d) => d.title.toLowerCase() === customTitle.toLowerCase(),
        );
        if (existing) {
          resolvedDesignationId = existing.id;
        } else {
          try {
            const newDesig = await organizationApi.createDesignation({
              departmentId: formData.departmentId,
              title: customTitle,
              code:
                customTitle
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, '_')
                  .replace(/_+/g, '_')
                  .slice(0, 20) || `DESIG_${Date.now().toString().slice(-6)}`,
              level: 1,
              description: `Custom designation: ${customTitle}`,
            });
            if (newDesig?.id) {
              resolvedDesignationId = newDesig.id;
            }
          } catch (e) {
            console.warn('Frontend designation creation fallback to backend:', e);
          }
        }
      }

      const payload: any = {
        employeeCode: formData.employeeCode.trim().toUpperCase(),
        firstName: formData.firstName.trim(),
        middleName: formData.middleName.trim() || undefined,
        lastName: formData.lastName.trim(),
        displayName:
          formData.displayName.trim() ||
          `${formData.firstName} ${formData.middleName ? formData.middleName + ' ' : ''}${formData.lastName}`.trim(),
        dateOfBirth: formData.dateOfBirth
          ? new Date(formData.dateOfBirth).toISOString()
          : undefined,
        gender: formData.gender,
        joiningDate: formData.joiningDate
          ? new Date(formData.joiningDate).toISOString()
          : undefined,

        branchId: formData.branchId,
        departmentId: formData.departmentId,
        designationId: resolvedDesignationId !== 'OTHER' ? resolvedDesignationId : undefined,
        customDesignation:
          formData.designationId === 'OTHER' ? formData.customDesignation.trim() : undefined,
        managerId: formData.managerId || undefined,
        employmentType: formData.employmentType,
        employmentStatus: formData.employmentStatus,
        workMode: formData.workMode,
        noticePeriodDays: Number(formData.noticePeriodDays) || 30,

        workEmail: formData.workEmail.trim().toLowerCase(),
        personalEmail: formData.personalEmail.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        alternatePhone: formData.alternatePhone.trim() || undefined,
        address: formData.address.trim() || undefined,
        city: formData.city.trim() || undefined,
        state: formData.state.trim() || undefined,
        postalCode: formData.postalCode.trim() || undefined,
        country: formData.country.trim() || 'India',

        emergencyContacts: [
          {
            name: formData.emergencyName.trim(),
            relationship: formData.emergencyRelationship.trim(),
            phone: formData.emergencyPhone.trim(),
            address: formData.emergencyAddress.trim() || undefined,
            isPrimary: true,
          },
        ],

        createLoginAccount: formData.createLoginAccount,
        initialPassword: formData.initialPassword,
        role: formData.role,
      };

      const result = await employeesApi.create(payload);
      router.push(`/employees/${result.id}`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create employee record');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-stone-900">Add New Employee</h1>
          <p className="text-xs md:text-sm text-stone-500 mt-1">
            Complete the multi-step onboarding wizard to register personal, organizational, and
            contact details.
          </p>
        </div>

        {/* Stepper Progress Bar */}
        <div className="grid grid-cols-5 gap-2 border-b border-stone-200 pb-4">
          {STEPS.map((s) => {
            const Icon = s.icon;
            const isCompleted = currentStep > s.id;
            const isCurrent = currentStep === s.id;
            return (
              <div
                key={s.id}
                className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${
                  isCurrent
                    ? 'bg-amber-50 text-amber-900 border border-amber-200'
                    : isCompleted
                      ? 'text-emerald-700'
                      : 'text-stone-400'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                    isCurrent
                      ? 'bg-amber-800 text-white'
                      : isCompleted
                        ? 'bg-emerald-600 text-white'
                        : 'bg-stone-200 text-stone-600'
                  }`}
                >
                  {isCompleted ? '✓' : s.id}
                </div>
                <div className="hidden sm:block text-xs font-medium truncate">{s.title}</div>
              </div>
            );
          })}
        </div>

        {/* Form Body */}
        <Card className="border border-stone-200/80 shadow-xs">
          <CardContent className="p-6">
            {errorMessage && (
              <div className="mb-4 p-3 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
                <div>{errorMessage}</div>
              </div>
            )}

            {/* STEP 1: Basic Information */}
            {currentStep === 1 && (
              <div className="space-y-4">
                <h2 className="text-sm font-bold text-stone-900 uppercase tracking-wider mb-2">
                  1. Basic Information
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Employee Code *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. EMP009"
                      value={formData.employeeCode}
                      onChange={(e) => setFormData({ ...formData, employeeCode: e.target.value })}
                      className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md uppercase font-mono focus:outline-none focus:ring-1 focus:ring-amber-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      First Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Rahul"
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Verma"
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Middle Name (Optional)
                    </label>
                    <input
                      type="text"
                      value={formData.middleName}
                      onChange={(e) => setFormData({ ...formData, middleName: e.target.value })}
                      className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Date of Birth
                    </label>
                    <input
                      type="date"
                      value={formData.dateOfBirth}
                      onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                      className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Gender
                    </label>
                    <select
                      value={formData.gender}
                      onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                      className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700 bg-white"
                    >
                      <option value="PREFER_NOT_TO_SAY">Prefer not to say</option>
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Joining Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.joiningDate}
                    onChange={(e) => setFormData({ ...formData, joiningDate: e.target.value })}
                    className="w-full sm:w-1/3 text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700"
                  />
                </div>
              </div>
            )}

            {/* STEP 2: Employment */}
            {currentStep === 2 && (
              <div className="space-y-4">
                <h2 className="text-sm font-bold text-stone-900 uppercase tracking-wider mb-2">
                  2. Organization & Employment Placement
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Branch / Workplace *
                    </label>
                    <select
                      value={formData.branchId}
                      onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                      className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700 bg-white"
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Department *
                    </label>
                    <select
                      value={formData.departmentId}
                      onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                      className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700 bg-white"
                    >
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Designation *
                    </label>
                    <select
                      value={formData.designationId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData({
                          ...formData,
                          designationId: val,
                          customDesignation: val === 'OTHER' ? formData.customDesignation : '',
                        });
                      }}
                      className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700 bg-white"
                    >
                      {designations.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.title} (Level {d.level || 1})
                        </option>
                      ))}
                      <option value="OTHER">Other (Enter manual designation...)</option>
                    </select>

                    {formData.designationId === 'OTHER' && (
                      <div className="mt-2.5 p-2.5 bg-amber-50/70 border border-amber-200 rounded-lg space-y-1.5 transition-all">
                        <label className="block text-xs font-bold text-amber-900">
                          Manual Designation Answer *
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.customDesignation}
                          onChange={(e) =>
                            setFormData({ ...formData, customDesignation: e.target.value })
                          }
                          placeholder="e.g. AI Research Scientist, Technical Trainer, etc."
                          className="w-full text-xs px-3 py-2 border border-amber-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700 bg-white text-stone-900 font-medium"
                          autoFocus
                        />
                        <p className="text-[11px] text-amber-800">
                          Enter your custom designation. It will be registered and linked to this
                          employee.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Reporting Manager
                    </label>
                    <select
                      value={formData.managerId}
                      onChange={(e) => setFormData({ ...formData, managerId: e.target.value })}
                      className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700 bg-white"
                    >
                      <option value="">None (Top-level / Reports to Board)</option>
                      {managers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.displayName} ({m.employeeCode} - {m.designationTitle || 'Leader'})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Work Mode *
                    </label>
                    <select
                      value={formData.workMode}
                      onChange={(e) => setFormData({ ...formData, workMode: e.target.value })}
                      className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700 bg-white"
                    >
                      <option value="OFFICE">Office</option>
                      <option value="HYBRID">Hybrid</option>
                      <option value="REMOTE">Remote</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Employment Type
                    </label>
                    <select
                      value={formData.employmentType}
                      onChange={(e) => setFormData({ ...formData, employmentType: e.target.value })}
                      className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700 bg-white"
                    >
                      <option value="FULL_TIME">Full Time</option>
                      <option value="PART_TIME">Part Time</option>
                      <option value="CONTRACT">Contract</option>
                      <option value="INTERN">Intern</option>
                      <option value="CONSULTANT">Consultant</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Initial Status
                    </label>
                    <select
                      value={formData.employmentStatus}
                      onChange={(e) =>
                        setFormData({ ...formData, employmentStatus: e.target.value })
                      }
                      className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700 bg-white"
                    >
                      <option value="PROBATION">Probation</option>
                      <option value="ACTIVE">Active</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Notice Period (Days)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={180}
                      value={formData.noticePeriodDays}
                      onChange={(e) =>
                        setFormData({ ...formData, noticePeriodDays: Number(e.target.value) })
                      }
                      className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: Contact */}
            {currentStep === 3 && (
              <div className="space-y-4">
                <h2 className="text-sm font-bold text-stone-900 uppercase tracking-wider mb-2">
                  3. Contact & Address Details
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Official Work Email *
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="e.g. name@peopleos.local"
                      value={formData.workEmail}
                      onChange={(e) => setFormData({ ...formData, workEmail: e.target.value })}
                      className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Personal Email
                    </label>
                    <input
                      type="email"
                      placeholder="e.g. personal@gmail.com"
                      value={formData.personalEmail}
                      onChange={(e) => setFormData({ ...formData, personalEmail: e.target.value })}
                      className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Primary Phone
                    </label>
                    <input
                      type="text"
                      placeholder="+91 98765 00000"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Alternate Phone
                    </label>
                    <input
                      type="text"
                      placeholder="+91 98765 11111"
                      value={formData.alternatePhone}
                      onChange={(e) => setFormData({ ...formData, alternatePhone: e.target.value })}
                      className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Residential Address
                  </label>
                  <textarea
                    rows={2}
                    placeholder="House / Flat No, Street, Landmark..."
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">City</label>
                    <input
                      type="text"
                      placeholder="Bengaluru"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">State</label>
                    <input
                      type="text"
                      placeholder="Karnataka"
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Postal Code
                    </label>
                    <input
                      type="text"
                      placeholder="560001"
                      value={formData.postalCode}
                      onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                      className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 4: Emergency Contacts */}
            {currentStep === 4 && (
              <div className="space-y-4">
                <h2 className="text-sm font-bold text-stone-900 uppercase tracking-wider mb-2">
                  4. Primary Emergency Contact
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Contact Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Sunita Verma"
                      value={formData.emergencyName}
                      onChange={(e) => setFormData({ ...formData, emergencyName: e.target.value })}
                      className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Relationship *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Spouse / Mother / Sibling"
                      value={formData.emergencyRelationship}
                      onChange={(e) =>
                        setFormData({ ...formData, emergencyRelationship: e.target.value })
                      }
                      className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Emergency Phone *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="+91 98765 99999"
                    value={formData.emergencyPhone}
                    onChange={(e) => setFormData({ ...formData, emergencyPhone: e.target.value })}
                    className="w-full sm:w-1/2 text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700"
                  />
                </div>

                <div className="pt-4 border-t border-stone-200 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      id="createLoginAccount"
                      checked={formData.createLoginAccount}
                      onChange={(e) =>
                        setFormData({ ...formData, createLoginAccount: e.target.checked })
                      }
                      className="mt-0.5 rounded border-stone-300 text-amber-800 focus:ring-amber-700"
                    />
                    <label htmlFor="createLoginAccount" className="cursor-pointer">
                      <span className="block text-xs font-bold text-stone-900">
                        Create System Login Credentials for this Employee
                      </span>
                      <span className="block text-[11px] text-stone-500">
                        Generates a secure user authentication account allowing this employee to log
                        in and access their role.
                      </span>
                    </label>
                  </div>

                  {formData.createLoginAccount && (
                    <div className="p-4 bg-amber-50/70 border border-amber-200/90 rounded-xl space-y-3.5 mt-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-amber-950 pb-2 border-b border-amber-200/60">
                        <KeyRound className="h-4 w-4 text-amber-700" />
                        <span>System Login & Role Access Setup</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div>
                          <label className="block text-xs font-semibold text-stone-700 mb-1">
                            Login ID / Work Email
                          </label>
                          <input
                            type="text"
                            readOnly
                            disabled
                            value={formData.workEmail || '(Provide Work Email in Step 3)'}
                            className="w-full text-xs px-3 py-2 border border-stone-200 rounded-md bg-stone-100/80 text-stone-700 font-mono"
                          />
                          <p className="text-[10px] text-stone-500 mt-1">
                            Official work email acts as their unique sign-in username.
                          </p>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-stone-700 mb-1">
                            Assigned System Role *
                          </label>
                          <select
                            value={formData.role}
                            onChange={(e) =>
                              setFormData({ ...formData, role: e.target.value as RoleType })
                            }
                            className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700 bg-white font-semibold text-stone-800"
                          >
                            <option value="EMPLOYEE">
                              EMPLOYEE (Self-Service Portal & Requests)
                            </option>
                            <option value="MANAGER">
                              MANAGER (Team Oversight, Approvals & Reviews)
                            </option>
                            <option value="HR">HR (Workforce Management & Operations)</option>
                            <option value="ADMIN">
                              ADMIN (Full System Administration & Security)
                            </option>
                          </select>
                          <p className="text-[10px] text-stone-500 mt-1">
                            Determines access rights and navigation throughout their session.
                          </p>
                        </div>

                        <div className="sm:col-span-2">
                          <label className="block text-xs font-semibold text-stone-700 mb-1">
                            Initial Login Password *
                          </label>
                          <div className="relative max-w-sm">
                            <input
                              type={showInitialPassword ? 'text' : 'password'}
                              required={formData.createLoginAccount}
                              value={formData.initialPassword}
                              onChange={(e) =>
                                setFormData({ ...formData, initialPassword: e.target.value })
                              }
                              placeholder="e.g. Password@123"
                              className="w-full text-xs px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-700 pr-10 font-mono"
                            />
                            <button
                              type="button"
                              onClick={() => setShowInitialPassword(!showInitialPassword)}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-1"
                              aria-label={showInitialPassword ? 'Hide password' : 'Show password'}
                            >
                              {showInitialPassword ? (
                                <EyeOff className="h-3.5 w-3.5" />
                              ) : (
                                <Eye className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                          <p className="text-[10px] text-stone-500 mt-1">
                            Default initial password:{' '}
                            <code className="font-mono font-semibold text-amber-900 bg-amber-100/60 px-1 py-0.5 rounded">
                              Password@123
                            </code>
                            . The employee can use this immediately at sign in.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* STEP 5: Review & Submit */}
            {currentStep === 5 && (
              <div className="space-y-4">
                <h2 className="text-sm font-bold text-stone-900 uppercase tracking-wider mb-2">
                  5. Review Employee Information
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="p-3 bg-stone-50 rounded-lg space-y-2 border border-stone-200">
                    <div className="font-bold text-stone-900 border-b pb-1">Personal Details</div>
                    <div>
                      <strong>Code:</strong> {formData.employeeCode}
                    </div>
                    <div>
                      <strong>Name:</strong> {formData.firstName} {formData.middleName}{' '}
                      {formData.lastName}
                    </div>
                    <div>
                      <strong>Gender:</strong> {formData.gender}
                    </div>
                    <div>
                      <strong>Joining Date:</strong> {formData.joiningDate}
                    </div>
                  </div>

                  <div className="p-3 bg-stone-50 rounded-lg space-y-2 border border-stone-200">
                    <div className="font-bold text-stone-900 border-b pb-1">Placement</div>
                    <div>
                      <strong>Branch:</strong>{' '}
                      {branches.find((b) => b.id === formData.branchId)?.name || 'HQ'}
                    </div>
                    <div>
                      <strong>Department:</strong>{' '}
                      {departments.find((d) => d.id === formData.departmentId)?.name || 'General'}
                    </div>
                    <div>
                      <strong>Designation:</strong>{' '}
                      {formData.designationId === 'OTHER'
                        ? `${formData.customDesignation || 'Custom Designation'} (Custom)`
                        : designations.find((d) => d.id === formData.designationId)?.title ||
                          'Staff'}
                    </div>
                    <div>
                      <strong>Work Mode:</strong> {formData.workMode}
                    </div>
                    <div>
                      <strong>Status:</strong> {formData.employmentStatus}
                    </div>
                  </div>

                  <div className="p-3 bg-stone-50 rounded-lg space-y-2 border border-stone-200">
                    <div className="font-bold text-stone-900 border-b pb-1">
                      Contact Information
                    </div>
                    <div>
                      <strong>Work Email:</strong> {formData.workEmail}
                    </div>
                    <div>
                      <strong>Personal Email:</strong> {formData.personalEmail || 'None'}
                    </div>
                    <div>
                      <strong>Phone:</strong> {formData.phone || 'None'}
                    </div>
                    <div>
                      <strong>City:</strong> {formData.city || 'None'}, {formData.state || ''}
                    </div>
                  </div>

                  <div className="p-3 bg-stone-50 rounded-lg space-y-2 border border-stone-200">
                    <div className="font-bold text-stone-900 border-b pb-1">Emergency Contact</div>
                    <div>
                      <strong>Name:</strong> {formData.emergencyName} (
                      {formData.emergencyRelationship})
                    </div>
                    <div>
                      <strong>Phone:</strong> {formData.emergencyPhone}
                    </div>
                  </div>

                  {/* Account Credentials Card */}
                  <div className="sm:col-span-2 p-3.5 bg-amber-50/50 rounded-xl space-y-2 border border-amber-200/90">
                    <div className="font-bold text-stone-900 border-b border-amber-200/60 pb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-amber-950">
                        <KeyRound className="h-3.5 w-3.5 text-amber-700" />
                        Login Credentials & Access Role
                      </span>
                      {formData.createLoginAccount ? (
                        <Badge variant="success">CREDENTIALS READY</Badge>
                      ) : (
                        <Badge variant="warning">NO LOGIN ACCOUNT</Badge>
                      )}
                    </div>
                    {formData.createLoginAccount ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                        <div>
                          <span className="text-stone-500 block text-[11px]">
                            Sign-in Work Email:
                          </span>
                          <span className="font-mono font-semibold text-stone-800">
                            {formData.workEmail}
                          </span>
                        </div>
                        <div>
                          <span className="text-stone-500 block text-[11px]">Allocated Role:</span>
                          <span className="inline-block mt-0.5 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            {formData.role}
                          </span>
                        </div>
                        <div>
                          <span className="text-stone-500 block text-[11px]">
                            Initial Password:
                          </span>
                          <span className="font-mono font-semibold text-stone-800">
                            {formData.initialPassword}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-stone-500 text-xs italic">
                        No login credentials requested. This record is managed administratively
                        only.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Stepper Navigation Buttons */}
            <div className="flex justify-between items-center pt-6 mt-6 border-t border-stone-200">
              <Button
                variant="outline"
                disabled={currentStep === 1 || submitting}
                onClick={handleBack}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Previous Step
              </Button>

              {currentStep < 5 ? (
                <Button className="bg-amber-800 hover:bg-amber-900 text-white" onClick={handleNext}>
                  Continue
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button
                  disabled={submitting}
                  className="bg-amber-800 hover:bg-amber-900 text-white"
                  onClick={handleSubmit}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {submitting ? 'Creating Employee...' : 'Confirm & Create Employee'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
