'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '../../../../layouts/AppShell';
import { ProtectedRoute } from '../../../../components/auth/ProtectedRoute';
import { useAuth } from '../../../../context/AuthContext';
import { apiClient } from '../../../../lib/api-client';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Button,
  Label,
} from '@hrms/ui';
import {
  Layers,
  ArrowLeft,
  Copy,
  CheckCircle2,
  AlertTriangle,
  Calculator,
  RefreshCw,
  Archive,
  Calendar,
  Lock,
  ShieldAlert,
  Coins,
  TrendingDown,
  TrendingUp,
  Building,
  User,
} from 'lucide-react';

export default function SalaryStructureDetailPage() {
  const params = useParams();
  const router = useRouter();
  const structureId = params?.id as string;
  const { hasPermission, hasRole } = useAuth();
  const canManage = hasRole('ADMIN') || hasPermission('PAYROLL_MANAGE');

  const [structure, setStructure] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // CTC Simulator state
  const [testAnnualCtc, setTestAnnualCtc] = useState<number>(1200000);
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

  // Clone Modal
  const [cloneModalOpen, setCloneModalOpen] = useState(false);
  const [cloneName, setCloneName] = useState('');
  const [cloneEffectiveFrom, setCloneEffectiveFrom] = useState(
    new Date().toISOString().split('T')[0],
  );
  const [cloneSubmitting, setCloneSubmitting] = useState(false);

  // Notifications
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const runSimulation = useCallback(async (structId: string, annualCtc: number) => {
    try {
      setSimLoading(true);
      setSimError(null);
      const res = await apiClient.previewSalaryStructure({
        structureId: structId,
        annualCtc: Number(annualCtc),
      });
      setSimulationResult(res.data);
    } catch (err: any) {
      setSimError(err?.message || 'Calculation preview failed');
    } finally {
      setSimLoading(false);
    }
  }, []);

  const fetchStructure = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiClient.getSalaryStructure(structureId);
      if (res?.data) {
        setStructure(res.data);
        runSimulation(structureId, testAnnualCtc);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load salary structure details');
    } finally {
      setIsLoading(false);
    }
  }, [structureId, testAnnualCtc, runSimulation]);

  useEffect(() => {
    if (structureId) {
      fetchStructure();
    }
  }, [structureId, fetchStructure]);

  const handleActivate = async () => {
    if (!confirm(`Activate salary structure '${structure.name}'?`)) return;
    try {
      await apiClient.activateSalaryStructure(structureId);
      setSuccessMessage('Structure activated successfully.');
      fetchStructure();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      alert(err?.message || 'Activation failed');
    }
  };

  const handleRetire = async () => {
    if (!confirm(`Retire salary structure '${structure.name}'?`)) return;
    try {
      await apiClient.retireSalaryStructure(structureId);
      setSuccessMessage('Structure retired.');
      fetchStructure();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      alert(err?.message || 'Retire failed');
    }
  };

  const handleClone = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCloneSubmitting(true);
      const res = await apiClient.cloneSalaryStructure(structureId, {
        name: cloneName,
        effectiveFrom: new Date(cloneEffectiveFrom).toISOString(),
      });
      setCloneModalOpen(false);
      setSuccessMessage('Successfully created new structure version.');
      if (res?.data?.id) {
        router.push(`/payroll/structures/${res.data.id}`);
      }
    } catch (err: any) {
      alert(err?.message || 'Clone failed');
    } finally {
      setCloneSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <ProtectedRoute requiredPermissions={['PAYROLL_VIEW']}>
        <AppShell>
          <div className="py-24 flex flex-col items-center justify-center gap-3 text-stone-500 text-sm">
            <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
            <span>Loading salary structure details...</span>
          </div>
        </AppShell>
      </ProtectedRoute>
    );
  }

  if (error || !structure) {
    return (
      <ProtectedRoute requiredPermissions={['PAYROLL_VIEW']}>
        <AppShell>
          <div className="p-8 max-w-xl mx-auto text-center space-y-4">
            <AlertTriangle className="w-10 h-10 text-red-500 mx-auto" />
            <h2 className="text-lg font-bold text-stone-900">Structure Not Found</h2>
            <p className="text-xs text-stone-500">
              {error || 'Requested structure does not exist.'}
            </p>
            <Link href="/payroll/structures">
              <Button variant="outline" size="sm">
                Back to Structures List
              </Button>
            </Link>
          </div>
        </AppShell>
      </ProtectedRoute>
    );
  }

  const assignedCount = structure._count?.compensations || 0;
  const isLocked = assignedCount > 0;

  // Separate components by category
  const earnings = structure.items?.filter((i: any) => i.component?.category === 'EARNING') || [];
  const deductions =
    structure.items?.filter((i: any) => i.component?.category === 'DEDUCTION') || [];
  const contributions =
    structure.items?.filter((i: any) => i.component?.category === 'EMPLOYER_CONTRIBUTION') || [];

  return (
    <ProtectedRoute requiredPermissions={['PAYROLL_VIEW']}>
      <AppShell>
        <div className="space-y-6">
          {/* Header & Breadcrumb */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-stone-200">
            <div>
              <div className="flex items-center gap-2 text-xs text-stone-500 mb-1">
                <Link href="/payroll" className="hover:text-stone-800">
                  Payroll
                </Link>
                <span>/</span>
                <Link href="/payroll/structures" className="hover:text-stone-800">
                  Salary Structures
                </Link>
                <span>/</span>
                <span className="text-stone-800 font-medium font-mono">{structure.code}</span>
              </div>
              <div className="flex items-center gap-3">
                <Link href="/payroll/structures">
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-stone-500">
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                </Link>
                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl md:text-2xl font-bold text-stone-900 tracking-tight">
                      {structure.name}
                    </h1>
                    <Badge variant="outline" className="font-mono text-xs bg-stone-50">
                      v{structure.version}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        structure.status === 'ACTIVE'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : structure.status === 'DRAFT'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-stone-100 text-stone-500'
                      }`}
                    >
                      {structure.status}
                    </Badge>
                  </div>
                  <span className="text-xs text-stone-400 font-mono">
                    Code: {structure.code} • Currency: {structure.currency}
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              {canManage && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCloneName(`${structure.name} (v${structure.version + 1})`);
                    setCloneModalOpen(true);
                  }}
                  className="gap-1.5 text-blue-600 hover:text-blue-700"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Clone as New Version
                </Button>
              )}

              {canManage && structure.status === 'DRAFT' && (
                <Button
                  size="sm"
                  onClick={handleActivate}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Activate Structure
                </Button>
              )}

              {canManage && structure.status === 'ACTIVE' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRetire}
                  className="text-stone-400 hover:text-red-600 gap-1.5"
                >
                  <Archive className="w-3.5 h-3.5" />
                  Retire
                </Button>
              )}
            </div>
          </div>

          {/* Success Banner */}
          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md text-emerald-800 text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Immutability / Version Lock Alert */}
          {isLocked && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs flex items-start gap-3">
              <Lock className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block text-sm">
                  Historical Immutability Enforced
                </span>
                <p className="mt-0.5 text-amber-800 leading-relaxed">
                  This structure is locked against in-place component modifications because{' '}
                  <strong>{assignedCount} active employee compensation record(s)</strong> are
                  presently linked to it. To alter the compensation formulas or add new components,
                  click <strong>&quot;Clone as New Version&quot;</strong> to create v
                  {structure.version + 1}.
                </p>
              </div>
            </div>
          )}

          {/* Metadata Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-stone-200 shadow-sm">
              <CardContent className="p-4 space-y-2 text-xs">
                <span className="text-stone-400 font-semibold uppercase tracking-wider block text-[10px]">
                  Effective Period
                </span>
                <div className="flex items-center gap-2 text-stone-800 font-medium">
                  <Calendar className="w-4 h-4 text-emerald-600" />
                  <span>
                    {structure.effectiveFrom
                      ? new Date(structure.effectiveFrom).toLocaleDateString()
                      : 'Immediate'}
                    {' — '}
                    {structure.effectiveTo
                      ? new Date(structure.effectiveTo).toLocaleDateString()
                      : 'Indefinite'}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-stone-200 shadow-sm">
              <CardContent className="p-4 space-y-2 text-xs">
                <span className="text-stone-400 font-semibold uppercase tracking-wider block text-[10px]">
                  Employee Assignments
                </span>
                <div className="flex items-center gap-2 text-stone-800 font-medium">
                  <User className="w-4 h-4 text-blue-600" />
                  <span>{assignedCount} assigned employee(s)</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-stone-200 shadow-sm">
              <CardContent className="p-4 space-y-2 text-xs">
                <span className="text-stone-400 font-semibold uppercase tracking-wider block text-[10px]">
                  Governance
                </span>
                <div className="text-stone-600 text-[11px]">
                  Created by:{' '}
                  <span className="font-mono">{structure.createdByUser?.email || 'System'}</span>
                </div>
                <div className="text-stone-400 text-[10px]">
                  Updated: {new Date(structure.updatedAt).toLocaleDateString()}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Interactive CTC Simulator & Take-Home Estimator */}
          <Card className="border-emerald-200 bg-emerald-50/20 shadow-sm">
            <CardHeader className="pb-3 border-b border-emerald-100">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-emerald-100 text-emerald-700 rounded-md">
                    <Calculator className="w-5 h-5" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-bold text-stone-900">
                      Live Compensation Simulator & Take-Home Calculator
                    </CardTitle>
                    <CardDescription className="text-xs text-stone-500">
                      Simulate deterministic earnings, employee deductions, employer costs, and
                      estimated net pay.
                    </CardDescription>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <span className="absolute left-2.5 top-2 text-stone-400 text-xs font-semibold">
                      ₹
                    </span>
                    <input
                      type="number"
                      step="10000"
                      value={testAnnualCtc}
                      onChange={(e) => setTestAnnualCtc(Number(e.target.value))}
                      className="pl-6 pr-3 py-1.5 w-40 bg-white border border-stone-300 rounded-md font-mono text-xs font-bold text-stone-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <Button
                    size="sm"
                    disabled={simLoading}
                    onClick={() => runSimulation(structureId, testAnnualCtc)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs"
                  >
                    {simLoading ? 'Simulating...' : 'Recalculate'}
                  </Button>
                </div>
              </div>

              {/* Quick Presets */}
              <div className="flex items-center gap-2 pt-2">
                <span className="text-[10px] text-stone-500 font-medium">Annual CTC Presets:</span>
                {[450000, 600000, 1000000, 1500000, 2400000, 3600000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => {
                      setTestAnnualCtc(amt);
                      runSimulation(structureId, amt);
                    }}
                    className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                      testAnnualCtc === amt
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
                    }`}
                  >
                    ₹{(amt / 100000).toFixed(1)}L
                  </button>
                ))}
              </div>
            </CardHeader>

            <CardContent className="p-5">
              {simError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-xs mb-4">
                  {simError}
                </div>
              )}

              {simulationResult && (
                <div className="space-y-4">
                  {/* Top Level Summary Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-white rounded-lg border border-stone-200 shadow-sm">
                      <div className="flex items-center justify-between text-stone-500 text-xs">
                        <span>Monthly Gross Salary</span>
                        <Coins className="w-4 h-4 text-blue-500" />
                      </div>
                      <div className="text-lg font-bold font-mono text-stone-900 mt-2">
                        ₹
                        {Number(simulationResult.summary?.monthlyGross || 0).toLocaleString(
                          'en-IN',
                        )}
                      </div>
                      <div className="text-[10px] text-stone-400 mt-0.5">
                        Annual: ₹
                        {Number(simulationResult.summary?.annualGross || 0).toLocaleString('en-IN')}
                      </div>
                    </div>

                    <div className="p-4 bg-white rounded-lg border border-stone-200 shadow-sm">
                      <div className="flex items-center justify-between text-amber-700 text-xs">
                        <span>Employee Deductions</span>
                        <TrendingDown className="w-4 h-4 text-amber-500" />
                      </div>
                      <div className="text-lg font-bold font-mono text-amber-900 mt-2">
                        ₹
                        {Number(
                          simulationResult.summary?.monthlyEmployeeDeductions || 0,
                        ).toLocaleString('en-IN')}
                      </div>
                      <div className="text-[10px] text-stone-400 mt-0.5">
                        Annual: ₹
                        {Number(
                          simulationResult.summary?.annualEmployeeDeductions || 0,
                        ).toLocaleString('en-IN')}
                      </div>
                    </div>

                    <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-300 shadow-sm">
                      <div className="flex items-center justify-between text-emerald-800 text-xs font-semibold">
                        <span>Est. Monthly Net Pay</span>
                        <TrendingUp className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div className="text-lg font-bold font-mono text-emerald-900 mt-2">
                        ₹
                        {Number(simulationResult.summary?.monthlyNetPay || 0).toLocaleString(
                          'en-IN',
                        )}
                      </div>
                      <div className="text-[10px] text-emerald-700 font-semibold mt-0.5">
                        Estimated Take-Home (per month)
                      </div>
                    </div>

                    <div className="p-4 bg-white rounded-lg border border-stone-200 shadow-sm">
                      <div className="flex items-center justify-between text-purple-700 text-xs">
                        <span>Employer Contributions</span>
                        <Building className="w-4 h-4 text-purple-500" />
                      </div>
                      <div className="text-lg font-bold font-mono text-purple-900 mt-2">
                        ₹
                        {Number(
                          simulationResult.summary?.monthlyEmployerContribution || 0,
                        ).toLocaleString('en-IN')}
                      </div>
                      <div className="text-[10px] text-stone-400 mt-0.5">
                        Annual: ₹
                        {Number(
                          simulationResult.summary?.annualEmployerContribution || 0,
                        ).toLocaleString('en-IN')}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Component Hierarchy Tables */}
          <div className="space-y-6">
            {/* 1. Earnings */}
            <Card className="border-stone-200 shadow-sm">
              <CardHeader className="pb-3 border-b border-stone-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <CardTitle className="text-sm font-bold text-stone-900">
                      Earnings Components ({earnings.length})
                    </CardTitle>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[10px] text-emerald-700 border-emerald-200 bg-emerald-50"
                  >
                    Affects Gross
                  </Badge>
                </div>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-stone-700">
                  <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 uppercase text-[10px]">
                    <tr>
                      <th className="py-2.5 px-4">Order</th>
                      <th className="py-2.5 px-4">Code</th>
                      <th className="py-2.5 px-4">Name</th>
                      <th className="py-2.5 px-4">Calculation Method</th>
                      <th className="py-2.5 px-4">Configured Formula / Value</th>
                      <th className="py-2.5 px-4 text-right">Simulated Monthly (₹)</th>
                      <th className="py-2.5 px-4 text-right">Simulated Annual (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {earnings.map((item: any) => {
                      const simItem = simulationResult?.breakdown?.find(
                        (b: any) => b.componentCode === item.component?.code,
                      );
                      return (
                        <tr key={item.id} className="hover:bg-stone-50/50">
                          <td className="py-2.5 px-4 font-mono text-stone-400">
                            {item.orderIndex}
                          </td>
                          <td className="py-2.5 px-4 font-mono font-semibold text-stone-900">
                            {item.component?.code}
                          </td>
                          <td className="py-2.5 px-4 font-medium text-stone-800">
                            {item.component?.name}
                          </td>
                          <td className="py-2.5 px-4">
                            <span className="px-1.5 py-0.5 rounded bg-stone-100 font-mono text-[10px]">
                              {item.calculationType || item.component?.calculationType}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 font-mono text-[11px] text-blue-600">
                            {item.formula ||
                              item.component?.formula ||
                              (item.value !== null ? item.value : item.component?.defaultValue)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-semibold text-stone-900">
                            {simItem
                              ? `₹${Number(simItem.monthlyAmount).toLocaleString('en-IN')}`
                              : '—'}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono text-stone-600">
                            {simItem
                              ? `₹${Number(simItem.annualAmount).toLocaleString('en-IN')}`
                              : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* 2. Employee Deductions */}
            <Card className="border-stone-200 shadow-sm">
              <CardHeader className="pb-3 border-b border-stone-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    <CardTitle className="text-sm font-bold text-stone-900">
                      Employee Deductions ({deductions.length})
                    </CardTitle>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[10px] text-amber-700 border-amber-200 bg-amber-50"
                  >
                    Subtracted from Net Pay
                  </Badge>
                </div>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-stone-700">
                  <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 uppercase text-[10px]">
                    <tr>
                      <th className="py-2.5 px-4">Order</th>
                      <th className="py-2.5 px-4">Code</th>
                      <th className="py-2.5 px-4">Name</th>
                      <th className="py-2.5 px-4">Calculation Method</th>
                      <th className="py-2.5 px-4">Configured Formula / Value</th>
                      <th className="py-2.5 px-4 text-right">Simulated Monthly (₹)</th>
                      <th className="py-2.5 px-4 text-right">Simulated Annual (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {deductions.map((item: any) => {
                      const simItem = simulationResult?.breakdown?.find(
                        (b: any) => b.componentCode === item.component?.code,
                      );
                      return (
                        <tr key={item.id} className="hover:bg-stone-50/50">
                          <td className="py-2.5 px-4 font-mono text-stone-400">
                            {item.orderIndex}
                          </td>
                          <td className="py-2.5 px-4 font-mono font-semibold text-stone-900">
                            {item.component?.code}
                          </td>
                          <td className="py-2.5 px-4 font-medium text-stone-800">
                            {item.component?.name}
                          </td>
                          <td className="py-2.5 px-4">
                            <span className="px-1.5 py-0.5 rounded bg-stone-100 font-mono text-[10px]">
                              {item.calculationType || item.component?.calculationType}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 font-mono text-[11px] text-amber-700">
                            {item.formula ||
                              item.component?.formula ||
                              (item.value !== null ? item.value : item.component?.defaultValue)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-semibold text-amber-800">
                            {simItem
                              ? `₹${Number(simItem.monthlyAmount).toLocaleString('en-IN')}`
                              : '—'}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono text-stone-600">
                            {simItem
                              ? `₹${Number(simItem.annualAmount).toLocaleString('en-IN')}`
                              : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* 3. Employer Contributions */}
            <Card className="border-stone-200 shadow-sm">
              <CardHeader className="pb-3 border-b border-stone-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                    <CardTitle className="text-sm font-bold text-stone-900">
                      Employer Contributions ({contributions.length})
                    </CardTitle>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[10px] text-purple-700 border-purple-200 bg-purple-50"
                  >
                    Company Cost (CTC)
                  </Badge>
                </div>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-stone-700">
                  <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 uppercase text-[10px]">
                    <tr>
                      <th className="py-2.5 px-4">Order</th>
                      <th className="py-2.5 px-4">Code</th>
                      <th className="py-2.5 px-4">Name</th>
                      <th className="py-2.5 px-4">Calculation Method</th>
                      <th className="py-2.5 px-4">Configured Formula / Value</th>
                      <th className="py-2.5 px-4 text-right">Simulated Monthly (₹)</th>
                      <th className="py-2.5 px-4 text-right">Simulated Annual (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {contributions.map((item: any) => {
                      const simItem = simulationResult?.breakdown?.find(
                        (b: any) => b.componentCode === item.component?.code,
                      );
                      return (
                        <tr key={item.id} className="hover:bg-stone-50/50">
                          <td className="py-2.5 px-4 font-mono text-stone-400">
                            {item.orderIndex}
                          </td>
                          <td className="py-2.5 px-4 font-mono font-semibold text-stone-900">
                            {item.component?.code}
                          </td>
                          <td className="py-2.5 px-4 font-medium text-stone-800">
                            {item.component?.name}
                          </td>
                          <td className="py-2.5 px-4">
                            <span className="px-1.5 py-0.5 rounded bg-stone-100 font-mono text-[10px]">
                              {item.calculationType || item.component?.calculationType}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 font-mono text-[11px] text-purple-700">
                            {item.formula ||
                              item.component?.formula ||
                              (item.value !== null ? item.value : item.component?.defaultValue)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-semibold text-purple-900">
                            {simItem
                              ? `₹${Number(simItem.monthlyAmount).toLocaleString('en-IN')}`
                              : '—'}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono text-stone-600">
                            {simItem
                              ? `₹${Number(simItem.annualAmount).toLocaleString('en-IN')}`
                              : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Clone Modal */}
          {cloneModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4 text-xs">
                <div className="flex items-center gap-2 text-blue-600">
                  <Copy className="w-5 h-5 flex-shrink-0" />
                  <h3 className="text-sm font-bold text-stone-900">
                    Clone as Version {structure.version + 1}
                  </h3>
                </div>
                <p className="text-stone-600">
                  Create a new revision based on <strong>{structure.code}</strong>. The new version
                  will start in DRAFT mode, allowing edits without altering past employee history.
                </p>

                <form onSubmit={handleClone} className="space-y-3 pt-2">
                  <div>
                    <Label className="font-semibold text-stone-700">New Structure Name *</Label>
                    <input
                      type="text"
                      required
                      value={cloneName}
                      onChange={(e) => setCloneName(e.target.value)}
                      className="mt-1 w-full px-3 py-2 border border-stone-300 rounded-md text-xs font-medium"
                    />
                  </div>

                  <div>
                    <Label className="font-semibold text-stone-700">Effective From Date *</Label>
                    <input
                      type="date"
                      required
                      value={cloneEffectiveFrom}
                      onChange={(e) => setCloneEffectiveFrom(e.target.value)}
                      className="mt-1 w-full px-3 py-2 border border-stone-300 rounded-md text-xs"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={cloneSubmitting}
                      onClick={() => setCloneModalOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={cloneSubmitting}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {cloneSubmitting ? 'Cloning...' : 'Confirm Clone'}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
