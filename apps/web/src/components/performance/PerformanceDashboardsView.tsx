'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useRole } from '../../context/RoleContext';
import { performanceApi } from '../../lib/api-client';
import {
  EmployeePerformanceDashboardDto,
  ManagerPerformanceDashboardDto,
  HrAdminPerformanceDashboardDto,
} from '@hrms/types';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  KPICard,
  Badge,
  Button,
} from '@hrms/ui';
import {
  TrendingUp,
  Target,
  Award,
  Clock,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Users,
  Building,
  MapPin,
  BarChart2,
  Download,
  RefreshCw,
  ChevronRight,
  ShieldAlert,
  ShieldCheck,
  FileText,
  Compass,
  ArrowUpRight,
  Sparkles,
} from 'lucide-react';

interface PerformanceDashboardsViewProps {
  onNotify?: (message: string, type: 'success' | 'error') => void;
  onNavigateToTab?: (tab: string) => void;
}

export const PerformanceDashboardsView: React.FC<PerformanceDashboardsViewProps> = ({
  onNotify,
  onNavigateToTab,
}) => {
  const { user } = useAuth();
  const { role } = useRole();
  const isHrOrAdmin = role === 'ADMIN' || role === 'HR';
  const isManagerOrAdmin = role === 'MANAGER' || role === 'ADMIN' || role === 'HR';

  // Active View Tab: 'EMPLOYEE' | 'MANAGER' | 'HR_ADMIN'
  const [activeDashboardTab, setActiveDashboardTab] = useState<'EMPLOYEE' | 'MANAGER' | 'HR_ADMIN'>(
    isHrOrAdmin ? 'HR_ADMIN' : isManagerOrAdmin ? 'MANAGER' : 'EMPLOYEE',
  );

  // Data States
  const [employeeData, setEmployeeData] = useState<EmployeePerformanceDashboardDto | null>(null);
  const [managerData, setManagerData] = useState<ManagerPerformanceDashboardDto | null>(null);
  const [hrAdminData, setHrAdminData] = useState<HrAdminPerformanceDashboardDto | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Notification helper
  const notify = (msg: string, type: 'success' | 'error' = 'success') => {
    if (onNotify) onNotify(msg, type);
  };

  // Fetch Dashboard Data based on active tab
  const fetchDashboardData = useCallback(async () => {
    setIsLoading(true);
    try {
      if (activeDashboardTab === 'EMPLOYEE') {
        const data = await performanceApi.getEmployeePerformanceDashboard();
        setEmployeeData(data);
      } else if (activeDashboardTab === 'MANAGER') {
        const data = await performanceApi.getManagerPerformanceDashboard();
        setManagerData(data);
      } else if (activeDashboardTab === 'HR_ADMIN') {
        const data = await performanceApi.getHrAdminPerformanceDashboard();
        setHrAdminData(data);
      }
    } catch (err: any) {
      notify(err?.message || 'Failed to load performance analytics', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [activeDashboardTab]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Handle CSV Export
  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      await performanceApi.exportPerformanceReport();
      notify('Performance review MIS report downloaded successfully.');
    } catch (err: any) {
      notify(err?.message || 'Failed to export MIS report', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Role Switcher Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-stone-200">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center">
            <BarChart2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-stone-900">
              Performance Dashboards & MIS Analytics
            </h2>
            <p className="text-xs text-stone-500">
              Deterministic progress tracking, review completion metrics, and organizational
              reports.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Dashboard Mode Switcher */}
          <div className="flex bg-stone-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveDashboardTab('EMPLOYEE')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                activeDashboardTab === 'EMPLOYEE'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              My Performance
            </button>

            {isManagerOrAdmin && (
              <button
                onClick={() => setActiveDashboardTab('MANAGER')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  activeDashboardTab === 'MANAGER'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Team Management
              </button>
            )}

            {isHrOrAdmin && (
              <button
                onClick={() => setActiveDashboardTab('HR_ADMIN')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  activeDashboardTab === 'HR_ADMIN'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                Org Analytics & Reports
              </button>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={fetchDashboardData}
            disabled={isLoading}
            className="text-xs h-8"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Loading State */}
      {isLoading ? (
        <Card className="p-12 text-center bg-white border border-stone-200">
          <RefreshCw className="h-8 w-8 animate-spin text-amber-600 mx-auto mb-2" />
          <p className="text-xs text-stone-500 font-medium">Loading performance dashboard...</p>
        </Card>
      ) : (
        <>
          {/* ========================================================================= */}
          {/* TAB 1: EMPLOYEE PERFORMANCE DASHBOARD                                     */}
          {/* ========================================================================= */}
          {activeDashboardTab === 'EMPLOYEE' && employeeData && (
            <div className="space-y-6">
              {/* High-Level KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                  title="My Goals"
                  value={String(employeeData.goalsSummary.totalGoals)}
                  description={`${employeeData.goalsSummary.inProgressGoals} in-progress, ${employeeData.goalsSummary.completedGoals} completed`}
                  icon={<Target className="h-5 w-5 text-amber-600" />}
                />
                <KPICard
                  title="Average Goal Progress"
                  value={`${employeeData.goalsSummary.averageProgressPercentage}%`}
                  description="Aggregated completion across active objectives"
                  icon={<TrendingUp className="h-5 w-5 text-emerald-600" />}
                />
                <KPICard
                  title="Active Cycle Status"
                  value={employeeData.currentCycleReview?.reviewStatus || 'No Active Cycle'}
                  description={
                    employeeData.currentCycleReview?.cycleName || 'Check review cycles module'
                  }
                  icon={<Calendar className="h-5 w-5 text-indigo-600" />}
                />
                <KPICard
                  title="Development Actions"
                  value={String(employeeData.activeDevelopmentPlans.length)}
                  description="Active skills & learning objectives"
                  icon={<Compass className="h-5 w-5 text-purple-600" />}
                />
              </div>

              {/* Deadlines & Active Cycle Overview */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Upcoming Deadlines */}
                <Card className="border border-stone-200 bg-white">
                  <CardHeader className="pb-3 border-b border-stone-100">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <Clock className="h-4 w-4 text-amber-600" />
                      <span>Upcoming Deadlines</span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Time-sensitive performance milestones and reviews
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    {employeeData.upcomingDeadlines.length === 0 ? (
                      <p className="text-xs text-stone-400 py-4 text-center">
                        No pending deadlines in the queue.
                      </p>
                    ) : (
                      employeeData.upcomingDeadlines.map((dl) => (
                        <div
                          key={dl.id}
                          className="flex items-center justify-between p-2.5 rounded-lg border border-stone-100 bg-stone-50/50"
                        >
                          <div className="space-y-0.5">
                            <span className="text-xs font-semibold text-stone-800 block line-clamp-1">
                              {dl.title}
                            </span>
                            <span className="text-[10px] text-stone-500">
                              Due: {new Date(dl.dueDate).toLocaleDateString()}
                            </span>
                          </div>
                          <Badge
                            variant={dl.isOverdue ? 'danger' : 'outline'}
                            className="text-[10px]"
                          >
                            {dl.isOverdue
                              ? `Overdue (${Math.abs(dl.daysRemaining)}d)`
                              : `${dl.daysRemaining} days left`}
                          </Badge>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                {/* Active Goals Snapshot */}
                <Card className="lg:col-span-2 border border-stone-200 bg-white">
                  <CardHeader className="pb-3 border-b border-stone-100 flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <Target className="h-4 w-4 text-amber-600" />
                        <span>Active Goals Progress</span>
                      </CardTitle>
                      <CardDescription className="text-xs">
                        High-priority objectives and milestones
                      </CardDescription>
                    </div>
                    {onNavigateToTab && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onNavigateToTab('GOALS')}
                        className="text-xs text-amber-700 hover:text-amber-800 hover:bg-amber-50"
                      >
                        <span>Manage Goals</span>
                        <ChevronRight className="h-3.5 w-3.5 ml-1" />
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    {employeeData.goalsSummary.activeGoalsList.length === 0 ? (
                      <p className="text-xs text-stone-400 py-6 text-center">
                        No active goals currently defined.
                      </p>
                    ) : (
                      employeeData.goalsSummary.activeGoalsList.map((g) => (
                        <div key={g.id} className="space-y-1.5 p-2 rounded-lg hover:bg-stone-50">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-stone-900">{g.title}</span>
                            <span className="font-bold text-amber-800">
                              {g.progressPercentage}%
                            </span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-stone-100 overflow-hidden">
                            <div
                              className="h-full bg-amber-500 rounded-full transition-all"
                              style={{ width: `${g.progressPercentage}%` }}
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Finalized Feedback & Active Development Plans */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Finalized Feedback */}
                <Card className="border border-stone-200 bg-white">
                  <CardHeader className="pb-3 border-b border-stone-100">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <Award className="h-4 w-4 text-emerald-600" />
                      <span>Finalized Reviews & Performance Feedback</span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Officially concluded reviews visible to you
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4">
                    {employeeData.recentFinalizedFeedback.length === 0 ? (
                      <p className="text-xs text-stone-400 py-6 text-center">
                        No finalized performance appraisals yet.
                      </p>
                    ) : (
                      employeeData.recentFinalizedFeedback.map((rf) => (
                        <div
                          key={rf.reviewId}
                          className="p-3.5 rounded-xl border border-stone-200 bg-stone-50/50 space-y-2.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-stone-900">{rf.cycleName}</span>
                            {rf.overallScore !== null && (
                              <Badge className="bg-emerald-600 text-white text-[11px]">
                                Official Score: {rf.overallScore.toFixed(2)} / {rf.ratingScaleMax}
                              </Badge>
                            )}
                          </div>

                          {rf.scoreExplanation && (
                            <p className="text-[11px] font-mono text-stone-600 bg-white p-2 rounded-md border border-stone-200">
                              {rf.scoreExplanation}
                            </p>
                          )}

                          {rf.managerSummary && (
                            <div className="text-xs text-stone-700">
                              <span className="font-semibold text-stone-900 block">
                                Manager Summary:
                              </span>
                              <p className="mt-0.5 line-clamp-2">{rf.managerSummary}</p>
                            </div>
                          )}

                          {rf.employeeVisibleFeedbacks.length > 0 && (
                            <div className="pt-2 border-t border-stone-200 space-y-1.5">
                              <span className="text-[11px] font-semibold text-stone-800 block">
                                Structured Feedback Notes:
                              </span>
                              {rf.employeeVisibleFeedbacks.map((fb, idx) => (
                                <div
                                  key={idx}
                                  className="p-2 rounded-md bg-white border border-stone-200 text-xs"
                                >
                                  <span className="font-bold text-stone-900 block">{fb.title}</span>
                                  <p className="text-stone-600 mt-0.5">{fb.content}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                {/* Active Development Plans */}
                <Card className="border border-stone-200 bg-white">
                  <CardHeader className="pb-3 border-b border-stone-100 flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <Compass className="h-4 w-4 text-purple-600" />
                        <span>Active Development Plans</span>
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Growth objectives and action items
                      </CardDescription>
                    </div>
                    {onNavigateToTab && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onNavigateToTab('DEVELOPMENT_PLANS')}
                        className="text-xs text-purple-700 hover:text-purple-800 hover:bg-purple-50"
                      >
                        <span>View Plans</span>
                        <ChevronRight className="h-3.5 w-3.5 ml-1" />
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    {employeeData.activeDevelopmentPlans.length === 0 ? (
                      <p className="text-xs text-stone-400 py-6 text-center">
                        No active development plan items.
                      </p>
                    ) : (
                      employeeData.activeDevelopmentPlans.map((dp) => (
                        <div
                          key={dp.id}
                          className="p-3 rounded-xl border border-stone-200 bg-white space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-stone-900">{dp.objective}</span>
                            <Badge variant="outline" className="text-[10px]">
                              {dp.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-stone-600">{dp.actionSteps}</p>
                          {dp.targetDate && (
                            <span className="text-[10px] text-stone-400 block">
                              Target Date: {new Date(dp.targetDate).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: MANAGER TEAM PERFORMANCE DASHBOARD                                 */}
          {/* ========================================================================= */}
          {activeDashboardTab === 'MANAGER' && managerData && (
            <div className="space-y-6">
              {/* Team Overview KPIs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                  title="Team Members"
                  value={String(managerData.teamGoalsSummary.totalTeamMembers)}
                  description="Supervised direct & indirect reports"
                  icon={<Users className="h-5 w-5 text-indigo-600" />}
                />
                <KPICard
                  title="Team Goal Progress"
                  value={`${managerData.teamGoalsSummary.averageProgressPercentage}%`}
                  description={`${managerData.teamGoalsSummary.completedGoals} completed of ${managerData.teamGoalsSummary.totalGoals} goals`}
                  icon={<TrendingUp className="h-5 w-5 text-emerald-600" />}
                />
                <KPICard
                  title="Pending Evaluations"
                  value={String(managerData.pendingActions.pendingManagerReviewsCount)}
                  description="Waiting for manager evaluation"
                  icon={<Clock className="h-5 w-5 text-amber-600" />}
                />
                <KPICard
                  title="Review Completion"
                  value={`${managerData.teamReviewStatus.completionPercentage}%`}
                  description={`${managerData.teamReviewStatus.finalized} finalized of ${managerData.teamReviewStatus.totalAssignedReviews} reviews`}
                  icon={<CheckCircle2 className="h-5 w-5 text-stone-900" />}
                />
              </div>

              {/* Urgent Action Inbox & Overdue Reviews */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 border border-stone-200 bg-white">
                  <CardHeader className="pb-3 border-b border-stone-100 flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-amber-600" />
                        <span>Actionable Review Inbox</span>
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Reviews requiring managerial attention or overdue submissions
                      </CardDescription>
                    </div>
                    {onNavigateToTab && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onNavigateToTab('MANAGER_REVIEWS')}
                        className="text-xs text-amber-700 hover:text-amber-800"
                      >
                        <span>Open Inbox</span>
                        <ChevronRight className="h-3.5 w-3.5 ml-1" />
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    {managerData.pendingActions.urgentReviews.length === 0 ? (
                      <p className="text-xs text-stone-400 py-8 text-center">
                        All team performance reviews are up to date!
                      </p>
                    ) : (
                      managerData.pendingActions.urgentReviews.map((ur) => (
                        <div
                          key={ur.reviewId}
                          className="flex items-center justify-between p-3 rounded-xl border border-stone-200 bg-white hover:bg-stone-50"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-stone-900">
                                {ur.employeeName}
                              </span>
                              <span className="text-[11px] text-stone-500">
                                ({ur.employeeCode})
                              </span>
                              <Badge
                                variant={ur.isOverdue ? 'danger' : 'outline'}
                                className="text-[10px]"
                              >
                                {ur.isOverdue ? 'OVERDUE' : ur.status}
                              </Badge>
                            </div>
                            <p className="text-[11px] text-stone-500">Cycle: {ur.cycleName}</p>
                          </div>

                          {onNavigateToTab && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onNavigateToTab('MANAGER_REVIEWS')}
                              className="text-xs h-7"
                            >
                              <span>Evaluate</span>
                              <ChevronRight className="h-3 w-3 ml-1" />
                            </Button>
                          )}
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                {/* Lagging Goals Attention Card */}
                <Card className="border border-stone-200 bg-white">
                  <CardHeader className="pb-3 border-b border-stone-100">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-rose-600" />
                      <span>Goals Needing Attention</span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Objectives below 50% with upcoming deadlines
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    {managerData.teamGoalsSummary.laggingGoals.length === 0 ? (
                      <p className="text-xs text-stone-400 py-8 text-center">
                        No lagging goals flagged in your team.
                      </p>
                    ) : (
                      managerData.teamGoalsSummary.laggingGoals.map((lg) => (
                        <div
                          key={lg.id}
                          className="p-2.5 rounded-lg border border-rose-100 bg-rose-50/40 space-y-1"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-rose-950 line-clamp-1">
                              {lg.title}
                            </span>
                            <span className="font-bold text-rose-700">
                              {lg.progressPercentage}%
                            </span>
                          </div>
                          <span className="text-[10px] text-rose-800/80 block">
                            Owner: {lg.employeeName} ({lg.employeeCode})
                          </span>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 3: HR/ADMIN GLOBAL DASHBOARD & MIS REPORTS                            */}
          {/* ========================================================================= */}
          {activeDashboardTab === 'HR_ADMIN' && hrAdminData && (
            <div className="space-y-6">
              {/* Global Organization KPIs & Export Button */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-stone-900">
                    Enterprise Performance & Calibration Overview
                  </h3>
                  <p className="text-xs text-stone-500">
                    Aggregated organization-wide performance cycle metrics
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleExportCsv}
                  disabled={isExporting}
                  className="bg-stone-900 hover:bg-stone-800 text-white text-xs flex items-center gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>{isExporting ? 'Generating CSV...' : 'Export Performance MIS (CSV)'}</span>
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                  title="Active Review Cycles"
                  value={String(hrAdminData.overview.totalActiveCycles)}
                  description="In-flight organizational cycles"
                  icon={<Calendar className="h-5 w-5 text-amber-600" />}
                />
                <KPICard
                  title="Enrolled Participants"
                  value={String(hrAdminData.overview.totalParticipants)}
                  description="Total eligible employees enrolled"
                  icon={<Users className="h-5 w-5 text-indigo-600" />}
                />
                <KPICard
                  title="Global Completion Rate"
                  value={`${hrAdminData.overview.overallCompletionRate}%`}
                  description={`${hrAdminData.overview.totalCompletedReviews} reviews officially finalized`}
                  icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                />
                <KPICard
                  title="Overdue Reviews"
                  value={String(hrAdminData.overview.totalOverdueReviews)}
                  description="Submissions past stage deadlines"
                  icon={<AlertCircle className="h-5 w-5 text-rose-600" />}
                />
              </div>

              {/* Department & Branch Completion Breakdowns */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Department Breakdown */}
                <Card className="border border-stone-200 bg-white">
                  <CardHeader className="pb-3 border-b border-stone-100">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <Building className="h-4 w-4 text-stone-800" />
                      <span>Completion by Department</span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Review progress across functional business units
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    {hrAdminData.departmentBreakdown.length === 0 ? (
                      <p className="text-xs text-stone-400 py-6 text-center">
                        No department participant data available.
                      </p>
                    ) : (
                      hrAdminData.departmentBreakdown.map((dept) => (
                        <div key={dept.departmentId} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-stone-800">
                              {dept.departmentName}
                            </span>
                            <span className="text-[11px] font-bold text-stone-700">
                              {dept.completedCount} / {dept.totalParticipants} (
                              {dept.completionRate}%)
                            </span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-stone-100 overflow-hidden">
                            <div
                              className="h-full bg-amber-600 rounded-full transition-all"
                              style={{ width: `${dept.completionRate}%` }}
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                {/* Branch Breakdown */}
                <Card className="border border-stone-200 bg-white">
                  <CardHeader className="pb-3 border-b border-stone-100">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-stone-800" />
                      <span>Completion by Branch Location</span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Physical branch and office progress distribution
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    {hrAdminData.branchBreakdown.length === 0 ? (
                      <p className="text-xs text-stone-400 py-6 text-center">
                        No branch participant data available.
                      </p>
                    ) : (
                      hrAdminData.branchBreakdown.map((br) => (
                        <div key={br.branchId} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-stone-800">{br.branchName}</span>
                            <span className="text-[11px] font-bold text-stone-700">
                              {br.completedCount} / {br.totalParticipants} ({br.completionRate}%)
                            </span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-stone-100 overflow-hidden">
                            <div
                              className="h-full bg-stone-700 rounded-full transition-all"
                              style={{ width: `${br.completionRate}%` }}
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Rating Distribution & Differential Privacy Protection */}
              <Card className="border border-stone-200 bg-white">
                <CardHeader className="pb-3 border-b border-stone-100">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <Award className="h-4 w-4 text-amber-600" />
                        <span>Rating Distribution & Calibration Curves</span>
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Cycle: {hrAdminData.ratingDistribution.cycleName || 'Current Active Cycle'}
                      </CardDescription>
                    </div>

                    {hrAdminData.ratingDistribution.averageScore !== null && (
                      <Badge className="bg-stone-900 text-white text-xs">
                        Cohort Average: {hrAdminData.ratingDistribution.averageScore} / 5.0
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  {hrAdminData.ratingDistribution.isSuppressed ? (
                    <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200 text-center space-y-2">
                      <ShieldAlert className="h-6 w-6 text-amber-700 mx-auto" />
                      <h4 className="text-xs font-bold text-amber-900">
                        Differential Privacy Protection Active
                      </h4>
                      <p className="text-xs text-amber-800 max-w-md mx-auto leading-relaxed">
                        {hrAdminData.ratingDistribution.suppressionReason ||
                          'Rating distributions are suppressed for small employee cohorts (< 3 participants) to prevent deducing individual employee scores.'}
                      </p>
                    </div>
                  ) : hrAdminData.ratingDistribution.buckets.length === 0 ? (
                    <p className="text-xs text-stone-400 py-6 text-center">
                      No numerical rating distribution available.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-2">
                      {hrAdminData.ratingDistribution.buckets.map((b, idx) => (
                        <div
                          key={idx}
                          className="p-4 rounded-xl border border-stone-200 bg-stone-50/50 text-center space-y-1"
                        >
                          <span className="text-[11px] font-semibold text-stone-600 block">
                            {b.label}
                          </span>
                          <span className="text-2xl font-black text-stone-900 block">
                            {b.count}
                          </span>
                          <span className="text-[10px] text-stone-400 block">
                            {(
                              (b.count / (hrAdminData.ratingDistribution.totalEvaluated || 1)) *
                              100
                            ).toFixed(0)}
                            % of cohort
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="text-[10px] text-stone-400 italic pt-4">
                    Enterprise Notice: Rating curves reflect approved policy formulas. Scores do not
                    automate payroll, bonus, disciplinary, promotion, or termination actions.
                  </p>
                </CardContent>
              </Card>

              {/* Cycle Exceptions & Consequential Actions Audit Log */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="border border-stone-200 bg-white">
                  <CardHeader className="pb-3 border-b border-stone-100">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-indigo-600" />
                      <span>Cycle Exceptions</span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Authorized operational modifications
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between p-2 rounded-lg bg-stone-50 border border-stone-100">
                      <span className="text-xs font-semibold text-stone-700">
                        Exempted Participants
                      </span>
                      <Badge variant="outline" className="text-xs font-bold">
                        {hrAdminData.cycleExceptions.exemptedCount}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-stone-50 border border-stone-100">
                      <span className="text-xs font-semibold text-stone-700">
                        Manager Reassignments
                      </span>
                      <Badge variant="outline" className="text-xs font-bold">
                        {hrAdminData.cycleExceptions.managerReassignedCount}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-stone-50 border border-stone-100">
                      <span className="text-xs font-semibold text-stone-700">
                        Reopened Assessments
                      </span>
                      <Badge variant="outline" className="text-xs font-bold">
                        {hrAdminData.cycleExceptions.reopenedCount}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                <Card className="lg:col-span-2 border border-stone-200 bg-white">
                  <CardHeader className="pb-3 border-b border-stone-100">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <FileText className="h-4 w-4 text-stone-700" />
                      <span>Consequential Actions Audit Timeline</span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Immutable trail of cycle adjustments and status changes
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    {hrAdminData.cycleExceptions.recentAuditTimeline.length === 0 ? (
                      <p className="text-xs text-stone-400 py-6 text-center">
                        No audit events recorded yet.
                      </p>
                    ) : (
                      hrAdminData.cycleExceptions.recentAuditTimeline.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-start justify-between p-2.5 rounded-lg border border-stone-100 bg-stone-50/50"
                        >
                          <div className="space-y-0.5">
                            <span className="text-xs font-bold text-stone-900 block">
                              {item.action} — {item.cycleName}
                            </span>
                            {item.changeReason && (
                              <p className="text-[11px] text-stone-600">
                                Reason: {item.changeReason}
                              </p>
                            )}
                          </div>
                          <span className="text-[10px] text-stone-400 shrink-0">
                            {new Date(item.timestamp).toLocaleString()}
                          </span>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
