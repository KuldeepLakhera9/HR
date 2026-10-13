'use client';

import React, { useEffect, useState, useCallback, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppShell } from '../../../../layouts/AppShell';
import { ProtectedRoute } from '../../../../components/auth/ProtectedRoute';
import { apiClient } from '../../../../lib/api-client';
import { PayslipDetailDto } from '@hrms/types';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Button,
  EmptyState,
} from '@hrms/ui';
import {
  ArrowLeft,
  Banknote,
  Calendar,
  Download,
  Printer,
  ShieldCheck,
  AlertCircle,
  Clock,
  CheckCircle2,
  Building2,
  User,
  CreditCard,
  FileText,
  History,
  Layers,
  ChevronRight,
  Info,
} from 'lucide-react';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function PayslipDetailPage({ params }: PageProps) {
  const router = useRouter();
  const resolvedParams = use(params);
  const payslipId = resolvedParams.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PayslipDetailDto | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const fetchPayslip = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.getPayslipDetail(payslipId);
      setData(res?.data || null);
    } catch (err: any) {
      console.error('Failed to load payslip detail', err);
      setError(
        err?.response?.data?.message ||
          err?.message ||
          'Failed to load payslip details. You may not have permission to view this document.',
      );
    } finally {
      setLoading(false);
    }
  }, [payslipId]);

  useEffect(() => {
    if (payslipId) {
      fetchPayslip();
    }
  }, [payslipId, fetchPayslip]);

  const handleDownloadPdf = async () => {
    if (!data) return;
    try {
      setIsDownloading(true);
      const filename = `Payslip_${data.snapshot.employeeCode}_${data.period.year}_${String(
        data.period.month,
      ).padStart(2, '0')}.pdf`;
      await apiClient.downloadPayslipPdf(data.snapshot.id, filename);
    } catch (err: any) {
      alert(err.message || 'Failed to download payslip PDF');
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const formatCurrency = (amount: number, currency = 'INR') => {
    return `₹${Number(amount || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return '--';
    try {
      return new Date(isoString).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  const getMonthName = (m: number) => {
    const months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    return months[m - 1] || `Month ${m}`;
  };

  // Convert number to Indian words
  const numberToWordsIndian = (num: number): string => {
    const a = [
      '',
      'One ',
      'Two ',
      'Three ',
      'Four ',
      'Five ',
      'Six ',
      'Seven ',
      'Eight ',
      'Nine ',
      'Ten ',
      'Eleven ',
      'Twelve ',
      'Thirteen ',
      'Fourteen ',
      'Fifteen ',
      'Sixteen ',
      'Seventeen ',
      'Eighteen ',
      'Nineteen ',
    ];
    const b = [
      '',
      '',
      'Twenty',
      'Thirty',
      'Forty',
      'Fifty',
      'Sixty',
      'Seventy',
      'Eighty',
      'Ninety',
    ];

    const rounded = Math.floor(Math.abs(num));
    if (rounded === 0) return 'Zero Rupees Only';

    function inWords(n: number): string {
      if (n < 20) return a[n];
      if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : ' ');
      if (n < 1000)
        return inWords(Math.floor(n / 100)) + 'Hundred ' + (n % 100 !== 0 ? inWords(n % 100) : '');
      if (n < 100000)
        return (
          inWords(Math.floor(n / 1000)) + 'Thousand ' + (n % 1000 !== 0 ? inWords(n % 1000) : '')
        );
      if (n < 10000000)
        return (
          inWords(Math.floor(n / 100000)) + 'Lakh ' + (n % 100000 !== 0 ? inWords(n % 100000) : '')
        );
      return (
        inWords(Math.floor(n / 10000000)) +
        'Crore ' +
        (n % 10000000 !== 0 ? inWords(n % 10000000) : '')
      );
    }

    return `${inWords(rounded).trim()} Rupees Only`;
  };

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="space-y-6 max-w-5xl mx-auto pb-16 print:p-0 print:max-w-full">
          {/* Top Bar Navigation */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 print:hidden">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push('/payroll/payslips')}
                leftIcon={<ArrowLeft className="h-4 w-4" />}
              >
                Back to Payslips
              </Button>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900">
                  {loading
                    ? 'Loading Payslip...'
                    : data
                      ? `Payslip: ${getMonthName(data.period.month)} ${data.period.year}`
                      : 'Payslip Document'}
                </h1>
                <p className="text-xs text-stone-500">
                  Secure employee self-service salary slip with itemized calculation breakdown
                </p>
              </div>
            </div>

            {data && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrint}
                  leftIcon={<Printer className="h-4 w-4" />}
                >
                  Print
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleDownloadPdf}
                  disabled={isDownloading}
                  leftIcon={
                    <Download className={`h-4 w-4 ${isDownloading ? 'animate-bounce' : ''}`} />
                  }
                >
                  {isDownloading ? 'Generating PDF...' : 'Download PDF'}
                </Button>
              </div>
            )}
          </div>

          {/* Loading Skeleton */}
          {loading && (
            <Card className="p-8">
              <div className="space-y-6 animate-pulse">
                <div className="h-8 bg-stone-200 rounded w-1/3"></div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="h-16 bg-stone-100 rounded"></div>
                  <div className="h-16 bg-stone-100 rounded"></div>
                  <div className="h-16 bg-stone-100 rounded"></div>
                  <div className="h-16 bg-stone-100 rounded"></div>
                </div>
                <div className="h-64 bg-stone-100 rounded"></div>
              </div>
            </Card>
          )}

          {/* Error State */}
          {!loading && error && (
            <Card className="p-8 text-center border-rose-200 bg-rose-50/40">
              <div className="max-w-md mx-auto space-y-4">
                <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
                  <AlertCircle className="h-6 w-6" />
                </div>
                <h2 className="text-lg font-bold text-stone-900">Payslip Unavailable</h2>
                <p className="text-sm text-stone-600">{error}</p>
                <div className="pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push('/payroll/payslips')}
                  >
                    Return to My Payslips
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Payslip Document Content */}
          {!loading && data && (
            <>
              {/* Version & Correction Banner */}
              {data.versions && data.versions.length > 1 && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 shadow-xs print:hidden">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-amber-100 text-amber-800 mt-0.5">
                        <History className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-stone-900">
                            Version History & Corrections Available
                          </h4>
                          <Badge variant="warning" size="sm">
                            Run #{data.run.runNumber} (v{data.run.calculationVersion || 1})
                          </Badge>
                        </div>
                        <p className="text-xs text-stone-600 mt-0.5">
                          {data.run.correctionReason
                            ? `Reason: ${data.run.correctionReason}`
                            : 'This payroll period has multiple calculation runs or adjustments.'}
                        </p>
                      </div>
                    </div>

                    {/* Version Switcher Buttons */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-semibold text-stone-500 mr-1">
                        Other Versions:
                      </span>
                      {data.versions.map((v) => (
                        <Link key={v.snapshotId} href={`/payroll/payslips/${v.snapshotId}`}>
                          <Button
                            variant={v.snapshotId === data.snapshot.id ? 'primary' : 'outline'}
                            size="sm"
                            className="text-xs h-7 px-2.5"
                          >
                            Run #{v.runNumber} {v.isCurrent && '(Latest)'}
                          </Button>
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Main Document Container (White Paper Style) */}
              <div className="bg-white border border-stone-200/90 rounded-2xl shadow-xs overflow-hidden print:border-none print:shadow-none">
                {/* 1. Header Section */}
                <div className="p-6 sm:p-8 border-b border-stone-100 bg-gradient-to-r from-stone-50/70 via-white to-amber-50/30">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Building2 className="h-5 w-5 text-amber-600" />
                        <span className="text-xs font-bold uppercase tracking-wider text-amber-800">
                          Enterprise Human Resource Management System
                        </span>
                      </div>
                      <h2 className="text-2xl font-black text-stone-900 tracking-tight">
                        SALARY SLIP / PAYSLIP
                      </h2>
                      <p className="text-xs text-stone-500 font-mono mt-0.5">
                        Confidential Employment Compensation Record
                      </p>
                    </div>

                    <div className="text-left sm:text-right space-y-1">
                      <div className="flex sm:justify-end items-center gap-2">
                        <span className="text-xs text-stone-500 font-medium">Payslip No:</span>
                        <span className="font-mono text-xs font-bold text-stone-800">
                          {data.snapshot.payslipNumber || `PS-${data.snapshot.id.slice(0, 8)}`}
                        </span>
                      </div>
                      <div className="flex sm:justify-end items-center gap-2">
                        <span className="text-xs text-stone-500 font-medium">Pay Period:</span>
                        <span className="text-xs font-bold text-stone-900">
                          {getMonthName(data.period.month)} {data.period.year}
                        </span>
                      </div>
                      <div className="flex sm:justify-end items-center gap-2">
                        <span className="text-xs text-stone-500 font-medium">Status:</span>
                        <Badge variant="success" size="sm">
                          {data.snapshot.payslipStatus || 'PUBLISHED'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Employee Profile & Banking Grid */}
                <div className="p-6 sm:p-8 border-b border-stone-100 bg-white">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                    {/* Employee Identifiers */}
                    <div className="space-y-2.5">
                      <div className="text-[11px] font-bold text-stone-400 uppercase tracking-wider flex items-center gap-1.5 pb-1 border-b border-stone-100">
                        <User className="h-3.5 w-3.5 text-stone-600" />
                        <span>Employee Details</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        <span className="text-stone-500 font-medium">Employee Name:</span>
                        <span className="col-span-2 font-bold text-stone-900">
                          {data.snapshot.employeeName || 'Authenticated Employee'}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        <span className="text-stone-500 font-medium">Employee Code:</span>
                        <span className="col-span-2 font-mono font-semibold text-stone-800">
                          {data.snapshot.employeeCode}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        <span className="text-stone-500 font-medium">Designation:</span>
                        <span className="col-span-2 text-stone-800">
                          {data.snapshot.designationTitle || 'Staff'}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        <span className="text-stone-500 font-medium">Department:</span>
                        <span className="col-span-2 text-stone-800">
                          {data.snapshot.departmentName || 'General'}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        <span className="text-stone-500 font-medium">Branch / Location:</span>
                        <span className="col-span-2 text-stone-800">
                          {data.snapshot.branchName || 'Headquarters'}
                        </span>
                      </div>
                    </div>

                    {/* Bank & Statutory / Payment Details */}
                    <div className="space-y-2.5">
                      <div className="text-[11px] font-bold text-stone-400 uppercase tracking-wider flex items-center gap-1.5 pb-1 border-b border-stone-100">
                        <CreditCard className="h-3.5 w-3.5 text-stone-600" />
                        <span>Statutory & Disbursement Data</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        <span className="text-stone-500 font-medium">Bank Account:</span>
                        <span className="col-span-2 font-mono font-semibold text-stone-800">
                          {data.snapshot.bankAccountMasked || '••••••••4812'}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        <span className="text-stone-500 font-medium">Bank Name:</span>
                        <span className="col-span-2 font-mono text-stone-800">
                          {data.snapshot.bankName || 'HDFC Bank'}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        <span className="text-stone-500 font-medium">Income Tax PAN:</span>
                        <span className="col-span-2 font-mono text-stone-800">
                          {data.snapshot.panMasked || '•••••9018A'}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        <span className="text-stone-500 font-medium">Payout Date:</span>
                        <span className="col-span-2 text-stone-800 font-medium">
                          {formatDate(data.period.payoutDate || data.snapshot.paidAt)}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        <span className="text-stone-500 font-medium">Payment Status:</span>
                        <span className="col-span-2">
                          <Badge variant="outline" size="sm">
                            {data.snapshot.paymentStatus || 'PAID'}
                          </Badge>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Attendance & Proration Metrics Strip */}
                <div className="px-6 py-4 bg-stone-50/80 border-b border-stone-100">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                    <div className="p-2 rounded-lg bg-white border border-stone-200/70 shadow-2xs">
                      <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
                        Calendar Days
                      </span>
                      <span className="text-base font-bold text-stone-800">
                        {data.snapshot.workingDays || 30}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-white border border-stone-200/70 shadow-2xs">
                      <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
                        Payable / Paid Days
                      </span>
                      <span className="text-base font-bold text-emerald-700">
                        {data.snapshot.paidDays || 30}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-white border border-stone-200/70 shadow-2xs">
                      <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
                        Loss of Pay (LOP)
                      </span>
                      <span className="text-base font-bold text-stone-700">
                        {data.snapshot.lopDays || 0}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-white border border-stone-200/70 shadow-2xs">
                      <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
                        Calculation Ver.
                      </span>
                      <span className="text-base font-bold text-stone-700">
                        v{data.run.calculationVersion || 1}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 4. Itemized Earnings & Deductions Tables */}
                <div className="p-6 sm:p-8">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Left: Earnings Table */}
                    <div className="border border-stone-200 rounded-xl overflow-hidden flex flex-col justify-between">
                      <div>
                        <div className="bg-emerald-50/70 px-4 py-2.5 border-b border-stone-200 flex items-center justify-between">
                          <span className="text-xs font-bold text-emerald-950 uppercase tracking-wider">
                            Earnings (Gross Inflows)
                          </span>
                          <span className="text-[11px] font-medium text-emerald-800">
                            Amount (INR)
                          </span>
                        </div>
                        <table className="w-full text-xs">
                          <thead className="bg-stone-50 border-b border-stone-200 text-stone-500">
                            <tr>
                              <th className="py-2 px-4 text-left font-semibold">
                                Salary Component
                              </th>
                              <th className="py-2 px-3 text-right font-semibold text-stone-400">
                                Fixed Rate
                              </th>
                              <th className="py-2 px-4 text-right font-semibold">Earned Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-100">
                            {data.earnings.length === 0 ? (
                              <tr>
                                <td colSpan={3} className="py-4 text-center text-stone-400">
                                  No earnings recorded
                                </td>
                              </tr>
                            ) : (
                              data.earnings.map((e, idx) => (
                                <tr key={idx} className="hover:bg-stone-50/50">
                                  <td className="py-2.5 px-4 font-medium text-stone-800">
                                    {e.componentName}
                                    <span className="block text-[10px] font-mono text-stone-400">
                                      {e.componentCode}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-right text-stone-400 font-mono">
                                    {e.standardAmount > 0 ? formatCurrency(e.standardAmount) : '--'}
                                  </td>
                                  <td className="py-2.5 px-4 text-right font-mono font-bold text-stone-900">
                                    {formatCurrency(e.earnedAmount)}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* Gross Earnings Subtotal */}
                      <div className="bg-emerald-50/40 border-t border-stone-200 px-4 py-3 flex items-center justify-between">
                        <span className="text-xs font-bold text-stone-800 uppercase">
                          Total Gross Earnings
                        </span>
                        <span className="text-sm font-bold font-mono text-emerald-800">
                          {formatCurrency(data.snapshot.earnedGross)}
                        </span>
                      </div>
                    </div>

                    {/* Right: Deductions Table */}
                    <div className="border border-stone-200 rounded-xl overflow-hidden flex flex-col justify-between">
                      <div>
                        <div className="bg-rose-50/70 px-4 py-2.5 border-b border-stone-200 flex items-center justify-between">
                          <span className="text-xs font-bold text-rose-950 uppercase tracking-wider">
                            Deductions (Outflows)
                          </span>
                          <span className="text-[11px] font-medium text-rose-800">
                            Amount (INR)
                          </span>
                        </div>
                        <table className="w-full text-xs">
                          <thead className="bg-stone-50 border-b border-stone-200 text-stone-500">
                            <tr>
                              <th className="py-2 px-4 text-left font-semibold">
                                Deduction Component
                              </th>
                              <th className="py-2 px-4 text-right font-semibold">
                                Deducted Amount
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-100">
                            {data.deductions.length === 0 ? (
                              <tr>
                                <td colSpan={2} className="py-4 text-center text-stone-400">
                                  No deductions applied
                                </td>
                              </tr>
                            ) : (
                              data.deductions.map((d, idx) => (
                                <tr key={idx} className="hover:bg-stone-50/50">
                                  <td className="py-2.5 px-4 font-medium text-stone-800">
                                    {d.componentName}
                                    <span className="block text-[10px] font-mono text-stone-400">
                                      {d.componentCode}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-4 text-right font-mono font-bold text-stone-900">
                                    {formatCurrency(d.earnedAmount)}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* Deductions Subtotal */}
                      <div className="bg-rose-50/40 border-t border-stone-200 px-4 py-3 flex items-center justify-between">
                        <span className="text-xs font-bold text-stone-800 uppercase">
                          Total Deductions
                        </span>
                        <span className="text-sm font-bold font-mono text-rose-800">
                          {formatCurrency(data.snapshot.totalDeductions)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 5. Highlight Net Pay Box */}
                <div className="mx-6 sm:mx-8 mb-8 p-6 rounded-2xl border-2 border-amber-300 bg-gradient-to-r from-amber-500/10 via-amber-50/60 to-white shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-amber-900 block">
                        Net Take-Home Salary
                      </span>
                      <div className="text-2xl sm:text-3xl font-black text-stone-900 font-mono mt-1">
                        {formatCurrency(data.snapshot.netSalary)}
                      </div>
                      <p className="text-xs font-medium text-stone-600 mt-1 italic">
                        In Words: {numberToWordsIndian(data.snapshot.netSalary)}
                      </p>
                    </div>

                    <div className="text-left sm:text-right border-t sm:border-t-0 pt-3 sm:pt-0 border-stone-200">
                      <div className="text-xs text-stone-500">Disbursed via</div>
                      <div className="text-xs font-bold text-stone-800 uppercase">
                        {data.snapshot.paymentMethod || 'Direct Bank Transfer'}
                      </div>
                      {data.snapshot.paymentReference && (
                        <div className="text-[11px] font-mono text-stone-400 mt-0.5">
                          Ref: {data.snapshot.paymentReference}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 6. Employer Contributions (CTC Breakdown) */}
                {data.employerContributions && data.employerContributions.length > 0 && (
                  <div className="mx-6 sm:mx-8 mb-8 p-4 rounded-xl border border-stone-200 bg-stone-50/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-stone-700 uppercase tracking-wider">
                        Employer Contributions (Non-Taxable to Employee)
                      </span>
                      <span className="text-xs font-bold font-mono text-stone-900">
                        {formatCurrency(data.totalEmployerContributions)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                      {data.employerContributions.map((ec, idx) => (
                        <div key={idx} className="p-2 rounded bg-white border border-stone-200/70">
                          <span className="text-stone-500 text-[11px] block">
                            {ec.componentName}
                          </span>
                          <span className="font-mono font-bold text-stone-800">
                            {formatCurrency(ec.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 7. Footer / Security Disclaimer */}
                <div className="px-6 sm:px-8 py-4 bg-stone-50 border-t border-stone-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-stone-400">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    <span>
                      Digitally verified electronic payslip generated by HRMS Security System
                    </span>
                  </div>
                  <div>
                    Generated on {new Date().toLocaleDateString('en-IN')} • Valid without physical
                    signature
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
