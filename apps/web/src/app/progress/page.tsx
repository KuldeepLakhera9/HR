'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AppShell } from '../../layouts/AppShell';
import { useAuth } from '../../context/AuthContext';
import { useRole } from '../../context/RoleContext';
import { performanceApi } from '../../lib/api-client';
import {
  PerformanceGoalDto,
  PerformanceGoalStats,
  CreateGoalDto,
  GoalStatus,
  GoalCategory,
  GoalMeasurementType,
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
  Dialog,
} from '@hrms/ui';
import { ReviewCyclesView } from '../../components/performance/ReviewCyclesView';
import {
  TrendingUp,
  Target,
  Award,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  RefreshCw,
  Search,
  Filter,
  CheckSquare,
  FileText,
  UploadCloud,
  ChevronRight,
  ChevronLeft,
  X,
  History,
  Paperclip,
  Trash2,
  Edit,
  Send,
  Eye,
  Sliders,
  Sparkles,
  Calendar,
  Layers,
} from 'lucide-react';

export default function ProgressGoalsPage() {
  const { user } = useAuth();
  const { role } = useRole();

  // Section Switcher (HR & Admin can toggle between Goals and Cycle Administration)
  const [activeSection, setActiveSection] = useState<'GOALS' | 'CYCLES'>('GOALS');

  // Navigation Scope Tabs: 'MY_GOALS' | 'TEAM_GOALS' | 'ORG_GOALS'
  const [activeTab, setActiveTab] = useState<'MY_GOALS' | 'TEAM_GOALS' | 'ORG_GOALS'>('MY_GOALS');
  const [viewMode, setViewMode] = useState<'GRID' | 'TABLE'>('GRID');

  // Query filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  // Data state
  const [goals, setGoals] = useState<PerformanceGoalDto[]>([]);
  const [stats, setStats] = useState<PerformanceGoalStats | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Notifications
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<PerformanceGoalDto | null>(null);
  const [checkInGoal, setCheckInGoal] = useState<PerformanceGoalDto | null>(null);
  const [decisionGoal, setDecisionGoal] = useState<PerformanceGoalDto | null>(null);
  const [detailGoal, setDetailGoal] = useState<PerformanceGoalDto | null>(null);

  // Form states for Goal Creation / Edit
  const [goalForm, setGoalForm] = useState<CreateGoalDto>({
    title: '',
    description: '',
    businessRationale: '',
    alignmentKey: '',
    category: 'QUANTITATIVE',
    measurementType: 'NUMERIC',
    unit: '%',
    baselineValue: 0,
    targetValue: 100,
    weight: 25,
    startDate: '',
    dueDate: '',
    submitForApproval: false,
  });

  // Form state for Check-in
  const [checkInForm, setCheckInForm] = useState({
    currentValue: 0,
    progressPercentage: 0,
    note: '',
    file: null as File | null,
  });

  // Form state for Approval / Rejection
  const [decisionReason, setDecisionReason] = useState('');

  const isManagerOrAdmin = role === 'MANAGER' || role === 'ADMIN' || role === 'HR';
  const isHrOrAdmin = role === 'ADMIN' || role === 'HR';

  const fetchGoalsData = useCallback(async () => {
    setIsLoading(true);
    setFeedbackError(null);
    try {
      const params: any = {
        page: currentPage,
        limit: pageSize,
      };

      if (searchQuery.trim()) params.search = searchQuery.trim();
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (categoryFilter !== 'ALL') params.category = categoryFilter;

      // Tab scoping
      if (activeTab === 'MY_GOALS') {
        // Leave employeeId to default server self-resolution
      } else if (activeTab === 'TEAM_GOALS') {
        // Handled by manager default team scope
      }

      const [goalsRes, statsRes] = await Promise.all([
        performanceApi.getGoals(params),
        performanceApi.getGoalStats(),
      ]);

      setGoals(goalsRes?.items || []);
      setTotalCount(goalsRes?.meta?.total || 0);
      setTotalPages(goalsRes?.meta?.totalPages || 1);
      setStats(statsRes);
    } catch (err: any) {
      setFeedbackError(err.message || 'Failed to load performance goals');
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, currentPage, searchQuery, statusFilter, categoryFilter]);

  useEffect(() => {
    fetchGoalsData();
  }, [fetchGoalsData]);

  // Handle Create / Edit Goal
  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedbackError(null);

    try {
      if (editingGoal) {
        await performanceApi.updateGoal(editingGoal.id, {
          title: goalForm.title,
          description: goalForm.description,
          businessRationale: goalForm.businessRationale,
          alignmentKey: goalForm.alignmentKey,
          category: goalForm.category,
          measurementType: goalForm.measurementType,
          unit: goalForm.unit,
          baselineValue: Number(goalForm.baselineValue),
          targetValue: Number(goalForm.targetValue),
          weight: Number(goalForm.weight),
          startDate: goalForm.startDate || undefined,
          dueDate: goalForm.dueDate || undefined,
        });
        setFeedbackSuccess('Goal updated successfully');
      } else {
        await performanceApi.createGoal({
          ...goalForm,
          weight: Number(goalForm.weight),
          baselineValue: Number(goalForm.baselineValue),
          targetValue: Number(goalForm.targetValue),
          startDate: goalForm.startDate || undefined,
          dueDate: goalForm.dueDate || undefined,
        });
        setFeedbackSuccess('Goal created successfully');
      }

      setIsCreateModalOpen(false);
      setEditingGoal(null);
      resetGoalForm();
      fetchGoalsData();
    } catch (err: any) {
      setFeedbackError(err.message || 'Failed to save goal');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Progress Check-in
  const handleSaveCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkInGoal) return;
    setIsSubmitting(true);
    setFeedbackError(null);

    try {
      await performanceApi.updateProgress(
        checkInGoal.id,
        {
          currentValue: Number(checkInForm.currentValue),
          progressPercentage: Number(checkInForm.progressPercentage),
          note: checkInForm.note,
        },
        checkInForm.file || undefined,
      );

      setFeedbackSuccess('Progress check-in recorded successfully with supporting evidence');
      setCheckInGoal(null);
      setCheckInForm({ currentValue: 0, progressPercentage: 0, note: '', file: null });
      fetchGoalsData();
    } catch (err: any) {
      setFeedbackError(err.message || 'Failed to record check-in progress');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Submit for Approval
  const handleSubmitGoal = async (goalId: string) => {
    setIsSubmitting(true);
    setFeedbackError(null);
    try {
      await performanceApi.submitGoal(goalId);
      setFeedbackSuccess('Goal submitted for manager review');
      fetchGoalsData();
    } catch (err: any) {
      setFeedbackError(err.message || 'Failed to submit goal');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Goal Approval / Rejection
  const handleDecideGoal = async (approved: boolean) => {
    if (!decisionGoal) return;
    setIsSubmitting(true);
    setFeedbackError(null);
    try {
      await performanceApi.approveGoal(decisionGoal.id, {
        approved,
        rejectionReason: approved ? undefined : decisionReason,
      });

      setFeedbackSuccess(
        approved ? 'Goal approved successfully' : 'Goal returned with revision notes',
      );
      setDecisionGoal(null);
      setDecisionReason('');
      fetchGoalsData();
    } catch (err: any) {
      setFeedbackError(err.message || 'Failed to complete goal review');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Delete Draft Goal
  const handleDeleteGoal = async (goalId: string) => {
    if (!confirm('Are you sure you want to delete this draft goal?')) return;
    setIsSubmitting(true);
    setFeedbackError(null);
    try {
      await performanceApi.deleteGoal(goalId);
      setFeedbackSuccess('Draft goal deleted');
      fetchGoalsData();
    } catch (err: any) {
      setFeedbackError(err.message || 'Failed to delete goal');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetGoalForm = () => {
    setGoalForm({
      title: '',
      description: '',
      businessRationale: '',
      alignmentKey: '',
      category: 'QUANTITATIVE',
      measurementType: 'NUMERIC',
      unit: '%',
      baselineValue: 0,
      targetValue: 100,
      weight: 25,
      startDate: '',
      dueDate: '',
      submitForApproval: false,
    });
  };

  const openEditModal = (goal: PerformanceGoalDto) => {
    setEditingGoal(goal);
    setGoalForm({
      title: goal.title,
      description: goal.description,
      businessRationale: goal.businessRationale || '',
      alignmentKey: goal.alignmentKey || '',
      category: goal.category,
      measurementType: goal.measurementType,
      unit: goal.unit || '',
      baselineValue: goal.baselineValue ?? 0,
      targetValue: goal.targetValue ?? 100,
      weight: goal.weight,
      startDate: goal.startDate ? goal.startDate.split('T')[0] : '',
      dueDate: goal.dueDate ? goal.dueDate.split('T')[0] : '',
      submitForApproval: false,
    });
    setIsCreateModalOpen(true);
  };

  const openCheckInModal = (goal: PerformanceGoalDto) => {
    setCheckInGoal(goal);
    setCheckInForm({
      currentValue: goal.currentValue ?? 0,
      progressPercentage: goal.progressPercentage,
      note: '',
      file: null,
    });
  };

  const getStatusBadgeVariant = (status: GoalStatus) => {
    switch (status) {
      case 'APPROVED':
      case 'COMPLETED':
        return 'success';
      case 'IN_PROGRESS':
      case 'ON_TRACK':
        return 'info';
      case 'PENDING_APPROVAL':
        return 'warning';
      case 'NEEDS_ATTENTION':
      case 'AT_RISK':
        return 'danger';
      case 'DRAFT':
      default:
        return 'default';
    }
  };

  return (
    <AppShell>
      <div className="space-y-6 pb-12">
        {/* Top Header & Action */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-bold text-stone-900 tracking-tight">
                Enterprise Performance Management & OKRs
              </h1>
              <Badge variant="primary" size="sm">
                Phase 9
              </Badge>
            </div>
            <p className="text-xs md:text-sm text-stone-500 mt-1">
              Set verifiable goals, submit progress check-ins, attach evidence, and manage strategic
              alignment.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchGoalsData}
              disabled={isLoading}
              className="gap-2 border-stone-200 text-stone-700 hover:bg-stone-50"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Sync
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                resetGoalForm();
                setEditingGoal(null);
                setIsCreateModalOpen(true);
              }}
              className="gap-2 bg-amber-600 hover:bg-amber-700 text-white font-medium shadow-xs"
            >
              <Plus className="h-4 w-4" />
              New Goal
            </Button>
          </div>
        </div>

        {/* Global Feedback Banners */}
        {feedbackSuccess && (
          <div className="flex items-center justify-between p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm animate-fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>{feedbackSuccess}</span>
            </div>
            <button
              onClick={() => setFeedbackSuccess(null)}
              className="text-emerald-600 hover:text-emerald-900"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {feedbackError && (
          <div className="flex items-center justify-between p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-sm animate-fade-in">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{feedbackError}</span>
            </div>
            <button
              onClick={() => setFeedbackError(null)}
              className="text-rose-600 hover:text-rose-900"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Section Navigation Tabs for HR & Admin */}
        {isHrOrAdmin && (
          <div className="flex border-b border-stone-200 gap-6 pt-1">
            <button
              onClick={() => setActiveSection('GOALS')}
              className={`pb-2.5 text-sm font-semibold transition-colors border-b-2 flex items-center gap-2 ${
                activeSection === 'GOALS'
                  ? 'border-amber-600 text-amber-900'
                  : 'border-transparent text-stone-500 hover:text-stone-800'
              }`}
            >
              <Target className="h-4 w-4" />
              Goals & OKRs Management
            </button>
            <button
              onClick={() => setActiveSection('CYCLES')}
              className={`pb-2.5 text-sm font-semibold transition-colors border-b-2 flex items-center gap-2 ${
                activeSection === 'CYCLES'
                  ? 'border-amber-600 text-amber-900'
                  : 'border-transparent text-stone-500 hover:text-stone-800'
              }`}
            >
              <Calendar className="h-4 w-4" />
              Review Cycles & Administration
            </button>
          </div>
        )}

        {activeSection === 'CYCLES' && isHrOrAdmin ? (
          <ReviewCyclesView
            onNotify={(msg, type) =>
              type === 'success' ? setFeedbackSuccess(msg) : setFeedbackError(msg)
            }
          />
        ) : (
          <>
            {/* KPI Overview Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KPICard
                title="Total Active Goals"
                value={stats ? `${stats.totalGoals}` : '...'}
                description="Across current cycles"
                icon={<Target className="h-5 w-5 text-amber-700" />}
              />
              <KPICard
                title="Average Progress"
                value={stats ? `${stats.averageProgress}%` : '...'}
                description="Deterministic server-weighted"
                icon={<TrendingUp className="h-5 w-5 text-emerald-700" />}
              />
              <KPICard
                title="Goal Allocation Weight"
                value={stats ? `${stats.totalWeight}%` : '...'}
                description="Policy max: 100% total"
                icon={<Layers className="h-5 w-5 text-blue-700" />}
              />
              <KPICard
                title="Pending Approvals"
                value={stats ? `${stats.pendingApproval}` : '...'}
                description="Awaiting reviewer decision"
                icon={<Clock className="h-5 w-5 text-amber-600" />}
              />
            </div>

            {/* Tabs & Controls Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200 pb-3">
              <div className="flex items-center gap-2 overflow-x-auto">
                <button
                  onClick={() => {
                    setActiveTab('MY_GOALS');
                    setCurrentPage(1);
                  }}
                  className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === 'MY_GOALS'
                      ? 'bg-amber-100/80 text-amber-900 font-semibold'
                      : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
                  }`}
                >
                  My Goals
                </button>

                {isManagerOrAdmin && (
                  <button
                    onClick={() => {
                      setActiveTab('TEAM_GOALS');
                      setCurrentPage(1);
                    }}
                    className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      activeTab === 'TEAM_GOALS'
                        ? 'bg-amber-100/80 text-amber-900 font-semibold'
                        : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
                    }`}
                  >
                    Team Goals & Approvals
                  </button>
                )}

                {isHrOrAdmin && (
                  <button
                    onClick={() => {
                      setActiveTab('ORG_GOALS');
                      setCurrentPage(1);
                    }}
                    className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      activeTab === 'ORG_GOALS'
                        ? 'bg-amber-100/80 text-amber-900 font-semibold'
                        : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
                    }`}
                  >
                    All Org Goals
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-stone-400" />
                  <input
                    type="text"
                    placeholder="Search goals..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="pl-8 pr-3 py-1.5 text-xs md:text-sm rounded-lg border border-stone-200 bg-white text-stone-900 focus:outline-none focus:ring-1 focus:ring-amber-500 w-44 md:w-56"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="text-xs md:text-sm py-1.5 px-2.5 rounded-lg border border-stone-200 bg-white text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="DRAFT">Draft</option>
                  <option value="PENDING_APPROVAL">Pending Approval</option>
                  <option value="APPROVED">Approved</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>

                <select
                  value={categoryFilter}
                  onChange={(e) => {
                    setCategoryFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="text-xs md:text-sm py-1.5 px-2.5 rounded-lg border border-stone-200 bg-white text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500 hidden sm:block"
                >
                  <option value="ALL">All Categories</option>
                  <option value="QUANTITATIVE">Quantitative</option>
                  <option value="QUALITATIVE">Qualitative</option>
                  <option value="DEVELOPMENT">Development</option>
                  <option value="TEAM">Team Goal</option>
                </select>

                <div className="flex rounded-lg border border-stone-200 bg-stone-50 p-0.5">
                  <button
                    onClick={() => setViewMode('GRID')}
                    className={`p-1.5 rounded-md ${viewMode === 'GRID' ? 'bg-white shadow-2xs text-amber-700' : 'text-stone-500'}`}
                    title="Grid View"
                  >
                    <Layers className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('TABLE')}
                    className={`p-1.5 rounded-md ${viewMode === 'TABLE' ? 'bg-white shadow-2xs text-amber-700' : 'text-stone-500'}`}
                    title="Table View"
                  >
                    <Sliders className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Goals Presentation: Grid or Table */}
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className="h-48 rounded-xl bg-stone-100/80 animate-pulse border border-stone-200"
                  />
                ))}
              </div>
            ) : goals.length === 0 ? (
              <Card className="text-center py-12 border-dashed border-stone-200">
                <CardContent className="space-y-3">
                  <Target className="h-10 w-10 text-stone-400 mx-auto" />
                  <h3 className="text-base font-semibold text-stone-800">
                    No performance goals found
                  </h3>
                  <p className="text-xs md:text-sm text-stone-500 max-w-sm mx-auto">
                    No goals match your current filter criteria or review scope. Get started by
                    defining key results.
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      resetGoalForm();
                      setIsCreateModalOpen(true);
                    }}
                    className="mt-2"
                  >
                    Create First Goal
                  </Button>
                </CardContent>
              </Card>
            ) : viewMode === 'GRID' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {goals.map((goal) => {
                  const isOwner = user?.employeeCode === goal.employee?.employeeCode;
                  const isPending = goal.status === 'PENDING_APPROVAL';

                  return (
                    <div
                      key={goal.id}
                      className="rounded-xl border border-stone-200 bg-white p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant={getStatusBadgeVariant(goal.status)} size="sm">
                              {goal.status.replace(/_/g, ' ')}
                            </Badge>
                            <Badge variant="outline" size="sm">
                              {goal.category}
                            </Badge>
                            <span className="text-[11px] font-semibold text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded">
                              {goal.weight}% Weight
                            </span>
                          </div>

                          {goal.cycle && (
                            <span className="text-[11px] font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                              {goal.cycle.name}
                            </span>
                          )}
                        </div>

                        <div>
                          <h3 className="text-base font-semibold text-stone-900 line-clamp-1">
                            {goal.title}
                          </h3>
                          <p className="text-xs text-stone-600 line-clamp-2 mt-1">
                            {goal.description}
                          </p>
                        </div>

                        {/* Progress Bar & Value Metrics */}
                        <div className="space-y-1.5 pt-1">
                          <div className="flex items-center justify-between text-xs font-medium text-stone-700">
                            <span>Progress: {goal.progressPercentage}%</span>
                            <span>
                              {goal.currentValue ?? 0} / {goal.targetValue ?? 100} {goal.unit || ''}
                            </span>
                          </div>
                          <div className="w-full bg-stone-100 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-amber-600 h-2 rounded-full transition-all duration-300"
                              style={{
                                width: `${Math.min(100, Math.max(0, goal.progressPercentage))}%`,
                              }}
                            />
                          </div>
                        </div>

                        {/* Meta Info */}
                        <div className="flex items-center justify-between text-[11px] text-stone-500 pt-1 border-t border-stone-100">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5 text-stone-400" />
                            <span>
                              Due:{' '}
                              {goal.dueDate
                                ? new Date(goal.dueDate).toLocaleDateString()
                                : 'No date'}
                            </span>
                          </div>
                          {goal.employee && (
                            <span className="font-medium text-stone-700 truncate max-w-[130px]">
                              {goal.employee.displayName}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center justify-between gap-2 pt-4 border-t border-stone-100 mt-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDetailGoal(goal)}
                          className="text-xs h-8 border-stone-200 hover:bg-stone-50 gap-1 text-stone-700"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Details
                        </Button>

                        <div className="flex items-center gap-1.5">
                          {goal.status === 'DRAFT' && isOwner && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openEditModal(goal)}
                                className="text-xs h-8 text-stone-700"
                                title="Edit Goal"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => handleSubmitGoal(goal.id)}
                                className="text-xs h-8 bg-amber-600 hover:bg-amber-700 text-white gap-1"
                              >
                                <Send className="h-3.5 w-3.5" />
                                Submit
                              </Button>
                            </>
                          )}

                          {isPending && isManagerOrAdmin && !isOwner && (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => setDecisionGoal(goal)}
                              className="text-xs h-8 bg-amber-600 hover:bg-amber-700 text-white gap-1 font-medium"
                            >
                              <CheckSquare className="h-3.5 w-3.5" />
                              Decide
                            </Button>
                          )}

                          {(goal.status === 'APPROVED' ||
                            goal.status === 'IN_PROGRESS' ||
                            goal.status === 'ON_TRACK') && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openCheckInModal(goal)}
                              className="text-xs h-8 border-amber-300 bg-amber-50/50 text-amber-900 hover:bg-amber-100 gap-1 font-medium"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 text-amber-700" />
                              Check-in
                            </Button>
                          )}

                          {goal.status === 'DRAFT' && (
                            <button
                              onClick={() => handleDeleteGoal(goal.id)}
                              className="p-1.5 text-stone-400 hover:text-rose-600 rounded-md transition-colors"
                              title="Delete Draft"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Table View */
              <div className="rounded-xl border border-stone-200 bg-white overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs md:text-sm">
                    <thead className="bg-stone-50 border-b border-stone-200 text-stone-600 font-medium">
                      <tr>
                        <th className="py-3 px-4">Goal Title</th>
                        <th className="py-3 px-4">Owner</th>
                        <th className="py-3 px-4">Category</th>
                        <th className="py-3 px-4">Weight</th>
                        <th className="py-3 px-4">Progress</th>
                        <th className="py-3 px-4">Due Date</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 text-stone-800">
                      {goals.map((goal) => (
                        <tr key={goal.id} className="hover:bg-stone-50/70 transition-colors">
                          <td className="py-3 px-4 font-medium text-stone-900 max-w-[200px] truncate">
                            {goal.title}
                          </td>
                          <td className="py-3 px-4 text-stone-600">
                            {goal.employee?.displayName || '—'}
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant="outline" size="sm">
                              {goal.category}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 font-semibold text-stone-700">{goal.weight}%</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2 min-w-[120px]">
                              <div className="w-16 bg-stone-100 rounded-full h-1.5">
                                <div
                                  className="bg-amber-600 h-1.5 rounded-full"
                                  style={{
                                    width: `${Math.min(100, Math.max(0, goal.progressPercentage))}%`,
                                  }}
                                />
                              </div>
                              <span className="text-xs font-medium text-stone-700">
                                {goal.progressPercentage}%
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-stone-500 whitespace-nowrap">
                            {goal.dueDate ? new Date(goal.dueDate).toLocaleDateString() : '—'}
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant={getStatusBadgeVariant(goal.status)} size="sm">
                              {goal.status.replace(/_/g, ' ')}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setDetailGoal(goal)}
                                className="text-xs h-7 px-2"
                              >
                                Details
                              </Button>
                              {(goal.status === 'APPROVED' || goal.status === 'IN_PROGRESS') && (
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={() => openCheckInModal(goal)}
                                  className="text-xs h-7 px-2 bg-amber-600 hover:bg-amber-700 text-white"
                                >
                                  Check-in
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Pagination Bar */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t border-stone-200">
                <span className="text-xs text-stone-500">
                  Showing page {currentPage} of {totalPages} ({totalCount} total goals)
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="gap-1 text-xs"
                  >
                    <ChevronLeft className="h-4 w-4" /> Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="gap-1 text-xs"
                  >
                    Next <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* MODAL 1: Create / Edit Goal Modal                             */}
            {/* ------------------------------------------------------------- */}
            <Dialog
              isOpen={isCreateModalOpen}
              onClose={() => {
                setIsCreateModalOpen(false);
                setEditingGoal(null);
              }}
              title={editingGoal ? 'Edit Performance Goal' : 'Create New Performance Goal'}
              description="Configure measurable objectives, KPIs, weight allocations and timeline targets."
              maxWidth="lg"
            >
              <form onSubmit={handleSaveGoal} className="space-y-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Goal Title <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={goalForm.title}
                    onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })}
                    placeholder="e.g. Next.js 14 App Shell Migration & Design System"
                    className="w-full text-sm px-3 py-2 rounded-lg border border-stone-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Description & Success Criteria <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={goalForm.description}
                    onChange={(e) => setGoalForm({ ...goalForm, description: e.target.value })}
                    placeholder="Specify concrete scope, deliverables, and verifiable acceptance criteria..."
                    className="w-full text-sm px-3 py-2 rounded-lg border border-stone-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Category
                    </label>
                    <select
                      value={goalForm.category}
                      onChange={(e) =>
                        setGoalForm({ ...goalForm, category: e.target.value as GoalCategory })
                      }
                      className="w-full text-sm px-3 py-2 rounded-lg border border-stone-200 bg-white"
                    >
                      <option value="QUANTITATIVE">Quantitative (Numeric / Metric)</option>
                      <option value="QUALITATIVE">Qualitative (Rubric Based)</option>
                      <option value="DEVELOPMENT">Professional Development</option>
                      <option value="TEAM">Strategic Team Objective</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Measurement Type
                    </label>
                    <select
                      value={goalForm.measurementType}
                      onChange={(e) =>
                        setGoalForm({
                          ...goalForm,
                          measurementType: e.target.value as GoalMeasurementType,
                        })
                      }
                      className="w-full text-sm px-3 py-2 rounded-lg border border-stone-200 bg-white"
                    >
                      <option value="NUMERIC">Numeric Value</option>
                      <option value="PERCENTAGE">Percentage (%)</option>
                      <option value="CURRENCY">Currency (INR)</option>
                      <option value="BOOLEAN">Milestone (Yes/No)</option>
                      <option value="QUALITATIVE">Qualitative Narrative</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Measurement Unit
                    </label>
                    <input
                      type="text"
                      value={goalForm.unit || ''}
                      onChange={(e) => setGoalForm({ ...goalForm, unit: e.target.value })}
                      placeholder="e.g. %, tasks, INR"
                      className="w-full text-sm px-3 py-2 rounded-lg border border-stone-200"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Baseline Value
                    </label>
                    <input
                      type="number"
                      value={goalForm.baselineValue ?? 0}
                      onChange={(e) =>
                        setGoalForm({ ...goalForm, baselineValue: Number(e.target.value) })
                      }
                      className="w-full text-sm px-3 py-2 rounded-lg border border-stone-200"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Target Value
                    </label>
                    <input
                      type="number"
                      value={goalForm.targetValue ?? 100}
                      onChange={(e) =>
                        setGoalForm({ ...goalForm, targetValue: Number(e.target.value) })
                      }
                      className="w-full text-sm px-3 py-2 rounded-lg border border-stone-200"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Weight (% of goal set) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      required
                      value={goalForm.weight}
                      onChange={(e) => setGoalForm({ ...goalForm, weight: Number(e.target.value) })}
                      className="w-full text-sm px-3 py-2 rounded-lg border border-stone-200"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={goalForm.startDate || ''}
                      onChange={(e) => setGoalForm({ ...goalForm, startDate: e.target.value })}
                      className="w-full text-sm px-3 py-2 rounded-lg border border-stone-200"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Due Date
                    </label>
                    <input
                      type="date"
                      value={goalForm.dueDate || ''}
                      onChange={(e) => setGoalForm({ ...goalForm, dueDate: e.target.value })}
                      className="w-full text-sm px-3 py-2 rounded-lg border border-stone-200"
                    />
                  </div>
                </div>

                {!editingGoal && (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="submitImmediately"
                      checked={goalForm.submitForApproval || false}
                      onChange={(e) =>
                        setGoalForm({ ...goalForm, submitForApproval: e.target.checked })
                      }
                      className="rounded border-stone-300 text-amber-600 focus:ring-amber-500"
                    />
                    <label
                      htmlFor="submitImmediately"
                      className="text-xs text-stone-700 select-none"
                    >
                      Submit immediately for manager approval upon creation
                    </label>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-4 border-t border-stone-100">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsCreateModalOpen(false);
                      setEditingGoal(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={isSubmitting}
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    {isSubmitting ? 'Saving...' : editingGoal ? 'Update Goal' : 'Create Goal'}
                  </Button>
                </div>
              </form>
            </Dialog>

            {/* ------------------------------------------------------------- */}
            {/* MODAL 2: Check-in Progress & Evidence Vault Modal             */}
            {/* ------------------------------------------------------------- */}
            {checkInGoal && (
              <Dialog
                isOpen={!!checkInGoal}
                onClose={() => setCheckInGoal(null)}
                title={`Check-in: ${checkInGoal.title}`}
                description="Record incremental progress, update metrics, and upload verifiable completion evidence."
                maxWidth="md"
              >
                <form onSubmit={handleSaveCheckIn} className="space-y-4 pt-2">
                  <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 text-xs space-y-1">
                    <div className="flex justify-between text-stone-600">
                      <span>
                        Current Progress: <strong>{checkInGoal.progressPercentage}%</strong>
                      </span>
                      <span>
                        Target:{' '}
                        <strong>
                          {checkInGoal.targetValue ?? 100} {checkInGoal.unit || ''}
                        </strong>
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      New Current Value ({checkInGoal.unit || 'units'})
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={checkInForm.currentValue}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        const baseline = checkInGoal.baselineValue ?? 0;
                        const target = checkInGoal.targetValue ?? 100;
                        const pct =
                          target !== baseline
                            ? Math.min(
                                100,
                                Math.max(
                                  0,
                                  Math.round(((val - baseline) / (target - baseline)) * 100),
                                ),
                              )
                            : 0;
                        setCheckInForm({
                          ...checkInForm,
                          currentValue: val,
                          progressPercentage: pct,
                        });
                      }}
                      className="w-full text-sm px-3 py-2 rounded-lg border border-stone-200"
                    />
                    <span className="text-[11px] text-stone-500 mt-1 block">
                      Calculated Progress: <strong>{checkInForm.progressPercentage}%</strong>
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Progress Percentage Override (Optional)
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={checkInForm.progressPercentage}
                      onChange={(e) =>
                        setCheckInForm({
                          ...checkInForm,
                          progressPercentage: Number(e.target.value),
                        })
                      }
                      className="w-full accent-amber-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Check-in Notes & Achievements <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      required
                      rows={3}
                      value={checkInForm.note}
                      onChange={(e) => setCheckInForm({ ...checkInForm, note: e.target.value })}
                      placeholder="Summarize progress made, key milestones reached, or impediments encountered..."
                      className="w-full text-sm px-3 py-2 rounded-lg border border-stone-200"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Supporting Evidence Document (Vault Upload, Max 10MB)
                    </label>
                    <input
                      type="file"
                      onChange={(e) =>
                        setCheckInForm({ ...checkInForm, file: e.target.files?.[0] || null })
                      }
                      className="w-full text-xs text-stone-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-amber-50 file:text-amber-800 hover:file:bg-amber-100"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-stone-100">
                    <Button type="button" variant="outline" onClick={() => setCheckInGoal(null)}>
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={isSubmitting}
                      className="bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      {isSubmitting ? 'Recording...' : 'Save Check-in'}
                    </Button>
                  </div>
                </form>
              </Dialog>
            )}

            {/* ------------------------------------------------------------- */}
            {/* MODAL 3: Manager Decision (Approve / Reject) Modal            */}
            {/* ------------------------------------------------------------- */}
            {decisionGoal && (
              <Dialog
                isOpen={!!decisionGoal}
                onClose={() => setDecisionGoal(null)}
                title="Review Goal Submission"
                description="Assess goal clarity, weight alignment, and business targets proposed by employee."
                maxWidth="md"
              >
                <div className="space-y-4 pt-2">
                  <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 space-y-1.5 text-xs text-stone-700">
                    <div>
                      <strong>Employee:</strong> {decisionGoal.employee?.displayName}
                    </div>
                    <div>
                      <strong>Goal:</strong> {decisionGoal.title}
                    </div>
                    <div>
                      <strong>Category & Weight:</strong> {decisionGoal.category} (
                      {decisionGoal.weight}
                      %)
                    </div>
                    <div>
                      <strong>Target:</strong> {decisionGoal.targetValue} {decisionGoal.unit || ''}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Reviewer Comments / Rejection Reason (Mandatory if returning for revision)
                    </label>
                    <textarea
                      rows={3}
                      value={decisionReason}
                      onChange={(e) => setDecisionReason(e.target.value)}
                      placeholder="Provide constructive feedback or specify required target adjustments..."
                      className="w-full text-sm px-3 py-2 rounded-lg border border-stone-200"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-stone-100">
                    <Button type="button" variant="outline" onClick={() => setDecisionGoal(null)}>
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSubmitting || !decisionReason.trim()}
                      onClick={() => handleDecideGoal(false)}
                      className="text-rose-700 border-rose-200 hover:bg-rose-50"
                    >
                      Return for Revision
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      disabled={isSubmitting}
                      onClick={() => handleDecideGoal(true)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      Approve Goal
                    </Button>
                  </div>
                </div>
              </Dialog>
            )}

            {/* ------------------------------------------------------------- */}
            {/* MODAL 4: Goal Detail, History & Evidence Drawer / Modal       */}
            {/* ------------------------------------------------------------- */}
            {detailGoal && (
              <Dialog
                isOpen={!!detailGoal}
                onClose={() => setDetailGoal(null)}
                title={`Goal Details: ${detailGoal.title}`}
                description="Audit history, incremental check-in log, and stored evidence attachments."
                maxWidth="lg"
              >
                <div className="space-y-5 pt-2 max-h-[75vh] overflow-y-auto pr-1">
                  {/* Goal Metadata summary */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-stone-50 rounded-lg border border-stone-200 text-xs">
                    <div>
                      <span className="text-stone-500 block">Status:</span>
                      <Badge variant={getStatusBadgeVariant(detailGoal.status)} size="sm">
                        {detailGoal.status.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-stone-500 block">Weight:</span>
                      <span className="font-semibold text-stone-800">{detailGoal.weight}%</span>
                    </div>
                    <div>
                      <span className="text-stone-500 block">Target:</span>
                      <span className="font-semibold text-stone-800">
                        {detailGoal.targetValue ?? 100} {detailGoal.unit || ''}
                      </span>
                    </div>
                    <div>
                      <span className="text-stone-500 block">Progress:</span>
                      <span className="font-semibold text-stone-800">
                        {detailGoal.progressPercentage}%
                      </span>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-semibold text-stone-900 mb-1">Description</h4>
                    <p className="text-xs text-stone-600 bg-white p-2.5 rounded border border-stone-100">
                      {detailGoal.description}
                    </p>
                  </div>

                  {detailGoal.businessRationale && (
                    <div>
                      <h4 className="text-xs font-semibold text-stone-900 mb-1">
                        Business Rationale
                      </h4>
                      <p className="text-xs text-stone-600 bg-white p-2.5 rounded border border-stone-100">
                        {detailGoal.businessRationale}
                      </p>
                    </div>
                  )}

                  {/* Progress Check-ins Timeline */}
                  <div>
                    <h4 className="text-xs font-semibold text-stone-900 mb-2 flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      Progress Check-ins & Evidence Updates (
                      {detailGoal.progressUpdates?.length || 0})
                    </h4>

                    {!detailGoal.progressUpdates || detailGoal.progressUpdates.length === 0 ? (
                      <p className="text-xs text-stone-400 italic">
                        No progress check-ins recorded yet.
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {detailGoal.progressUpdates.map((update) => (
                          <div
                            key={update.id}
                            className="p-3 bg-stone-50 rounded-lg border border-stone-200 text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between text-stone-500">
                              <span className="font-semibold text-stone-800">
                                {update.updatedBy?.displayName || 'Owner'}
                              </span>
                              <span>{new Date(update.createdAt).toLocaleString()}</span>
                            </div>
                            <p className="text-stone-700">{update.note}</p>
                            <div className="flex items-center justify-between pt-1 text-[11px] text-stone-500">
                              <span>
                                Progress: {update.previousProgress}% &rarr;{' '}
                                <strong>{update.newProgress}%</strong>
                              </span>
                              {update.evidenceUrl && (
                                <a
                                  href={`/api/v1/performance/goals/${detailGoal.id}/progress/${update.id}/evidence`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-amber-700 hover:underline flex items-center gap-1 font-medium"
                                >
                                  <Paperclip className="h-3 w-3" />
                                  {update.evidenceFileName || 'Download Evidence'}
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Goal History & Audit */}
                  <div>
                    <h4 className="text-xs font-semibold text-stone-900 mb-2 flex items-center gap-1.5">
                      <History className="h-4 w-4 text-amber-600" />
                      Target & Lifecycle Audit History
                    </h4>

                    {!detailGoal.history || detailGoal.history.length === 0 ? (
                      <p className="text-xs text-stone-400 italic">
                        No historical adjustments recorded.
                      </p>
                    ) : (
                      <div className="space-y-1.5 text-xs text-stone-600">
                        {detailGoal.history.map((hist) => (
                          <div
                            key={hist.id}
                            className="flex items-start justify-between p-2 rounded bg-stone-50 border border-stone-100"
                          >
                            <div>
                              <Badge variant="outline" size="sm">
                                {hist.action}
                              </Badge>
                              <span className="ml-2 text-stone-700">
                                {hist.changeReason || 'Action logged'}
                              </span>
                            </div>
                            <span className="text-[11px] text-stone-400 whitespace-nowrap ml-2">
                              {new Date(hist.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end pt-3 border-t border-stone-100">
                    <Button type="button" variant="outline" onClick={() => setDetailGoal(null)}>
                      Close
                    </Button>
                  </div>
                </div>
              </Dialog>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
