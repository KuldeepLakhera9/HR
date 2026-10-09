'use client';

import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  Download,
  RefreshCw,
  X,
  FileText,
  Building2,
  Briefcase,
  MapPin,
  ShieldCheck,
  Check,
  ArrowLeft,
  Info,
} from 'lucide-react';
import { Dialog, Button, Badge } from '@hrms/ui';
import { employeesApi } from '../../lib/api-client';

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess?: () => void;
}

type ImportStep = 'upload' | 'preview' | 'confirm' | 'summary';

interface RowError {
  row: number;
  field: string;
  value: unknown;
  message: string;
}

interface ValidatedRow {
  rowNumber: number;
  employeeCode: string;
  firstName: string;
  lastName: string;
  displayName: string;
  workEmail: string;
  phone?: string | null;
  departmentId: string;
  departmentName?: string;
  designationId: string;
  designationTitle?: string;
  branchId: string;
  branchName?: string;
  managerEmployeeCode?: string | null;
  employmentType: string;
  employmentStatus: string;
  workMode: string;
  joiningDate?: string;
}

interface ImportPreviewData {
  totalRows: number;
  validRowsCount: number;
  errorRowsCount: number;
  errors: RowError[];
  previewData: ValidatedRow[];
  validatedRows: ValidatedRow[];
}

interface ImportSummaryResult {
  totalRows: number;
  validRowsCount: number;
  importedCount: number;
  skippedCount: number;
}

export function BulkImportModal({ isOpen, onClose, onImportSuccess }: BulkImportModalProps) {
  const [step, setStep] = useState<ImportStep>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<ImportPreviewData | null>(null);
  const [summaryResult, setSummaryResult] = useState<ImportSummaryResult | null>(null);

  // Preview filtering state: 'all' | 'valid' | 'errors'
  const [previewFilter, setPreviewFilter] = useState<'all' | 'valid' | 'errors'>('all');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setStep('upload');
    setSelectedFile(null);
    setIsProcessing(false);
    setUploadError(null);
    setPreviewData(null);
    setSummaryResult(null);
    setPreviewFilter('all');
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  // Download Sample Template CSV
  const handleDownloadTemplate = () => {
    const csvContent =
      'employeeCode,firstName,lastName,workEmail,departmentCode,designationCode,branchCode,managerEmployeeCode,employmentType,status,workMode,phone\n' +
      'EMP101,Rohan,Sharma,rohan.sharma@example.com,ENG,SWE,BLR-HQ,,FULL_TIME,PROBATION,OFFICE,+91-9876543210\n' +
      'EMP102,Priya,Nair,priya.nair@example.com,HR,HRM,BLR-HQ,EMP101,FULL_TIME,ACTIVE,HYBRID,+91-9876543211\n' +
      'EMP103,Amit,Patel,amit.patel@example.com,SALES,SRE,MUM-BR,EMP101,FULL_TIME,ACTIVE,OFFICE,+91-9876543212\n';

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'employee_bulk_import_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Step 1 -> Step 2: Handle File Upload & Server Validation
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setUploadError(null);
    setIsProcessing(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await employeesApi.previewImport(formData);

      setPreviewData(res);
      setStep('preview');
    } catch (err: any) {
      setUploadError(err.message || 'Failed to parse and validate file');
    } finally {
      setIsProcessing(false);
    }
  };

  // Drag & drop handlers
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setUploadError(null);
    setIsProcessing(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await employeesApi.previewImport(formData);

      setPreviewData(res);
      setStep('preview');
    } catch (err: any) {
      setUploadError(err.message || 'Failed to parse and validate file');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // Step 3 -> Step 4: Proceed to Confirmation
  const handleProceedToConfirm = () => {
    if (!previewData || previewData.validRowsCount === 0) return;
    setStep('confirm');
  };

  // Step 4 -> Step 5: Execute Import Transaction
  const handleExecuteImport = async () => {
    if (!previewData?.validatedRows || previewData.validatedRows.length === 0) return;

    setIsProcessing(true);
    setUploadError(null);

    try {
      const res = await employeesApi.confirmImport(previewData.validatedRows);

      const imported = res?.importedCount ?? res?.count ?? previewData.validRowsCount;
      const skipped = (previewData.totalRows || 0) - imported;

      setSummaryResult({
        totalRows: previewData.totalRows,
        validRowsCount: previewData.validRowsCount,
        importedCount: imported,
        skippedCount: Math.max(0, skipped),
      });

      setStep('summary');
      if (onImportSuccess) {
        onImportSuccess();
      }
    } catch (err: any) {
      setUploadError(err.message || 'Import transaction failed to commit');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title="Bulk Employee Master Import"
      description="Professional multi-step CSV & Excel bulk onboarding workflow with row-level validation and transaction safety."
      maxWidth="xl"
    >
      <div className="space-y-6 pt-2">
        {/* Step Indicator */}
        <div className="flex items-center justify-between border-b border-stone-200 pb-4 text-xs font-semibold">
          {[
            { id: 'upload', label: '1. Upload' },
            { id: 'preview', label: '2. Validate & Preview' },
            { id: 'confirm', label: '3. Confirm' },
            { id: 'summary', label: '4. Summary' },
          ].map((s, idx) => {
            const isCurrent = step === s.id;
            const isCompleted =
              (step === 'preview' && idx === 0) ||
              (step === 'confirm' && idx <= 1) ||
              (step === 'summary' && idx <= 2);

            return (
              <div
                key={s.id}
                className={`flex items-center gap-1.5 ${
                  isCurrent
                    ? 'text-amber-900 font-bold'
                    : isCompleted
                      ? 'text-emerald-700'
                      : 'text-stone-400'
                }`}
              >
                <div
                  className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-mono ${
                    isCurrent
                      ? 'bg-amber-900 text-white'
                      : isCompleted
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-stone-100 text-stone-500'
                  }`}
                >
                  {isCompleted ? <Check className="h-3 w-3" /> : idx + 1}
                </div>
                <span>{s.label}</span>
              </div>
            );
          })}
        </div>

        {uploadError && (
          <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
            <div>
              <p className="font-semibold">Validation Issue</p>
              <p className="mt-0.5">{uploadError}</p>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* STEP 1: UPLOAD */}
        {/* ------------------------------------------------------------------ */}
        {step === 'upload' && (
          <div className="space-y-5">
            {/* Drag & Drop Zone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-stone-300 hover:border-amber-800 rounded-2xl p-8 text-center transition-all bg-stone-50/60 hover:bg-amber-50/30 cursor-pointer group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                onChange={handleFileChange}
                className="hidden"
              />

              <div className="h-14 w-14 rounded-2xl bg-amber-100/70 text-amber-800 flex items-center justify-center mx-auto mb-3 group-hover:scale-105 transition-transform">
                <UploadCloud className="h-7 w-7" />
              </div>

              <h4 className="text-sm font-bold text-stone-900">
                Choose CSV or Excel Spreadsheet (.xlsx, .xls)
              </h4>
              <p className="text-xs text-stone-500 mt-1 max-w-md mx-auto">
                Drag and drop your spreadsheet file here or click to browse files on your computer.
              </p>

              <div className="mt-4 flex items-center justify-center gap-2 text-[11px] font-mono text-stone-400">
                <span>Maximum file size: 10MB</span>
                <span>•</span>
                <span>Supported: CSV, XLSX, XLS</span>
              </div>
            </div>

            {/* Template Download & Column Specifications */}
            <div className="bg-stone-50 rounded-2xl p-4 border border-stone-200/80 space-y-3 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-stone-200/80 pb-3">
                <div className="flex items-center gap-2 text-stone-700">
                  <FileSpreadsheet className="h-4 w-4 text-amber-800 shrink-0" />
                  <span className="font-bold text-stone-900">Need the standardized template?</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadTemplate}
                  className="text-xs h-7 gap-1.5 text-stone-700 border-stone-300 bg-white hover:bg-stone-50 shrink-0"
                >
                  <Download className="h-3.5 w-3.5 text-amber-800" />
                  <span>Download Sample CSV</span>
                </Button>
              </div>

              <div className="space-y-1.5 text-[11px] text-stone-600">
                <p className="font-semibold text-stone-800">Required Column Headers:</p>
                <div className="flex flex-wrap gap-1.5 font-mono">
                  {[
                    'employeeCode',
                    'firstName',
                    'lastName',
                    'workEmail',
                    'departmentCode',
                    'designationCode',
                    'branchCode',
                  ].map((col) => (
                    <span
                      key={col}
                      className="bg-white border border-stone-200 px-1.5 py-0.5 rounded text-stone-800 font-medium"
                    >
                      {col}
                    </span>
                  ))}
                </div>
                <p className="font-semibold text-stone-800 pt-1.5">Optional Column Headers:</p>
                <div className="flex flex-wrap gap-1.5 font-mono">
                  {['managerEmployeeCode', 'employmentType', 'status', 'workMode', 'phone'].map(
                    (col) => (
                      <span
                        key={col}
                        className="bg-white border border-stone-200 px-1.5 py-0.5 rounded text-stone-600"
                      >
                        {col}
                      </span>
                    ),
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
              <Button variant="ghost" onClick={handleClose} className="text-xs">
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* STEP 2: VALIDATE & PREVIEW */}
        {/* ------------------------------------------------------------------ */}
        {step === 'preview' && previewData && (
          <div className="space-y-5">
            {/* KPI Summary Cards */}
            <div className="grid grid-cols-3 gap-3 text-center text-xs">
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200">
                <span className="text-stone-500 font-medium">Total Rows</span>
                <p className="text-lg font-bold text-stone-900 mt-0.5">{previewData.totalRows}</p>
              </div>

              <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-200">
                <span className="text-emerald-700 font-medium">Valid Records</span>
                <p className="text-lg font-bold text-emerald-800 mt-0.5">
                  {previewData.validRowsCount}
                </p>
              </div>

              <div
                className={`p-3 rounded-xl border ${
                  previewData.errorRowsCount > 0
                    ? 'bg-rose-50/70 border-rose-200'
                    : 'bg-stone-50 border-stone-200 text-stone-400'
                }`}
              >
                <span
                  className={
                    previewData.errorRowsCount > 0 ? 'text-rose-700 font-medium' : 'text-stone-500'
                  }
                >
                  Validation Errors
                </span>
                <p
                  className={`text-lg font-bold mt-0.5 ${
                    previewData.errorRowsCount > 0 ? 'text-rose-800' : 'text-stone-600'
                  }`}
                >
                  {previewData.errorRowsCount}
                </p>
              </div>
            </div>

            {/* Row-Level Errors Panel (If any exist) */}
            {previewData.errors && previewData.errors.length > 0 && (
              <div className="border border-rose-200 rounded-2xl p-4 bg-rose-50/40 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-rose-900">
                  <span className="flex items-center gap-1.5">
                    <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
                    Row-Level Validation Errors Detected ({previewData.errors.length})
                  </span>
                  <span className="text-[11px] font-normal text-rose-700">
                    Fix and re-upload, or proceed to import valid rows only.
                  </span>
                </div>

                <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                  {previewData.errors.map((err, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded-xl bg-white border border-rose-200 text-xs text-rose-800 flex items-start justify-between gap-2 shadow-2xs"
                    >
                      <div className="flex items-start gap-2">
                        <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-mono font-bold text-[10px] shrink-0">
                          Row {err.row}
                        </span>
                        <div>
                          <p className="font-semibold">{err.message}</p>
                          <p className="text-[10px] text-stone-500 font-mono mt-0.5">
                            Field: <strong className="text-stone-700">{err.field}</strong> | Value:{' '}
                            <strong className="text-stone-700">
                              {err.value ? String(err.value) : '<empty>'}
                            </strong>
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Preview Records Table */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-stone-900">
                  Sample Preview Data ({previewData.previewData.length} of{' '}
                  {previewData.validRowsCount} valid rows)
                </span>
                <span className="text-stone-500 text-[11px]">
                  Production records will only be created on final confirmation.
                </span>
              </div>

              <div className="border border-stone-200 rounded-2xl overflow-x-auto max-h-56">
                <table className="w-full text-left text-xs divide-y divide-stone-200">
                  <thead className="bg-stone-50 text-[11px] font-semibold text-stone-500 uppercase tracking-wider sticky top-0">
                    <tr>
                      <th className="py-2.5 px-3">Row</th>
                      <th className="py-2.5 px-3">Code</th>
                      <th className="py-2.5 px-3">Name</th>
                      <th className="py-2.5 px-3">Work Email</th>
                      <th className="py-2.5 px-3">Department</th>
                      <th className="py-2.5 px-3">Designation</th>
                      <th className="py-2.5 px-3">Branch</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 bg-white text-stone-700">
                    {previewData.previewData.map((row) => (
                      <tr key={row.rowNumber} className="hover:bg-stone-50/50">
                        <td className="py-2 px-3 font-mono text-stone-400 text-[11px]">
                          #{row.rowNumber}
                        </td>
                        <td className="py-2 px-3 font-mono font-semibold text-stone-900">
                          {row.employeeCode}
                        </td>
                        <td className="py-2 px-3 font-medium text-stone-900">{row.displayName}</td>
                        <td className="py-2 px-3 text-stone-600 truncate max-w-[160px]">
                          {row.workEmail}
                        </td>
                        <td className="py-2 px-3 text-stone-600">{row.departmentName}</td>
                        <td className="py-2 px-3 text-stone-600">{row.designationTitle}</td>
                        <td className="py-2 px-3 text-stone-600">{row.branchName}</td>
                        <td className="py-2 px-3 font-mono text-[10px]">{row.employmentType}</td>
                        <td className="py-2 px-3">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            {row.employmentStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-stone-200">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep('upload')}
                className="text-xs text-stone-600 gap-1"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Upload Different File</span>
              </Button>

              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={handleClose} className="text-xs">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={previewData.validRowsCount === 0}
                  className="bg-amber-900 hover:bg-amber-800 text-white text-xs gap-1.5 shadow-xs"
                  onClick={handleProceedToConfirm}
                >
                  <span>
                    Proceed with {previewData.validRowsCount}{' '}
                    {previewData.validRowsCount === 1 ? 'Record' : 'Records'}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* STEP 3: CONFIRM */}
        {/* ------------------------------------------------------------------ */}
        {step === 'confirm' && previewData && (
          <div className="space-y-6">
            <div className="p-5 rounded-2xl bg-amber-50/70 border border-amber-200/90 text-xs space-y-3">
              <div className="flex items-center gap-2 text-amber-950 font-bold text-sm">
                <ShieldCheck className="h-5 w-5 text-amber-800 shrink-0" />
                <span>Transactional Safety & Rollback Guarantee</span>
              </div>
              <p className="text-amber-900 leading-relaxed">
                You are about to import{' '}
                <strong className="font-bold text-amber-950">
                  {previewData.validRowsCount} employee records
                </strong>{' '}
                into the database. This operation will provision employee profiles, user login
                accounts, and employment history logs in an atomic transaction.
              </p>
              <div className="pt-2 border-t border-amber-200/60 text-amber-800 text-[11px] flex items-center gap-2">
                <Info className="h-4 w-4 shrink-0" />
                <span>
                  If any unexpected database error occurs during insertion, the entire batch will
                  roll back automatically.
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200">
                <span className="text-stone-500 font-medium">Target Organization</span>
                <p className="font-bold text-stone-900 mt-1">Current Active Workspace</p>
              </div>
              <div className="p-3.5 bg-stone-50 rounded-xl border border-stone-200">
                <span className="text-stone-500 font-medium">Valid Records to Create</span>
                <p className="font-bold text-stone-900 mt-1">
                  {previewData.validRowsCount} Records
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-stone-200">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep('preview')}
                disabled={isProcessing}
                className="text-xs text-stone-600 gap-1"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back to Preview</span>
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClose}
                  disabled={isProcessing}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={isProcessing}
                  className="bg-amber-900 hover:bg-amber-800 text-white text-xs gap-1.5 shadow-xs"
                  onClick={handleExecuteImport}
                >
                  {isProcessing && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  <span>
                    {isProcessing
                      ? 'Executing Transaction...'
                      : `Confirm & Import ${previewData.validRowsCount} Employees`}
                  </span>
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* STEP 4: SUMMARY */}
        {/* ------------------------------------------------------------------ */}
        {step === 'summary' && summaryResult && (
          <div className="space-y-6 text-center py-4">
            <div className="h-16 w-16 rounded-3xl bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto mb-2 shadow-xs">
              <CheckCircle2 className="h-8 w-8" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-stone-900 tracking-tight">
                Bulk Import Completed Successfully
              </h3>
              <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto">
                All valid employee records have been committed to the organization directory and
                user accounts provisioned.
              </p>
            </div>

            {/* Official Import Summary KPI Box */}
            <div className="bg-stone-50 rounded-2xl border border-stone-200/90 p-5 max-w-lg mx-auto">
              <div className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-3 text-left">
                Official Import Execution Summary
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-2.5 rounded-xl bg-white border border-stone-200">
                  <span className="text-[11px] text-stone-500 block">Total Rows</span>
                  <span className="text-base font-bold text-stone-900">
                    {summaryResult.totalRows}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
                  <span className="text-[11px] text-emerald-700 block">Valid Rows</span>
                  <span className="text-base font-bold text-emerald-800">
                    {summaryResult.validRowsCount}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-emerald-100 border border-emerald-300">
                  <span className="text-[11px] text-emerald-800 block">Imported</span>
                  <span className="text-base font-bold text-emerald-900">
                    {summaryResult.importedCount}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-stone-100 border border-stone-200">
                  <span className="text-[11px] text-stone-500 block">Skipped</span>
                  <span className="text-base font-bold text-stone-700">
                    {summaryResult.skippedCount}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <Button
                className="bg-amber-900 hover:bg-amber-800 text-white text-xs px-6 py-2.5 shadow-xs"
                onClick={handleClose}
              >
                <span>Done & Refresh Employee Directory</span>
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

export default BulkImportModal;
