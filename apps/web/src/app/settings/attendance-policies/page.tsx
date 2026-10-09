'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppShell } from '../../../layouts/AppShell';
import {
  Button,
  Input,
  Badge,
  Toast,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Dialog,
  Switch,
} from '@hrms/ui';
import {
  Clock,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  Calendar,
  Layers,
  Sliders,
  Moon,
  Sun,
  Timer,
  AlertCircle,
  Play,
  RotateCcw,
  Users,
  ShieldCheck,
} from 'lucide-react';
import {
  attendancePoliciesApi,
  shiftsApi,
  organizationApi,
  employeesApi,
} from '../../../lib/api-client';
import {
  AttendancePolicyDto,
  ShiftDto,
  ShiftAssignmentDto,
  PolicyEvaluationResultDto,
} from '@hrms/types';

export default function AttendancePoliciesPage() {
  const [activeTab, setActiveTab] = useState<'POLICIES' | 'SHIFTS' | 'ASSIGNMENTS' | 'SIMULATOR'>(
    'POLICIES',
  );
  const [policies, setPolicies] = useState<AttendancePolicyDto[]>([]);
  const [shifts, setShifts] = useState<ShiftDto[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [toastMessage, setToastMessage] = useState<{
    type: 'success' | 'error' | 'warning';
    title: string;
    message: string;
  } | null>(null);

  // Policy Modal State
  const [isPolicyModalOpen, setIsPolicyModalOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<AttendancePolicyDto | null>(null);
  const [policyForm, setPolicyForm] = useState({
    name: '',
    code: '',
    branchId: '',
    description: '',
    isDefault: false,
    standardWorkMinutes: 480,
    halfDayThresholdMinutes: 240,
    fullDayThresholdMinutes: 420,
    gracePeriodMinutes: 15,
    maxCheckInDelayMinutes: 120,
    maxDailyBreakMinutes: 60,
    maxSingleBreakMinutes: 45,
    allowMultipleSessions: true,
    overnightShiftAllowed: false,
    workingDayStartHour: 5,
    timezone: 'Asia/Kolkata',
    geofenceEnforcement: true,
    maxGpsAccuracyMeters: 100,
    isActive: true,
  });

  // Shift Modal State
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<ShiftDto | null>(null);
  const [shiftForm, setShiftForm] = useState({
    name: '',
    code: '',
    policyId: '',
    description: '',
    startTime: '09:00',
    endTime: '18:00',
    isOvernight: false,
    workDays: [1, 2, 3, 4, 5],
    breakDurationMinutes: 60,
    color: '#3b82f6',
    isActive: true,
  });

  // Shift Assignment Modal State
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({
    employeeId: '',
    shiftId: '',
    effectiveFrom: new Date().toISOString().split('T')[0],
    effectiveTo: '',
  });

  // Simulator State
  const [simPolicyId, setSimPolicyId] = useState('');
  const [simShiftId, setSimShiftId] = useState('');
  const [simWorkingDate, setSimWorkingDate] = useState(new Date().toISOString().split('T')[0]);
  const [simCheckIn, setSimCheckIn] = useState('09:12');
  const [simCheckOut, setSimCheckOut] = useState('18:05');
  const [simBreakMinutes, setSimBreakMinutes] = useState(45);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simResult, setSimResult] = useState<PolicyEvaluationResultDto | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [pRes, sRes, aRes, bRes, eRes] = await Promise.all([
        attendancePoliciesApi.getAll(),
        shiftsApi.getAll(),
        shiftsApi.getAssignments(),
        organizationApi.getBranches({ limit: 100 }),
        employeesApi.findAll({ limit: 100 }),
      ]);

      if (pRes) setPolicies(pRes);
      if (sRes) setShifts(sRes);
      if (aRes) setAssignments(aRes);
      if (Array.isArray(bRes)) setBranches(bRes);
      if (eRes?.items) setEmployees(eRes.items);
    } catch (err: any) {
      setToastMessage({
        type: 'error',
        title: 'Loading Failed',
        message: err.message || 'Could not load policy records.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Policy Submission
  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingPolicy) {
        await attendancePoliciesApi.update(editingPolicy.id, policyForm);
        setToastMessage({
          type: 'success',
          title: 'Policy Updated',
          message: `${policyForm.name} updated successfully.`,
        });
      } else {
        await attendancePoliciesApi.create(policyForm);
        setToastMessage({
          type: 'success',
          title: 'Policy Created',
          message: `${policyForm.name} created successfully.`,
        });
      }
      setIsPolicyModalOpen(false);
      fetchData();
    } catch (err: any) {
      setToastMessage({
        type: 'error',
        title: 'Error Saving Policy',
        message: err.message || 'Operation failed.',
      });
    }
  };

  // Handle Shift Submission
  const handleSaveShift = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingShift) {
        await shiftsApi.update(editingShift.id, shiftForm);
        setToastMessage({
          type: 'success',
          title: 'Shift Updated',
          message: `${shiftForm.name} updated successfully.`,
        });
      } else {
        await shiftsApi.create(shiftForm);
        setToastMessage({
          type: 'success',
          title: 'Shift Created',
          message: `${shiftForm.name} created successfully.`,
        });
      }
      setIsShiftModalOpen(false);
      fetchData();
    } catch (err: any) {
      setToastMessage({
        type: 'error',
        title: 'Error Saving Shift',
        message: err.message || 'Operation failed.',
      });
    }
  };

  // Handle Assignment Submission
  const handleSaveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignForm.employeeId || !assignForm.shiftId) {
      setToastMessage({
        type: 'warning',
        title: 'Missing Selection',
        message: 'Employee and shift are required.',
      });
      return;
    }
    try {
      await shiftsApi.assign({
        employeeId: assignForm.employeeId,
        shiftId: assignForm.shiftId,
        effectiveFrom: new Date(assignForm.effectiveFrom).toISOString(),
        effectiveTo: assignForm.effectiveTo
          ? new Date(assignForm.effectiveTo).toISOString()
          : undefined,
      });
      setToastMessage({
        type: 'success',
        title: 'Shift Assigned',
        message: 'Employee shift schedule updated.',
      });
      setIsAssignModalOpen(false);
      fetchData();
    } catch (err: any) {
      setToastMessage({
        type: 'error',
        title: 'Assignment Failed',
        message: err.message || 'Could not assign shift.',
      });
    }
  };

  // Run Simulator
  const handleRunSimulation = async () => {
    setIsSimulating(true);
    try {
      // Build ISO strings for checkIn and checkOut
      const checkInIso = new Date(`${simWorkingDate}T${simCheckIn}:00.000Z`).toISOString();
      let checkOutIso: string | undefined = undefined;
      if (simCheckOut) {
        // If checkout hour < checkin hour, span to next day
        const [inH] = simCheckIn.split(':').map(Number);
        const [outH] = simCheckOut.split(':').map(Number);
        const [y, m, d] = simWorkingDate.split('-').map(Number);
        const nextDay = outH < inH ? d + 1 : d;
        const targetDayStr = `${y}-${String(m).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`;
        checkOutIso = new Date(`${targetDayStr}T${simCheckOut}:00.000Z`).toISOString();
      }

      const res = await attendancePoliciesApi.simulate({
        policyId: simPolicyId || undefined,
        shiftId: simShiftId || undefined,
        workingDate: simWorkingDate,
        checkInTime: checkInIso,
        checkOutTime: checkOutIso,
        totalBreakMinutes: simBreakMinutes,
      });

      setSimResult(res);
    } catch (err: any) {
      setToastMessage({
        type: 'error',
        title: 'Simulation Failed',
        message: err.message || 'Error executing policy calculation.',
      });
    } finally {
      setIsSimulating(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PRESENT':
        return <Badge variant="success">PRESENT (FULL DAY)</Badge>;
      case 'LATE':
        return <Badge variant="warning">LATE ARRIVAL</Badge>;
      case 'HALF_DAY':
        return <Badge variant="purple">HALF DAY</Badge>;
      case 'ABSENT':
        return <Badge variant="danger">ABSENT</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <AppShell>
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50">
          <Toast
            type={toastMessage.type}
            title={toastMessage.title}
            message={toastMessage.message}
            onClose={() => setToastMessage(null)}
          />
        </div>
      )}

      <div className="space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-stone-200">
          <div>
            <div className="flex items-center gap-2">
              <Clock className="h-6 w-6 text-amber-800" />
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-stone-900">
                Attendance Policies & Shift Schedules
              </h1>
            </div>
            <p className="text-xs md:text-sm text-stone-600 mt-1">
              Configure working hours, half-day/full-day thresholds, grace periods, overnight
              shifts, and test evaluations live.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === 'POLICIES' && (
              <Button
                size="sm"
                onClick={() => {
                  setEditingPolicy(null);
                  setPolicyForm({
                    name: '',
                    code: '',
                    branchId: '',
                    description: '',
                    isDefault: false,
                    standardWorkMinutes: 480,
                    halfDayThresholdMinutes: 240,
                    fullDayThresholdMinutes: 420,
                    gracePeriodMinutes: 15,
                    maxCheckInDelayMinutes: 120,
                    maxDailyBreakMinutes: 60,
                    maxSingleBreakMinutes: 45,
                    allowMultipleSessions: true,
                    overnightShiftAllowed: false,
                    workingDayStartHour: 5,
                    timezone: 'Asia/Kolkata',
                    geofenceEnforcement: true,
                    maxGpsAccuracyMeters: 100,
                    isActive: true,
                  });
                  setIsPolicyModalOpen(true);
                }}
                leftIcon={<Plus className="h-4 w-4" />}
                className="bg-amber-800 hover:bg-amber-900 text-white"
              >
                Create Policy
              </Button>
            )}

            {activeTab === 'SHIFTS' && (
              <Button
                size="sm"
                onClick={() => {
                  setEditingShift(null);
                  setShiftForm({
                    name: '',
                    code: '',
                    policyId: policies[0]?.id || '',
                    description: '',
                    startTime: '09:00',
                    endTime: '18:00',
                    isOvernight: false,
                    workDays: [1, 2, 3, 4, 5],
                    breakDurationMinutes: 60,
                    color: '#3b82f6',
                    isActive: true,
                  });
                  setIsShiftModalOpen(true);
                }}
                leftIcon={<Plus className="h-4 w-4" />}
                className="bg-amber-800 hover:bg-amber-900 text-white"
              >
                Create Shift
              </Button>
            )}

            {activeTab === 'ASSIGNMENTS' && (
              <Button
                size="sm"
                onClick={() => {
                  setAssignForm({
                    employeeId: employees[0]?.id || '',
                    shiftId: shifts[0]?.id || '',
                    effectiveFrom: new Date().toISOString().split('T')[0],
                    effectiveTo: '',
                  });
                  setIsAssignModalOpen(true);
                }}
                leftIcon={<Plus className="h-4 w-4" />}
                className="bg-amber-800 hover:bg-amber-900 text-white"
              >
                Assign Shift
              </Button>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-stone-200 space-x-6 text-sm font-medium">
          <button
            onClick={() => setActiveTab('POLICIES')}
            className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'POLICIES'
                ? 'border-amber-800 text-amber-900 font-semibold'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            <Sliders className="h-4 w-4" />
            Attendance Policies ({policies.length})
          </button>

          <button
            onClick={() => setActiveTab('SHIFTS')}
            className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'SHIFTS'
                ? 'border-amber-800 text-amber-900 font-semibold'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            <Clock className="h-4 w-4" />
            Shift Schedules ({shifts.length})
          </button>

          <button
            onClick={() => setActiveTab('ASSIGNMENTS')}
            className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'ASSIGNMENTS'
                ? 'border-amber-800 text-amber-900 font-semibold'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            <Users className="h-4 w-4" />
            Employee Roster ({assignments.length})
          </button>

          <button
            onClick={() => setActiveTab('SIMULATOR')}
            className={`pb-3 flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === 'SIMULATOR'
                ? 'border-amber-800 text-amber-900 font-semibold'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            <Play className="h-4 w-4 text-emerald-600" />
            Interactive Policy Simulator
          </button>
        </div>

        {/* ==================================================================== */}
        {/* TAB 1: ATTENDANCE POLICIES */}
        {/* ==================================================================== */}
        {activeTab === 'POLICIES' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {policies.map((pol) => (
              <Card
                key={pol.id}
                className="border-stone-200 bg-white shadow-sm flex flex-col justify-between"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base text-stone-900">{pol.name}</CardTitle>
                        {pol.isDefault && (
                          <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Org Default
                          </span>
                        )}
                      </div>
                      <CardDescription className="font-mono text-xs text-stone-500 mt-0.5">
                        Code: {pol.code}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingPolicy(pol);
                          setPolicyForm({
                            name: pol.name,
                            code: pol.code,
                            branchId: pol.branchId || '',
                            description: pol.description || '',
                            isDefault: pol.isDefault,
                            standardWorkMinutes: pol.standardWorkMinutes,
                            halfDayThresholdMinutes: pol.halfDayThresholdMinutes,
                            fullDayThresholdMinutes: pol.fullDayThresholdMinutes,
                            gracePeriodMinutes: pol.gracePeriodMinutes,
                            maxCheckInDelayMinutes: pol.maxCheckInDelayMinutes,
                            maxDailyBreakMinutes: pol.maxDailyBreakMinutes,
                            maxSingleBreakMinutes: pol.maxSingleBreakMinutes,
                            allowMultipleSessions: pol.allowMultipleSessions,
                            overnightShiftAllowed: pol.overnightShiftAllowed,
                            workingDayStartHour: pol.workingDayStartHour,
                            timezone: pol.timezone || 'Asia/Kolkata',
                            geofenceEnforcement: pol.geofenceEnforcement,
                            maxGpsAccuracyMeters: pol.maxGpsAccuracyMeters,
                            isActive: pol.isActive,
                          });
                          setIsPolicyModalOpen(true);
                        }}
                      >
                        <Edit2 className="h-3.5 w-3.5 text-stone-600" />
                      </Button>
                      {!pol.isDefault && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            if (confirm(`Delete policy "${pol.name}"?`)) {
                              await attendancePoliciesApi.delete(pol.id);
                              fetchData();
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 pt-0 text-xs text-stone-600">
                  <div className="grid grid-cols-2 gap-2 bg-stone-50 p-2.5 rounded-md border border-stone-100">
                    <div>
                      <span className="text-[11px] text-stone-400 block">Workday</span>
                      <span className="font-semibold text-stone-800">
                        {Math.floor(pol.standardWorkMinutes / 60)}h {pol.standardWorkMinutes % 60}m
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-stone-400 block">Grace Window</span>
                      <span className="font-semibold text-stone-800">
                        {pol.gracePeriodMinutes} mins
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-stone-400 block">Full Day Min</span>
                      <span className="font-semibold text-stone-800">
                        {Math.floor(pol.fullDayThresholdMinutes / 60)}h
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-stone-400 block">Half Day Min</span>
                      <span className="font-semibold text-stone-800">
                        {Math.floor(pol.halfDayThresholdMinutes / 60)}h
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-stone-100 text-[11px] text-stone-500">
                    <span>Cutoff: {pol.workingDayStartHour}:00 AM</span>
                    <span>Max Break: {pol.maxDailyBreakMinutes}m</span>
                    <span>{pol.geofenceEnforcement ? '🛡️ Geofenced' : 'No Geofence'}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 2: SHIFTS */}
        {/* ==================================================================== */}
        {activeTab === 'SHIFTS' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {shifts.map((s) => (
              <Card
                key={s.id}
                className="border-stone-200 bg-white shadow-sm flex flex-col justify-between"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: s.color || '#3b82f6' }}
                        />
                        <CardTitle className="text-base text-stone-900">{s.name}</CardTitle>
                        {s.isOvernight && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-purple-100 text-purple-800 border border-purple-200">
                            <Moon className="h-3 w-3" /> Overnight
                          </span>
                        )}
                      </div>
                      <CardDescription className="font-mono text-xs text-stone-500 mt-0.5">
                        Code: {s.code}
                      </CardDescription>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingShift(s);
                          setShiftForm({
                            name: s.name,
                            code: s.code,
                            policyId: s.policyId || '',
                            description: s.description || '',
                            startTime: s.startTime,
                            endTime: s.endTime,
                            isOvernight: s.isOvernight,
                            workDays: s.workDays || [1, 2, 3, 4, 5],
                            breakDurationMinutes: s.breakDurationMinutes,
                            color: s.color || '#3b82f6',
                            isActive: s.isActive,
                          });
                          setIsShiftModalOpen(true);
                        }}
                      >
                        <Edit2 className="h-3.5 w-3.5 text-stone-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          if (confirm(`Delete shift "${s.name}"?`)) {
                            try {
                              await shiftsApi.delete(s.id);
                              fetchData();
                            } catch (err: any) {
                              setToastMessage({
                                type: 'error',
                                title: 'Cannot Delete Shift',
                                message: err.message,
                              });
                            }
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 pt-0 text-xs text-stone-600">
                  <div className="flex items-center justify-between p-2.5 bg-stone-50 rounded-md border border-stone-100 font-mono text-sm">
                    <span className="font-bold text-stone-800">{s.startTime}</span>
                    <span className="text-stone-400">⟶</span>
                    <span className="font-bold text-stone-800">{s.endTime}</span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-stone-500 pt-1 border-t border-stone-100">
                    <span>Break: {s.breakDurationMinutes}m</span>
                    <span>Days: {s.workDays?.length || 5} active/week</span>
                    <span>{s.policy ? `Policy: ${s.policy.name}` : 'Default Policy'}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ==================================================================== */}
        {/* TAB 3: SHIFT ASSIGNMENTS */}
        {/* ==================================================================== */}
        {activeTab === 'ASSIGNMENTS' && (
          <Card className="border-stone-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs md:text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50/80 text-stone-600 font-medium">
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Assigned Shift</th>
                    <th className="py-3 px-4">Shift Timings</th>
                    <th className="py-3 px-4">Effective From</th>
                    <th className="py-3 px-4">Effective To</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-stone-800">
                  {assignments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-stone-400">
                        No custom shift assignments yet. Employees currently follow their
                        branch/organization default policy.
                      </td>
                    </tr>
                  ) : (
                    assignments.map((a) => (
                      <tr key={a.id} className="hover:bg-amber-50/20 transition-colors">
                        <td className="py-3 px-4 font-medium text-stone-900">
                          {a.employee?.displayName || 'Employee'}
                          <span className="text-xs text-stone-400 ml-1">
                            ({a.employee?.employeeCode})
                          </span>
                        </td>
                        <td className="py-3 px-4 font-semibold text-amber-900">{a.shift?.name}</td>
                        <td className="py-3 px-4 font-mono text-xs text-stone-600">
                          {a.shift?.startTime} - {a.shift?.endTime}{' '}
                          {a.shift?.isOvernight ? '🌙' : ''}
                        </td>
                        <td className="py-3 px-4 text-xs text-stone-600">
                          {new Date(a.effectiveFrom).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-xs text-stone-600">
                          {a.effectiveTo
                            ? new Date(a.effectiveTo).toLocaleDateString()
                            : 'Indefinite'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              if (confirm('Remove this shift assignment?')) {
                                await shiftsApi.deleteAssignment(a.id);
                                fetchData();
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* ==================================================================== */}
        {/* TAB 4: INTERACTIVE POLICY SIMULATOR & CALCULATOR */}
        {/* ==================================================================== */}
        {activeTab === 'SIMULATOR' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-stone-200 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-base text-stone-900 flex items-center gap-2">
                  <Play className="h-4 w-4 text-emerald-600" />
                  Policy Evaluation Parameters
                </CardTitle>
                <CardDescription>
                  Plug in test punch times to verify grace period calculations, overnight cutoff
                  hours, and daily thresholds.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-stone-700">
                      Select Shift Schedule
                    </label>
                    <select
                      aria-label="Select shift to simulate"
                      value={simShiftId}
                      onChange={(e) => setSimShiftId(e.target.value)}
                      className="mt-1 w-full h-9 px-3 rounded-md border border-stone-300 bg-white text-xs text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-800"
                    >
                      <option value="">Default Schedule</option>
                      {shifts.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.startTime} - {s.endTime})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-stone-700">
                      Select Attendance Policy
                    </label>
                    <select
                      aria-label="Select policy to simulate"
                      value={simPolicyId}
                      onChange={(e) => setSimPolicyId(e.target.value)}
                      className="mt-1 w-full h-9 px-3 rounded-md border border-stone-300 bg-white text-xs text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-800"
                    >
                      <option value="">Default Policy</option>
                      {policies.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.isDefault ? '(Org Default)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-stone-700">Working Date</label>
                    <Input
                      type="date"
                      value={simWorkingDate}
                      onChange={(e) => setSimWorkingDate(e.target.value)}
                      className="mt-1 text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-stone-700">Check-In Time</label>
                    <Input
                      type="time"
                      value={simCheckIn}
                      onChange={(e) => setSimCheckIn(e.target.value)}
                      className="mt-1 font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-stone-700">Check-Out Time</label>
                    <Input
                      type="time"
                      value={simCheckOut}
                      onChange={(e) => setSimCheckOut(e.target.value)}
                      className="mt-1 font-mono text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-stone-700">
                    Total Break Duration (minutes taken)
                  </label>
                  <Input
                    type="number"
                    value={simBreakMinutes}
                    onChange={(e) => setSimBreakMinutes(parseInt(e.target.value) || 0)}
                    className="mt-1 text-xs"
                  />
                </div>

                <Button
                  onClick={handleRunSimulation}
                  disabled={isSimulating}
                  className="w-full bg-amber-800 hover:bg-amber-900 text-white"
                  leftIcon={<Play className={`h-4 w-4 ${isSimulating ? 'animate-spin' : ''}`} />}
                >
                  {isSimulating ? 'Evaluating...' : 'Run Simulation Evaluation'}
                </Button>
              </CardContent>
            </Card>

            {/* Simulation Results Output */}
            <Card className="border-stone-200 bg-white shadow-sm flex flex-col justify-between">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base text-stone-900">
                    Calculated Policy Assessment
                  </CardTitle>
                  {simResult && getStatusBadge(simResult.status)}
                </div>
                <CardDescription>
                  Automated rule assessment based on mathematical thresholds and shift schedule.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {simResult ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                      <div className="p-2.5 rounded bg-stone-50 border border-stone-100">
                        <span className="text-stone-400 block text-[11px]">Net Work Minutes</span>
                        <span className="font-bold text-stone-900 text-base">
                          {Math.floor(simResult.netWorkMinutes / 60)}h{' '}
                          {simResult.netWorkMinutes % 60}m
                        </span>
                      </div>

                      <div className="p-2.5 rounded bg-stone-50 border border-stone-100">
                        <span className="text-stone-400 block text-[11px]">Late Arrival</span>
                        <span
                          className={`font-bold text-base ${simResult.lateArrivalMinutes > 0 ? 'text-rose-600' : 'text-emerald-700'}`}
                        >
                          {simResult.lateArrivalMinutes > 0
                            ? `${simResult.lateArrivalMinutes} mins`
                            : 'On Time'}
                        </span>
                      </div>

                      <div className="p-2.5 rounded bg-stone-50 border border-stone-100">
                        <span className="text-stone-400 block text-[11px]">Early Departure</span>
                        <span className="font-bold text-stone-900 text-base">
                          {simResult.earlyDepartureMinutes > 0
                            ? `${simResult.earlyDepartureMinutes} mins`
                            : 'None'}
                        </span>
                      </div>

                      <div className="p-2.5 rounded bg-stone-50 border border-stone-100">
                        <span className="text-stone-400 block text-[11px]">Break Deductions</span>
                        <span className="font-bold text-stone-900 text-base">
                          {simResult.breakDeductionMinutes} mins
                        </span>
                      </div>

                      <div className="p-2.5 rounded bg-stone-50 border border-stone-100">
                        <span className="text-stone-400 block text-[11px]">Overtime Hours</span>
                        <span className="font-bold text-stone-900 text-base">
                          {simResult.overtimeMinutes > 0
                            ? `${Math.floor(simResult.overtimeMinutes / 60)}h ${simResult.overtimeMinutes % 60}m`
                            : '0m'}
                        </span>
                      </div>

                      <div className="p-2.5 rounded bg-stone-50 border border-stone-100">
                        <span className="text-stone-400 block text-[11px]">Overnight Shift</span>
                        <span className="font-bold text-stone-900 text-base">
                          {simResult.isOvernight ? '🌙 Yes' : 'No'}
                        </span>
                      </div>
                    </div>

                    <div className="p-3 bg-amber-50/60 rounded-lg border border-amber-200/80 text-xs text-amber-900 space-y-1">
                      <div className="font-semibold flex items-center gap-1.5">
                        <ShieldCheck className="h-4 w-4 text-amber-800" />
                        Evaluation Summary
                      </div>
                      <p>
                        Shift Window:{' '}
                        <strong className="font-mono">
                          {simResult.shiftStartLocal} - {simResult.shiftEndLocal}
                        </strong>{' '}
                        with Grace Window ending at{' '}
                        <strong className="font-mono">{simResult.graceWindowEndLocal}</strong>.
                      </p>
                      <p className="text-[11px] text-amber-800">Resolved via {simResult.source}.</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 text-stone-400">
                    <Timer className="h-8 w-8 mx-auto mb-2 text-stone-300" />
                    <p className="text-sm font-medium text-stone-600">No calculation run yet</p>
                    <p className="text-xs text-stone-400 mt-0.5">
                      Select shift parameters and click "Run Simulation Evaluation".
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* ======================================================================== */}
      {/* CREATE / EDIT POLICY MODAL */}
      {/* ======================================================================== */}
      <Dialog
        isOpen={isPolicyModalOpen}
        onClose={() => setIsPolicyModalOpen(false)}
        title={editingPolicy ? 'Edit Attendance Policy' : 'Create Attendance Policy'}
      >
        <form
          onSubmit={handleSavePolicy}
          className="space-y-4 pt-1 max-h-[75vh] overflow-y-auto px-1"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-stone-700">Policy Name *</label>
              <Input
                value={policyForm.name}
                onChange={(e) => setPolicyForm({ ...policyForm, name: e.target.value })}
                placeholder="e.g. Standard 8-Hour Workday"
                required
                className="mt-1 text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-700">Policy Code *</label>
              <Input
                value={policyForm.code}
                onChange={(e) =>
                  setPolicyForm({ ...policyForm, code: e.target.value.toUpperCase() })
                }
                placeholder="e.g. STD-8HR"
                required
                className="mt-1 font-mono text-xs"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-stone-700">Branch Override (Optional)</label>
            <select
              aria-label="Branch policy override"
              value={policyForm.branchId}
              onChange={(e) => setPolicyForm({ ...policyForm, branchId: e.target.value })}
              className="mt-1 w-full h-9 px-3 rounded-md border border-stone-300 bg-white text-xs text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-800"
            >
              <option value="">None (Organization Wide Policy)</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-stone-700">
                Standard Work Minutes (8h = 480m)
              </label>
              <Input
                type="number"
                value={policyForm.standardWorkMinutes}
                onChange={(e) =>
                  setPolicyForm({
                    ...policyForm,
                    standardWorkMinutes: parseInt(e.target.value) || 480,
                  })
                }
                className="mt-1 font-mono text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-700">Grace Period (Minutes)</label>
              <Input
                type="number"
                value={policyForm.gracePeriodMinutes}
                onChange={(e) =>
                  setPolicyForm({
                    ...policyForm,
                    gracePeriodMinutes: parseInt(e.target.value) || 15,
                  })
                }
                className="mt-1 font-mono text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-stone-700">
                Full-Day Threshold (Minutes)
              </label>
              <Input
                type="number"
                value={policyForm.fullDayThresholdMinutes}
                onChange={(e) =>
                  setPolicyForm({
                    ...policyForm,
                    fullDayThresholdMinutes: parseInt(e.target.value) || 420,
                  })
                }
                className="mt-1 font-mono text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-700">
                Half-Day Threshold (Minutes)
              </label>
              <Input
                type="number"
                value={policyForm.halfDayThresholdMinutes}
                onChange={(e) =>
                  setPolicyForm({
                    ...policyForm,
                    halfDayThresholdMinutes: parseInt(e.target.value) || 240,
                  })
                }
                className="mt-1 font-mono text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-stone-700">
                Max Daily Break (Minutes)
              </label>
              <Input
                type="number"
                value={policyForm.maxDailyBreakMinutes}
                onChange={(e) =>
                  setPolicyForm({
                    ...policyForm,
                    maxDailyBreakMinutes: parseInt(e.target.value) || 60,
                  })
                }
                className="mt-1 font-mono text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-700">
                Working Day Cutoff Hour (0-23)
              </label>
              <Input
                type="number"
                min="0"
                max="23"
                value={policyForm.workingDayStartHour}
                onChange={(e) =>
                  setPolicyForm({
                    ...policyForm,
                    workingDayStartHour: parseInt(e.target.value) || 5,
                  })
                }
                className="mt-1 font-mono text-xs"
              />
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-stone-200">
            <Switch
              label="Organization Default Policy"
              description="Applies to all employees unless specific branch or shift overrides exist."
              checked={policyForm.isDefault}
              onChange={(checked: any) =>
                setPolicyForm({
                  ...policyForm,
                  isDefault: typeof checked === 'boolean' ? checked : !!checked?.target?.checked,
                })
              }
            />

            <Switch
              label="Allow Overnight Shifts"
              description="Allows punch sessions to cross midnight and conclude on next calendar morning."
              checked={policyForm.overnightShiftAllowed}
              onChange={(checked: any) =>
                setPolicyForm({
                  ...policyForm,
                  overnightShiftAllowed:
                    typeof checked === 'boolean' ? checked : !!checked?.target?.checked,
                })
              }
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-stone-200">
            <Button variant="outline" type="button" onClick={() => setIsPolicyModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-amber-800 hover:bg-amber-900 text-white">
              {editingPolicy ? 'Update Policy' : 'Create Policy'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ======================================================================== */}
      {/* CREATE / EDIT SHIFT MODAL */}
      {/* ======================================================================== */}
      <Dialog
        isOpen={isShiftModalOpen}
        onClose={() => setIsShiftModalOpen(false)}
        title={editingShift ? 'Edit Shift Schedule' : 'Create Shift Schedule'}
      >
        <form onSubmit={handleSaveShift} className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-stone-700">Shift Name *</label>
              <Input
                value={shiftForm.name}
                onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })}
                placeholder="e.g. Morning Shift A"
                required
                className="mt-1 text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-700">Shift Code *</label>
              <Input
                value={shiftForm.code}
                onChange={(e) => setShiftForm({ ...shiftForm, code: e.target.value.toUpperCase() })}
                placeholder="e.g. MORN-A"
                required
                className="mt-1 font-mono text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-stone-700">Start Time (HH:mm) *</label>
              <Input
                type="time"
                value={shiftForm.startTime}
                onChange={(e) => setShiftForm({ ...shiftForm, startTime: e.target.value })}
                required
                className="mt-1 font-mono text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-700">End Time (HH:mm) *</label>
              <Input
                type="time"
                value={shiftForm.endTime}
                onChange={(e) => setShiftForm({ ...shiftForm, endTime: e.target.value })}
                required
                className="mt-1 font-mono text-xs"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-stone-700">Break Duration (Minutes)</label>
            <Input
              type="number"
              value={shiftForm.breakDurationMinutes}
              onChange={(e) =>
                setShiftForm({ ...shiftForm, breakDurationMinutes: parseInt(e.target.value) || 60 })
              }
              className="mt-1 font-mono text-xs"
            />
          </div>

          <div className="pt-2 border-t border-stone-200">
            <Switch
              label="Overnight Shift Flag"
              description="Check if shift ends on next calendar day."
              checked={shiftForm.isOvernight}
              onChange={(checked: any) =>
                setShiftForm({
                  ...shiftForm,
                  isOvernight: typeof checked === 'boolean' ? checked : !!checked?.target?.checked,
                })
              }
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-stone-200">
            <Button variant="outline" type="button" onClick={() => setIsShiftModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-amber-800 hover:bg-amber-900 text-white">
              {editingShift ? 'Update Shift' : 'Create Shift'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ======================================================================== */}
      {/* ASSIGN SHIFT MODAL */}
      {/* ======================================================================== */}
      <Dialog
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        title="Assign Shift to Employee"
      >
        <form onSubmit={handleSaveAssignment} className="space-y-4 pt-1">
          <div>
            <label className="text-xs font-semibold text-stone-700">Select Employee *</label>
            <select
              aria-label="Select employee for shift assignment"
              value={assignForm.employeeId}
              onChange={(e) => setAssignForm({ ...assignForm, employeeId: e.target.value })}
              required
              className="mt-1 w-full h-9 px-3 rounded-md border border-stone-300 bg-white text-xs text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-800"
            >
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.displayName} ({emp.employeeCode})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-stone-700">Select Shift Schedule *</label>
            <select
              aria-label="Select shift to assign"
              value={assignForm.shiftId}
              onChange={(e) => setAssignForm({ ...assignForm, shiftId: e.target.value })}
              required
              className="mt-1 w-full h-9 px-3 rounded-md border border-stone-300 bg-white text-xs text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-800"
            >
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.startTime} - {s.endTime})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-stone-700">Effective From *</label>
              <Input
                type="date"
                value={assignForm.effectiveFrom}
                onChange={(e) => setAssignForm({ ...assignForm, effectiveFrom: e.target.value })}
                required
                className="mt-1 text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-stone-700">Effective To (Optional)</label>
              <Input
                type="date"
                value={assignForm.effectiveTo}
                onChange={(e) => setAssignForm({ ...assignForm, effectiveTo: e.target.value })}
                className="mt-1 text-xs"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-stone-200">
            <Button variant="outline" type="button" onClick={() => setIsAssignModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-amber-800 hover:bg-amber-900 text-white">
              Assign Shift
            </Button>
          </div>
        </form>
      </Dialog>
    </AppShell>
  );
}
