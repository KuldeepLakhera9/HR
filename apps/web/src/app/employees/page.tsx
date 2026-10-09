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
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Building2,
  Briefcase,
  MapPin,
  UserCheck,
  RotateCcw,
  FileSpreadsheet,
  AlertTriangle,
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

  // Filter dropdown lookups
  const [departments, setDepartments] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [designations, setDesignations] = useState<any[]>([]);
  const [managers, setManagers] = useState<any[]>([]);

  // Search, Filters & Sorting state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedDesig, setSelectedDesig] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedManager, setSelectedManager] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedEmpType, setSelectedEmpType] = useState('');
  const [selectedWorkMode, setSelectedWorkMode] = useState('');

  // Sorting
  const [sortBy, setSortBy] = useState<string>('displayName');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Import Modal state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // Count active filters
  const activeFilterCount = [
    selectedDept,
    selectedDesig,
    selectedBranch,
    selectedManager,
    selectedStatus,
    selectedEmpType,
    selectedWorkMode,
  ].filter(Boolean).length;

  const resetAllFilters = () => {
    setSelectedDept('');
    setSelectedDesig('');
    setSelectedBranch('');
    setSelectedManager('');
    setSelectedStatus('');
    setSelectedEmpType('');
    setSelectedWorkMode('');
    setSearchTerm('');
    setCurrentPage(1);
  };

  // Load filter options on mount
  useEffect(() => {
    async function loadLookups() {
      try {
        const [depts, brs, desigs, emps] = await Promise.all([
          organizationApi.getDepartments({ status: 'active' }),
          organizationApi.getBranches({ status: 'active' }),
          organizationApi.getDesignations({ status: 'active' }),
          employeesApi.findAll({ limit: 100 }),
        ]);
        setDepartments(depts || []);
        setBranches(brs || []);
        setDesignations(desigs || []);
        setManagers(emps?.items || []);
      } catch (err) {
        console.error('Failed to load filter lookups:', err);
      }
    }
    loadLookups();
  }, []);

  // Fetch employees with all query parameters
  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const result = await employeesApi.findAll({
        search: searchTerm || undefined,
        departmentId: selectedDept || undefined,
        designationId: selectedDesig || undefined,
        branchId: selectedBranch || undefined,
        managerId: selectedManager || undefined,
        status: selectedStatus || undefined,
        employmentType: selectedEmpType || undefined,
        workMode: selectedWorkMode || undefined,
        sortBy,
        sortOrder,
        page: currentPage,
        limit: pageSize,
      });

      setEmployees(result.items || []);
      if (result.meta) {
        setMeta({
          page: result.meta.page || 1,
          limit: result.meta.limit || pageSize,
          total: result.meta.total || 0,
          totalPages: result.meta.totalPages || 1,
        });
      }
    } catch (err) {
      console.error('Failed to fetch employees:', err);
    } finally {
      setLoading(false);
    }
  }, [
    searchTerm,
    selectedDept,
    selectedDesig,
    selectedBranch,
    selectedManager,
    selectedStatus,
    selectedEmpType,
    selectedWorkMode,
    sortBy,
    sortOrder,
    currentPage,
    pageSize,
  ]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // Handle column header sort toggle
  const handleSortToggle = (field: string) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
    setCurrentPage(1);
  };

  // Export handler
  const handleExport = async (format: 'csv' | 'xlsx') => {
    try {
      await employeesApi.export(format, {
        search: searchTerm,
        departmentId: selectedDept,
        designationId: selectedDesig,
        branchId: selectedBranch,
        managerId: selectedManager,
        status: selectedStatus,
        employmentType: selectedEmpType,
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

  const renderSortIndicator = (field: string) => {
    if (sortBy !== field) {
      return <ArrowUpDown className="h-3 w-3 text-stone-400 opacity-60 group-hover:opacity-100" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5 text-amber-800" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-amber-800" />
    );
  };

  const startRecord = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const endRecord = Math.min(meta.page * meta.limit, meta.total);

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Page Title & Action Bar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-stone-900">Employee Directory</h1>
            <p className="text-xs md:text-sm text-stone-500 mt-1">
              Search, filter, view profiles, and manage employee records across your organization.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {hasPermission('EMPLOYEE_EXPORT') && (
              <Button
                variant="outline"
                className="border-stone-200 text-stone-700 hover:bg-stone-50"
                onClick={() => handleExport('csv')}
              >
                <Download className="h-4 w-4 mr-2 text-stone-500" />
                Export CSV
              </Button>
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

        {/* Search, Sorting, and Filter Toolbar */}
        <div className="bg-white p-4 rounded-xl border border-stone-200/80 shadow-xs space-y-3.5">
          {/* Top row: Search & Quick Sorting */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex-1 max-w-md">
              <Search
                placeholder="Search name, employee code, email, phone..."
                value={searchTerm}
                onChange={(val) => {
                  setSearchTerm(val);
                  setCurrentPage(1);
                }}
              />
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <span className="text-xs font-medium text-stone-500 whitespace-nowrap">Sort by:</span>
              <select
                value={`${sortBy}:${sortOrder}`}
                onChange={(e) => {
                  const [field, order] = e.target.value.split(':');
                  setSortBy(field);
                  setSortOrder(order as 'asc' | 'desc');
                  setCurrentPage(1);
                }}
                className="text-xs px-2.5 py-1.5 border border-stone-200 rounded-lg bg-white text-stone-700 focus:outline-none focus:ring-1 focus:ring-amber-700"
              >
                <option value="displayName:asc">Name (A-Z)</option>
                <option value="displayName:desc">Name (Z-A)</option>
                <option value="employeeCode:asc">Code (A-Z)</option>
                <option value="employeeCode:desc">Code (Z-A)</option>
                <option value="joiningDate:desc">Joining Date (Newest)</option>
                <option value="joiningDate:asc">Joining Date (Oldest)</option>
                <option value="status:asc">Status (Ascending)</option>
              </select>

              {activeFilterCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetAllFilters}
                  className="text-stone-600 border-stone-200 hover:bg-stone-50 text-xs h-8 px-2.5"
                >
                  <RotateCcw className="h-3 w-3 mr-1 text-stone-400" />
                  Clear ({activeFilterCount})
                </Button>
              )}
            </div>
          </div>

          {/* Filter Grid: 7 Required Filters */}
          <div className="pt-2 border-t border-stone-100">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-600 uppercase tracking-wider mb-2.5">
              <Filter className="h-3.5 w-3.5 text-amber-700" />
              <span>Filter Directory</span>
              {activeFilterCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 bg-amber-100 text-amber-900 rounded-full text-[10px] font-bold">
                  {activeFilterCount}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
              {/* 1. Department */}
              <div>
                <label className="block text-[11px] font-medium text-stone-500 mb-1">
                  Department
                </label>
                <select
                  value={selectedDept}
                  onChange={(e) => {
                    setSelectedDept(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full text-xs px-2.5 py-1.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700 bg-white text-stone-800"
                >
                  <option value="">All Departments</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Designation */}
              <div>
                <label className="block text-[11px] font-medium text-stone-500 mb-1">
                  Designation
                </label>
                <select
                  value={selectedDesig}
                  onChange={(e) => {
                    setSelectedDesig(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full text-xs px-2.5 py-1.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700 bg-white text-stone-800"
                >
                  <option value="">All Designations</option>
                  {designations.map((desig) => (
                    <option key={desig.id} value={desig.id}>
                      {desig.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. Branch */}
              <div>
                <label className="block text-[11px] font-medium text-stone-500 mb-1">Branch</label>
                <select
                  value={selectedBranch}
                  onChange={(e) => {
                    setSelectedBranch(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full text-xs px-2.5 py-1.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700 bg-white text-stone-800"
                >
                  <option value="">All Branches</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 4. Manager */}
              <div>
                <label className="block text-[11px] font-medium text-stone-500 mb-1">Manager</label>
                <select
                  value={selectedManager}
                  onChange={(e) => {
                    setSelectedManager(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full text-xs px-2.5 py-1.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700 bg-white text-stone-800"
                >
                  <option value="">All Managers</option>
                  {managers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName} ({m.employeeCode})
                    </option>
                  ))}
                </select>
              </div>

              {/* 5. Status */}
              <div>
                <label className="block text-[11px] font-medium text-stone-500 mb-1">Status</label>
                <select
                  value={selectedStatus}
                  onChange={(e) => {
                    setSelectedStatus(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full text-xs px-2.5 py-1.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700 bg-white text-stone-800 font-medium"
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

              {/* 6. Employment Type */}
              <div>
                <label className="block text-[11px] font-medium text-stone-500 mb-1">
                  Employment Type
                </label>
                <select
                  value={selectedEmpType}
                  onChange={(e) => {
                    setSelectedEmpType(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full text-xs px-2.5 py-1.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700 bg-white text-stone-800"
                >
                  <option value="">All Types</option>
                  <option value="FULL_TIME">Full Time</option>
                  <option value="PART_TIME">Part Time</option>
                  <option value="CONTRACT">Contract</option>
                  <option value="INTERN">Intern</option>
                  <option value="CONSULTANT">Consultant</option>
                </select>
              </div>

              {/* 7. Work Mode */}
              <div>
                <label className="block text-[11px] font-medium text-stone-500 mb-1">
                  Work Mode
                </label>
                <select
                  value={selectedWorkMode}
                  onChange={(e) => {
                    setSelectedWorkMode(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full text-xs px-2.5 py-1.5 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-700 bg-white text-stone-800"
                >
                  <option value="">All Modes</option>
                  <option value="OFFICE">Onsite / Office</option>
                  <option value="HYBRID">Hybrid</option>
                  <option value="REMOTE">Remote</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Directory Table */}
        <DataTable
          data={employees}
          isLoading={loading}
          emptyMessage="No employees found matching current search and filter criteria."
          onRowClick={(item) => router.push(`/employees/${item.id}`)}
          columns={[
            {
              key: 'avatar_name',
              header: (
                <button
                  type="button"
                  onClick={() => handleSortToggle('displayName')}
                  className="group flex items-center gap-1.5 hover:text-stone-900 transition-colors cursor-pointer text-left font-semibold text-xs text-stone-600 uppercase tracking-wider"
                >
                  <span>Name</span>
                  {renderSortIndicator('displayName')}
                </button>
              ),
              render: (item: any) => (
                <div className="flex items-center gap-3">
                  <Avatar name={item.displayName} src={item.profilePhoto} size="md" />
                  <div>
                    <div className="font-semibold text-stone-900 hover:text-amber-800 transition-colors">
                      {item.displayName}
                    </div>
                    {item.workEmail && (
                      <div className="text-[11px] text-stone-500 truncate max-w-[170px]">
                        {item.workEmail}
                      </div>
                    )}
                  </div>
                </div>
              ),
            },
            {
              key: 'employeeCode',
              header: (
                <button
                  type="button"
                  onClick={() => handleSortToggle('employeeCode')}
                  className="group flex items-center gap-1.5 hover:text-stone-900 transition-colors cursor-pointer text-left font-semibold text-xs text-stone-600 uppercase tracking-wider"
                >
                  <span>Employee Code</span>
                  {renderSortIndicator('employeeCode')}
                </button>
              ),
              render: (item: any) => (
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-stone-100 text-stone-700 border border-stone-200">
                  {item.employeeCode}
                </span>
              ),
            },
            {
              key: 'department',
              header: 'Department',
              render: (item: any) => (
                <div className="text-stone-800 font-medium text-xs">
                  {item.departmentName || <span className="text-stone-400 italic">—</span>}
                </div>
              ),
            },
            {
              key: 'designation',
              header: 'Designation',
              render: (item: any) => (
                <div className="text-stone-700 text-xs">
                  {item.designationTitle || <span className="text-stone-400 italic">—</span>}
                </div>
              ),
            },
            {
              key: 'manager',
              header: 'Manager',
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
              header: 'Branch',
              render: (item: any) => (
                <div className="space-y-0.5">
                  <div className="text-xs font-medium text-stone-900">
                    {item.branchName || 'HQ'}
                  </div>
                  {item.workMode && (
                    <Badge
                      variant="outline"
                      className="text-[10px] py-0 px-1 border-stone-300 text-stone-600"
                    >
                      {item.workMode}
                    </Badge>
                  )}
                </div>
              ),
            },
            {
              key: 'status',
              header: (
                <button
                  type="button"
                  onClick={() => handleSortToggle('status')}
                  className="group flex items-center gap-1.5 hover:text-stone-900 transition-colors cursor-pointer text-left font-semibold text-xs text-stone-600 uppercase tracking-wider"
                >
                  <span>Status</span>
                  {renderSortIndicator('status')}
                </button>
              ),
              render: (item: any) => getStatusBadge(item.status),
            },
          ]}
        />

        {/* Pagination & Results Summary using existing Pagination component */}
        <div className="bg-white px-4 py-3 rounded-xl border border-stone-200/80 shadow-xs flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="text-xs text-stone-500">
            Showing <span className="font-semibold text-stone-800">{startRecord}</span> to{' '}
            <span className="font-semibold text-stone-800">{endRecord}</span> of{' '}
            <span className="font-semibold text-stone-800">{meta.total}</span> employees
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-xs text-stone-500">
              <span>Per page:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="text-xs px-2 py-1 border border-stone-200 rounded-md bg-white text-stone-700 focus:outline-none focus:ring-1 focus:ring-amber-700"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>

            <Pagination
              currentPage={currentPage}
              totalPages={meta.totalPages || 1}
              onPageChange={(page) => setCurrentPage(page)}
            />
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
