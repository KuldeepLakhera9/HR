'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppShell } from '../../layouts/AppShell';
import { ProtectedRoute } from '../../components/auth/ProtectedRoute';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../lib/api-client';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Badge, Button } from '@hrms/ui';
import {
  Banknote,
  Layers,
  Component,
  Plus,
  ArrowRight,
  Calculator,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  Clock,
  Sparkles,
  RefreshCw,
} from 'lucide-react';

export default function PayrollOverviewPage() {
  const router = useRouter();
  const { hasPermission, hasRole } = useAuth();
  const canManage = hasRole('ADMIN') || hasPermission('PAYROLL_MANAGE');

  const [isLoading, setIsLoading] = useState(true);
  const [structures, setStructures] = useState<any[]>([]);
  const [components, setComponents] = useState<any[]>([]);
  const [stats, setStats] = useState({
    activeStructuresCount: 0,
    totalComponentsCount: 0,
    earningsCount: 0,
    deductionsCount: 0,
  });

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [structRes, compRes] = await Promise.all([
        apiClient.getSalaryStructures({ limit: 5 }),
        apiClient.getSalaryComponents({ limit: 10 }),
      ]);

      const structList = structRes?.data?.data || [];
      const compList = compRes?.data?.data || [];

      setStructures(structList);
      setComponents(compList);

      const activeStructs = structList.filter((s: any) => s.status === 'ACTIVE').length;
      const earnings = compList.filter((c: any) => c.category === 'EARNING').length;
      const deductions = compList.filter((c: any) => c.category === 'DEDUCTION').length;

      setStats({
        activeStructuresCount: activeStructs,
        totalComponentsCount: compRes?.data?.meta?.total || compList.length,
        earningsCount: earnings,
        deductionsCount: deductions,
      });
    } catch (err) {
      console.error('Failed to load payroll overview data', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <ProtectedRoute requiredPermissions={['PAYROLL_VIEW']}>
      <AppShell>
        <div className="space-y-6">
          {/* Top Page Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-stone-200">
            <div>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                  <Banknote className="w-5 h-5" />
                </div>
                <h1 className="text-xl md:text-2xl font-bold text-stone-900 tracking-tight">
                  Payroll & Salary Administration
                </h1>
              </div>
              <p className="text-sm text-stone-500 mt-1">
                Configure standardized salary components, versioned compensation structures, and
                deterministic financial calculation rules.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchData}
                disabled={isLoading}
                className="gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              {canManage && (
                <Link href="/payroll/structures/new">
                  <Button
                    size="sm"
                    className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Plus className="w-4 h-4" />
                    New Salary Structure
                  </Button>
                </Link>
              )}
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-stone-200 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                    Active Structures
                  </span>
                  <div className="p-2 bg-emerald-50 text-emerald-600 rounded-md">
                    <Layers className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-stone-900">
                    {stats.activeStructuresCount}
                  </span>
                  <span className="text-xs text-stone-500">versioned models</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-stone-200 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                    Salary Components
                  </span>
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-md">
                    <Component className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-stone-900">
                    {stats.totalComponentsCount}
                  </span>
                  <span className="text-xs text-stone-500">catalog items</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-stone-200 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                    Formula Security
                  </span>
                  <div className="p-2 bg-indigo-50 text-indigo-600 rounded-md">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-stone-900">Zero-Eval Parser</span>
                  <Badge
                    variant="outline"
                    className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]"
                  >
                    Verified
                  </Badge>
                </div>
                <p className="text-[11px] text-stone-500 mt-1">Acyclic AST • Precision Decimal</p>
              </CardContent>
            </Card>

            <Card className="border-stone-200 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
                    Governance
                  </span>
                  <div className="p-2 bg-amber-50 text-amber-600 rounded-md">
                    <Clock className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-stone-900">Immutable History</span>
                </div>
                <p className="text-[11px] text-stone-500 mt-1">
                  Version increment on employee assignments
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Navigation Hub Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="border-stone-200 hover:border-emerald-300 transition-all shadow-sm bg-gradient-to-br from-emerald-50/30 to-white">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-emerald-100 text-emerald-800">
                      <Calculator className="w-5 h-5" />
                    </div>
                    <CardTitle className="text-lg font-bold text-stone-900">
                      Payroll Runs & Periods
                    </CardTitle>
                  </div>
                  <Link href="/payroll/runs">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-emerald-700 hover:text-emerald-800 font-semibold"
                    >
                      Open <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
                <CardDescription className="text-xs text-stone-500 mt-1">
                  Orchestrate monthly calculation cycles, configure deadlines, review snapshots,
                  approve runs, and publish payslips.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="p-3 bg-white rounded-lg border border-emerald-100 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-stone-600">
                    <span>Workflow State Machine</span>
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-800 text-[10px]">
                      7 Stages
                    </Badge>
                  </div>
                  <div className="text-[11px] text-stone-400">
                    Draft → Calculating → Review Pending → Approved → Locked → Published
                  </div>
                </div>
                <div className="pt-3 mt-3 border-t border-stone-100">
                  <Link href="/payroll/runs">
                    <Button className="w-full text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white">
                      Manage Payroll Runs
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            <Card className="border-stone-200 hover:border-stone-300 transition-all shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700">
                      <Layers className="w-5 h-5" />
                    </div>
                    <CardTitle className="text-lg font-bold text-stone-900">
                      Salary Structures
                    </CardTitle>
                  </div>
                  <Link href="/payroll/structures">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-emerald-600 hover:text-emerald-700"
                    >
                      View All <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
                <CardDescription className="text-xs text-stone-500 mt-1">
                  Manage versioned compensation templates, assign component rules, preview take-home
                  pay, and activate policies.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="divide-y divide-stone-100">
                  {structures.length === 0 ? (
                    <div className="py-6 text-center text-xs text-stone-400">
                      No salary structures created yet.
                    </div>
                  ) : (
                    structures.slice(0, 4).map((s) => (
                      <div key={s.id} className="py-3 flex items-center justify-between text-sm">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-stone-800">{s.name}</span>
                            <Badge variant="outline" className="text-[10px] font-mono">
                              v{s.version}
                            </Badge>
                            <Badge
                              variant={s.status === 'ACTIVE' ? 'default' : 'outline'}
                              className={`text-[10px] ${
                                s.status === 'ACTIVE'
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                  : s.status === 'DRAFT'
                                    ? 'bg-amber-100 text-amber-800 border-amber-200'
                                    : 'bg-stone-100 text-stone-700'
                              }`}
                            >
                              {s.status}
                            </Badge>
                          </div>
                          <span className="text-xs text-stone-400 font-mono mt-0.5 block">
                            Code: {s.code} • {s.items?.length || 0} components
                          </span>
                        </div>
                        <Link href={`/payroll/structures/${s.id}`}>
                          <Button variant="outline" size="sm" className="text-xs h-7 px-2">
                            Inspect
                          </Button>
                        </Link>
                      </div>
                    ))
                  )}
                </div>
                <div className="pt-3 border-t border-stone-100 mt-2">
                  <Link href="/payroll/structures">
                    <Button variant="outline" className="w-full text-xs font-medium">
                      Manage All Salary Structures
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            <Card className="border-stone-200 hover:border-stone-300 transition-all shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-blue-50 text-blue-700">
                      <Component className="w-5 h-5" />
                    </div>
                    <CardTitle className="text-lg font-bold text-stone-900">
                      Salary Components Catalog
                    </CardTitle>
                  </div>
                  <Link href="/payroll/components">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-blue-600 hover:text-blue-700"
                    >
                      View All <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
                <CardDescription className="text-xs text-stone-500 mt-1">
                  Define modular earnings, deductions, and employer contributions with explicit
                  rounding and calculation models.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="divide-y divide-stone-100">
                  {components.length === 0 ? (
                    <div className="py-6 text-center text-xs text-stone-400">
                      No salary components configured yet.
                    </div>
                  ) : (
                    components.slice(0, 4).map((c) => (
                      <div key={c.id} className="py-3 flex items-center justify-between text-sm">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-stone-800">{c.name}</span>
                            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-stone-100 text-stone-700">
                              {c.code}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] text-stone-500">
                              {c.category} • {c.calculationType}
                            </span>
                            {c.isTaxable && (
                              <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1 rounded">
                                Taxable
                              </span>
                            )}
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={
                            c.isActive ? 'text-emerald-700 border-emerald-200' : 'text-stone-400'
                          }
                        >
                          {c.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    ))
                  )}
                </div>
                <div className="pt-3 border-t border-stone-100 mt-2">
                  <Link href="/payroll/components">
                    <Button variant="outline" className="w-full text-xs font-medium">
                      Manage All Salary Components
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            <Card className="border-stone-200 hover:border-amber-300 transition-all shadow-sm bg-gradient-to-br from-amber-50/20 to-white">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-amber-100 text-amber-800">
                      <ShieldAlert className="w-5 h-5" />
                    </div>
                    <CardTitle className="text-lg font-bold text-stone-900">
                      Exceptions & Validation
                    </CardTitle>
                  </div>
                  <Link href="/payroll/exceptions">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-amber-700 hover:text-amber-800 font-semibold"
                    >
                      Open <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
                <CardDescription className="text-xs text-stone-500 mt-1">
                  Investigate anomalies, negative pay, proration mismatches, and manage authorized
                  audit overrides.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="p-3 bg-white rounded-lg border border-amber-100 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-stone-600">
                    <span>Approval Safeguards</span>
                    <Badge
                      variant="outline"
                      className="bg-red-50 text-red-700 border-red-200 text-[10px]"
                    >
                      Blocking Gated
                    </Badge>
                  </div>
                  <div className="text-[11px] text-stone-400">
                    Spike/Drop Detection • 5-Char Reason Overrides • Immutable Trail
                  </div>
                </div>
                <div className="pt-3 mt-3 border-t border-stone-100">
                  <Link href="/payroll/exceptions">
                    <Button className="w-full text-xs font-semibold bg-amber-800 hover:bg-amber-900 text-white">
                      Manage Exceptions
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
