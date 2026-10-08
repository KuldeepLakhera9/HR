'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '../../layouts/AppShell';
import { DataTable, Search, Button, Badge, Avatar, Dialog, Pagination } from '@hrms/ui';
import {
  UserPlus,
  Download,
  Upload,
  Filter,
  RefreshCw,
  Building2,
  Mail,
  Phone,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { employeesApi, organizationApi } from '../../lib/api-client';
import { useAuth } from '../../context/AuthContext';

export default function EmployeesPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();

  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<any[]>([]);
  const [meta, setMeta] = useState<{
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });

  // Filter dropdown data
  const [departments, setDepartments] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [designations, setDesignations] = useState<any[]>([]);

  // Search & Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedWorkMode, setSelectedWorkMode] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Import Modal state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // Load filter options
  useEffect(() => {
    async function loadLookups() {
      try {
        const [depts, brs, desigs] = await Promise.all([
          organizationApi.getDepartments({ status: 'active' }),
          organizationApi.getBranches({ status: 'active' }),
          organizationApi.getDesignations({ status: 'active' }),
        ]);
        setDepartments(depts || []);
        setBranches(brs || []);
        setDesignations(desigs || []);
      } catch (err) {
        console.error('Failed to load filter lookups:', err);
      }
    }
    loadLookups();
  }, []);

  // Fetch employees
  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const result = await employeesApi.findAll({
        search: searchTerm,
        departmentId: selectedDept || undefined,
        branchId: selectedBranch || undefined,
        status: selectedStatus || undefined,
        workMode: selectedWorkMode || undefined,
        page: currentPage,
        limit: 10,
      });

      setEmployees(result.items || []);
      if (result.meta) {
        setMeta({
          page: result.meta.page || 1,
          limit: result.meta.limit || 10,
          total: result.meta.total || 0,
          totalPages: result.meta.totalPages || 1,
        });
      }
    } catch (err) {
      console.error('Failed to fetch employees:', err);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, selectedDept, selectedBranch, selectedStatus, selectedWorkMode, currentPage]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // Export handler
  const handleExport = async (format: 'csv' | 'xlsx') => {
    try {
      await employeesApi.export(format, {
        search: searchTerm,
        departmentId: selectedDept,
        branchId: selectedBranch,
        status: selectedStatus,
        workMode: selectedWorkMode,
      });
    } catch (err: any) {
      alert(err.message || 'Export failed');
    }
  };

  // Import preview handler
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFile(file);
    setImportError(null);
    setImporting(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const preview = await employeesApi.previewImport(formData);
      setImportPreview(preview);
    } catch (err: any) {
      setImportError(err.message || 'Failed to parse file');
      setImportPreview(null);
    } finally {
      setImporting(false);
    }
  };

  // Commit import handler
  const handleConfirmImport = async () => {
    if (!importPreview?.validatedRows || importPreview.validatedRows.length === 0) return;

    setImporting(true);
    setImportError(null);
    try {
      await employeesApi.confirmImport(importPreview.validatedRows);
      setIsImportModalOpen(false);
      setImportFile(null);
      setImportPreview(null);
      await fetchEmployees();
    } catch (err: any) {
      setImportError(err.message || 'Import failed to commit');
    } finally {
      setImporting(false);
    }
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
      case 'EXITED':
        return <Badge variant="danger">{status}</Badge>;
      default:
        return <Badge variant="default">{status}</Badge>;
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Page Title & Action Bar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-stone-900">Employee Directory</h1>
            <p className="text-xs md:text-sm text-stone-500 mt-1">
              Search, filter, view profiles, and manage employee records.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {hasPermission('EMPLOYEE_EXPORT') && (
              <div className="relative group">
                <Button
                  variant="outline"
                  className="border-stone-200 text-stone-700 hover:bg-stone-50"
                  onClick={() => handleExport('csv')}
                >
                  <Download className="h-4 w-4 mr-2 text-stone-500" />
                  Export CSV
                </Button>
              </div>
            )}

            {hasPermission('EMPLOYEE_IMPORT') && (
              <Button
                variant="outline"
                className="border-stone-200 text-stone-700 hover:bg-stone-50"
                onClick={() => {
                  setImportFile(null);
                  setImportPreview(null);
                  setImportError(null);
                  setIsImportModalOpen(true);
                }}
              >
                <Upload className="h-4 w-4 mr-2 text-stone-500" />
                Bulk Import
              </Button>
            )}

            {hasPermission('EMPLOYEE_CREATE') && (
              <Button
                className="bg-amber-800 hover:bg-amber-900 text-white"
                onClick={() => router.push('/employees/new')}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Add Employee
              </Button>
            )}
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="bg-white p-4 rounded-xl border border-stone-200/80 shadow-xs space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            <div className="md:col-span-2">
              <Search
                placeholder="Search name, code, email, or phone..."
                value={searchTerm}
                onChange={(val) => {
                  setSearchTerm(val);
                  setCurrentPage(1);
                }}
              />
            </div>

            <div>
              <select
                value={selectedDept}
                onChange={(e) => {
                  setSelectedDept(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700 bg-white"
              >
                <option value="">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <select
                value={selectedBranch}
                onChange={(e) => {
                  setSelectedBranch(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700 bg-white"
              >
                <option value="">All Branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <select
                value={selectedStatus}
                onChange={(e) => {
                  setSelectedStatus(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full text-xs px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700 bg-white"
              >
                <option value="">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="PROBATION">Probation</option>
                <option value="ON_NOTICE">On Notice</option>
                <option value="RESIGNED">Resigned</option>
                <option value="TERMINATED">Terminated</option>
                <option value="EXITED">Exited</option>
              </select>
            </div>
          </div>
        </div>

        {/* Directory Table */}
        <DataTable
          data={employees}
          onRowClick={(item) => router.push(`/employees/${item.id}`)}
          columns={[
            {
              key: 'employee',
              header: 'Employee',
              render: (item: any) => (
                <div className="flex items-center gap-3">
                  <Avatar name={item.displayName} size="sm" />
                  <div>
                    <div className="font-semibold text-stone-900 hover:text-amber-800 transition-colors">
                      {item.displayName}
                    </div>
                    <div className="text-xs text-stone-500 font-mono">{item.employeeCode}</div>
                  </div>
                </div>
              ),
            },
            {
              key: 'role',
              header: 'Department & Role',
              render: (item: any) => (
                <div>
                  <div className="text-stone-900 font-medium">
                    {item.departmentName || 'General'}
                  </div>
                  <div className="text-xs text-stone-500">
                    {item.designationTitle || 'Staff Member'}
                  </div>
                </div>
              ),
            },
            {
              key: 'manager',
              header: 'Reporting Manager',
              render: (item: any) => (
                <span className="text-xs text-stone-700">
                  {item.managerName || (
                    <span className="text-stone-400 italic">Direct to Executive</span>
                  )}
                </span>
              ),
            },
            {
              key: 'branch',
              header: 'Branch & Mode',
              render: (item: any) => (
                <div>
                  <div className="text-xs font-medium text-stone-900">
                    {item.branchName || 'HQ'}
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[10px] py-0 px-1 mt-0.5 border-stone-300 text-stone-600"
                  >
                    {item.workMode || 'OFFICE'}
                  </Badge>
                </div>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (item: any) => getStatusBadge(item.status),
            },
            {
              key: 'contact',
              header: 'Contact',
              render: (item: any) => (
                <div className="text-xs text-stone-600 space-y-0.5">
                  {item.workEmail && (
                    <div className="flex items-center gap-1.5 truncate max-w-[160px]">
                      <Mail className="h-3 w-3 text-stone-400" />
                      <span className="truncate">{item.workEmail}</span>
                    </div>
                  )}
                  {item.phone && (
                    <div className="flex items-center gap-1.5 text-stone-500">
                      <Phone className="h-3 w-3 text-stone-400" />
                      <span>{item.phone}</span>
                    </div>
                  )}
                </div>
              ),
            },
          ]}
        />

        {/* Pagination */}
        <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-2 text-xs text-stone-500">
          <div>
            Showing {employees.length} of {meta.total} employee records
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1 || loading}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="font-semibold text-stone-800">
              Page {meta.page} of {meta.totalPages || 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= meta.totalPages || loading}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>

        {/* Bulk Import Modal */}
        <Dialog
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          title="Bulk Employee Import"
          description="Upload CSV or Excel spreadsheet with employee master records"
        >
          <div className="space-y-4 pt-2">
            {importError && (
              <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-md flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>{importError}</div>
              </div>
            )}

            {/* Dropzone */}
            <div className="border-2 border-dashed border-stone-300 hover:border-amber-700 rounded-xl p-6 text-center transition-colors bg-stone-50/50">
              <FileSpreadsheet className="h-8 w-8 mx-auto text-amber-800 mb-2" />
              <div className="text-xs font-semibold text-stone-900 mb-1">
                Choose CSV or Excel (.xlsx) file
              </div>
              <p className="text-[11px] text-stone-500 mb-3">
                Include columns: employeeCode, firstName, lastName, workEmail, departmentCode,
                designationCode, branchCode
              </p>
              <input
                type="file"
                accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                onChange={handleFileSelect}
                className="text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-amber-800 file:text-white hover:file:bg-amber-900 cursor-pointer"
              />
            </div>

            {/* Validation Preview Summary */}
            {importPreview && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2 bg-stone-100 rounded-lg">
                    <div className="text-stone-500">Total Rows</div>
                    <div className="font-bold text-stone-900 text-sm">
                      {importPreview.totalRows}
                    </div>
                  </div>
                  <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-200">
                    <div className="text-emerald-700">Valid Rows</div>
                    <div className="font-bold text-emerald-800 text-sm">
                      {importPreview.validRowsCount}
                    </div>
                  </div>
                  <div className="p-2 bg-rose-50 rounded-lg border border-rose-200">
                    <div className="text-rose-700">Error Rows</div>
                    <div className="font-bold text-rose-800 text-sm">
                      {importPreview.errorRowsCount}
                    </div>
                  </div>
                </div>

                {/* Row-Level Errors list */}
                {importPreview.errors && importPreview.errors.length > 0 && (
                  <div className="max-h-36 overflow-y-auto border border-rose-200 rounded-lg p-2.5 bg-rose-50/50 space-y-1.5 text-xs">
                    <div className="font-semibold text-rose-900 text-[11px] uppercase tracking-wider mb-1">
                      Validation Issues Detected:
                    </div>
                    {importPreview.errors.map((err: any, idx: number) => (
                      <div key={idx} className="flex items-start gap-1.5 text-rose-800 text-[11px]">
                        <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-600 mt-0.5" />
                        <span>
                          <strong>Row {err.row}:</strong> {err.message} (field: {err.field})
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-200">
              <Button variant="ghost" onClick={() => setIsImportModalOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={
                  importing ||
                  !importPreview ||
                  importPreview.validRowsCount === 0 ||
                  importPreview.errorRowsCount > 0
                }
                className="bg-amber-800 hover:bg-amber-900 text-white"
                onClick={handleConfirmImport}
              >
                {importing
                  ? 'Importing...'
                  : `Import ${importPreview?.validRowsCount || 0} Records`}
              </Button>
            </div>
          </div>
        </Dialog>
      </div>
    </AppShell>
  );
}
