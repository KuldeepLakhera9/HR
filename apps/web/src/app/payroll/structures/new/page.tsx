'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Calculator,
  RefreshCw,
  Coins,
  ArrowUpDown,
  Code2,
} from 'lucide-react';

interface StructureRow {
  componentId: string;
  componentCode: string;
  componentName: string;
  category: string;
  defaultCalculationType: string;
  defaultValue: any;
  defaultFormula: string;
  orderIndex: number;
  overrideCalculationType?: string;
  value?: number;
  formula?: string;
}

export default function NewSalaryStructurePage() {
  const router = useRouter();
  const { hasPermission, hasRole } = useAuth();
  const canManage = hasRole('ADMIN') || hasPermission('PAYROLL_MANAGE');

  const [availableComponents, setAvailableComponents] = useState<any[]>([]);
  const [loadingComponents, setLoadingComponents] = useState(true);

  // Form states
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().split('T')[0]);
  const [currency, setCurrency] = useState('INR');
  const [items, setItems] = useState<StructureRow[]>([]);

  // Simulation states
  const [annualCtcTest, setAnnualCtcTest] = useState<number>(1200000);
  const [simulation, setSimulation] = useState<any>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);

  // Submission states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadComponents() {
      try {
        setLoadingComponents(true);
        const res = await apiClient.getSalaryComponents({ isActive: true, limit: 100 });
        const list = res?.data?.data || [];
        setAvailableComponents(list);

        // Pre-populate with common defaults if available (e.g. BASIC, HRA)
        const initialRows: StructureRow[] = [];
        let order = 1;
        list.forEach((c: any) => {
          if (['BASIC', 'HRA', 'SPECIAL_ALLOWANCE', 'PF_EMP', 'PF_EMPLOYER'].includes(c.code)) {
            initialRows.push({
              componentId: c.id,
              componentCode: c.code,
              componentName: c.name,
              category: c.category,
              defaultCalculationType: c.calculationType,
              defaultValue: c.defaultValue,
              defaultFormula: c.formula || '',
              orderIndex: order++,
            });
          }
        });
        setItems(initialRows);
      } catch (err) {
        console.error('Failed to load components', err);
      } finally {
        setLoadingComponents(false);
      }
    }
    loadComponents();
  }, []);

  const handleAddComponent = (componentId: string) => {
    if (!componentId) return;
    const comp = availableComponents.find((c) => c.id === componentId);
    if (!comp) return;

    if (items.some((i) => i.componentId === comp.id)) {
      alert(`Component ${comp.code} is already added to this structure.`);
      return;
    }

    const newRow: StructureRow = {
      componentId: comp.id,
      componentCode: comp.code,
      componentName: comp.name,
      category: comp.category,
      defaultCalculationType: comp.calculationType,
      defaultValue: comp.defaultValue,
      defaultFormula: comp.formula || '',
      orderIndex: items.length + 1,
    };

    setItems([...items, newRow]);
  };

  const handleRemoveRow = (index: number) => {
    const updated = items
      .filter((_, i) => i !== index)
      .map((row, idx) => ({
        ...row,
        orderIndex: idx + 1,
      }));
    setItems(updated);
  };

  const handleUpdateRow = (index: number, patch: Partial<StructureRow>) => {
    const updated = [...items];
    updated[index] = { ...updated[index], ...patch };
    setItems(updated);
  };

  // Run live simulation
  const runLiveSimulation = async () => {
    if (items.length === 0) {
      setSimError('Add at least one earning component to test simulation.');
      return;
    }

    try {
      setSimLoading(true);
      setSimError(null);

      const customItems = items.map((i) => ({
        componentId: i.componentId,
        orderIndex: i.orderIndex,
        calculationType: i.overrideCalculationType || undefined,
        value: i.value !== undefined ? Number(i.value) : undefined,
        formula: i.formula || undefined,
      }));

      const res = await apiClient.previewSalaryStructure({
        annualCtc: Number(annualCtcTest),
        customItems,
      });

      setSimulation(res.data);
    } catch (err: any) {
      setSimError(err?.message || 'Formula validation or simulation failed');
    } finally {
      setSimLoading(false);
    }
  };

  const handleSubmit = async (activateImmediately: boolean) => {
    if (!name.trim()) {
      setErrorMessage('Structure name is required.');
      return;
    }
    if (!code.trim()) {
      setErrorMessage('Structure code is required.');
      return;
    }
    if (!/^[A-Z][A-Z0-9_]*$/.test(code.trim().toUpperCase())) {
      setErrorMessage(
        'Structure code must contain uppercase letters, numbers and underscores only.',
      );
      return;
    }
    if (items.length === 0) {
      setErrorMessage('At least one salary component is required.');
      return;
    }
    const hasEarning = items.some((i) => i.category === 'EARNING');
    if (!hasEarning) {
      setErrorMessage('Structure must contain at least one EARNING component.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      const payload = {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        description: description.trim() || undefined,
        effectiveFrom: new Date(effectiveFrom).toISOString(),
        currency: currency.toUpperCase(),
        items: items.map((i) => ({
          componentId: i.componentId,
          orderIndex: i.orderIndex,
          calculationType: i.overrideCalculationType || undefined,
          value: i.value !== undefined && i.value !== null ? Number(i.value) : undefined,
          formula: i.formula?.trim() || undefined,
        })),
      };

      const res = await apiClient.createSalaryStructure(payload);
      const newId = res?.data?.id;

      if (activateImmediately && newId) {
        await apiClient.activateSalaryStructure(newId);
      }

      if (newId) {
        router.push(`/payroll/structures/${newId}`);
      } else {
        router.push('/payroll/structures');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to create salary structure');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ProtectedRoute requiredPermissions={['PAYROLL_MANAGE']}>
      <AppShell>
        <div className="space-y-6">
          {/* Header */}
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
                <span className="text-stone-800 font-medium">New Structure</span>
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
                  <h1 className="text-xl md:text-2xl font-bold text-stone-900 tracking-tight">
                    Create Version 1 Salary Structure
                  </h1>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Define standardized earnings and statutory deductions with automated AST formula
                    validation.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={isSubmitting}
                onClick={() => handleSubmit(false)}
              >
                Save as Draft
              </Button>
              <Button
                size="sm"
                disabled={isSubmitting}
                onClick={() => handleSubmit(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isSubmitting ? 'Creating...' : 'Save & Activate'}
              </Button>
            </div>
          </div>

          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Form details */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Basic Properties */}
              <Card className="border-stone-200 shadow-sm">
                <CardHeader className="pb-3 border-b border-stone-100">
                  <CardTitle className="text-sm font-bold text-stone-900">
                    Structure Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-4 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="font-semibold text-stone-700">Structure Name *</Label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Standard Corporate Package 2026"
                        className="mt-1 w-full px-3 py-2 border border-stone-300 rounded-md text-xs font-medium"
                      />
                    </div>
                    <div>
                      <Label className="font-semibold text-stone-700">Structure Code *</Label>
                      <input
                        type="text"
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                        placeholder="e.g. CORP_STD_2026"
                        className="mt-1 w-full px-3 py-2 border border-stone-300 rounded-md font-mono uppercase text-xs font-semibold"
                      />
                      <p className="text-[10px] text-stone-400 mt-1">
                        Unique immutable family identifier
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="font-semibold text-stone-700">Effective From *</Label>
                      <input
                        type="date"
                        value={effectiveFrom}
                        onChange={(e) => setEffectiveFrom(e.target.value)}
                        className="mt-1 w-full px-3 py-2 border border-stone-300 rounded-md text-xs"
                      />
                    </div>
                    <div>
                      <Label className="font-semibold text-stone-700">Currency</Label>
                      <input
                        type="text"
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                        className="mt-1 w-full px-3 py-2 border border-stone-300 rounded-md font-mono uppercase text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="font-semibold text-stone-700">Description / Rationale</Label>
                    <textarea
                      rows={2}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="e.g. Standard salary structure for general full-time corporate staff"
                      className="mt-1 w-full px-3 py-2 border border-stone-300 rounded-md text-xs"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Component Items Builder */}
              <Card className="border-stone-200 shadow-sm">
                <CardHeader className="pb-3 border-b border-stone-100 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-bold text-stone-900">
                      Component Items ({items.length})
                    </CardTitle>
                    <CardDescription className="text-xs text-stone-500">
                      Order and calculation rules applied to determine each component value.
                    </CardDescription>
                  </div>
                  {/* Add Component Dropdown */}
                  <div className="flex items-center gap-2">
                    <select
                      onChange={(e) => {
                        handleAddComponent(e.target.value);
                        e.target.value = '';
                      }}
                      defaultValue=""
                      className="text-xs bg-white border border-stone-300 rounded-md px-2.5 py-1.5 font-medium text-stone-800"
                    >
                      <option value="" disabled>
                        + Add Component...
                      </option>
                      {availableComponents.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} - {c.name} ({c.category})
                        </option>
                      ))}
                    </select>
                  </div>
                </CardHeader>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-stone-700">
                    <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 uppercase text-[10px]">
                      <tr>
                        <th className="py-2.5 px-3 text-center">#</th>
                        <th className="py-2.5 px-3">Component</th>
                        <th className="py-2.5 px-3">Category</th>
                        <th className="py-2.5 px-3">Calculation / Expression</th>
                        <th className="py-2.5 px-3 text-right">Remove</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {items.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-stone-400">
                            No components added yet. Use the dropdown above to add components.
                          </td>
                        </tr>
                      ) : (
                        items.map((row, idx) => (
                          <tr key={row.componentId} className="hover:bg-stone-50/50">
                            <td className="py-2.5 px-3 text-center font-mono text-stone-400">
                              {row.orderIndex}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-semibold font-mono text-stone-900">
                                {row.componentCode}
                              </div>
                              <div className="text-[10px] text-stone-500">{row.componentName}</div>
                            </td>
                            <td className="py-2.5 px-3">
                              <Badge
                                variant="outline"
                                className={`text-[9px] ${
                                  row.category === 'EARNING'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : row.category === 'DEDUCTION'
                                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                                      : 'bg-purple-50 text-purple-700 border-purple-200'
                                }`}
                              >
                                {row.category}
                              </Badge>
                            </td>
                            <td className="py-2.5 px-3">
                              {row.defaultCalculationType === 'FORMULA' ? (
                                <div className="space-y-1">
                                  <input
                                    type="text"
                                    defaultValue={row.formula || row.defaultFormula}
                                    onChange={(e) =>
                                      handleUpdateRow(idx, { formula: e.target.value })
                                    }
                                    placeholder="Override formula..."
                                    className="w-full px-2 py-1 border border-stone-300 rounded font-mono text-[11px] text-blue-600 bg-white"
                                  />
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-[11px] text-stone-500">
                                    {row.defaultCalculationType}:
                                  </span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    defaultValue={
                                      row.value !== undefined ? row.value : row.defaultValue
                                    }
                                    onChange={(e) =>
                                      handleUpdateRow(idx, { value: Number(e.target.value) })
                                    }
                                    className="w-24 px-2 py-1 border border-stone-300 rounded font-mono text-[11px] bg-white"
                                  />
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveRow(idx)}
                                className="h-7 w-7 p-0 text-stone-400 hover:text-red-600"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>

            {/* Live CTC Test Simulator Panel */}
            <div className="space-y-6">
              <Card className="border-emerald-200 bg-emerald-50/20 shadow-sm sticky top-6">
                <CardHeader className="pb-3 border-b border-emerald-100">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-emerald-100 text-emerald-700 rounded">
                      <Calculator className="w-4 h-4" />
                    </div>
                    <CardTitle className="text-sm font-bold text-stone-900">
                      Live Formula Tester
                    </CardTitle>
                  </div>
                  <CardDescription className="text-[11px] text-stone-500">
                    Verify formulas and dependencies before saving this structure.
                  </CardDescription>
                </CardHeader>

                <CardContent className="p-4 space-y-4 text-xs">
                  <div>
                    <Label className="font-semibold text-stone-700 text-[11px]">
                      Test Annual CTC (₹)
                    </Label>
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="number"
                        step="50000"
                        value={annualCtcTest}
                        onChange={(e) => setAnnualCtcTest(Number(e.target.value))}
                        className="w-full px-3 py-1.5 border border-stone-300 rounded-md font-mono text-xs font-semibold bg-white"
                      />
                      <Button
                        size="sm"
                        disabled={simLoading || items.length === 0}
                        onClick={runLiveSimulation}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs shrink-0"
                      >
                        {simLoading ? 'Testing...' : 'Test'}
                      </Button>
                    </div>
                  </div>

                  {simError && (
                    <div className="p-2.5 bg-red-50 border border-red-200 rounded text-red-700 text-[11px] flex items-start gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{simError}</span>
                    </div>
                  )}

                  {simulation && (
                    <div className="space-y-3 pt-2 border-t border-emerald-100">
                      <div className="grid grid-cols-2 gap-2 text-center">
                        <div className="p-2 bg-white rounded border border-stone-200">
                          <span className="text-[10px] text-stone-500 uppercase block">
                            Monthly Gross
                          </span>
                          <span className="font-mono font-bold text-xs text-stone-900">
                            ₹{Number(simulation.summary?.monthlyGross || 0).toLocaleString('en-IN')}
                          </span>
                        </div>
                        <div className="p-2 bg-emerald-100/60 rounded border border-emerald-200">
                          <span className="text-[10px] text-emerald-800 uppercase font-semibold block">
                            Est. Take-Home
                          </span>
                          <span className="font-mono font-bold text-xs text-emerald-900">
                            ₹
                            {Number(simulation.summary?.monthlyNetPay || 0).toLocaleString('en-IN')}
                          </span>
                        </div>
                      </div>

                      <div className="divide-y divide-stone-100 max-h-48 overflow-y-auto text-[11px]">
                        {simulation.breakdown?.map((b: any, idx: number) => (
                          <div key={idx} className="py-1 flex items-center justify-between">
                            <span className="font-mono text-stone-700">{b.componentCode}</span>
                            <span className="font-mono font-medium text-stone-900">
                              ₹{Number(b.monthlyAmount).toLocaleString('en-IN')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
