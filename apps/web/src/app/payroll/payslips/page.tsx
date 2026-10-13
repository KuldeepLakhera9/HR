'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppShell } from '../../../layouts/AppShell';
import { ProtectedRoute } from '../../../components/auth/ProtectedRoute';
import { apiClient } from '../../../lib/api-client';
import { PayslipListItemDto } from '@hrms/types';
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
  Banknote,
  Calendar,
  Download,
  Eye,
  FileText,
  Filter,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingUp,
  AlertCircle,
  Clock,
  CheckCircle2,
  ChevronRight,
  Layers,
} from 'lucide-react';

export default function EmployeePayslipHistoryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [payslips, setPayslips] = useState<PayslipListItemDto[]>([]);
  const [meta, setMeta] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Filters
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<string>(String(currentYear));
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');

  const fetchPayslips = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.getMyPayslips({
        year: selectedYear ? Number(selectedYear) : undefined,
        month: selectedMonth !== 'ALL' ? Number(selectedMonth) : undefined,
        limit: 50,
      });
      setPayslips(res?.data || []);
      setMeta({
        page: res?.meta?.page ?? 1,
        limit: res?.meta?.limit ?? 20,
        total: res?.meta?.total ?? 0,
        totalPages: res?.meta?.totalPages ?? 0,
      });
    } catch (err) {
      console.error('Failed to load employee payslips', err);
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedMonth]);

  useEffect(() => {
    fetchPayslips();
  }, [fetchPayslips]);

  const handleDownloadPdf = async (e: React.MouseEvent, p: PayslipListItemDto) => {
    e.stopPropagation();
    try {
      setDownloadingId(p.id);
      const filename = `Payslip_${p.periodYear}_${String(p.periodMonth).padStart(2, '0')}.pdf`;
      await apiClient.downloadPayslipPdf(p.id, filename);
    } catch (err: any) {
      alert(err.message || 'Failed to download payslip PDF');
    } finally {
      setDownloadingId(null);
    }
  };

  const formatCurrency = (amount: number, currency = 'INR') => {
    return `₹${Number(amount || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const getMonthName = (m: number) => {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return months[m - 1] || `Month ${m}`;
  };

  // Compute summary stats
  const totalNetYtd = payslips.reduce((acc, p) => acc + (p.netPay || 0), 0);
  const totalDeductionsYtd = payslips.reduce((acc, p) => acc + (p.totalDeductions || 0), 0);
  const latestPayslip = payslips[0];

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-stone-200">
            <div>
              <div className="flex items-center gap-2">
                <Banknote className="w-6 h-6 text-emerald-600" />
                <h1 className="text-xl md:text-2xl font-bold text-stone-900 tracking-tight">
                  My Salary Payslips
                </h1>
              </div>
              <p className="text-xs text-stone-500 mt-1">
                Access, view itemized salary breakdowns, and download official PDF payslips for
                published periods.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchPayslips}
                disabled={loading}
                className="text-stone-600"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>

          {/* Quick Metric Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-stone-200 shadow-2xs">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                    Latest Disbursed Net
                  </span>
                  <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
                    <Banknote className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2 text-xl font-bold text-stone-900">
                  {latestPayslip ? formatCurrency(latestPayslip.netPay) : '₹0.00'}
                </div>
                <div className="mt-1 text-[11px] text-stone-400">
                  {latestPayslip
                    ? `${getMonthName(latestPayslip.periodMonth)} ${latestPayslip.periodYear}`
                    : 'No published payslips'}
                </div>
              </CardContent>
            </Card>

            <Card className="border-stone-200 shadow-2xs">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                    Net Paid ({selectedYear})
                  </span>
                  <div className="p-1.5 rounded-lg bg-blue-50 text-blue-700">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2 text-xl font-bold text-stone-900">
                  {formatCurrency(totalNetYtd)}
                </div>
                <div className="mt-1 text-[11px] text-stone-400">
                  {payslips.length} published period(s)
                </div>
              </CardContent>
            </Card>

            <Card className="border-stone-200 shadow-2xs">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                    Total Deductions ({selectedYear})
                  </span>
                  <div className="p-1.5 rounded-lg bg-rose-50 text-rose-700">
                    <Layers className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2 text-xl font-bold text-stone-900">
                  {formatCurrency(totalDeductionsYtd)}
                </div>
                <div className="mt-1 text-[11px] text-stone-400">
                  Statutory PF, ESI, Tax, and Welfare
                </div>
              </CardContent>
            </Card>

            <Card className="border-stone-200 shadow-2xs">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
                    Security Verification
                  </span>
                  <div className="p-1.5 rounded-lg bg-teal-50 text-teal-700">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-2 text-sm font-bold text-emerald-800 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Tamper-Evident Delivery
                </div>
                <div className="mt-1 text-[11px] text-stone-400">
                  Direct authenticated PDF stream
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filter Bar */}
          <Card className="border-stone-200 shadow-2xs">
            <CardContent className="p-3">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5 text-stone-600 font-semibold">
                  <Filter className="w-3.5 h-3.5 text-stone-400" />
                  <span>Filter Periods:</span>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-stone-500">Year:</label>
                  <select
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="px-2.5 py-1.5 border border-stone-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-stone-500">Month:</label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="px-2.5 py-1.5 border border-stone-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="ALL">All Months</option>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>
                        {getMonthName(m)}
                      </option>
                    ))}
                  </select>
                </div>

                {(selectedMonth !== 'ALL' || selectedYear !== String(currentYear)) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedYear(String(currentYear));
                      setSelectedMonth('ALL');
                    }}
                    className="text-stone-500 hover:text-stone-800 text-xs"
                  >
                    Reset Filters
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Payslips History List */}
          {loading ? (
            <div className="py-20 text-center space-y-3">
              <RefreshCw className="w-6 h-6 animate-spin text-emerald-600 mx-auto" />
              <p className="text-xs text-stone-500 font-medium">Loading published payslips...</p>
            </div>
          ) : payslips.length === 0 ? (
            <Card className="border-stone-200 shadow-2xs">
              <CardContent className="py-16 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center mx-auto text-stone-400">
                  <FileText className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-stone-800">No Published Payslips Found</h3>
                <p className="text-xs text-stone-500 max-w-md mx-auto leading-relaxed">
                  There are no published payslips matching your filter selection. Payslips are made
                  available here immediately once payroll runs are finalized and published by
                  HR/Finance.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {payslips.map((p) => (
                <Card
                  key={p.id}
                  onClick={() => router.push(`/payroll/payslips/${p.id}`)}
                  className="border-stone-200 hover:border-emerald-300 hover:shadow-xs transition-all cursor-pointer group"
                >
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      {/* Left: Period & Meta */}
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-bold text-stone-900 group-hover:text-emerald-700 transition-colors">
                            {getMonthName(p.periodMonth)} {p.periodYear}
                          </span>
                          <Badge
                            variant="outline"
                            className="bg-emerald-50 text-emerald-700 border-emerald-300 text-[10px]"
                          >
                            PUBLISHED
                          </Badge>
                          {p.isCorrection && (
                            <Badge
                              variant="outline"
                              className="bg-amber-50 text-amber-800 border-amber-300 text-[10px]"
                            >
                              CORRECTION RUN #{p.runNumber}
                            </Badge>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-stone-500">
                          <span className="font-mono text-stone-600 font-medium">
                            {p.payslipNumber}
                          </span>
                          <span>•</span>
                          <span>
                            Paid Days: <strong className="text-stone-700">{p.paidDays}</strong> /{' '}
                            {p.workingDays}
                          </span>
                          {p.payoutDate && (
                            <>
                              <span>•</span>
                              <span>
                                Payout:{' '}
                                <strong className="text-stone-700">
                                  {new Date(p.payoutDate).toLocaleDateString()}
                                </strong>
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Right: Amounts & Actions */}
                      <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-6 pt-3 sm:pt-0 border-t sm:border-t-0 border-stone-100">
                        <div className="text-left sm:text-right">
                          <span className="text-[10px] uppercase font-bold text-stone-400 block">
                            Net Disbursed
                          </span>
                          <span className="text-lg font-bold text-emerald-800 font-mono">
                            {formatCurrency(p.netPay, p.currency)}
                          </span>
                          <span className="text-[10px] text-stone-400 block">
                            Gross: {formatCurrency(p.grossPay, p.currency)} • Ded:{' '}
                            {formatCurrency(p.totalDeductions, p.currency)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={downloadingId === p.id}
                            onClick={(e) => handleDownloadPdf(e, p)}
                            className="border-stone-200 text-stone-700 hover:text-emerald-700 hover:border-emerald-300 text-xs shadow-2xs"
                            title="Download Official PDF Payslip"
                          >
                            <Download
                              className={`w-3.5 h-3.5 mr-1.5 ${
                                downloadingId === p.id ? 'animate-bounce text-emerald-600' : ''
                              }`}
                            />
                            PDF
                          </Button>

                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs"
                            onClick={() => router.push(`/payroll/payslips/${p.id}`)}
                          >
                            <span>Breakdown</span>
                            <ChevronRight className="w-3.5 h-3.5 ml-1 group-hover:translate-x-0.5 transition-transform" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
