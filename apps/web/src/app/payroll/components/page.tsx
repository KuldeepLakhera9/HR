'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
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
  Component,
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  AlertCircle,
  CheckCircle,
  HelpCircle,
  RefreshCw,
  ArrowUpDown,
  Code2,
  FileText,
} from 'lucide-react';

export default function SalaryComponentsPage() {
  const { hasPermission, hasRole } = useAuth();
  const canManage = hasRole('ADMIN') || hasPermission('PAYROLL_MANAGE');

  // List state
  const [components, setComponents] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    category: 'EARNING',
    calculationType: 'FIXED',
    defaultValue: '0',
    formula: '',
    roundingRule: 'HALF_UP',
    precision: 2,
    isTaxable: true,
    affectsGross: true,
    isPartCtc: true,
    isMandatory: false,
    isActive: true,
    effectiveFrom: new Date().toISOString().split('T')[0],
    description: '',
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Delete confirm modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [componentToDelete, setComponentToDelete] = useState<any>(null);

  const fetchComponents = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await apiClient.getSalaryComponents({
        search: searchTerm || undefined,
        category: selectedCategory !== 'ALL' ? selectedCategory : undefined,
        type: selectedType !== 'ALL' ? selectedType : undefined,
        page,
        limit: 15,
      });

      if (res?.data) {
        setComponents(res.data.data || []);
        setTotalPages(res.data.meta?.totalPages || 1);
        setTotalCount(res.data.meta?.total || 0);
      }
    } catch (err: any) {
      console.error('Failed to load components', err);
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, selectedCategory, selectedType, page]);

  useEffect(() => {
    fetchComponents();
  }, [fetchComponents]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchComponents();
  };

  const openCreateModal = () => {
    setIsEditing(false);
    setEditingId(null);
    setFormData({
      code: '',
      name: '',
      category: 'EARNING',
      calculationType: 'FIXED',
      defaultValue: '0',
      formula: '',
      roundingRule: 'HALF_UP',
      precision: 2,
      isTaxable: true,
      affectsGross: true,
      isPartCtc: true,
      isMandatory: false,
      isActive: true,
      effectiveFrom: new Date().toISOString().split('T')[0],
      description: '',
    });
    setFormErrors({});
    setSubmitError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (comp: any) => {
    setIsEditing(true);
    setEditingId(comp.id);
    setFormData({
      code: comp.code,
      name: comp.name,
      category: comp.category,
      calculationType: comp.calculationType,
      defaultValue: comp.defaultValue ? String(comp.defaultValue) : '0',
      formula: comp.formula || '',
      roundingRule: comp.roundingRule || 'HALF_UP',
      precision: comp.precision ?? 2,
      isTaxable: comp.isTaxable ?? true,
      affectsGross: comp.affectsGross ?? true,
      isPartCtc: comp.isPartCtc ?? true,
      isMandatory: comp.isMandatory ?? false,
      isActive: comp.isActive ?? true,
      effectiveFrom: comp.effectiveFrom ? comp.effectiveFrom.split('T')[0] : '',
      description: comp.description || '',
    });
    setFormErrors({});
    setSubmitError(null);
    setIsModalOpen(true);
  };

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formData.code.trim()) {
      errors.code = 'Component code is required';
    } else if (!/^[A-Z][A-Z0-9_]*$/.test(formData.code.trim())) {
      errors.code = 'Code must be UPPERCASE letters, numbers, and underscores only';
    }

    if (!formData.name.trim()) {
      errors.name = 'Component name is required';
    }

    if (formData.calculationType === 'FORMULA' && !formData.formula.trim()) {
      errors.formula = 'Formula expression is required for formula-based components';
    }

    if (
      (formData.calculationType === 'FIXED' || formData.calculationType === 'PERCENTAGE') &&
      (isNaN(Number(formData.defaultValue)) || Number(formData.defaultValue) < 0)
    ) {
      errors.defaultValue = 'Default value must be a non-negative number';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      setIsSubmitting(true);
      setSubmitError(null);

      const payload = {
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        category: formData.category,
        calculationType: formData.calculationType,
        defaultValue: Number(formData.defaultValue) || 0,
        formula: formData.calculationType === 'FORMULA' ? formData.formula.trim() : undefined,
        roundingRule: formData.roundingRule,
        precision: Number(formData.precision),
        isTaxable: formData.isTaxable,
        affectsGross: formData.affectsGross,
        isPartCtc: formData.isPartCtc,
        isMandatory: formData.isMandatory,
        isActive: formData.isActive,
        effectiveFrom: formData.effectiveFrom
          ? new Date(formData.effectiveFrom).toISOString()
          : undefined,
        description: formData.description.trim() || undefined,
      };

      if (isEditing && editingId) {
        await apiClient.updateSalaryComponent(editingId, payload);
        setSuccessMessage(`Component ${formData.code} updated successfully.`);
      } else {
        await apiClient.createSalaryComponent(payload);
        setSuccessMessage(`Component ${formData.code} created successfully.`);
      }

      setIsModalOpen(false);
      fetchComponents();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setSubmitError(err?.message || 'Failed to save salary component');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!componentToDelete) return;
    try {
      setIsSubmitting(true);
      await apiClient.deleteSalaryComponent(componentToDelete.id);
      setDeleteModalOpen(false);
      setSuccessMessage(`Component ${componentToDelete.code} retired/deleted.`);
      fetchComponents();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      alert(err?.message || 'Failed to delete component');
    } finally {
      setIsSubmitting(false);
      setComponentToDelete(null);
    }
  };

  return (
    <ProtectedRoute requiredPermissions={['PAYROLL_VIEW']}>
      <AppShell>
        <div className="space-y-6">
          {/* Breadcrumbs & Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-stone-200">
            <div>
              <div className="flex items-center gap-2 text-xs text-stone-500 mb-1">
                <Link href="/payroll" className="hover:text-stone-800">
                  Payroll
                </Link>
                <span>/</span>
                <span className="text-stone-800 font-medium">Salary Components</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
                  <Component className="w-5 h-5" />
                </div>
                <h1 className="text-xl md:text-2xl font-bold text-stone-900 tracking-tight">
                  Salary Components Administration
                </h1>
              </div>
              <p className="text-sm text-stone-500 mt-1">
                Catalog of standardized earnings, employee deductions, and employer contributions
                used across salary structures.
              </p>
            </div>
            {canManage && (
              <Button
                onClick={openCreateModal}
                size="sm"
                className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Plus className="w-4 h-4" />
                Add Component
              </Button>
            )}
          </div>

          {/* Success Banner */}
          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md text-emerald-800 text-sm flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Filters & Search */}
          <Card className="border-stone-200 shadow-sm">
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                {/* Category Tabs */}
                <div className="flex flex-wrap items-center gap-1.5 bg-stone-100 p-1 rounded-lg">
                  {[
                    { id: 'ALL', label: 'All Components' },
                    { id: 'EARNING', label: 'Earnings' },
                    { id: 'DEDUCTION', label: 'Deductions' },
                    { id: 'EMPLOYER_CONTRIBUTION', label: 'Employer Contributions' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setSelectedCategory(tab.id);
                        setPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        selectedCategory === tab.id
                          ? 'bg-white text-stone-900 shadow-sm'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Search & Calculation Type Filter */}
                <div className="flex items-center gap-2">
                  <select
                    value={selectedType}
                    onChange={(e) => {
                      setSelectedType(e.target.value);
                      setPage(1);
                    }}
                    className="text-xs bg-white border border-stone-200 rounded-md px-2.5 py-1.5 text-stone-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="ALL">All Methods</option>
                    <option value="FIXED">Fixed Amount</option>
                    <option value="PERCENTAGE">Percentage</option>
                    <option value="FORMULA">Formula</option>
                  </select>

                  <form onSubmit={handleSearch} className="flex items-center gap-1.5">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-2.5" />
                      <input
                        type="text"
                        placeholder="Search code or name..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="text-xs pl-8 pr-3 py-1.5 bg-white border border-stone-200 rounded-md w-44 md:w-56 text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <Button
                      type="submit"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs px-2.5"
                    >
                      Search
                    </Button>
                  </form>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Components Data Table */}
          <Card className="border-stone-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-stone-700">
                <thead className="bg-stone-50 border-b border-stone-200 text-stone-500 uppercase font-semibold">
                  <tr>
                    <th className="py-3 px-4">Code / Identifier</th>
                    <th className="py-3 px-4">Component Name</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Calculation Method</th>
                    <th className="py-3 px-4">Default Value / Expression</th>
                    <th className="py-3 px-4 text-center">Tax / CTC Flags</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    {canManage && <th className="py-3 px-4 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {isLoading ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-stone-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
                          <span>Loading salary components catalog...</span>
                        </div>
                      </td>
                    </tr>
                  ) : components.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-stone-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Component className="w-8 h-8 text-stone-300" />
                          <span className="text-sm font-medium text-stone-600">
                            No components found
                          </span>
                          <span className="text-xs text-stone-400">
                            {searchTerm
                              ? 'Try adjusting your search criteria.'
                              : 'Get started by creating your first salary component.'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    components.map((comp) => (
                      <tr key={comp.id} className="hover:bg-stone-50/70 transition-colors">
                        <td className="py-3 px-4 font-mono font-semibold text-stone-900">
                          {comp.code}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-stone-900">{comp.name}</div>
                          {comp.description && (
                            <div className="text-[11px] text-stone-400 truncate max-w-xs">
                              {comp.description}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <Badge
                            variant="outline"
                            className={`text-[10px] font-medium ${
                              comp.category === 'EARNING'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : comp.category === 'DEDUCTION'
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-purple-50 text-purple-700 border-purple-200'
                            }`}
                          >
                            {comp.category}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-700">
                            {comp.calculationType}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-[11px] text-stone-800">
                          {comp.calculationType === 'FORMULA' ? (
                            <span className="text-blue-600 font-semibold">{comp.formula}</span>
                          ) : comp.calculationType === 'PERCENTAGE' ? (
                            <span>{comp.defaultValue}%</span>
                          ) : (
                            <span>₹{Number(comp.defaultValue).toLocaleString('en-IN')}</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {comp.isTaxable && (
                              <span
                                title="Taxable income component"
                                className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded text-[10px]"
                              >
                                Taxable
                              </span>
                            )}
                            {comp.isPartCtc && (
                              <span
                                title="Included in CTC calculation"
                                className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px]"
                              >
                                CTC
                              </span>
                            )}
                            {comp.affectsGross && (
                              <span
                                title="Contributes to Monthly Gross"
                                className="px-1.5 py-0.5 bg-stone-100 text-stone-700 rounded text-[10px]"
                              >
                                Gross
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              comp.isActive
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-stone-100 text-stone-400'
                            }`}
                          >
                            {comp.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        {canManage && (
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditModal(comp)}
                                className="h-7 w-7 p-0 text-stone-500 hover:text-stone-900"
                                title="Edit Component"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setComponentToDelete(comp);
                                  setDeleteModalOpen(true);
                                }}
                                className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                                title="Retire/Delete Component"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            <div className="p-3 bg-stone-50 border-t border-stone-200 flex items-center justify-between text-xs text-stone-500">
              <span>
                Showing {components.length} of {totalCount} components
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

          {/* Create / Edit Component Modal */}
          {isModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-white rounded-xl shadow-xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
                <div className="p-5 border-b border-stone-100 flex items-center justify-between">
                  <h3 className="text-base font-bold text-stone-900">
                    {isEditing ? `Edit Component: ${formData.code}` : 'Create Salary Component'}
                  </h3>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="text-stone-400 hover:text-stone-700 text-lg leading-none"
                  >
                    &times;
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
                  {submitError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <span>{submitError}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="font-semibold text-stone-700">Component Code *</Label>
                      <input
                        type="text"
                        value={formData.code}
                        disabled={isEditing}
                        onChange={(e) =>
                          setFormData({ ...formData, code: e.target.value.toUpperCase() })
                        }
                        placeholder="e.g. BASIC, HRA, PF_EMP"
                        className={`mt-1 w-full px-3 py-2 border rounded-md font-mono text-xs uppercase ${
                          formErrors.code ? 'border-red-500' : 'border-stone-300'
                        } ${isEditing ? 'bg-stone-100 text-stone-500 cursor-not-allowed' : 'bg-white'}`}
                      />
                      {formErrors.code && (
                        <p className="text-red-500 text-[11px] mt-1">{formErrors.code}</p>
                      )}
                      <p className="text-stone-400 text-[10px] mt-1">
                        Must be unique, uppercase identifier
                      </p>
                    </div>

                    <div>
                      <Label className="font-semibold text-stone-700">Display Name *</Label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g. Basic Salary"
                        className={`mt-1 w-full px-3 py-2 border rounded-md text-xs ${
                          formErrors.name ? 'border-red-500' : 'border-stone-300'
                        }`}
                      />
                      {formErrors.name && (
                        <p className="text-red-500 text-[11px] mt-1">{formErrors.name}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="font-semibold text-stone-700">Category *</Label>
                      <select
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        className="mt-1 w-full px-3 py-2 border border-stone-300 rounded-md text-xs bg-white"
                      >
                        <option value="EARNING">Earning</option>
                        <option value="DEDUCTION">Employee Deduction</option>
                        <option value="EMPLOYER_CONTRIBUTION">Employer Contribution</option>
                      </select>
                    </div>

                    <div>
                      <Label className="font-semibold text-stone-700">Calculation Method *</Label>
                      <select
                        value={formData.calculationType}
                        onChange={(e) =>
                          setFormData({ ...formData, calculationType: e.target.value })
                        }
                        className="mt-1 w-full px-3 py-2 border border-stone-300 rounded-md text-xs bg-white"
                      >
                        <option value="FIXED">Fixed Amount</option>
                        <option value="PERCENTAGE">Percentage</option>
                        <option value="FORMULA">Formula Expression</option>
                      </select>
                    </div>
                  </div>

                  {formData.calculationType === 'FORMULA' ? (
                    <div>
                      <Label className="font-semibold text-stone-700">Formula Expression *</Label>
                      <input
                        type="text"
                        value={formData.formula}
                        onChange={(e) => setFormData({ ...formData, formula: e.target.value })}
                        placeholder="e.g. BASIC * 0.40 or (CTC * 0.50) / 12"
                        className={`mt-1 w-full px-3 py-2 border font-mono rounded-md text-xs ${
                          formErrors.formula ? 'border-red-500' : 'border-stone-300'
                        }`}
                      />
                      {formErrors.formula && (
                        <p className="text-red-500 text-[11px] mt-1">{formErrors.formula}</p>
                      )}
                      <div className="mt-2 p-2 bg-blue-50 border border-blue-100 rounded text-[11px] text-blue-700 space-y-1">
                        <div className="flex items-center gap-1 font-semibold">
                          <Code2 className="w-3.5 h-3.5" />
                          <span>Formula Security & Whitelist:</span>
                        </div>
                        <p>
                          Supports component codes (e.g. <code>BASIC</code>, <code>CTC</code>),
                          arithmetic operators <code>+ - * / ( )</code>, and decimal numbers.
                          Arbitrary code execution is strictly rejected.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <Label className="font-semibold text-stone-700">
                        Default Value {formData.calculationType === 'PERCENTAGE' ? '(%)' : '(₹)'}
                      </Label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.defaultValue}
                        onChange={(e) => setFormData({ ...formData, defaultValue: e.target.value })}
                        className={`mt-1 w-full px-3 py-2 border rounded-md font-mono text-xs ${
                          formErrors.defaultValue ? 'border-red-500' : 'border-stone-300'
                        }`}
                      />
                      {formErrors.defaultValue && (
                        <p className="text-red-500 text-[11px] mt-1">{formErrors.defaultValue}</p>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="font-semibold text-stone-700">Rounding Rule</Label>
                      <select
                        value={formData.roundingRule}
                        onChange={(e) => setFormData({ ...formData, roundingRule: e.target.value })}
                        className="mt-1 w-full px-3 py-2 border border-stone-300 rounded-md text-xs bg-white"
                      >
                        <option value="HALF_UP">Half Up (Standard)</option>
                        <option value="UP">Round Up</option>
                        <option value="DOWN">Round Down</option>
                        <option value="NEAREST_INTEGER">Nearest Integer</option>
                      </select>
                    </div>

                    <div>
                      <Label className="font-semibold text-stone-700">Precision (Decimals)</Label>
                      <input
                        type="number"
                        value={formData.precision}
                        min="0"
                        max="4"
                        onChange={(e) =>
                          setFormData({ ...formData, precision: Number(e.target.value) })
                        }
                        className="mt-1 w-full px-3 py-2 border border-stone-300 rounded-md font-mono text-xs"
                      />
                    </div>
                  </div>

                  {/* Classification Checkboxes */}
                  <div className="p-3 bg-stone-50 rounded-lg space-y-2 border border-stone-200">
                    <span className="font-semibold text-stone-700 block text-[11px]">
                      Classification & Financial Flags
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-stone-700">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.isTaxable}
                          onChange={(e) =>
                            setFormData({ ...formData, isTaxable: e.target.checked })
                          }
                          className="rounded text-blue-600 focus:ring-0"
                        />
                        <span>Is Taxable</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.affectsGross}
                          onChange={(e) =>
                            setFormData({ ...formData, affectsGross: e.target.checked })
                          }
                          className="rounded text-blue-600 focus:ring-0"
                        />
                        <span>Affects Gross Salary</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.isPartCtc}
                          onChange={(e) =>
                            setFormData({ ...formData, isPartCtc: e.target.checked })
                          }
                          className="rounded text-blue-600 focus:ring-0"
                        />
                        <span>Part of Annual CTC</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.isMandatory}
                          onChange={(e) =>
                            setFormData({ ...formData, isMandatory: e.target.checked })
                          }
                          className="rounded text-blue-600 focus:ring-0"
                        />
                        <span>Mandatory Component</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer col-span-2">
                        <input
                          type="checkbox"
                          checked={formData.isActive}
                          onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                          className="rounded text-blue-600 focus:ring-0"
                        />
                        <span>Active for new structures</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <Label className="font-semibold text-stone-700">
                      Description / Business Notes
                    </Label>
                    <textarea
                      rows={2}
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="e.g. Statutory requirement according to EPF Act 1952"
                      className="mt-1 w-full px-3 py-2 border border-stone-300 rounded-md text-xs"
                    />
                  </div>

                  <div className="pt-3 border-t border-stone-200 flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsModalOpen(false)}
                      disabled={isSubmitting}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={isSubmitting}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {isSubmitting
                        ? 'Saving...'
                        : isEditing
                          ? 'Update Component'
                          : 'Create Component'}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Delete / Retire Confirmation Dialog */}
          {deleteModalOpen && componentToDelete && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5 space-y-4 text-xs">
                <div className="flex items-center gap-2 text-amber-600">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <h3 className="text-sm font-bold text-stone-900">
                    Retire Component: {componentToDelete.code}?
                  </h3>
                </div>
                <p className="text-stone-600">
                  Are you sure you want to retire <strong>{componentToDelete.name}</strong>?
                </p>
                <p className="text-stone-500 bg-stone-50 p-2.5 rounded border border-stone-200 text-[11px]">
                  <strong>Integrity check:</strong> If this component is currently referenced by any
                  active salary structures, retirement will be prevented to protect historical
                  consistency.
                </p>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isSubmitting}
                    onClick={() => setDeleteModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={isSubmitting}
                    onClick={handleDelete}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    {isSubmitting ? 'Processing...' : 'Confirm Retire'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
