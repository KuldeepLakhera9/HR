'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useRole } from '../../context/RoleContext';
import { performanceApi } from '../../lib/api-client';
import {
  DevelopmentPlanDto,
  PerformanceFeedbackDto,
  CreateDevelopmentPlanDto,
  UpdateDevelopmentPlanDto,
  CreatePerformanceFeedbackDto,
  DevelopmentPlanStatus,
  FeedbackVisibility,
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
import {
  Compass,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  RefreshCw,
  Search,
  Filter,
  FileText,
  Calendar,
  User,
  BookOpen,
  ArrowRight,
  ExternalLink,
  MessageSquare,
  Lock,
  Eye,
  ShieldAlert,
  Send,
  Trash2,
  Edit,
  Sparkles,
  Award,
  Bell,
  Target,
  CheckSquare,
} from 'lucide-react';

interface DevelopmentPlansViewProps {
  employeeId?: string;
  onNotify?: (message: string, type: 'success' | 'error') => void;
}

export function DevelopmentPlansView({ employeeId, onNotify }: DevelopmentPlansViewProps) {
  const { user } = useAuth();
  const { role } = useRole();
  const isHrOrAdmin = role === 'ADMIN' || role === 'HR';
  const isManagerOrAdmin = role === 'MANAGER' || isHrOrAdmin;

  // Data states
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activePlans, setActivePlans] = useState<DevelopmentPlanDto[]>([]);
  const [completedPlans, setCompletedPlans] = useState<DevelopmentPlanDto[]>([]);
  const [feedbacks, setFeedbacks] = useState<PerformanceFeedbackDto[]>([]);
  const [strengths, setStrengths] = useState<string | null>(null);
  const [improvements, setImprovements] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'COMPLETED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isUpdateProgressModalOpen, setIsUpdateProgressModalOpen] = useState(false);
  const [isAddFeedbackModalOpen, setIsAddFeedbackModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<DevelopmentPlanDto | null>(null);

  // Form states
  const [createForm, setCreateForm] = useState<Partial<CreateDevelopmentPlanDto>>({
    reviewId: '',
    objective: '',
    actionSteps: '',
    successCriteria: '',
    targetDate: '',
    responsiblePerson: '',
    trainingNeeds: '',
    status: 'PLANNED' as any,
  });

  const [progressForm, setProgressForm] = useState<{
    status: DevelopmentPlanStatus;
    followUpNotes: string;
    completionEvidence: string;
  }>({
    status: 'IN_PROGRESS' as any,
    followUpNotes: '',
    completionEvidence: '',
  });

  const [feedbackForm, setFeedbackForm] = useState<Partial<CreatePerformanceFeedbackDto>>({
    reviewId: '',
    title: '',
    content: '',
    visibility: 'EMPLOYEE_VISIBLE' as any,
  });

  const [submitting, setSubmitting] = useState(false);

  const notify = (msg: string, type: 'success' | 'error') => {
    if (onNotify) {
      onNotify(msg, type);
    }
  };

  // Fetch development overview
  const fetchData = useCallback(
    async (isManual = false) => {
      if (isManual) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const data = await performanceApi.getDevelopmentOverview(employeeId);
        setActivePlans(data.activePlans || []);
        setCompletedPlans(data.completedPlans || []);
        setFeedbacks(data.feedbacks || []);
        setStrengths(data.strengthsSummary || null);
        setImprovements(data.improvementsSummary || null);
        setCanManage(data.canManage);
      } catch (err: any) {
        const msg = err.message || 'Failed to load employee development plans';
        setError(msg);
        notify(msg, 'error');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [employeeId],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Create Plan
  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.objective?.trim() || !createForm.actionSteps?.trim()) {
      notify('Please provide both objective title and action steps.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      // Find a reviewId from existing plans if available or use provided
      const reviewId =
        createForm.reviewId ||
        activePlans[0]?.reviewId ||
        completedPlans[0]?.reviewId ||
        feedbacks[0]?.reviewId;

      if (!reviewId) {
        notify(
          'A performance review reference is required to link this development plan.',
          'error',
        );
        return;
      }

      await performanceApi.createDevelopmentPlan({
        reviewId,
        employeeId,
        objective: createForm.objective.trim(),
        actionSteps: createForm.actionSteps.trim(),
        successCriteria: createForm.successCriteria?.trim() || undefined,
        targetDate: createForm.targetDate || undefined,
        responsiblePerson: createForm.responsiblePerson?.trim() || undefined,
        trainingNeeds: createForm.trainingNeeds?.trim() || undefined,
        status: createForm.status || ('PLANNED' as any),
      });

      notify('Development plan assigned successfully', 'success');
      setIsCreateModalOpen(false);
      setCreateForm({
        reviewId: '',
        objective: '',
        actionSteps: '',
        successCriteria: '',
        targetDate: '',
        responsiblePerson: '',
        trainingNeeds: '',
        status: 'PLANNED' as any,
      });
      fetchData(true);
    } catch (err: any) {
      notify(err.message || 'Failed to create development plan', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Update Plan Progress
  const handleUpdateProgress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlan) return;

    setSubmitting(true);
    try {
      await performanceApi.updateDevelopmentPlan(selectedPlan.id, {
        status: progressForm.status,
        followUpNotes: progressForm.followUpNotes.trim() || undefined,
        completionEvidence: progressForm.completionEvidence.trim() || undefined,
      });

      notify('Development plan progress updated', 'success');
      setIsUpdateProgressModalOpen(false);
      setSelectedPlan(null);
      fetchData(true);
    } catch (err: any) {
      notify(err.message || 'Failed to update progress', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Delete Plan
  const handleDeletePlan = async (planId: string) => {
    if (!confirm('Are you sure you want to delete this development plan?')) return;
    setSubmitting(true);
    try {
      await performanceApi.deleteDevelopmentPlan(planId);
      notify('Development plan deleted', 'success');
      fetchData(true);
    } catch (err: any) {
      notify(err.message || 'Failed to delete development plan', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Send Reminder
  const handleSendReminder = async (planId: string) => {
    setSubmitting(true);
    try {
      const res = await performanceApi.sendDevelopmentReminder(planId);
      notify(res.message || 'Progress reminder notification dispatched', 'success');
    } catch (err: any) {
      notify(err.message || 'Failed to send reminder', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Add Feedback
  const handleAddFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackForm.title?.trim() || !feedbackForm.content?.trim()) {
      notify('Please enter both feedback title and content.', 'error');
      return;
    }

    const reviewId =
      feedbackForm.reviewId ||
      activePlans[0]?.reviewId ||
      completedPlans[0]?.reviewId ||
      feedbacks[0]?.reviewId;

    if (!reviewId) {
      notify('A performance review cycle is required to record feedback.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await performanceApi.addPerformanceFeedback({
        reviewId,
        title: feedbackForm.title.trim(),
        content: feedbackForm.content.trim(),
        visibility: feedbackForm.visibility,
      });

      notify('Performance feedback recorded', 'success');
      setIsAddFeedbackModalOpen(false);
      setFeedbackForm({
        reviewId: '',
        title: '',
        content: '',
        visibility: 'EMPLOYEE_VISIBLE' as any,
      });
      fetchData(true);
    } catch (err: any) {
      notify(err.message || 'Failed to record feedback', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Delete Feedback
  const handleDeleteFeedback = async (feedbackId: string) => {
    if (!confirm('Are you sure you want to remove this feedback note?')) return;
    setSubmitting(true);
    try {
      await performanceApi.deletePerformanceFeedback(feedbackId);
      notify('Feedback note removed', 'success');
      fetchData(true);
    } catch (err: any) {
      notify(err.message || 'Failed to delete feedback', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const openProgressModal = (plan: DevelopmentPlanDto) => {
    setSelectedPlan(plan);
    setProgressForm({
      status: plan.status,
      followUpNotes: plan.followUpNotes || '',
      completionEvidence: plan.completionEvidence || '',
    });
    setIsUpdateProgressModalOpen(true);
  };

  const getStatusBadge = (status: DevelopmentPlanStatus) => {
    switch (status) {
      case 'COMPLETED':
        return <Badge variant="success">Completed</Badge>;
      case 'IN_PROGRESS':
        return <Badge variant="primary">In Progress</Badge>;
      case 'PLANNED':
        return <Badge variant="info">Planned</Badge>;
      case 'ON_HOLD':
        return <Badge variant="warning">On Hold</Badge>;
      case 'CANCELLED':
        return <Badge variant="danger">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getVisibilityBadge = (visibility: FeedbackVisibility) => {
    switch (visibility) {
      case 'EMPLOYEE_VISIBLE':
        return (
          <Badge variant="success" className="gap-1">
            <Eye className="h-3 w-3" />
            Employee Visible
          </Badge>
        );
      case 'MANAGER_ONLY':
        return (
          <Badge variant="warning" className="gap-1">
            <Lock className="h-3 w-3" />
            Manager Only
          </Badge>
        );
      case 'HR_CONFIDENTIAL':
        return (
          <Badge variant="danger" className="gap-1">
            <ShieldAlert className="h-3 w-3" />
            HR Confidential
          </Badge>
        );
    }
  };

  // Filter plans based on active selection and search
  const allPlans = [...activePlans, ...completedPlans];
  const displayedPlans = allPlans.filter((p) => {
    if (statusFilter === 'ACTIVE' && (p.status === 'COMPLETED' || p.status === 'CANCELLED')) {
      return false;
    }
    if (statusFilter === 'COMPLETED' && p.status !== 'COMPLETED' && p.status !== 'CANCELLED') {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchObj = p.objective.toLowerCase().includes(q);
      const matchAction = p.actionSteps.toLowerCase().includes(q);
      const matchResp = p.responsiblePerson?.toLowerCase().includes(q);
      return matchObj || matchAction || matchResp;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-stone-200">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-stone-900 tracking-tight flex items-center gap-2">
              <Compass className="h-5 w-5 text-amber-700" />
              Performance Feedback & Development Planning
            </h2>
            <Badge variant="outline">Enterprise HRMS</Badge>
          </div>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            Structured skill building, developmental milestones, completion evidence, and authorized
            supervisory feedback notes.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData(true)}
            disabled={loading || refreshing}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          {canManage && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAddFeedbackModalOpen(true)}
                className="flex items-center gap-1.5"
              >
                <MessageSquare className="h-3.5 w-3.5 text-amber-700" />
                Add Feedback
              </Button>

              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                Assign Objective
              </Button>
            </>
          )}
        </div>
      </div>

      {/* KPI Metric Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Active Objectives"
          value={activePlans.length.toString()}
          description="In progress or planned milestones"
          icon={<Compass className="h-5 w-5 text-amber-700" />}
        />
        <KPICard
          title="Completed Milestones"
          value={completedPlans.length.toString()}
          description="Verified development goals"
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-700" />}
        />
        <KPICard
          title="Feedback Notes"
          value={feedbacks.length.toString()}
          description="Authoritative review guidance"
          icon={<MessageSquare className="h-5 w-5 text-blue-700" />}
        />
        <KPICard
          title="Action Items Total"
          value={allPlans.length.toString()}
          description="Career development objectives"
          icon={<Target className="h-5 w-5 text-stone-700" />}
        />
      </div>

      {/* Strengths & Growth Areas Highlight (if available from cycle review) */}
      {(strengths || improvements) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {strengths && (
            <Card className="border-emerald-200 bg-emerald-50/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-emerald-900 flex items-center gap-2">
                  <Award className="h-4 w-4 text-emerald-700" />
                  Key Strengths & Notable Achievements
                </CardTitle>
                <CardDescription className="text-xs text-emerald-700">
                  Recorded from recent performance evaluations
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xs sm:text-sm text-stone-800 whitespace-pre-line leading-relaxed">
                  {strengths}
                </p>
              </CardContent>
            </Card>
          )}

          {improvements && (
            <Card className="border-amber-200 bg-amber-50/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-amber-900 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-700" />
                  Areas for Growth & Targeted Development
                </CardTitle>
                <CardDescription className="text-xs text-amber-700">
                  Identified focus areas for career advancement
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xs sm:text-sm text-stone-800 whitespace-pre-line leading-relaxed">
                  {improvements}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Development Plans Section */}
      <Card>
        <CardHeader className="pb-3 border-b border-stone-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold text-stone-900 flex items-center gap-2">
                <Target className="h-4 w-4 text-amber-700" />
                Development Action Items & Milestones
              </CardTitle>
              <CardDescription className="text-xs text-stone-500">
                Actionable steps, target dates, completion criteria, and evidence tracking.
              </CardDescription>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-stone-400" />
                <input
                  type="text"
                  placeholder="Search objectives..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1 text-xs border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 w-48 bg-stone-50"
                />
              </div>

              <div className="flex rounded-lg border border-stone-200 p-0.5 bg-stone-100 text-xs font-medium">
                <button
                  onClick={() => setStatusFilter('ALL')}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    statusFilter === 'ALL'
                      ? 'bg-white text-stone-900 shadow-xs'
                      : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  All ({allPlans.length})
                </button>
                <button
                  onClick={() => setStatusFilter('ACTIVE')}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    statusFilter === 'ACTIVE'
                      ? 'bg-white text-stone-900 shadow-xs'
                      : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  Active ({activePlans.length})
                </button>
                <button
                  onClick={() => setStatusFilter('COMPLETED')}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    statusFilter === 'COMPLETED'
                      ? 'bg-white text-stone-900 shadow-xs'
                      : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  Completed ({completedPlans.length})
                </button>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-4">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-stone-400 gap-2">
              <RefreshCw className="h-6 w-6 animate-spin text-amber-600" />
              <p className="text-xs">Loading development plans...</p>
            </div>
          ) : displayedPlans.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-stone-400 gap-2 border-2 border-dashed border-stone-200 rounded-xl">
              <Compass className="h-8 w-8 text-stone-300" />
              <p className="text-sm font-semibold text-stone-600">No Development Plans Found</p>
              <p className="text-xs text-stone-400 text-center max-w-sm">
                No development objectives matching your filter. Development plans assigned during
                performance reviews will appear here.
              </p>
              {canManage && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCreateModalOpen(true)}
                  className="mt-2 text-xs"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Assign First Objective
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {displayedPlans.map((plan) => {
                const isOverdue =
                  plan.targetDate &&
                  new Date(plan.targetDate) < new Date() &&
                  plan.status !== 'COMPLETED' &&
                  plan.status !== 'CANCELLED';

                return (
                  <div
                    key={plan.id}
                    className={`p-4 rounded-xl border transition-all ${
                      isOverdue
                        ? 'border-rose-200 bg-rose-50/20'
                        : plan.status === 'COMPLETED'
                          ? 'border-emerald-200 bg-emerald-50/20'
                          : 'border-stone-200 bg-white hover:border-stone-300'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-stone-900 tracking-tight">
                            {plan.objective}
                          </h3>
                          {getStatusBadge(plan.status)}
                          {isOverdue && (
                            <Badge variant="danger" className="gap-1">
                              <AlertCircle className="h-3 w-3" />
                              Overdue
                            </Badge>
                          )}
                          {plan.cycleName && (
                            <Badge variant="outline" className="text-stone-500 text-[10px]">
                              {plan.cycleName}
                            </Badge>
                          )}
                        </div>

                        {/* Action Steps */}
                        <div className="pt-1">
                          <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider block">
                            Action Steps
                          </span>
                          <p className="text-xs text-stone-700 whitespace-pre-line leading-relaxed">
                            {plan.actionSteps}
                          </p>
                        </div>

                        {/* Success Criteria */}
                        {plan.successCriteria && (
                          <div className="pt-1">
                            <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider block">
                              Success Criteria
                            </span>
                            <p className="text-xs text-stone-700 leading-relaxed">
                              {plan.successCriteria}
                            </p>
                          </div>
                        )}

                        {/* Metadata row */}
                        <div className="flex items-center gap-4 text-xs text-stone-500 pt-2 flex-wrap">
                          {plan.targetDate && (
                            <span className="flex items-center gap-1 font-medium text-stone-600">
                              <Calendar className="h-3.5 w-3.5 text-stone-400" />
                              Target: {new Date(plan.targetDate).toLocaleDateString()}
                            </span>
                          )}

                          {plan.responsiblePerson && (
                            <span className="flex items-center gap-1">
                              <User className="h-3.5 w-3.5 text-stone-400" />
                              Lead: {plan.responsiblePerson}
                            </span>
                          )}

                          {plan.trainingNeeds && (
                            <span className="flex items-center gap-1">
                              <BookOpen className="h-3.5 w-3.5 text-stone-400" />
                              Resource: {plan.trainingNeeds}
                            </span>
                          )}
                        </div>

                        {/* Follow-up Notes & Evidence (if present) */}
                        {(plan.followUpNotes || plan.completionEvidence) && (
                          <div className="mt-3 p-2.5 rounded-lg bg-stone-50 border border-stone-200/80 space-y-1.5">
                            {plan.followUpNotes && (
                              <div>
                                <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block">
                                  Progress Notes & Updates
                                </span>
                                <p className="text-xs text-stone-800 whitespace-pre-line">
                                  {plan.followUpNotes}
                                </p>
                              </div>
                            )}

                            {plan.completionEvidence && (
                              <div className="flex items-center gap-1.5 text-xs text-amber-800 font-medium pt-0.5">
                                <ExternalLink className="h-3.5 w-3.5" />
                                <span>Completion Evidence:</span>
                                <a
                                  href={plan.completionEvidence}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline hover:text-amber-950 truncate max-w-xs"
                                >
                                  {plan.completionEvidence}
                                </a>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center sm:flex-col gap-1.5 flex-shrink-0 pt-2 sm:pt-0">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => openProgressModal(plan)}
                          className="text-xs flex items-center gap-1"
                        >
                          <CheckSquare className="h-3.5 w-3.5" />
                          Update Progress
                        </Button>

                        {canManage && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSendReminder(plan.id)}
                              disabled={submitting}
                              className="text-xs flex items-center gap-1"
                              title="Send in-app reminder to employee"
                            >
                              <Bell className="h-3.5 w-3.5 text-amber-700" />
                              Remind
                            </Button>

                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => handleDeletePlan(plan.id)}
                              disabled={submitting}
                              className="text-xs flex items-center gap-1"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Structured Performance Feedback Section */}
      <Card>
        <CardHeader className="pb-3 border-b border-stone-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold text-stone-900 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-blue-700" />
                Structured Performance Feedback
              </CardTitle>
              <CardDescription className="text-xs text-stone-500">
                Supervisory notes, constructive feedback, and official cycle reviews.
              </CardDescription>
            </div>

            {canManage && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAddFeedbackModalOpen(true)}
                className="text-xs flex items-center gap-1"
              >
                <Plus className="h-3 w-3" />
                Add Feedback Note
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="pt-4">
          {feedbacks.length === 0 ? (
            <div className="py-8 text-center text-stone-400 text-xs">
              No performance feedback notes recorded yet for this review cycle.
            </div>
          ) : (
            <div className="space-y-3">
              {feedbacks.map((fb) => (
                <div
                  key={fb.id}
                  className="p-3.5 rounded-xl border border-stone-200 bg-white hover:border-stone-300 transition-all space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-xs sm:text-sm font-bold text-stone-900">{fb.title}</h4>
                      {getVisibilityBadge(fb.visibility)}
                      <span className="text-[11px] text-stone-400">
                        {new Date(fb.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    {(canManage || isHrOrAdmin) && (
                      <button
                        onClick={() => handleDeleteFeedback(fb.id)}
                        className="text-stone-400 hover:text-rose-600 transition-colors p-1"
                        title="Delete feedback note"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <p className="text-xs sm:text-sm text-stone-700 whitespace-pre-line leading-relaxed">
                    {fb.content}
                  </p>

                  {fb.author && (
                    <div className="text-[11px] text-stone-400 pt-1">
                      Author:{' '}
                      <span className="text-stone-600 font-medium">{fb.author.displayName}</span> (
                      {fb.author.employeeCode})
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* MODAL 1: Create Development Plan */}
      <Dialog
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Assign Employee Development Plan"
      >
        <form onSubmit={handleCreatePlan} className="space-y-4 pt-2">
          <div>
            <label className="text-xs font-bold text-stone-700 block mb-1">
              Development Objective *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Master Cloud-Native Architecture"
              value={createForm.objective || ''}
              onChange={(e) => setCreateForm({ ...createForm, objective: e.target.value })}
              className="w-full text-xs p-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-stone-700 block mb-1">
              Action Steps & Key Milestones *
            </label>
            <textarea
              required
              rows={3}
              placeholder="1. Complete internal Kubernetes module&#10;2. Design microservice decoupling pattern&#10;3. Conduct team tech review"
              value={createForm.actionSteps || ''}
              onChange={(e) => setCreateForm({ ...createForm, actionSteps: e.target.value })}
              className="w-full text-xs p-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-stone-700 block mb-1">Success Criteria</label>
            <input
              type="text"
              placeholder="e.g. Production migration signed off with zero downtime"
              value={createForm.successCriteria || ''}
              onChange={(e) => setCreateForm({ ...createForm, successCriteria: e.target.value })}
              className="w-full text-xs p-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-stone-700 block mb-1">
                Target Completion Date
              </label>
              <input
                type="date"
                value={createForm.targetDate || ''}
                onChange={(e) => setCreateForm({ ...createForm, targetDate: e.target.value })}
                className="w-full text-xs p-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-stone-700 block mb-1">
                Responsible Person / Mentor
              </label>
              <input
                type="text"
                placeholder="e.g. Lead Architect or Manager"
                value={createForm.responsiblePerson || ''}
                onChange={(e) =>
                  setCreateForm({ ...createForm, responsiblePerson: e.target.value })
                }
                className="w-full text-xs p-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-stone-700 block mb-1">
              Required Resources & Training Needs
            </label>
            <input
              type="text"
              placeholder="e.g. O'Reilly subscription, workshop budget"
              value={createForm.trainingNeeds || ''}
              onChange={(e) => setCreateForm({ ...createForm, trainingNeeds: e.target.value })}
              className="w-full text-xs p-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              {submitting ? 'Assigning...' : 'Assign Development Plan'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* MODAL 2: Update Progress */}
      <Dialog
        isOpen={isUpdateProgressModalOpen}
        onClose={() => setIsUpdateProgressModalOpen(false)}
        title="Update Development Plan Progress"
      >
        <form onSubmit={handleUpdateProgress} className="space-y-4 pt-2">
          {selectedPlan && (
            <div className="p-2.5 rounded-lg bg-stone-50 border border-stone-200 text-xs space-y-1">
              <span className="font-bold text-stone-800 block">{selectedPlan.objective}</span>
              <p className="text-stone-600 line-clamp-2">{selectedPlan.actionSteps}</p>
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-stone-700 block mb-1">Progress Status *</label>
            <select
              value={progressForm.status}
              onChange={(e) =>
                setProgressForm({
                  ...progressForm,
                  status: e.target.value as DevelopmentPlanStatus,
                })
              }
              className="w-full text-xs p-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white"
            >
              <option value="PLANNED">Planned</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="ON_HOLD">On Hold</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-stone-700 block mb-1">
              Follow-up Progress Notes & Updates
            </label>
            <textarea
              rows={3}
              placeholder="Describe progress made, courses finished, or current blockers..."
              value={progressForm.followUpNotes}
              onChange={(e) => setProgressForm({ ...progressForm, followUpNotes: e.target.value })}
              className="w-full text-xs p-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-stone-700 block mb-1">
              Completion Evidence URL / Verification Link
            </label>
            <input
              type="text"
              placeholder="e.g. https://certificates.internal/completion-cert-123.pdf"
              value={progressForm.completionEvidence}
              onChange={(e) =>
                setProgressForm({ ...progressForm, completionEvidence: e.target.value })
              }
              className="w-full text-xs p-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setIsUpdateProgressModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1.5"
            >
              <CheckSquare className="h-3.5 w-3.5" />
              {submitting ? 'Saving...' : 'Save Progress Update'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* MODAL 3: Add Structured Feedback */}
      <Dialog
        isOpen={isAddFeedbackModalOpen}
        onClose={() => setIsAddFeedbackModalOpen(false)}
        title="Add Structured Performance Feedback"
      >
        <form onSubmit={handleAddFeedback} className="space-y-4 pt-2">
          <div>
            <label className="text-xs font-bold text-stone-700 block mb-1">
              Feedback Title / Topic *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Q3 Leadership & Mentorship Recognition"
              value={feedbackForm.title || ''}
              onChange={(e) => setFeedbackForm({ ...feedbackForm, title: e.target.value })}
              className="w-full text-xs p-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-stone-700 block mb-1">
              Feedback Content *
            </label>
            <textarea
              required
              rows={4}
              placeholder="Provide constructive observations, achievements, or guidance..."
              value={feedbackForm.content || ''}
              onChange={(e) => setFeedbackForm({ ...feedbackForm, content: e.target.value })}
              className="w-full text-xs p-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-stone-700 block mb-1">
              Feedback Visibility Tier *
            </label>
            <select
              value={feedbackForm.visibility}
              onChange={(e) =>
                setFeedbackForm({
                  ...feedbackForm,
                  visibility: e.target.value as FeedbackVisibility,
                })
              }
              className="w-full text-xs p-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 bg-white"
            >
              <option value="EMPLOYEE_VISIBLE">
                Employee Visible (Shared directly with the employee)
              </option>
              <option value="MANAGER_ONLY">
                Manager Only (Restricted to management hierarchy)
              </option>
              {isHrOrAdmin && (
                <option value="HR_CONFIDENTIAL">
                  HR Confidential (Restricted exclusively to HR & Admins)
                </option>
              )}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-stone-200">
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setIsAddFeedbackModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1.5"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {submitting ? 'Recording...' : 'Record Feedback'}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
