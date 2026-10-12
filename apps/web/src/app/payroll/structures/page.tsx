'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppShell } from '../../../layouts/AppShell';
import { ProtectedRoute } from '../../../components/auth/ProtectedRoute';
import { useAuth } from '../../../context/AuthContext';
import { apiClient } from '../../../lib/api-client';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Button,
  Input,
  Label,
} from '@hrms/ui';
import {
  Layers,
  Plus,
  Search,
  Copy,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Calculator,
  RefreshCw,
  Archive,
  ArrowRight,
  Sparkles,
  Calendar,
  Lock,
} from 'lucide-react';

export default function SalaryStructuresPage() {
  const router = useRouter();
  const { hasPermission, hasRole } = useAuth();
  const canManage = hasRole('ADMIN') || hasPermission('PAYROLL_MANAGE');

  const [structures, setStructures] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Quick Preview Modal state
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewStructure, setPreviewStructure] = useState<any>(null);
  const [annualCtcInput, setAnnualCtcInput] = useState<number>(1200000);
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Clone Modal state
  const [cloneModalOpen, setCloneModalOpen] = useState(false);
  const [structureToClone, setStructureToClone] = useState<any>(null);
  const [cloneForm, setCloneForm] = useState({
    name: '',
    effectiveFrom: new Date().toISOString().split('T')[0],
  });
  const [cloneSubmitting, setCloneSubmitting] = useState(false);

  // Notification banners
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchStructures = async () => {
    try {
      setIsLoading(true);
      const res = await apiClient.getSalaryStructures({
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        search: searchTerm || undefined,
        page,
        limit: 15,
      });

      if (res?.data) {
        setStructures(res.data.data || []);
        setTotalPages(res.data.meta?.totalPages || 1);
        setTotalCount(res.data.meta?.total || 0);
      }
    } catch (err: any) {
      console.error('Failed to load salary structures', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStructures();
  }, [statusFilter, page]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchStructures();
  };

  const handleActivate = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to activate salary structure '${name}'?`)) return;
    try {
      await apiClient.activateSalaryStructure(id);
      setSuccessMessage(`Salary structure '${name}' activated successfully.`);
      fetchStructures();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to activate salary structure');
      setTimeout(() => setErrorMessage(null), 4000);
    }
  };

  const handleRetire = async (id: string, name: string) => {
    if (
      !confirm(
        `Are you sure you want to retire salary structure '${name}'? Historical records will be retained.`,
      )
    )
      return;
    try {
      await apiClient.retireSalaryStructure(id);
      setSuccessMessage(`Salary structure '${name}' retired.`);
      fetchStructures();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to retire salary structure');
      setTimeout(() => setErrorMessage(null), 4000);
    }
  };

  const openPreview = async (struct: any) => {
    setPreviewStructure(struct);
    setPreviewModalOpen(true);
    setPreviewResult(null);
    setPreviewError(null);
    runPreview(struct.id, annualCtcInput);
  };

  const runPreview = async (structureId: string, annualCtc: number) => {
    try {
      setPreviewLoading(true);
      setPreviewError(null);
      const res = await apiClient.previewSalaryStructure({
        structureId,
        annualCtc: Number(annualCtc),
      });
      setPreviewResult(res.data);
    } catch (err: any) {
      setPreviewError(err?.message || 'Calculation preview failed');
    } finally {
      setPreviewLoading(false);
    }
  };

  const openCloneModal = (struct: any) => {
    setStructureToClone(struct);
    setCloneForm({
      name: `${struct.name} (v${struct.version + 1})`,
      effectiveFrom: new Date().toISOString().split('T')[0],
    });
    setCloneModalOpen(true);
  };

  const submitClone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!structureToClone) return;
    try {
      setCloneSubmitting(true);
      const res = await apiClient.cloneSalaryStructure(structureToClone.id, {
        name: cloneForm.name,
        effectiveFrom: new Date(cloneForm.effectiveFrom).toISOString(),
      });
      setCloneModalOpen(false);
      setSuccessMessage(`Successfully cloned to version ${res?.data?.version || 'new'}.`);
      fetchStructures();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      alert(err?.message || 'Failed to clone salary structure');
    } finally {
      setCloneSubmitting(false);
    }
  };

  return (
    <ProtectedRoute requiredPermissions={['PAYROLL_VIEW']}>
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
                <span className="text-stone-800 font-medium">Salary Structures</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                  <Layers className="w-5 h-5" />
                </div>
                <h1 className="text-xl md:text-2xl font-bold text-stone-900 tracking-tight">
                  Salary Structures Administration
                </h1>
              </div>
              <p className="text-sm text-stone-500 mt-1">
                Versioned compensation architectures, component hierarchies, and deterministic
                calculation templates.
              </p>
            </div>
            {canManage && (
              <Link href="/payroll/structures/new">
                <Button
                  size="sm"
                  className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Plus className="w-4 h-4" />
                  Create Structure
                </Button>
              </Link>
            )}
          </div>

          {/* Success / Error alerts */}
          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md text-emerald-800 text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Filters & Search */}
          <Card className="border-stone-200 shadow-sm">
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5 bg-stone-100 p-1 rounded-lg">
                  {[
                    { id: 'ALL', label: 'All Structures' },
                    { id: 'ACTIVE', label: 'Active' },
                    { id: 'DRAFT', label: 'Draft' },
                    { id: 'RETIRED', label: 'Retired' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setStatusFilter(tab.id);
                        setPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        statusFilter === tab.id
                          ? 'bg-white text-stone-900 shadow-sm'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleSearch} className="flex items-center gap-1.5">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="Search structure name or code..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="text-xs pl-8 pr-3 py-1.5 bg-white border border-stone-200 rounded-md w-48 md:w-64 text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <Button type="submit" variant="outline" size="sm" className="h-8 text-xs px-2.5">
                    Search
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>

          {/* Structures Table */}
          <Card className="border-stone-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-stone-700">
                <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 uppercase font-semibold">
                  <tr>
                    <th className="py-3 px-4">Structure Name & Code</th>
                    <th className="py-3 px-4 text-center">Version</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4">Effective Dates</th>
                    <th className="py-3 px-4 text-center">Components</th>
                    <th className="py-3 px-4 text-center">Assigned Employees</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-stone-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <RefreshCw className="w-5 h-5 animate-spin text-emerald-500" />
                          <span>Loading salary structures...</span>
                        </div>
                      </td>
                    </tr>
                  ) : structures.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-stone-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Layers className="w-8 h-8 text-stone-300" />
                          <span className="text-sm font-medium text-stone-600">
                            No salary structures found
                          </span>
                          <span className="text-xs text-stone-400">
                            Create your first structure to define standardized compensation
                            templates.
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    structures.map((s) => {
                      const empCount = s._count?.compensations || 0;
                      return (
                        <tr key={s.id} className="hover:bg-stone-50/70 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-semibold text-stone-900">{s.name}</div>
                            <div className="text-[11px] font-mono text-stone-400">
                              Code: {s.code}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <Badge variant="outline" className="font-mono text-[10px] bg-stone-50">
                              v{s.version}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-medium ${
                                s.status === 'ACTIVE'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : s.status === 'DRAFT'
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : 'bg-stone-100 text-stone-500'
                              }`}
                            >
                              {s.status}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-[11px] text-stone-600">
                            <div>
                              From:{' '}
                              {s.effectiveFrom
                                ? new Date(s.effectiveFrom).toLocaleDateString()
                                : 'Immediate'}
                            </div>
                            {s.effectiveTo && (
                              <div className="text-stone-400">
                                To: {new Date(s.effectiveTo).toLocaleDateString()}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="font-semibold text-stone-800">
                              {s.items?.length || 0}
                            </span>
                            <span className="text-[10px] text-stone-400 block">items</span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <span className="font-semibold text-stone-800">{empCount}</span>
                              {empCount > 0 && (
                                <span title="Locked by active assignments">
                                  <Lock className="w-3 h-3 text-amber-600" />
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-stone-400 block">assigned</span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Quick Preview Button */}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openPreview(s)}
                                className="h-7 px-2 text-[11px] gap-1 text-stone-600"
                                title="Quick CTC Preview"
                              >
                                <Calculator className="w-3 h-3 text-emerald-600" />
                                Preview
                              </Button>

                              {/* Inspect Detail */}
                              <Link href={`/payroll/structures/${s.id}`}>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-[11px] gap-1 text-stone-700"
                                >
                                  <Eye className="w-3 h-3" />
                                  Inspect
                                </Button>
                              </Link>

                              {/* Clone / New Version */}
                              {canManage && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openCloneModal(s)}
                                  className="h-7 px-2 text-[11px] gap-1 text-blue-600 hover:text-blue-700"
                                  title="Clone as New Version"
                                >
                                  <Copy className="w-3 h-3" />
                                  Clone
                                </Button>
                              )}

                              {/* Activate if DRAFT */}
                              {canManage && s.status === 'DRAFT' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleActivate(s.id, s.name)}
                                  className="h-7 px-2 text-[11px] bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                >
                                  Activate
                                </Button>
                              )}

                              {/* Retire if ACTIVE */}
                              {canManage && s.status === 'ACTIVE' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleRetire(s.id, s.name)}
                                  className="h-7 px-2 text-[11px] text-stone-400 hover:text-red-600"
                                  title="Retire Structure"
                                >
                                  <Archive className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="p-3 bg-stone-50 border-t border-stone-200 flex items-center justify-between text-xs text-stone-500">
              <span>
                Showing {structures.length} of {totalCount} structures
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="h-7 text-xs px-2.5"
                >
                  Previous
                </Button>
                <span>
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="h-7 text-xs px-2.5"
                >
                  Next
                </Button>
              </div>
            </div>
          </Card>

          {/* Quick CTC Preview Modal */}
          {previewModalOpen && previewStructure && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div className="p-5 border-b border-stone-100 flex items-center justify-between bg-stone-50">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
                      <Calculator className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-stone-900">
                        Quick CTC Preview: {previewStructure.name}
                      </h3>
                      <p className="text-[11px] text-stone-500 font-mono">
                        Code: {previewStructure.code} • v{previewStructure.version}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setPreviewModalOpen(false)}
                    className="text-stone-400 hover:text-stone-700 text-lg leading-none"
                  >
                    &times;
                  </button>
                </div>

                <div className="p-5 space-y-5 text-xs">
                  {/* Simulator Controls */}
                  <div className="bg-emerald-50/50 p-4 rounded-lg border border-emerald-100 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <Label className="font-semibold text-stone-800 text-xs">
                          Test Annual Cost to Company (CTC)
                        </Label>
                        <p className="text-[11px] text-stone-500">
                          Simulate itemized monthly gross, deductions, and estimated net pay.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <span className="absolute left-2.5 top-2 text-stone-400 font-medium">
                            ₹
                          </span>
                          <input
                            type="number"
                            step="10000"
                            value={annualCtcInput}
                            onChange={(e) => setAnnualCtcInput(Number(e.target.value))}
                            className="pl-6 pr-3 py-1.5 w-36 bg-white border border-stone-300 rounded-md font-mono text-xs font-semibold text-stone-900"
                          />
                        </div>
                        <Button
                          size="sm"
                          disabled={previewLoading}
                          onClick={() => runPreview(previewStructure.id, annualCtcInput)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs"
                        >
                          {previewLoading ? 'Calculating...' : 'Recalculate'}
                        </Button>
                      </div>
                    </div>

                    {/* Presets */}
                    <div className="flex items-center gap-2 pt-1 border-t border-emerald-100/60">
                      <span className="text-[10px] text-stone-500 font-medium">Presets:</span>
                      {[400000, 600000, 1000000, 1500000, 2400000].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => {
                            setAnnualCtcInput(amt);
                            runPreview(previewStructure.id, amt);
                          }}
                          className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                            annualCtcInput === amt
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
                          }`}
                        >
                          ₹{(amt / 100000).toFixed(1)}L
                        </button>
                      ))}
                    </div>
                  </div>

                  {previewError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-xs">
                      {previewError}
                    </div>
                  )}

                  {/* Calculation Result */}
                  {previewResult && (
                    <div className="space-y-4">
                      {/* Summary Cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                        <div className="p-3 bg-stone-50 rounded-lg border border-stone-200">
                          <span className="text-[10px] font-semibold uppercase text-stone-500">
                            Monthly Gross
                          </span>
                          <div className="text-sm font-bold text-stone-900 mt-1 font-mono">
                            ₹
                            {Number(previewResult.summary?.monthlyGross || 0).toLocaleString(
                              'en-IN',
                            )}
                          </div>
                        </div>

                        <div className="p-3 bg-amber-50/50 rounded-lg border border-amber-200">
                          <span className="text-[10px] font-semibold uppercase text-amber-700">
                            Monthly Deductions
                          </span>
                          <div className="text-sm font-bold text-amber-900 mt-1 font-mono">
                            ₹
                            {Number(
                              previewResult.summary?.monthlyEmployeeDeductions || 0,
                            ).toLocaleString('en-IN')}
                          </div>
                        </div>

                        <div className="p-3 bg-emerald-50/70 rounded-lg border border-emerald-200">
                          <span className="text-[10px] font-semibold uppercase text-emerald-700">
                            Est. Take-Home
                          </span>
                          <div className="text-sm font-bold text-emerald-900 mt-1 font-mono">
                            ₹
                            {Number(previewResult.summary?.monthlyNetPay || 0).toLocaleString(
                              'en-IN',
                            )}
                          </div>
                        </div>

                        <div className="p-3 bg-purple-50/50 rounded-lg border border-purple-200">
                          <span className="text-[10px] font-semibold uppercase text-purple-700">
                            Employer Share
                          </span>
                          <div className="text-sm font-bold text-purple-900 mt-1 font-mono">
                            ₹
                            {Number(
                              previewResult.summary?.monthlyEmployerContribution || 0,
                            ).toLocaleString('en-IN')}
                          </div>
                        </div>
                      </div>

                      {/* Itemized Table */}
                      <div className="border border-stone-200 rounded-lg overflow-hidden">
                        <table className="w-full text-left text-xs text-stone-700">
                          <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 uppercase text-[10px]">
                            <tr>
                              <th className="py-2.5 px-3">Component</th>
                              <th className="py-2.5 px-3">Category</th>
                              <th className="py-2.5 px-3 text-right">Monthly (₹)</th>
                              <th className="py-2.5 px-3 text-right">Annual (₹)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-100">
                            {previewResult.breakdown?.map((item: any, idx: number) => (
                              <tr key={idx} className="hover:bg-stone-50/50 font-mono text-[11px]">
                                <td className="py-2 px-3">
                                  <span className="font-semibold text-stone-900">
                                    {item.componentCode}
                                  </span>{' '}
                                  <span className="font-sans text-stone-500 text-[10px]">
                                    ({item.componentName})
                                  </span>
                                </td>
                                <td className="py-2 px-3 font-sans">
                                  <span
                                    className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                                      item.category === 'EARNING'
                                        ? 'bg-emerald-50 text-emerald-700'
                                        : item.category === 'DEDUCTION'
                                          ? 'bg-amber-50 text-amber-700'
                                          : 'bg-purple-50 text-purple-700'
                                    }`}
                                  >
                                    {item.category}
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-right font-semibold text-stone-900">
                                  ₹{Number(item.monthlyAmount).toLocaleString('en-IN')}
                                </td>
                                <td className="py-2 px-3 text-right text-stone-600">
                                  ₹{Number(item.annualAmount).toLocaleString('en-IN')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-4 bg-stone-50 border-t border-stone-100 flex items-center justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPreviewModalOpen(false)}
                    className="text-xs"
                  >
                    Close Preview
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Clone Structure Modal */}
          {cloneModalOpen && structureToClone && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4 text-xs">
                <div className="flex items-center gap-2 text-blue-600">
                  <Copy className="w-5 h-5 flex-shrink-0" />
                  <h3 className="text-sm font-bold text-stone-900">
                    Clone as New Version: {structureToClone.code}
                  </h3>
                </div>
                <p className="text-stone-600 text-xs">
                  This will create a new version (<strong>v{structureToClone.version + 1}</strong>)
                  with all current component configurations duplicated in <strong>DRAFT</strong>{' '}
                  status. Existing employee assignments to version {structureToClone.version} will
                  remain undisturbed.
                </p>

                <form onSubmit={submitClone} className="space-y-3 pt-2">
                  <div>
                    <Label className="font-semibold text-stone-700">New Structure Name *</Label>
                    <input
                      type="text"
                      required
                      value={cloneForm.name}
                      onChange={(e) => setCloneForm({ ...cloneForm, name: e.target.value })}
                      className="mt-1 w-full px-3 py-2 border border-stone-300 rounded-md text-xs font-medium"
                    />
                  </div>

                  <div>
                    <Label className="font-semibold text-stone-700">Effective From Date *</Label>
                    <input
                      type="date"
                      required
                      value={cloneForm.effectiveFrom}
                      onChange={(e) =>
                        setCloneForm({ ...cloneForm, effectiveFrom: e.target.value })
                      }
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
