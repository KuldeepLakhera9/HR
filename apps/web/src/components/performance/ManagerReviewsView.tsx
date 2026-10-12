'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useRole } from '../../context/RoleContext';
import { performanceApi } from '../../lib/api-client';
import {
  ManagerReviewInboxItemDto,
  ManagerReviewDetailDto,
  SaveManagerReviewDraftDto,
  SubmitManagerReviewDto,
  PerformanceReviewStatus,
} from '@hrms/types';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Button,
  Dialog,
  KPICard,
} from '@hrms/ui';
import {
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  Save,
  Send,
  RotateCcw,
  ShieldCheck,
  Search,
  Filter,
  RefreshCw,
  FileText,
  Target,
  Award,
  ChevronRight,
  ExternalLink,
  Paperclip,
  Plus,
  Trash2,
  Lock,
  History,
  TrendingUp,
  UserCheck,
} from 'lucide-react';

interface ManagerReviewsViewProps {
  onNotify?: (message: string, type: 'success' | 'error') => void;
}

export const ManagerReviewsView: React.FC<ManagerReviewsViewProps> = ({ onNotify }) => {
  const { user } = useAuth();
  const { role } = useRole();
  const isHrOrAdmin = role === 'ADMIN' || role === 'HR';

  // Inbox Query & Data State
  const [inboxItems, setInboxItems] = useState<ManagerReviewInboxItemDto[]>([]);
  const [counts, setCounts] = useState<{
    all: number;
    pendingReview: number;
    submitted: number;
    finalized: number;
    overdue: number;
  }>({ all: 0, pendingReview: 0, submitted: 0, finalized: 0, overdue: 0 });

  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Active Selected Review Detail State
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [reviewDetail, setReviewDetail] = useState<ManagerReviewDetailDto | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState<
    'SELF_ASSESSMENT' | 'EVALUATION' | 'HISTORY'
  >('EVALUATION');

  // Evaluation Form State
  const [managerSummary, setManagerSummary] = useState('');
  const [managerStrengths, setManagerStrengths] = useState('');
  const [managerImprovements, setManagerImprovements] = useState('');
  const [itemRatings, setItemRatings] = useState<
    Record<
      string,
      {
        rating: number;
        comments: string;
        isNotApplicable: boolean;
      }
    >
  >({});
  const [developmentPlans, setDevelopmentPlans] = useState<
    Array<{
      objective: string;
      actionSteps: string;
      targetDate?: string;
      trainingNeeds?: string;
    }>
  >([]);

  // Action Modals State
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [isReturning, setIsReturning] = useState(false);
  const [isFinalizeModalOpen, setIsFinalizeModalOpen] = useState(false);
  const [finalizeComments, setFinalizeComments] = useState('');
  const [isFinalizing, setIsFinalizing] = useState(false);

  // Notification helper
  const notify = (msg: string, type: 'success' | 'error' = 'success') => {
    if (onNotify) onNotify(msg, type);
  };

  // Fetch Inbox Data
  const fetchInbox = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await performanceApi.getManagerReviewInbox({
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        search: searchQuery || undefined,
        page,
        limit: 15,
      });
      setInboxItems(res.items);
      setCounts(res.counts);
      setTotalPages(res.meta.totalPages);
    } catch (err: any) {
      notify(err?.message || 'Failed to fetch manager review inbox', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, searchQuery, page]);

  useEffect(() => {
    fetchInbox();
  }, [fetchInbox]);

  // Load Review Detail
  const openReviewDetail = async (id: string) => {
    setSelectedReviewId(id);
    setIsLoadingDetail(true);
    try {
      const detail = await performanceApi.getManagerReviewDetail(id);
      setReviewDetail(detail);

      // Populate form fields
      setManagerSummary(detail.review.managerSummary || '');
      setManagerStrengths(detail.review.managerStrengths || '');
      setManagerImprovements(detail.review.managerImprovements || '');

      const ratingsMap: Record<string, any> = {};
      if (detail.review.items) {
        for (const it of detail.review.items) {
          const key = it.goalId || it.competencyId;
          if (key) {
            ratingsMap[key] = {
              rating: it.managerRating ?? it.selfRating ?? 3,
              comments: it.managerComments || '',
              isNotApplicable: it.isNotApplicable,
            };
          }
        }
      }
      setItemRatings(ratingsMap);

      if (detail.developmentPlans) {
        setDevelopmentPlans(
          detail.developmentPlans.map((dp) => ({
            objective: dp.objective,
            actionSteps: dp.actionSteps,
            targetDate: dp.targetDate ? dp.targetDate.slice(0, 10) : undefined,
            trainingNeeds: dp.trainingNeeds || '',
          })),
        );
      }
    } catch (err: any) {
      notify(err?.message || 'Failed to load review details', 'error');
      setSelectedReviewId(null);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // Build items payload
  const buildItemsPayload = () => {
    if (!reviewDetail?.review.items) return [];
    return reviewDetail.review.items.map((it) => {
      const key = it.goalId || it.competencyId;
      const state = key ? itemRatings[key] : null;
      return {
        goalId: it.goalId || undefined,
        competencyId: it.competencyId || undefined,
        managerRating: state?.rating ?? it.managerRating ?? 3,
        managerComments: state?.comments,
        isNotApplicable: state?.isNotApplicable ?? it.isNotApplicable,
      };
    });
  };

  // Live Score Preview Computation
  const liveScorePreview = useMemo(() => {
    if (!reviewDetail?.review.cycle) return null;
    const cycle = reviewDetail.review.cycle;
    const items = reviewDetail.review.items || [];

    let totalGoalWeight = 0;
    let weightedGoalScore = 0;
    let totalCompWeight = 0;
    let weightedCompScore = 0;

    for (const it of items) {
      const key = it.goalId || it.competencyId;
      const ratingEntry = key ? itemRatings[key] : null;
      const rating = ratingEntry?.rating ?? it.managerRating;

      if (rating && !ratingEntry?.isNotApplicable) {
        if (it.goalId && it.goal) {
          const w = it.goal.weight > 0 ? it.goal.weight : 1;
          weightedGoalScore += rating * w;
          totalGoalWeight += w;
        } else if (it.competencyId && it.competency) {
          const w = it.competency.weight > 0 ? it.competency.weight : 1;
          weightedCompScore += rating * w;
          totalCompWeight += w;
        }
      }
    }

    const goalsScore = totalGoalWeight > 0 ? weightedGoalScore / totalGoalWeight : null;
    const compsScore = totalCompWeight > 0 ? weightedCompScore / totalCompWeight : null;

    let overall: number | null = null;
    if (goalsScore !== null && compsScore !== null) {
      const totalW = cycle.goalsWeightPercentage + cycle.competenciesWeightPercentage;
      if (totalW > 0) {
        overall =
          (goalsScore * cycle.goalsWeightPercentage +
            compsScore * cycle.competenciesWeightPercentage) /
          totalW;
      }
    } else if (goalsScore !== null) {
      overall = goalsScore;
    } else if (compsScore !== null) {
      overall = compsScore;
    }

    return {
      goalsScore: goalsScore ? goalsScore.toFixed(2) : 'N/A',
      compsScore: compsScore ? compsScore.toFixed(2) : 'N/A',
      overall: overall ? overall.toFixed(2) : 'N/A',
    };
  }, [reviewDetail, itemRatings]);

  // Save Draft
  const handleSaveDraft = async () => {
    if (!selectedReviewId) return;
    setIsSaving(true);
    try {
      const payload: SaveManagerReviewDraftDto = {
        managerSummary: managerSummary || undefined,
        managerStrengths: managerStrengths || undefined,
        managerImprovements: managerImprovements || undefined,
        items: buildItemsPayload(),
        developmentPlans,
      };

      const updated = await performanceApi.saveManagerReviewDraft(selectedReviewId, payload);
      setReviewDetail(updated);
      notify('Manager evaluation draft saved successfully.');
      fetchInbox();
    } catch (err: any) {
      notify(err?.message || 'Failed to save draft evaluation', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Submit Evaluation
  const handleSubmitReview = async () => {
    if (!selectedReviewId) return;

    if (!managerSummary.trim() || managerSummary.trim().length < 10) {
      notify('Executive summary is required and must contain at least 10 characters', 'error');
      return;
    }
    if (!managerStrengths.trim() || managerStrengths.trim().length < 10) {
      notify('Key strengths are required and must contain at least 10 characters', 'error');
      return;
    }
    if (!managerImprovements.trim() || managerImprovements.trim().length < 10) {
      notify(
        'Growth and improvement areas are required and must contain at least 10 characters',
        'error',
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: SubmitManagerReviewDto = {
        managerSummary: managerSummary.trim(),
        managerStrengths: managerStrengths.trim(),
        managerImprovements: managerImprovements.trim(),
        items: buildItemsPayload(),
        developmentPlans,
      };

      const submitted = await performanceApi.submitManagerReview(selectedReviewId, payload);
      setReviewDetail(submitted);
      notify('Manager review formally submitted and sent for calibration.');
      fetchInbox();
    } catch (err: any) {
      notify(err?.message || 'Failed to submit review evaluation', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Return to Employee for Revision
  const handleReturnReview = async () => {
    if (!selectedReviewId || !returnReason.trim()) return;
    setIsReturning(true);
    try {
      const returned = await performanceApi.returnReviewForCorrection(
        selectedReviewId,
        returnReason.trim(),
      );
      setReviewDetail(returned);
      setIsReturnModalOpen(false);
      setReturnReason('');
      notify('Review has been returned to the employee for self-assessment revisions.');
      fetchInbox();
    } catch (err: any) {
      notify(err?.message || 'Failed to return review for correction', 'error');
    } finally {
      setIsReturning(false);
    }
  };

  // Finalize Review
  const handleFinalizeReview = async () => {
    if (!selectedReviewId) return;
    setIsFinalizing(true);
    try {
      const finalized = await performanceApi.finalizeManagerReview(
        selectedReviewId,
        finalizeComments.trim() || undefined,
      );
      setReviewDetail(finalized);
      setIsFinalizeModalOpen(false);
      setFinalizeComments('');
      notify('Performance review has been officially finalized.');
      fetchInbox();
    } catch (err: any) {
      notify(err?.message || 'Failed to finalize review', 'error');
    } finally {
      setIsFinalizing(false);
    }
  };

  // Add Development Plan Item
  const handleAddPlan = () => {
    setDevelopmentPlans((prev) => [...prev, { objective: '', actionSteps: '', trainingNeeds: '' }]);
  };

  const handleRemovePlan = (index: number) => {
    setDevelopmentPlans((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      {/* KPI Overview Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KPICard
          title="Pending Evaluation"
          value={counts.pendingReview.toString()}
          description="Awaiting manager review"
          icon={<Clock className="h-4 w-4 text-amber-600" />}
        />
        <KPICard
          title="Submitted / Calibration"
          value={counts.submitted.toString()}
          description="Sent for HR review"
          icon={<CheckCircle2 className="h-4 w-4 text-blue-600" />}
        />
        <KPICard
          title="Finalized Reviews"
          value={counts.finalized.toString()}
          description="Officially closed"
          icon={<ShieldCheck className="h-4 w-4 text-emerald-600" />}
        />
        <KPICard
          title="Overdue Submissions"
          value={counts.overdue.toString()}
          description="Past cycle deadline"
          icon={<AlertCircle className="h-4 w-4 text-rose-600" />}
        />
      </div>

      {/* Main Container: Split View or Inbox Table */}
      {!selectedReviewId ? (
        <Card className="border border-stone-200 shadow-xs bg-white">
          <CardHeader className="p-5 border-b border-stone-150">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-base font-bold text-stone-900 flex items-center gap-2">
                  <Users className="h-4 w-4 text-amber-600" />
                  <span>Team Performance Reviews Inbox</span>
                </CardTitle>
                <CardDescription className="text-xs text-stone-500">
                  Assess deliverable goals, evaluate core competencies, and provide structured
                  feedback.
                </CardDescription>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 text-stone-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search direct reports..."
                    className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-stone-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 w-44"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-lg border border-stone-200 focus:outline-hidden text-stone-700 bg-white"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="SELF_ASSESSMENT_SUBMITTED">Ready for Review</option>
                  <option value="MANAGER_REVIEW_DRAFT">Draft in Progress</option>
                  <option value="MANAGER_REVIEW_SUBMITTED">Submitted</option>
                  <option value="FINALIZED">Finalized</option>
                  <option value="REOPENED">Returned to Employee</option>
                </select>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchInbox}
                  disabled={isLoading}
                  className="gap-1.5"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-12 text-center text-stone-500 text-xs flex flex-col items-center gap-2">
                <RefreshCw className="h-6 w-6 animate-spin text-amber-600" />
                <span>Loading team reviews...</span>
              </div>
            ) : inboxItems.length === 0 ? (
              <div className="p-12 text-center text-stone-500 text-xs">
                <UserCheck className="h-8 w-8 text-stone-300 mx-auto mb-2" />
                <p className="font-semibold text-stone-700">No reviews found matching filters</p>
                <p className="text-[11px] text-stone-400 mt-0.5">
                  Direct reports enrolled in performance cycles will appear here once
                  self-assessments are submitted.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-stone-100">
                {inboxItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-stone-50/70 transition-colors"
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="h-10 w-10 rounded-full bg-amber-100 text-amber-800 font-bold text-sm flex items-center justify-center shrink-0 border border-amber-200">
                        {item.employeeName.charAt(0)}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-stone-900">{item.employeeName}</h4>
                          <span className="text-xs text-stone-400 font-mono">
                            ({item.employeeCode})
                          </span>
                          {item.isOverdue && (
                            <Badge
                              variant="outline"
                              className="bg-rose-50 text-rose-700 border-rose-200 text-[10px]"
                            >
                              Overdue
                            </Badge>
                          )}
                        </div>

                        <p className="text-xs text-stone-500">
                          {item.designationTitle || 'Employee'} &bull;{' '}
                          {item.departmentName || 'General'}
                        </p>

                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-stone-400 pt-0.5">
                          <span>
                            Cycle: <strong className="text-stone-600">{item.cycleName}</strong>
                          </span>
                          <span>&bull;</span>
                          <span>Goals: {item.goalsCount}</span>
                          <span>&bull;</span>
                          <span>Competencies: {item.competenciesCount}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-center">
                      <div className="text-right">
                        {item.status === 'SELF_ASSESSMENT_SUBMITTED' ? (
                          <Badge variant="default" className="bg-blue-600 text-white text-[11px]">
                            Ready for Review
                          </Badge>
                        ) : item.status === 'MANAGER_REVIEW_DRAFT' ? (
                          <Badge
                            variant="outline"
                            className="bg-amber-50 text-amber-800 border-amber-300 text-[11px]"
                          >
                            Draft Saved
                          </Badge>
                        ) : item.status === 'MANAGER_REVIEW_SUBMITTED' ? (
                          <Badge variant="default" className="bg-indigo-600 text-white text-[11px]">
                            Submitted
                          </Badge>
                        ) : item.status === 'FINALIZED' ? (
                          <Badge
                            variant="default"
                            className="bg-emerald-600 text-white text-[11px]"
                          >
                            Finalized
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[11px]">
                            {item.status}
                          </Badge>
                        )}

                        {item.overallScore && (
                          <span className="block text-[11px] font-bold text-stone-700 mt-1">
                            Score: {item.overallScore.toFixed(2)}
                          </span>
                        )}
                      </div>

                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => openReviewDetail(item.id)}
                        className="bg-stone-900 hover:bg-stone-800 text-white text-xs flex items-center gap-1.5"
                      >
                        <span>Evaluate</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        /* Evaluation Detail Workspace */
        <div className="space-y-6">
          {isLoadingDetail || !reviewDetail ? (
            <Card className="p-12 text-center bg-white">
              <RefreshCw className="h-8 w-8 animate-spin text-amber-600 mx-auto mb-2" />
              <p className="text-xs text-stone-500 font-medium">Loading evaluation workspace...</p>
            </Card>
          ) : (
            <>
              {/* Header Card with Employee & Score Preview */}
              <Card className="border border-stone-200 bg-white">
                <CardContent className="p-6">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedReviewId(null)}
                          className="text-xs h-7 px-2"
                        >
                          &larr; Back to Inbox
                        </Button>
                        <Badge variant="outline" className="text-xs">
                          {reviewDetail.review.cycle?.name}
                        </Badge>
                        <Badge variant="outline" className="text-xs bg-amber-50 text-amber-800">
                          Template v{reviewDetail.review.templateVersion}
                        </Badge>
                        <Badge variant="default" className="text-xs bg-stone-900 text-white">
                          {reviewDetail.review.status}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-3 pt-1">
                        <div className="h-11 w-11 rounded-full bg-amber-100 text-amber-800 font-bold text-base flex items-center justify-center border border-amber-200">
                          {reviewDetail.review.employee?.displayName.charAt(0)}
                        </div>
                        <div>
                          <h2 className="text-lg font-bold text-stone-900">
                            {reviewDetail.review.employee?.displayName}
                          </h2>
                          <p className="text-xs text-stone-500">
                            {reviewDetail.review.employee?.employeeCode} &bull;{' '}
                            {reviewDetail.review.employee?.employment?.designation?.title ||
                              'Designation'}{' '}
                            &bull;{' '}
                            {reviewDetail.review.employee?.employment?.department?.name ||
                              'Department'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Live Score Banner & Actions */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                      {liveScorePreview && (
                        <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-right">
                          <span className="text-[10px] text-amber-800 font-semibold uppercase block">
                            Calculated Rating
                          </span>
                          <span className="text-xl font-extrabold text-amber-900 block leading-tight">
                            {liveScorePreview.overall} / {reviewDetail.ratingScaleMax}
                          </span>
                          <span className="text-[10px] text-amber-700 block">
                            Goals: {liveScorePreview.goalsScore} | Comps:{' '}
                            {liveScorePreview.compsScore}
                          </span>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        {reviewDetail.canEdit && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleSaveDraft}
                              disabled={isSaving}
                              className="text-xs flex items-center gap-1.5"
                            >
                              <Save className="h-3.5 w-3.5" />
                              <span>{isSaving ? 'Saving...' : 'Save Draft'}</span>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setIsReturnModalOpen(true)}
                              className="text-xs text-rose-700 border-rose-200 hover:bg-rose-50 flex items-center gap-1.5"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              <span>Return for Edits</span>
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={handleSubmitReview}
                              disabled={isSubmitting}
                              className="bg-amber-600 hover:bg-amber-700 text-white text-xs flex items-center gap-1.5"
                            >
                              <Send className="h-3.5 w-3.5" />
                              <span>{isSubmitting ? 'Submitting...' : 'Submit Evaluation'}</span>
                            </Button>
                          </>
                        )}

                        {reviewDetail.canFinalize && (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => setIsFinalizeModalOpen(true)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs flex items-center gap-1.5"
                          >
                            <ShieldCheck className="h-3.5 w-3.5" />
                            <span>Finalize Review</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Workspace Navigation Tabs */}
              <div className="flex border-b border-stone-200 bg-white rounded-t-xl px-4">
                <button
                  onClick={() => setActiveDetailTab('EVALUATION')}
                  className={`py-3.5 px-4 font-semibold text-xs border-b-2 flex items-center gap-2 transition-colors ${
                    activeDetailTab === 'EVALUATION'
                      ? 'border-amber-600 text-amber-800'
                      : 'border-transparent text-stone-500 hover:text-stone-800'
                  }`}
                >
                  <Award className="h-3.5 w-3.5" />
                  <span>Manager Evaluation & Ratings</span>
                </button>

                <button
                  onClick={() => setActiveDetailTab('SELF_ASSESSMENT')}
                  className={`py-3.5 px-4 font-semibold text-xs border-b-2 flex items-center gap-2 transition-colors ${
                    activeDetailTab === 'SELF_ASSESSMENT'
                      ? 'border-amber-600 text-amber-800'
                      : 'border-transparent text-stone-500 hover:text-stone-800'
                  }`}
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Employee Self-Assessment & Evidence</span>
                </button>

                <button
                  onClick={() => setActiveDetailTab('HISTORY')}
                  className={`py-3.5 px-4 font-semibold text-xs border-b-2 flex items-center gap-2 transition-colors ${
                    activeDetailTab === 'HISTORY'
                      ? 'border-amber-600 text-amber-800'
                      : 'border-transparent text-stone-500 hover:text-stone-800'
                  }`}
                >
                  <History className="h-3.5 w-3.5" />
                  <span>Audit History Timeline</span>
                </button>
              </div>

              {/* TAB 1: EVALUATION FORM */}
              {activeDetailTab === 'EVALUATION' && (
                <div className="space-y-6">
                  {/* Goals Section */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                      <Target className="h-4 w-4 text-amber-600" />
                      <span>
                        Goals Evaluation ({reviewDetail.review.cycle?.goalsWeightPercentage || 70}%
                        Weight)
                      </span>
                    </h3>

                    {reviewDetail.review.items
                      ?.filter((it) => !!it.goalId)
                      .map((it, idx) => {
                        const entry = it.goalId ? itemRatings[it.goalId] : null;
                        const currentRating = entry?.rating ?? it.managerRating ?? 3;

                        return (
                          <Card key={it.id} className="border border-stone-200 bg-white">
                            <CardContent className="p-5 space-y-4">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-3">
                                <div>
                                  <span className="text-[10px] font-bold text-amber-800 uppercase mr-2">
                                    Goal #{idx + 1}
                                  </span>
                                  <strong className="text-sm text-stone-900">
                                    {it.goal?.title}
                                  </strong>
                                </div>
                                <div className="flex items-center gap-2 text-xs">
                                  <Badge variant="outline" className="text-[10px]">
                                    Weight: {it.goal?.weight}%
                                  </Badge>
                                  {it.selfRating && (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] bg-blue-50 text-blue-700"
                                    >
                                      Self Rating: {it.selfRating} / {reviewDetail.ratingScaleMax}
                                    </Badge>
                                  )}
                                </div>
                              </div>

                              {it.selfComments && (
                                <div className="p-2.5 rounded-lg bg-stone-50 text-xs text-stone-700">
                                  <strong className="text-stone-900 block text-[11px] mb-0.5">
                                    Employee Self Reflection:
                                  </strong>
                                  {it.selfComments}
                                </div>
                              )}

                              {/* Manager Rating Input */}
                              <div className="space-y-2">
                                <label className="text-xs font-semibold text-stone-800">
                                  Evaluator Rating (1 to {reviewDetail.ratingScaleMax})
                                </label>
                                <div className="flex items-center gap-2">
                                  {Array.from(
                                    { length: reviewDetail.ratingScaleMax },
                                    (_, i) => i + 1,
                                  ).map((val) => (
                                    <button
                                      key={val}
                                      type="button"
                                      disabled={!reviewDetail.canEdit}
                                      onClick={() => {
                                        if (it.goalId) {
                                          setItemRatings((prev) => ({
                                            ...prev,
                                            [it.goalId!]: {
                                              rating: val,
                                              comments: prev[it.goalId!]?.comments || '',
                                              isNotApplicable: false,
                                            },
                                          }));
                                        }
                                      }}
                                      className={`h-8 w-10 rounded-lg text-xs font-bold transition-all ${
                                        currentRating === val
                                          ? 'bg-amber-600 text-white shadow-xs'
                                          : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                                      }`}
                                    >
                                      {val}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Manager Feedback Comment */}
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-stone-700">
                                  Evaluator Evidence & Comments
                                </label>
                                <textarea
                                  rows={2}
                                  disabled={!reviewDetail.canEdit}
                                  value={entry?.comments || ''}
                                  onChange={(e) => {
                                    if (it.goalId) {
                                      setItemRatings((prev) => ({
                                        ...prev,
                                        [it.goalId!]: {
                                          rating: currentRating,
                                          comments: e.target.value,
                                          isNotApplicable:
                                            prev[it.goalId!]?.isNotApplicable || false,
                                        },
                                      }));
                                    }
                                  }}
                                  placeholder="Enter specific manager feedback, delivery notes, or recognition..."
                                  className="w-full text-xs p-2.5 rounded-lg border border-stone-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20"
                                />
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                  </div>

                  {/* Competencies Section */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                      <Award className="h-4 w-4 text-amber-600" />
                      <span>
                        Competencies Evaluation (
                        {reviewDetail.review.cycle?.competenciesWeightPercentage || 30}% Weight)
                      </span>
                    </h3>

                    {reviewDetail.review.items
                      ?.filter((it) => !!it.competencyId)
                      .map((it, idx) => {
                        const entry = it.competencyId ? itemRatings[it.competencyId] : null;
                        const currentRating = entry?.rating ?? it.managerRating ?? 3;

                        return (
                          <Card key={it.id} className="border border-stone-200 bg-white">
                            <CardContent className="p-5 space-y-4">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-3">
                                <div>
                                  <span className="text-[10px] font-bold text-amber-800 uppercase mr-2">
                                    Competency #{idx + 1}
                                  </span>
                                  <strong className="text-sm text-stone-900">
                                    {it.competency?.name}
                                  </strong>
                                </div>
                                {it.selfRating && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] bg-blue-50 text-blue-700"
                                  >
                                    Self Rating: {it.selfRating} / {reviewDetail.ratingScaleMax}
                                  </Badge>
                                )}
                              </div>

                              {it.competency?.description && (
                                <p className="text-xs text-stone-500">
                                  {it.competency.description}
                                </p>
                              )}

                              {/* Rating buttons */}
                              <div className="space-y-2">
                                <label className="text-xs font-semibold text-stone-800">
                                  Evaluator Rating (1 to {reviewDetail.ratingScaleMax})
                                </label>
                                <div className="flex items-center gap-2">
                                  {Array.from(
                                    { length: reviewDetail.ratingScaleMax },
                                    (_, i) => i + 1,
                                  ).map((val) => (
                                    <button
                                      key={val}
                                      type="button"
                                      disabled={!reviewDetail.canEdit}
                                      onClick={() => {
                                        if (it.competencyId) {
                                          setItemRatings((prev) => ({
                                            ...prev,
                                            [it.competencyId!]: {
                                              rating: val,
                                              comments: prev[it.competencyId!]?.comments || '',
                                              isNotApplicable: false,
                                            },
                                          }));
                                        }
                                      }}
                                      className={`h-8 w-10 rounded-lg text-xs font-bold transition-all ${
                                        currentRating === val
                                          ? 'bg-amber-600 text-white shadow-xs'
                                          : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                                      }`}
                                    >
                                      {val}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Manager Comment */}
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-stone-700">
                                  Behavioral Feedback & Observations
                                </label>
                                <textarea
                                  rows={2}
                                  disabled={!reviewDetail.canEdit}
                                  value={entry?.comments || ''}
                                  onChange={(e) => {
                                    if (it.competencyId) {
                                      setItemRatings((prev) => ({
                                        ...prev,
                                        [it.competencyId!]: {
                                          rating: currentRating,
                                          comments: e.target.value,
                                          isNotApplicable:
                                            prev[it.competencyId!]?.isNotApplicable || false,
                                        },
                                      }));
                                    }
                                  }}
                                  placeholder="Assess alignment with company values, communication, or leadership..."
                                  className="w-full text-xs p-2.5 rounded-lg border border-stone-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20"
                                />
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                  </div>

                  {/* Manager Executive Reflections */}
                  <Card className="border border-stone-200 bg-white">
                    <CardHeader className="pb-3 border-b border-stone-100">
                      <CardTitle className="text-sm font-bold text-stone-900">
                        Executive Evaluation & Qualitative Feedback
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6 space-y-4">
                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-stone-800">
                          Executive Summary <span className="text-rose-500">*</span>
                        </label>
                        <textarea
                          rows={3}
                          disabled={!reviewDetail.canEdit}
                          value={managerSummary}
                          onChange={(e) => setManagerSummary(e.target.value)}
                          placeholder="Comprehensive review of overall performance, value generated, and alignment..."
                          className="w-full text-xs p-3 rounded-lg border border-stone-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-stone-800">
                          Demonstrated Strengths & Significant Wins{' '}
                          <span className="text-rose-500">*</span>
                        </label>
                        <textarea
                          rows={3}
                          disabled={!reviewDetail.canEdit}
                          value={managerStrengths}
                          onChange={(e) => setManagerStrengths(e.target.value)}
                          placeholder="Notable technical expertise, high-impact contributions, leadership qualities..."
                          className="w-full text-xs p-3 rounded-lg border border-stone-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-semibold text-stone-800">
                          Areas for Growth & Improvement Recommendations{' '}
                          <span className="text-rose-500">*</span>
                        </label>
                        <textarea
                          rows={3}
                          disabled={!reviewDetail.canEdit}
                          value={managerImprovements}
                          onChange={(e) => setManagerImprovements(e.target.value)}
                          placeholder="Skill gaps to close, processes to improve, or future focus areas..."
                          className="w-full text-xs p-3 rounded-lg border border-stone-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20"
                        />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Development Recommendations */}
                  <Card className="border border-stone-200 bg-white">
                    <CardHeader className="pb-3 border-b border-stone-100 flex flex-row items-center justify-between">
                      <CardTitle className="text-sm font-bold text-stone-900">
                        Individual Development Recommendations
                      </CardTitle>
                      {reviewDetail.canEdit && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleAddPlan}
                          className="text-xs gap-1"
                        >
                          <Plus className="h-3 w-3" />
                          <span>Add Action Plan</span>
                        </Button>
                      )}
                    </CardHeader>
                    <CardContent className="p-6 space-y-4">
                      {developmentPlans.length === 0 ? (
                        <p className="text-xs text-stone-400 italic">
                          No development action plans added.
                        </p>
                      ) : (
                        developmentPlans.map((dp, idx) => (
                          <div
                            key={idx}
                            className="p-4 rounded-xl border border-stone-200 bg-stone-50/50 space-y-3"
                          >
                            <div className="flex items-center justify-between">
                              <strong className="text-xs text-stone-800">
                                Objective #{idx + 1}
                              </strong>
                              {reviewDetail.canEdit && (
                                <button
                                  type="button"
                                  onClick={() => handleRemovePlan(idx)}
                                  className="text-stone-400 hover:text-rose-600 text-xs"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                            <input
                              type="text"
                              disabled={!reviewDetail.canEdit}
                              value={dp.objective}
                              onChange={(e) => {
                                const val = e.target.value;
                                setDevelopmentPlans((prev) =>
                                  prev.map((p, i) => (i === idx ? { ...p, objective: val } : p)),
                                );
                              }}
                              placeholder="Objective title (e.g. Master Distributed Systems Architecture)"
                              className="w-full text-xs p-2 rounded-lg border border-stone-200 bg-white"
                            />
                            <textarea
                              rows={2}
                              disabled={!reviewDetail.canEdit}
                              value={dp.actionSteps}
                              onChange={(e) => {
                                const val = e.target.value;
                                setDevelopmentPlans((prev) =>
                                  prev.map((p, i) => (i === idx ? { ...p, actionSteps: val } : p)),
                                );
                              }}
                              placeholder="Action steps and milestones..."
                              className="w-full text-xs p-2 rounded-lg border border-stone-200 bg-white"
                            />
                          </div>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* TAB 2: EMPLOYEE SELF-ASSESSMENT & EVIDENCE */}
              {activeDetailTab === 'SELF_ASSESSMENT' && (
                <div className="space-y-4">
                  <Card className="border border-stone-200 bg-white">
                    <CardHeader className="pb-3 border-b border-stone-100">
                      <CardTitle className="text-sm font-bold text-stone-900">
                        Employee Submitted Self-Assessment
                      </CardTitle>
                      <CardDescription className="text-xs text-stone-500">
                        Submitted at:{' '}
                        {reviewDetail.review.selfSubmittedAt
                          ? new Date(reviewDetail.review.selfSubmittedAt).toLocaleString()
                          : 'Pending'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-6 space-y-4 text-xs">
                      <div>
                        <strong className="text-stone-900 block mb-1">Executive Summary</strong>
                        <p className="p-3 rounded-lg bg-stone-50 text-stone-700 whitespace-pre-wrap">
                          {reviewDetail.review.selfSummary || 'Not provided'}
                        </p>
                      </div>

                      <div>
                        <strong className="text-stone-900 block mb-1">Key Achievements</strong>
                        <p className="p-3 rounded-lg bg-stone-50 text-stone-700 whitespace-pre-wrap">
                          {reviewDetail.review.selfAchievements || 'Not provided'}
                        </p>
                      </div>

                      {reviewDetail.review.selfChallenges && (
                        <div>
                          <strong className="text-stone-900 block mb-1">
                            Obstacles & Challenges Faced
                          </strong>
                          <p className="p-3 rounded-lg bg-stone-50 text-stone-700 whitespace-pre-wrap">
                            {reviewDetail.review.selfChallenges}
                          </p>
                        </div>
                      )}

                      {reviewDetail.review.skillsDeveloped && (
                        <div>
                          <strong className="text-stone-900 block mb-1">Skills Developed</strong>
                          <p className="p-3 rounded-lg bg-stone-50 text-stone-700 whitespace-pre-wrap">
                            {reviewDetail.review.skillsDeveloped}
                          </p>
                        </div>
                      )}

                      {reviewDetail.review.developmentInterests && (
                        <div>
                          <strong className="text-stone-900 block mb-1">
                            Development & Career Interests
                          </strong>
                          <p className="p-3 rounded-lg bg-stone-50 text-stone-700 whitespace-pre-wrap">
                            {reviewDetail.review.developmentInterests}
                          </p>
                        </div>
                      )}

                      {/* Attachments */}
                      {reviewDetail.review.selfEvidenceAttachments &&
                        reviewDetail.review.selfEvidenceAttachments.length > 0 && (
                          <div className="pt-2">
                            <strong className="text-stone-900 block mb-2">
                              Supporting Attachments (
                              {reviewDetail.review.selfEvidenceAttachments.length})
                            </strong>
                            <div className="divide-y divide-stone-100 rounded-lg border border-stone-200">
                              {reviewDetail.review.selfEvidenceAttachments.map((att, i) => (
                                <div key={i} className="p-3 flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <Paperclip className="h-4 w-4 text-stone-400" />
                                    <span className="font-medium text-stone-800">{att.name}</span>
                                  </div>
                                  <a
                                    href={att.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-amber-700 font-semibold hover:underline flex items-center gap-1"
                                  >
                                    <span>View Artifact</span>
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* TAB 3: AUDIT HISTORY TIMELINE */}
              {activeDetailTab === 'HISTORY' && (
                <Card className="border border-stone-200 bg-white">
                  <CardHeader className="pb-3 border-b border-stone-100">
                    <CardTitle className="text-sm font-bold text-stone-900 flex items-center gap-2">
                      <History className="h-4 w-4 text-stone-500" />
                      <span>Audit Trail & State Transitions</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    {reviewDetail.review.history && reviewDetail.review.history.length > 0 ? (
                      <div className="space-y-4">
                        {reviewDetail.review.history.map((hist, i) => (
                          <div key={hist.id || i} className="flex items-start gap-3 text-xs">
                            <div className="h-6 w-6 rounded-full bg-stone-100 text-stone-700 font-bold flex items-center justify-center shrink-0 mt-0.5">
                              {i + 1}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-stone-900">{hist.action}</span>
                                <span className="text-[10px] text-stone-400">
                                  {new Date(hist.createdAt).toLocaleString()}
                                </span>
                              </div>
                              {hist.changeReason && (
                                <p className="text-stone-600 text-[11px] mt-0.5">
                                  {hist.changeReason}
                                </p>
                              )}
                              {hist.actor && (
                                <span className="text-[10px] text-stone-400 block mt-0.5">
                                  Actor: {hist.actor.displayName} ({hist.actor.employeeCode})
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-stone-400 italic">
                        No history records logged yet.
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* Return for Revision Dialog */}
      <Dialog
        isOpen={isReturnModalOpen}
        onClose={() => setIsReturnModalOpen(false)}
        title="Return Self-Assessment for Revision"
      >
        <div className="space-y-4 p-2">
          <p className="text-xs text-stone-600">
            Returning this evaluation unlocks it for editing by the employee. You must specify what
            revisions are required.
          </p>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-stone-800">
              Revision Reason / Feedback <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={3}
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              placeholder="e.g. Please update achievement metrics for Goal #2 and provide Jira sprint links..."
              className="w-full text-xs p-2.5 rounded-lg border border-stone-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsReturnModalOpen(false)}
              disabled={isReturning}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleReturnReview}
              disabled={isReturning || !returnReason.trim()}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {isReturning ? 'Returning...' : 'Return Review'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Finalize Dialog */}
      <Dialog
        isOpen={isFinalizeModalOpen}
        onClose={() => setIsFinalizeModalOpen(false)}
        title="Finalize Performance Review"
      >
        <div className="space-y-4 p-2">
          <p className="text-xs text-stone-600">
            Finalizing officially closes this review. The score will become official and locked for
            further edits.
          </p>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-stone-800">Final Concluding Remarks</label>
            <textarea
              rows={3}
              value={finalizeComments}
              onChange={(e) => setFinalizeComments(e.target.value)}
              placeholder="e.g. Approved and calibrated during department executive review..."
              className="w-full text-xs p-2.5 rounded-lg border border-stone-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsFinalizeModalOpen(false)}
              disabled={isFinalizing}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleFinalizeReview}
              disabled={isFinalizing}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isFinalizing ? 'Finalizing...' : 'Confirm Finalization'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};
