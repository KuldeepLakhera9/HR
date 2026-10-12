'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ChartCard, KPICard, Button } from '@hrms/ui';
import { reportsApi, organizationApi, performanceApi } from '../../../lib/api-client';
import {
  PerformanceAnalyticsOverviewDto,
  GoalProgressAnalyticsDto,
  DevelopmentPlanAnalyticsDto,
} from '@hrms/types';
import {
  Award,
  Target,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Users,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Table as TableIcon,
  BarChart3,
  Building2,
  MapPin,
  Calendar,
  Filter,
  FileText,
  Percent,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from 'recharts';

export function PerformanceAnalyticsTab() {
  const [subTab, setSubTab] = useState<'OVERVIEW' | 'GOALS' | 'DEV_PLANS'>('OVERVIEW');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'CHARTS' | 'TABLES'>('CHARTS');

  // Filters
  const [cycleId, setCycleId] = useState<string>('ALL');
  const [departmentId, setDepartmentId] = useState<string>('ALL');
  const [branchId, setBranchId] = useState<string>('ALL');

  // Metadata dropdowns
  const [cycles, setCycles] = useState<Array<{ id: string; name: string }>>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);

  // Data states
  const [overviewData, setOverviewData] = useState<PerformanceAnalyticsOverviewDto | null>(null);
  const [goalsData, setGoalsData] = useState<GoalProgressAnalyticsDto | null>(null);
  const [devPlansData, setDevPlansData] = useState<DevelopmentPlanAnalyticsDto | null>(null);

  // Load dropdown options once
  useEffect(() => {
    async function loadOptions() {
      try {
        const [cyclesRes, deptRes, branchRes] = await Promise.all([
          performanceApi.getCycles().catch(() => []),
          organizationApi.getDepartments().catch(() => []),
          organizationApi.getBranches().catch(() => []),
        ]);
        if (Array.isArray(cyclesRes)) {
          setCycles(cyclesRes.map((c: any) => ({ id: c.id, name: c.name })));
        }
        if (Array.isArray(deptRes)) setDepartments(deptRes);
        if (Array.isArray(branchRes)) setBranches(branchRes);
      } catch {
        // Fallback gracefully
      }
    }
    loadOptions();
  }, []);

  // Fetch report data
  const fetchData = useCallback(
    async (isBackground = false) => {
      if (!isBackground) setLoading(true);
      else setRefreshing(true);
      setError(null);

      const filterParams = {
        cycleId: cycleId !== 'ALL' ? cycleId : undefined,
        departmentId: departmentId !== 'ALL' ? departmentId : undefined,
        branchId: branchId !== 'ALL' ? branchId : undefined,
      };

      try {
        if (subTab === 'OVERVIEW') {
          const res = await reportsApi.getPerformanceOverview(filterParams);
          setOverviewData(res);
        } else if (subTab === 'GOALS') {
          const res = await reportsApi.getPerformanceGoals(filterParams);
          setGoalsData(res);
        } else if (subTab === 'DEV_PLANS') {
          const res = await reportsApi.getPerformanceDevelopmentPlans(filterParams);
          setDevPlansData(res);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to retrieve performance analytics');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [subTab, cycleId, departmentId, branchId],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Color mapping for score buckets
  const BUCKET_COLORS = ['#EF4444', '#F59E0B', '#3B82F6', '#10B981'];

  return (
    <div className="space-y-6">
      {/* Privacy & Governance Notice */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
        <ShieldCheck className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
        <div className="leading-relaxed">
          <strong>Institutional Confidentiality & Non-Ranking Policy:</strong> Performance review
          outcomes and rating distributions are aggregated into cohorts. Groups smaller than
          differential privacy thresholds are suppressed to prevent de-anonymization. Non-finalized
          draft scores and unrated records are never evaluated as zero. Direct employee
          stack-ranking or automated adverse employment decisions are strictly prohibited.
        </div>
      </div>

      {/* Header & Sub-Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200 pb-3">
        <div className="flex items-center gap-2">
          {(['OVERVIEW', 'GOALS', 'DEV_PLANS'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setSubTab(tab)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                subTab === tab
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
              }`}
            >
              {tab === 'OVERVIEW' && <Award className="h-3.5 w-3.5" />}
              {tab === 'GOALS' && <Target className="h-3.5 w-3.5" />}
              {tab === 'DEV_PLANS' && <BookOpen className="h-3.5 w-3.5" />}
              {tab === 'OVERVIEW'
                ? 'Cycle Participation & Outcomes'
                : tab === 'GOALS'
                  ? 'Goal Progress & Lagging Actions'
                  : 'Development Plans'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center rounded-lg border border-stone-200 bg-white p-0.5">
            <button
              onClick={() => setViewMode('CHARTS')}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'CHARTS'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Visual
            </button>
            <button
              onClick={() => setViewMode('TABLES')}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                viewMode === 'TABLES'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              <TableIcon className="h-3.5 w-3.5" />
              Tables
            </button>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => fetchData(true)}
            disabled={loading || refreshing}
            leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter Controls Bar */}
      <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-stone-600">
          <div className="flex flex-wrap items-center gap-3">
            {/* Cycle Selector */}
            {cycles.length > 0 && (
              <div className="flex items-center gap-1.5 bg-white border border-stone-200 rounded-lg px-2.5 py-1">
                <Calendar className="h-3.5 w-3.5 text-stone-400" />
                <select
                  value={cycleId}
                  onChange={(e) => setCycleId(e.target.value)}
                  className="bg-transparent text-xs font-medium text-stone-800 focus:outline-none cursor-pointer"
                >
                  <option value="ALL">All / Latest Review Cycle</option>
                  {cycles.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Department Selector */}
            {departments.length > 0 && (
              <div className="flex items-center gap-1.5 bg-white border border-stone-200 rounded-lg px-2.5 py-1">
                <Building2 className="h-3.5 w-3.5 text-stone-400" />
                <select
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  className="bg-transparent text-xs font-medium text-stone-800 focus:outline-none cursor-pointer"
                >
                  <option value="ALL">All Departments</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Branch Selector */}
            {branches.length > 0 && (
              <div className="flex items-center gap-1.5 bg-white border border-stone-200 rounded-lg px-2.5 py-1">
                <MapPin className="h-3.5 w-3.5 text-stone-400" />
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  className="bg-transparent text-xs font-medium text-stone-800 focus:outline-none cursor-pointer"
                >
                  <option value="ALL">All Branches</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Scope Indicator */}
          {overviewData && (
            <div className="text-[11px] text-stone-500 flex items-center gap-2">
              <span className="font-semibold text-stone-700">
                Scope: {overviewData.metadata.scopeType}
              </span>
              {overviewData.metadata.scopeType === 'TEAM' && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800 font-medium">
                  Team Scoped (k&lt;5 Suppressed)
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600" />
            <span>{error}</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => fetchData()}>
            Retry
          </Button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-28 rounded-xl border border-stone-200 bg-white p-4 animate-pulse flex flex-col justify-between"
            >
              <div className="h-4 bg-stone-200 rounded w-1/3"></div>
              <div className="h-8 bg-stone-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      )}

      {/* SUB-VIEW 1: OVERVIEW */}
      {!loading && subTab === 'OVERVIEW' && overviewData && (
        <div className="space-y-6">
          {/* Active Cycle Header */}
          {overviewData.cycle ? (
            <div className="rounded-xl border border-stone-200 bg-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-stone-900">{overviewData.cycle.name}</h2>
                  <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-semibold text-stone-700">
                    {overviewData.cycle.status}
                  </span>
                  {overviewData.cycle.isNumericalApproved ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                      Approved Numerical Policy (Scale 1–{overviewData.cycle.ratingScaleMax})
                    </span>
                  ) : (
                    <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">
                      Narrative Assessment Policy
                    </span>
                  )}
                </div>
                <p className="text-xs text-stone-500 mt-1">
                  Active window: {overviewData.cycle.startDate.slice(0, 10)} to{' '}
                  {overviewData.cycle.endDate.slice(0, 10)}
                </p>
              </div>

              <div className="flex items-center gap-4 text-xs text-stone-600">
                {overviewData.cycle.selfAssessmentDeadline && (
                  <div>
                    <span className="text-stone-400 block text-[10px] uppercase">
                      Self-Assessment Due
                    </span>
                    <span className="font-semibold text-stone-800">
                      {overviewData.cycle.selfAssessmentDeadline.slice(0, 10)}
                    </span>
                  </div>
                )}
                {overviewData.cycle.managerReviewDeadline && (
                  <div>
                    <span className="text-stone-400 block text-[10px] uppercase">
                      Manager Review Due
                    </span>
                    <span className="font-semibold text-stone-800">
                      {overviewData.cycle.managerReviewDeadline.slice(0, 10)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-stone-200 bg-white p-6 text-center text-xs text-stone-400">
              No active or historical performance review cycles configured in this scope.
            </div>
          )}

          {/* KPI Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              title="Eligible Participation"
              value={`${overviewData.participation.eligibleCount}`}
              description={`${overviewData.participation.totalEnrolled} total enrolled (${overviewData.participation.exemptedCount} exempted)`}
              icon={<Users className="h-4 w-4" />}
            />
            <KPICard
              title="Review Cycle Completion"
              value={`${overviewData.participation.completionRate}%`}
              description={`${overviewData.participation.finalizedCount} of ${overviewData.participation.eligibleCount} finalized`}
              icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            />
            <KPICard
              title="Self-Assessment Rate"
              value={`${overviewData.assessments.selfAssessmentRate}%`}
              description={`${overviewData.assessments.selfAssessmentSubmitted} submitted (${overviewData.assessments.selfAssessmentDraft} in draft)`}
              icon={<FileText className="h-4 w-4 text-blue-600" />}
            />
            <KPICard
              title="Overdue Appraisals"
              value={`${overviewData.deadlines.totalOverdueReviews}`}
              description={`${overviewData.deadlines.overdueSelfAssessments} self, ${overviewData.deadlines.overdueManagerReviews} manager`}
              icon={
                <Clock
                  className={`h-4 w-4 ${
                    overviewData.deadlines.totalOverdueReviews > 0
                      ? 'text-rose-600'
                      : 'text-stone-400'
                  }`}
                />
              }
            />
          </div>

          {/* Rating Distribution & Funnel Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Rating Distribution Card */}
            <ChartCard
              title="Authoritative Rating Distribution"
              subtitle={
                overviewData.ratingDistribution.isNumericalApproved
                  ? `Cohort of ${overviewData.ratingDistribution.totalFinalizedScored} finalized reviews (${overviewData.ratingDistribution.missingOrExcludedCount} excluded narrative/missing)`
                  : 'Numerical scoring deferred (no approved numerical formula)'
              }
            >
              {overviewData.ratingDistribution.isSuppressed ? (
                <div className="h-56 flex flex-col items-center justify-center text-center p-4">
                  <ShieldAlert className="h-8 w-8 text-amber-500 mb-2" />
                  <p className="text-xs font-semibold text-stone-800">
                    Distribution Suppressed for Privacy
                  </p>
                  <p className="text-[11px] text-stone-500 max-w-sm mt-1">
                    {overviewData.ratingDistribution.suppressionReason}
                  </p>
                </div>
              ) : !overviewData.ratingDistribution.isNumericalApproved ? (
                <div className="h-56 flex flex-col items-center justify-center text-center p-4 text-stone-400 text-xs">
                  Review cycle uses narrative qualitative assessments without an approved numerical
                  weight formula.
                </div>
              ) : overviewData.ratingDistribution.totalFinalizedScored === 0 ? (
                <div className="h-56 flex items-center justify-center text-xs text-stone-400">
                  No finalized scored reviews in current cycle
                </div>
              ) : viewMode === 'CHARTS' ? (
                <div className="w-full h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={overviewData.ratingDistribution.buckets}
                      margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0ECE4" />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: '#78716C', fontSize: 10 }}
                        tickFormatter={(v) => v.split(' ')[0]}
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: '#78716C', fontSize: 10 }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#FFFFFF',
                          borderColor: '#E7E2DA',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                      />
                      <Bar dataKey="count" name="Evaluated Employees" radius={[4, 4, 0, 0]}>
                        {overviewData.ratingDistribution.buckets.map((_, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={BUCKET_COLORS[index % BUCKET_COLORS.length]}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-stone-200 text-stone-500">
                        <th className="py-2">Rating Tier</th>
                        <th className="py-2">Employees</th>
                        <th className="py-2">Share %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {overviewData.ratingDistribution.buckets.map((b) => (
                        <tr key={b.label} className="hover:bg-stone-50">
                          <td className="py-2 font-medium text-stone-800">{b.label}</td>
                          <td className="py-2 text-stone-600">{b.count}</td>
                          <td className="py-2 font-semibold text-amber-700">
                            {overviewData.ratingDistribution.totalFinalizedScored > 0
                              ? Math.round(
                                  (b.count / overviewData.ratingDistribution.totalFinalizedScored) *
                                    100,
                                )
                              : 0}
                            %
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ChartCard>

            {/* Department Breakdown Card */}
            <ChartCard
              title="Department Completion Summary"
              subtitle="Review completion rates across institutional business units"
            >
              {overviewData.departmentBreakdown.length > 0 ? (
                viewMode === 'CHARTS' ? (
                  <div className="w-full h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={overviewData.departmentBreakdown}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0ECE4" />
                        <XAxis
                          dataKey="departmentName"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: '#78716C', fontSize: 10 }}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: '#78716C', fontSize: 10 }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#FFFFFF',
                            borderColor: '#E7E2DA',
                            borderRadius: '8px',
                            fontSize: '12px',
                          }}
                        />
                        <Bar
                          dataKey="completedCount"
                          name="Completed"
                          fill="#10B981"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          dataKey="totalParticipants"
                          name="Total Eligible"
                          fill="#D97706"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-stone-200 text-stone-500">
                          <th className="py-2">Department</th>
                          <th className="py-2">Eligible</th>
                          <th className="py-2">Completed</th>
                          <th className="py-2">Rate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {overviewData.departmentBreakdown.map((d) => (
                          <tr key={d.departmentId} className="hover:bg-stone-50">
                            <td className="py-2 font-medium text-stone-800">
                              {d.departmentName}
                              {d.isSuppressed && (
                                <span className="ml-2 text-[10px] text-stone-400 italic">
                                  (Suppressed &lt; 5)
                                </span>
                              )}
                            </td>
                            <td className="py-2 text-stone-600">{d.totalParticipants}</td>
                            <td className="py-2 text-stone-600">{d.completedCount}</td>
                            <td className="py-2 font-semibold text-amber-700">
                              {d.completionRate}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                <div className="h-56 flex items-center justify-center text-xs text-stone-400">
                  No department breakdown records available
                </div>
              )}
            </ChartCard>
          </div>

          {/* Cycle Exceptions Bar */}
          <div className="rounded-xl border border-stone-200 bg-white p-4">
            <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">
              Review Cycle Exceptions & Integrity Audit
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="rounded-lg bg-stone-50 p-3">
                <span className="text-stone-500 block">Exempted Participants</span>
                <span className="text-lg font-bold text-stone-800">
                  {overviewData.cycleExceptions.exemptedCount}
                </span>
                <p className="text-[11px] text-stone-400 mt-0.5">
                  Probation/medical/notice exclusions
                </p>
              </div>
              <div className="rounded-lg bg-stone-50 p-3">
                <span className="text-stone-500 block">Manager Reassignments</span>
                <span className="text-lg font-bold text-stone-800">
                  {overviewData.cycleExceptions.managerReassignedCount}
                </span>
                <p className="text-[11px] text-stone-400 mt-0.5">Reassigned with audit trails</p>
              </div>
              <div className="rounded-lg bg-stone-50 p-3">
                <span className="text-stone-500 block">Reopened Appraisals</span>
                <span className="text-lg font-bold text-stone-800">
                  {overviewData.cycleExceptions.reopenedCount}
                </span>
                <p className="text-[11px] text-stone-400 mt-0.5">
                  Recalibration or authorized corrections
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW 2: GOALS */}
      {!loading && subTab === 'GOALS' && goalsData && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              title="Total Assigned Goals"
              value={`${goalsData.overview.totalGoals}`}
              description={`${goalsData.overview.cancelledGoals} cancelled excluded`}
              icon={<Target className="h-4 w-4" />}
            />
            <KPICard
              title="Average Goal Progress"
              value={`${goalsData.overview.averageProgressPercentage}%`}
              description="Non-cancelled active goals"
              icon={<Percent className="h-4 w-4 text-emerald-600" />}
            />
            <KPICard
              title="Completed Goals"
              value={`${goalsData.overview.completedGoals}`}
              description={`${goalsData.overview.inProgressGoals} currently in progress`}
              icon={<CheckCircle2 className="h-4 w-4 text-blue-600" />}
            />
            <KPICard
              title="Overdue / Lagging Goals"
              value={`${goalsData.overview.overdueGoalsCount}`}
              description="Progress < 50% or past deadline"
              icon={
                <Clock
                  className={`h-4 w-4 ${
                    goalsData.overview.overdueGoalsCount > 0 ? 'text-rose-600' : 'text-stone-400'
                  }`}
                />
              }
            />
          </div>

          {/* Goal Categories & Lagging List */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Category Breakdown */}
            <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-3">
              <h3 className="text-sm font-semibold text-stone-900">Goals by Functional Category</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-stone-200 text-stone-500">
                      <th className="py-2">Category</th>
                      <th className="py-2">Total</th>
                      <th className="py-2">Completed</th>
                      <th className="py-2">Avg Progress</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {goalsData.byCategory.map((cat) => (
                      <tr key={cat.category} className="hover:bg-stone-50">
                        <td className="py-2 font-medium text-stone-800">{cat.category}</td>
                        <td className="py-2 text-stone-600">{cat.total}</td>
                        <td className="py-2 text-stone-600">{cat.completed}</td>
                        <td className="py-2 font-semibold text-amber-700">
                          {cat.averageProgress}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Lagging Goals Queue */}
            <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-3">
              <h3 className="text-sm font-semibold text-stone-900">
                Lagging & Overdue Goals (Attention Required)
              </h3>
              {goalsData.laggingGoals.length > 0 ? (
                <div className="overflow-x-auto max-h-72">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-stone-200 text-stone-500">
                        <th className="py-2">Goal Title</th>
                        <th className="py-2">Owner</th>
                        <th className="py-2">Progress</th>
                        <th className="py-2">Due Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {goalsData.laggingGoals.map((g) => (
                        <tr key={g.id} className="hover:bg-stone-50">
                          <td className="py-2 font-medium text-stone-800 max-w-[160px] truncate">
                            {g.title}
                          </td>
                          <td className="py-2 text-stone-600">
                            {g.employeeName}{' '}
                            <span className="text-[10px] text-stone-400">({g.employeeCode})</span>
                          </td>
                          <td className="py-2 font-semibold text-amber-700">
                            {g.progressPercentage}%
                          </td>
                          <td className="py-2 text-stone-600">
                            {g.dueDate ? g.dueDate.slice(0, 10) : 'N/A'}{' '}
                            {g.isOverdue && (
                              <span className="text-[10px] font-semibold text-rose-600">
                                Overdue
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="h-44 flex items-center justify-center text-xs text-stone-400">
                  No lagging or overdue goals detected in this period.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW 3: DEVELOPMENT PLANS */}
      {!loading && subTab === 'DEV_PLANS' && devPlansData && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              title="Total Development Actions"
              value={`${devPlansData.overview.totalPlans}`}
              description={`${devPlansData.overview.cancelledCount} cancelled`}
              icon={<BookOpen className="h-4 w-4" />}
            />
            <KPICard
              title="Action Completion Rate"
              value={`${devPlansData.overview.completionRate}%`}
              description={`${devPlansData.overview.completedCount} completed`}
              icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            />
            <KPICard
              title="In Progress Actions"
              value={`${devPlansData.overview.inProgressCount}`}
              description={`${devPlansData.overview.plannedCount} planned`}
              icon={<Clock className="h-4 w-4 text-blue-600" />}
            />
            <KPICard
              title="Overdue Actions"
              value={`${devPlansData.overview.overduePlansCount}`}
              description="Target date elapsed without completion"
              icon={
                <AlertTriangle
                  className={`h-4 w-4 ${
                    devPlansData.overview.overduePlansCount > 0 ? 'text-rose-600' : 'text-stone-400'
                  }`}
                />
              }
            />
          </div>

          {/* Active Development Plans Table */}
          <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-3">
            <h3 className="text-sm font-semibold text-stone-900">
              Active Employee Development Action Items
            </h3>
            {devPlansData.activePlans.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-stone-200 text-stone-500">
                      <th className="py-2">Objective</th>
                      <th className="py-2">Employee</th>
                      <th className="py-2">Status</th>
                      <th className="py-2">Target Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {devPlansData.activePlans.map((p) => (
                      <tr key={p.id} className="hover:bg-stone-50">
                        <td className="py-2 font-medium text-stone-800">{p.objective}</td>
                        <td className="py-2 text-stone-600">
                          {p.employeeName}{' '}
                          <span className="text-[10px] text-stone-400">({p.employeeCode})</span>
                        </td>
                        <td className="py-2">
                          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-700">
                            {p.status}
                          </span>
                        </td>
                        <td className="py-2 text-stone-600">
                          {p.targetDate ? p.targetDate.slice(0, 10) : 'N/A'}{' '}
                          {p.isOverdue && (
                            <span className="text-[10px] font-semibold text-rose-600">Overdue</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="h-32 flex items-center justify-center text-xs text-stone-400">
                No active development action items found.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
