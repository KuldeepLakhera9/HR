'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useRole } from '../../context/RoleContext';
import { performanceApi } from '../../lib/api-client';
import {
  EmployeeActiveReviewContextDto,
  PerformanceReviewDto,
  SaveSelfAssessmentDraftDto,
  SubmitSelfAssessmentDto,
  SelfAssessmentAttachment,
  SelfAssessmentItemInput,
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
} from '@hrms/ui';
import {
  FileText,
  Target,
  Award,
  CheckCircle2,
  Clock,
  AlertCircle,
  Save,
  Send,
  UploadCloud,
  Paperclip,
  Trash2,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  Calendar,
  User,
  History,
  RotateCcw,
  Sparkles,
  HelpCircle,
  ShieldCheck,
  Check,
  RefreshCw,
  Lock,
} from 'lucide-react';

interface SelfAssessmentViewProps {
  initialCycleId?: string;
  onRefreshParent?: () => void;
}

type AssessmentStep = 'GOALS' | 'COMPETENCIES' | 'REFLECTION' | 'EVIDENCE' | 'SUBMIT';

export const SelfAssessmentView: React.FC<SelfAssessmentViewProps> = ({
  initialCycleId,
  onRefreshParent,
}) => {
  const { user } = useAuth();
  const { role } = useRole();
  const isHrOrAdmin = role === 'ADMIN' || role === 'HR';

  // Core Data State
  const [context, setContext] = useState<EmployeeActiveReviewContextDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Notifications
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Stepper state
  const [activeStep, setActiveStep] = useState<AssessmentStep>('GOALS');

  // Form State
  const [selfSummary, setSelfSummary] = useState('');
  const [selfAchievements, setSelfAchievements] = useState('');
  const [selfChallenges, setSelfChallenges] = useState('');
  const [skillsDeveloped, setSkillsDeveloped] = useState('');
  const [developmentInterests, setDevelopmentInterests] = useState('');
  const [attachments, setAttachments] = useState<SelfAssessmentAttachment[]>([]);
  const [itemRatings, setItemRatings] = useState<
    Record<
      string,
      {
        rating?: number;
        comments?: string;
        evidenceUrl?: string;
        isNotApplicable?: boolean;
      }
    >
  >({});

  // External Link Input modal / state
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [externalLinkUrl, setExternalLinkUrl] = useState('');
  const [externalLinkName, setExternalLinkName] = useState('');

  // Submit confirmation dialog
  const [isSubmitConfirmOpen, setIsSubmitConfirmOpen] = useState(false);

  // HR Reopen dialog
  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [isReopening, setIsReopening] = useState(false);

  // Fetch active review context
  const loadContext = useCallback(
    async (cycleId?: string) => {
      setIsLoading(true);
      setFeedbackError(null);
      try {
        const data = await performanceApi.getSelfAssessmentContext(cycleId || initialCycleId);
        setContext(data);

        // Populate form if review exists
        if (data.review) {
          setSelfSummary(data.review.selfSummary || '');
          setSelfAchievements(data.review.selfAchievements || '');
          setSelfChallenges(data.review.selfChallenges || '');
          setSkillsDeveloped(data.review.skillsDeveloped || '');
          setDevelopmentInterests(data.review.developmentInterests || '');
          setAttachments(data.review.selfEvidenceAttachments || []);

          const ratingsMap: Record<string, any> = {};
          if (data.review.items) {
            for (const it of data.review.items) {
              const key = it.goalId || it.competencyId;
              if (key) {
                ratingsMap[key] = {
                  rating: it.selfRating !== null ? it.selfRating : undefined,
                  comments: it.selfComments || '',
                  evidenceUrl: it.selfEvidenceUrl || '',
                  isNotApplicable: it.isNotApplicable,
                };
              }
            }
          }
          setItemRatings(ratingsMap);
        }
      } catch (err: any) {
        setFeedbackError(
          err?.message || 'Failed to load performance cycle self-assessment details.',
        );
      } finally {
        setIsLoading(false);
      }
    },
    [initialCycleId],
  );

  useEffect(() => {
    loadContext();
  }, [loadContext]);

  // Read-only / Submitted check
  const isSubmitted = useMemo(() => {
    if (!context?.review) return false;
    return (
      context.review.status === 'SELF_ASSESSMENT_SUBMITTED' ||
      context.review.status === 'MANAGER_REVIEW_DRAFT' ||
      context.review.status === 'MANAGER_REVIEW_SUBMITTED' ||
      context.review.status === 'HR_CALIBRATION' ||
      context.review.status === 'FINALIZED'
    );
  }, [context?.review]);

  const canEdit = context ? context.canEdit && !isSubmitted : false;

  // Build items array from state
  const buildItemsPayload = useCallback((): SelfAssessmentItemInput[] => {
    const list: SelfAssessmentItemInput[] = [];

    // Goals
    if (context?.goals) {
      for (const g of context.goals) {
        const entry = itemRatings[g.id];
        if (entry) {
          list.push({
            goalId: g.id,
            selfRating: entry.rating,
            selfComments: entry.comments,
            selfEvidenceUrl: entry.evidenceUrl,
            isNotApplicable: entry.isNotApplicable,
          });
        }
      }
    }

    // Competencies
    if (context?.competencies) {
      for (const c of context.competencies) {
        const entry = itemRatings[c.id];
        if (entry) {
          list.push({
            competencyId: c.id,
            selfRating: entry.rating,
            selfComments: entry.comments,
            isNotApplicable: entry.isNotApplicable,
          });
        }
      }
    }

    return list;
  }, [context?.goals, context?.competencies, itemRatings]);

  // Save Draft
  const handleSaveDraft = async () => {
    if (!context?.cycle?.id || !canEdit) return;
    setIsSaving(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);

    try {
      const payload: SaveSelfAssessmentDraftDto = {
        cycleId: context.cycle.id,
        selfSummary: selfSummary || undefined,
        selfAchievements: selfAchievements || undefined,
        selfChallenges: selfChallenges || undefined,
        skillsDeveloped: skillsDeveloped || undefined,
        developmentInterests: developmentInterests || undefined,
        selfEvidenceAttachments: attachments,
        items: buildItemsPayload(),
      };

      const updatedReview = await performanceApi.saveSelfAssessmentDraft(payload);
      setContext((prev) => (prev ? { ...prev, review: updatedReview } : null));
      setLastSavedAt(new Date());
      setFeedbackSuccess('Self-assessment draft saved successfully.');
      setTimeout(() => setFeedbackSuccess(null), 3500);
    } catch (err: any) {
      setFeedbackError(err?.message || 'Failed to save draft self-assessment.');
    } finally {
      setIsSaving(false);
    }
  };

  // Submit Final
  const handleSubmitFinal = async () => {
    if (!context?.cycle?.id) return;

    if (!selfSummary.trim() || selfSummary.trim().length < 10) {
      setFeedbackError('Executive summary is required and must contain at least 10 characters.');
      setActiveStep('REFLECTION');
      setIsSubmitConfirmOpen(false);
      return;
    }

    if (!selfAchievements.trim() || selfAchievements.trim().length < 10) {
      setFeedbackError('Key achievements are required and must contain at least 10 characters.');
      setActiveStep('REFLECTION');
      setIsSubmitConfirmOpen(false);
      return;
    }

    setIsSubmitting(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);

    try {
      const payload: SubmitSelfAssessmentDto = {
        cycleId: context.cycle.id,
        selfSummary: selfSummary.trim(),
        selfAchievements: selfAchievements.trim(),
        selfChallenges: selfChallenges.trim() || undefined,
        skillsDeveloped: skillsDeveloped.trim() || undefined,
        developmentInterests: developmentInterests.trim() || undefined,
        selfEvidenceAttachments: attachments,
        items: buildItemsPayload(),
      };

      const submittedReview = await performanceApi.submitSelfAssessment(payload);
      setContext((prev) => (prev ? { ...prev, review: submittedReview } : null));
      setIsSubmitConfirmOpen(false);
      setFeedbackSuccess(
        'Your self-assessment has been formally submitted and locked for manager review.',
      );
      if (onRefreshParent) onRefreshParent();
    } catch (err: any) {
      setFeedbackError(err?.message || 'Failed to submit self-assessment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reopen Review (HR / Admin)
  const handleReopen = async () => {
    if (!context?.review?.id || !reopenReason.trim()) return;
    setIsReopening(true);
    setFeedbackError(null);
    try {
      const reopened = await performanceApi.reopenSelfAssessment(
        context.review.id,
        reopenReason.trim(),
      );
      setContext((prev) => (prev ? { ...prev, review: reopened, canEdit: true } : null));
      setIsReopenModalOpen(false);
      setReopenReason('');
      setFeedbackSuccess(
        'Self-assessment has been reopened for employee editing. An audit record was created.',
      );
      if (onRefreshParent) onRefreshParent();
    } catch (err: any) {
      setFeedbackError(err?.message || 'Failed to reopen self-assessment.');
    } finally {
      setIsReopening(false);
    }
  };

  // File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setFeedbackError('Selected file exceeds maximum allowed size (10MB).');
      return;
    }

    setIsUploading(true);
    setFeedbackError(null);
    try {
      const uploaded = await performanceApi.uploadSelfAssessmentEvidence(file);
      setAttachments((prev) => [...prev, uploaded]);
      setFeedbackSuccess(`Uploaded "${file.name}" successfully.`);
      setTimeout(() => setFeedbackSuccess(null), 3000);
    } catch (err: any) {
      setFeedbackError(err?.message || 'Failed to upload evidence file.');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  // Add External Link
  const handleAddExternalLink = () => {
    if (!externalLinkUrl.trim() || !externalLinkName.trim()) {
      setFeedbackError('Please enter both a link title and valid URL.');
      return;
    }
    setAttachments((prev) => [
      ...prev,
      {
        name: externalLinkName.trim(),
        url: externalLinkUrl.trim(),
        mimeType: 'link/url',
      },
    ]);
    setExternalLinkName('');
    setExternalLinkUrl('');
    setIsLinkModalOpen(false);
  };

  // Delete Attachment
  const handleRemoveAttachment = (index: number) => {
    if (!canEdit) return;
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // Validation Completion Computations
  const goalsEvaluatedCount = useMemo(() => {
    if (!context?.goals) return 0;
    return context.goals.filter((g) => {
      const entry = itemRatings[g.id];
      return entry?.rating !== undefined || entry?.isNotApplicable;
    }).length;
  }, [context?.goals, itemRatings]);

  const competenciesEvaluatedCount = useMemo(() => {
    if (!context?.competencies) return 0;
    return context.competencies.filter((c) => {
      const entry = itemRatings[c.id];
      return entry?.rating !== undefined || entry?.isNotApplicable;
    }).length;
  }, [context?.competencies, itemRatings]);

  const isReflectionComplete = useMemo(() => {
    return selfSummary.trim().length >= 10 && selfAchievements.trim().length >= 10;
  }, [selfSummary, selfAchievements]);

  if (isLoading) {
    return (
      <Card className="p-12 text-center bg-white border-stone-200">
        <RefreshCw className="h-8 w-8 text-amber-600 animate-spin mx-auto mb-3" />
        <p className="text-stone-600 font-medium">Loading self-assessment cycle and goals...</p>
      </Card>
    );
  }

  if (!context) {
    return (
      <Card className="p-8 text-center bg-white border-stone-200">
        <AlertCircle className="h-10 w-10 text-amber-600 mx-auto mb-3" />
        <h3 className="text-base font-semibold text-stone-900">No Active Review Cycle</h3>
        <p className="text-sm text-stone-600 mt-1 max-w-md mx-auto">
          You are not currently enrolled in any active performance review cycle. Please contact HR
          if you believe this is in error.
        </p>
      </Card>
    );
  }

  const { cycle, participant, review, goals, competencies } = context;
  const ratingMax = cycle.ratingScaleMax || 5;

  return (
    <div className="space-y-6">
      {/* Notifications */}
      {feedbackSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{feedbackSuccess}</span>
          </div>
          <button
            onClick={() => setFeedbackSuccess(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold ml-2"
          >
            ×
          </button>
        </div>
      )}

      {feedbackError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>{feedbackError}</span>
          </div>
          <button
            onClick={() => setFeedbackError(null)}
            className="text-rose-700 hover:text-rose-900 font-bold ml-2"
          >
            ×
          </button>
        </div>
      )}

      {/* Cycle & Submission Overview Banner */}
      <Card className="border border-stone-200 shadow-xs bg-gradient-to-r from-stone-50 via-white to-amber-50/20">
        <CardContent className="p-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-xs bg-white text-stone-700">
                  {cycle.code}
                </Badge>
                <Badge
                  variant="outline"
                  className="text-xs bg-amber-50 text-amber-800 border-amber-300"
                >
                  Template v{review?.templateVersion || cycle.templateVersion}
                </Badge>
                {review?.status === 'SELF_ASSESSMENT_SUBMITTED' ? (
                  <Badge variant="default" className="bg-emerald-600 text-white font-medium">
                    <CheckCircle2 className="h-3 w-3 mr-1 inline" /> Submitted
                  </Badge>
                ) : review?.status === 'REOPENED' ? (
                  <Badge variant="default" className="bg-amber-600 text-white font-medium">
                    <RotateCcw className="h-3 w-3 mr-1 inline" /> Reopened for Edits
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                    Draft in Progress
                  </Badge>
                )}
                {participant.status === 'EXEMPTED' && (
                  <Badge variant="outline" className="bg-stone-100 text-stone-700">
                    Exempted: {participant.exemptionReason || 'Policy'}
                  </Badge>
                )}
              </div>

              <h2 className="text-xl font-bold text-stone-900 tracking-tight">{cycle.name}</h2>
              {cycle.description && (
                <p className="text-xs text-stone-600 max-w-2xl">{cycle.description}</p>
              )}

              <div className="flex flex-wrap items-center gap-4 text-xs text-stone-500 pt-1">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-stone-400" />
                  Review Period:{' '}
                  <strong className="text-stone-700">
                    {new Date(cycle.startDate).toLocaleDateString()} –{' '}
                    {new Date(cycle.endDate).toLocaleDateString()}
                  </strong>
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-amber-600" />
                  Self-Assessment Deadline:{' '}
                  <strong className="text-amber-800">
                    {cycle.selfAssessmentDeadline
                      ? new Date(cycle.selfAssessmentDeadline).toLocaleDateString()
                      : 'None'}
                  </strong>
                </span>
                {participant.manager && (
                  <span className="flex items-center gap-1">
                    <User className="h-3.5 w-3.5 text-stone-400" />
                    Assigned Reviewer:{' '}
                    <strong className="text-stone-700">
                      {participant.manager.displayName} ({participant.manager.employeeCode})
                    </strong>
                  </span>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-2 self-start lg:self-center">
              {canEdit && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSaveDraft}
                    disabled={isSaving}
                    className="flex items-center gap-1.5"
                  >
                    {isSaving ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    <span>Save Draft</span>
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setIsSubmitConfirmOpen(true)}
                    disabled={isSubmitting || !isReflectionComplete}
                    className="bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1.5"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Submit Assessment</span>
                  </Button>
                </>
              )}

              {/* HR / Admin Reopen Action */}
              {isHrOrAdmin && isSubmitted && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsReopenModalOpen(true)}
                  className="text-amber-700 border-amber-300 hover:bg-amber-50 flex items-center gap-1.5"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reopen for Corrections</span>
                </Button>
              )}
            </div>
          </div>

          {/* Reopen notice if applicable */}
          {review?.status === 'REOPENED' && review.reopenReason && (
            <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
              <RotateCcw className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>Self-Assessment Reopened by HR:</strong> &quot;{review.reopenReason}&quot;
                <span className="block text-amber-700 mt-0.5">
                  You may update your ratings, narrative responses, and evidence before
                  resubmitting.
                </span>
              </div>
            </div>
          )}

          {lastSavedAt && (
            <p className="text-[11px] text-stone-400 mt-2 text-right">
              Draft saved at {lastSavedAt.toLocaleTimeString()}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Navigation Stepper */}
      <div className="flex border-b border-stone-200 bg-white rounded-t-xl px-4 overflow-x-auto">
        <button
          onClick={() => setActiveStep('GOALS')}
          className={`py-3.5 px-4 font-medium text-xs border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeStep === 'GOALS'
              ? 'border-amber-600 text-amber-700'
              : 'border-transparent text-stone-600 hover:text-stone-900'
          }`}
        >
          <Target className="h-3.5 w-3.5" />
          <span>1. Goals Evaluation</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-600 font-semibold">
            {goalsEvaluatedCount}/{goals.length}
          </span>
        </button>

        {competencies.length > 0 && (
          <button
            onClick={() => setActiveStep('COMPETENCIES')}
            className={`py-3.5 px-4 font-medium text-xs border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
              activeStep === 'COMPETENCIES'
                ? 'border-amber-600 text-amber-700'
                : 'border-transparent text-stone-600 hover:text-stone-900'
            }`}
          >
            <Award className="h-3.5 w-3.5" />
            <span>2. Core Competencies</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-600 font-semibold">
              {competenciesEvaluatedCount}/{competencies.length}
            </span>
          </button>
        )}

        <button
          onClick={() => setActiveStep('REFLECTION')}
          className={`py-3.5 px-4 font-medium text-xs border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeStep === 'REFLECTION'
              ? 'border-amber-600 text-amber-700'
              : 'border-transparent text-stone-600 hover:text-stone-900'
          }`}
        >
          <FileText className="h-3.5 w-3.5" />
          <span>3. Reflection & Development</span>
          {isReflectionComplete && <Check className="h-3.5 w-3.5 text-emerald-600" />}
        </button>

        <button
          onClick={() => setActiveStep('EVIDENCE')}
          className={`py-3.5 px-4 font-medium text-xs border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeStep === 'EVIDENCE'
              ? 'border-amber-600 text-amber-700'
              : 'border-transparent text-stone-600 hover:text-stone-900'
          }`}
        >
          <Paperclip className="h-3.5 w-3.5" />
          <span>4. Supporting Evidence</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-600 font-semibold">
            {attachments.length}
          </span>
        </button>

        <button
          onClick={() => setActiveStep('SUBMIT')}
          className={`py-3.5 px-4 font-medium text-xs border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeStep === 'SUBMIT'
              ? 'border-amber-600 text-amber-700'
              : 'border-transparent text-stone-600 hover:text-stone-900'
          }`}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>5. Review & Submit</span>
        </button>
      </div>

      {/* STEP 1: GOALS EVALUATION */}
      {activeStep === 'GOALS' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-stone-900">
                Performance Goals & KPIs Assessment
              </h3>
              <p className="text-xs text-stone-500">
                Rate your deliverables and accomplishments against assigned goals on a 1 to{' '}
                {ratingMax} scale.
              </p>
            </div>
            <span className="text-xs text-stone-600 font-medium">
              Weight Contribution: {cycle.goalsWeightPercentage}%
            </span>
          </div>

          {goals.length === 0 ? (
            <Card className="p-8 text-center bg-stone-50 border-stone-200">
              <Target className="h-8 w-8 text-stone-400 mx-auto mb-2" />
              <p className="text-xs text-stone-600">
                No active approved goals found for this review cycle. You may proceed to
                competencies and reflection.
              </p>
            </Card>
          ) : (
            <div className="space-y-4">
              {goals.map((goal, idx) => {
                const currentEntry = itemRatings[goal.id] || {};
                const currentScore = currentEntry.rating;

                return (
                  <Card key={goal.id} className="border border-stone-200 shadow-2xs bg-white">
                    <CardContent className="p-5 space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-3">
                        <div className="flex items-center gap-2">
                          <span className="h-5 w-5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <h4 className="text-sm font-semibold text-stone-900">{goal.title}</h4>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">
                            {goal.category}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-stone-50 text-stone-700 font-semibold"
                          >
                            Weight: {goal.weight}%
                          </Badge>
                        </div>
                      </div>

                      {goal.description && (
                        <p className="text-xs text-stone-600">{goal.description}</p>
                      )}

                      {/* Goal Metrics */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-stone-50 text-xs">
                        <div>
                          <span className="text-[10px] text-stone-500 block uppercase font-medium">
                            Baseline
                          </span>
                          <span className="font-semibold text-stone-800">
                            {goal.baselineValue ?? 0} {goal.unit || ''}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-stone-500 block uppercase font-medium">
                            Target
                          </span>
                          <span className="font-semibold text-stone-800">
                            {goal.targetValue ?? 'N/A'} {goal.unit || ''}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-stone-500 block uppercase font-medium">
                            Current Value
                          </span>
                          <span className="font-semibold text-amber-700">
                            {goal.currentValue ?? 0} {goal.unit || ''}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-stone-500 block uppercase font-medium">
                            Progress
                          </span>
                          <span className="font-semibold text-emerald-700">
                            {goal.progressPercentage}%
                          </span>
                        </div>
                      </div>

                      {/* Rating input */}
                      <div className="space-y-2 pt-1">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <label className="text-xs font-semibold text-stone-800">
                            Self Rating (1 to {ratingMax})
                          </label>
                          <label className="flex items-center gap-1.5 text-xs text-stone-600 cursor-pointer">
                            <input
                              type="checkbox"
                              disabled={!canEdit}
                              checked={currentEntry.isNotApplicable || false}
                              onChange={(e) => {
                                setItemRatings((prev) => ({
                                  ...prev,
                                  [goal.id]: {
                                    ...prev[goal.id],
                                    isNotApplicable: e.target.checked,
                                  },
                                }));
                              }}
                              className="rounded-sm border-stone-300 text-amber-600 focus:ring-amber-500"
                            />
                            <span>Not Applicable</span>
                          </label>
                        </div>

                        {!currentEntry.isNotApplicable && (
                          <div className="flex items-center gap-2">
                            {Array.from({ length: ratingMax }, (_, i) => i + 1).map((val) => (
                              <button
                                key={val}
                                type="button"
                                disabled={!canEdit}
                                onClick={() => {
                                  setItemRatings((prev) => ({
                                    ...prev,
                                    [goal.id]: {
                                      ...prev[goal.id],
                                      rating: val,
                                    },
                                  }));
                                }}
                                className={`h-8 w-10 rounded-lg text-xs font-bold transition-all ${
                                  currentScore === val
                                    ? 'bg-amber-600 text-white shadow-xs'
                                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                                }`}
                              >
                                {val}
                              </button>
                            ))}
                            {currentScore && (
                              <span className="text-xs text-stone-500 ml-2">
                                Selected:{' '}
                                <strong>
                                  {currentScore} / {ratingMax}
                                </strong>
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Comments */}
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-stone-700">
                          Self Assessment Comments & Evidence Context
                        </label>
                        <textarea
                          rows={2}
                          disabled={!canEdit}
                          value={currentEntry.comments || ''}
                          onChange={(e) => {
                            setItemRatings((prev) => ({
                              ...prev,
                              [goal.id]: {
                                ...prev[goal.id],
                                comments: e.target.value,
                              },
                            }));
                          }}
                          placeholder="Describe specific milestones, measurable outcomes, or challenges encountered..."
                          className="w-full text-xs p-2.5 rounded-lg border border-stone-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setActiveStep(competencies.length > 0 ? 'COMPETENCIES' : 'REFLECTION')}
              className="bg-stone-900 text-white flex items-center gap-1.5"
            >
              <span>Next: {competencies.length > 0 ? 'Competencies' : 'Reflection'}</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 2: CORE COMPETENCIES */}
      {activeStep === 'COMPETENCIES' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-stone-900">
                Core Organizational Competencies
              </h3>
              <p className="text-xs text-stone-500">
                Evaluate organizational values, leadership qualities, and behavioral expectations.
              </p>
            </div>
            <span className="text-xs text-stone-600 font-medium">
              Weight Contribution: {cycle.competenciesWeightPercentage}%
            </span>
          </div>

          <div className="space-y-4">
            {competencies.map((comp, idx) => {
              const currentEntry = itemRatings[comp.id] || {};
              const currentScore = currentEntry.rating;

              return (
                <Card key={comp.id} className="border border-stone-200 shadow-2xs bg-white">
                  <CardContent className="p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="h-5 w-5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <h4 className="text-sm font-semibold text-stone-900">{comp.name}</h4>
                      </div>
                      <Badge variant="outline" className="text-[10px] bg-stone-50">
                        {comp.category}
                      </Badge>
                    </div>

                    {comp.description && (
                      <p className="text-xs text-stone-600">{comp.description}</p>
                    )}

                    {/* Rating buttons */}
                    <div className="space-y-1.5 pt-1">
                      <label className="text-xs font-semibold text-stone-800">
                        Self Rating (1 to {ratingMax})
                      </label>
                      <div className="flex items-center gap-2">
                        {Array.from({ length: ratingMax }, (_, i) => i + 1).map((val) => (
                          <button
                            key={val}
                            type="button"
                            disabled={!canEdit}
                            onClick={() => {
                              setItemRatings((prev) => ({
                                ...prev,
                                [comp.id]: {
                                  ...prev[comp.id],
                                  rating: val,
                                },
                              }));
                            }}
                            className={`h-8 w-10 rounded-lg text-xs font-bold transition-all ${
                              currentScore === val
                                ? 'bg-amber-600 text-white shadow-xs'
                                : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                            }`}
                          >
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Comments */}
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-stone-700">
                        Behavioral Evidence & Examples
                      </label>
                      <textarea
                        rows={2}
                        disabled={!canEdit}
                        value={currentEntry.comments || ''}
                        onChange={(e) => {
                          setItemRatings((prev) => ({
                            ...prev,
                            [comp.id]: {
                              ...prev[comp.id],
                              comments: e.target.value,
                            },
                          }));
                        }}
                        placeholder="Provide concrete situations demonstrating adherence to this competency..."
                        className="w-full text-xs p-2.5 rounded-lg border border-stone-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                      />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveStep('GOALS')}
              className="flex items-center gap-1"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Back: Goals</span>
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setActiveStep('REFLECTION')}
              className="bg-stone-900 text-white flex items-center gap-1.5"
            >
              <span>Next: Reflection</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3: REFLECTION & DEVELOPMENT */}
      {activeStep === 'REFLECTION' && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-stone-900">
              Executive Reflection & Professional Development
            </h3>
            <p className="text-xs text-stone-500">
              Synthesize key deliverables, obstacles overcome, and future learning objectives.
            </p>
          </div>

          <Card className="border border-stone-200 bg-white">
            <CardContent className="p-6 space-y-5">
              {/* Executive Summary */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-stone-900">
                    Executive Summary <span className="text-rose-500">*</span>
                  </label>
                  <span
                    className={`text-[10px] font-medium ${
                      selfSummary.trim().length >= 10 ? 'text-emerald-600' : 'text-stone-400'
                    }`}
                  >
                    {selfSummary.trim().length}/10 min chars
                  </span>
                </div>
                <textarea
                  rows={4}
                  disabled={!canEdit}
                  value={selfSummary}
                  onChange={(e) => setSelfSummary(e.target.value)}
                  placeholder="Provide a high-level summary of your core accomplishments, business contributions, and focus areas during this review period..."
                  className="w-full text-xs p-3 rounded-lg border border-stone-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              {/* Key Achievements */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-stone-900">
                    Key Achievements & Value Delivered <span className="text-rose-500">*</span>
                  </label>
                  <span
                    className={`text-[10px] font-medium ${
                      selfAchievements.trim().length >= 10 ? 'text-emerald-600' : 'text-stone-400'
                    }`}
                  >
                    {selfAchievements.trim().length}/10 min chars
                  </span>
                </div>
                <textarea
                  rows={3}
                  disabled={!canEdit}
                  value={selfAchievements}
                  onChange={(e) => setSelfAchievements(e.target.value)}
                  placeholder="Highlight major milestones, quantitative impact, operational efficiencies, or customer wins..."
                  className="w-full text-xs p-3 rounded-lg border border-stone-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              {/* Challenges */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-stone-900">
                  Key Challenges & Obstacles Faced
                </label>
                <textarea
                  rows={3}
                  disabled={!canEdit}
                  value={selfChallenges}
                  onChange={(e) => setSelfChallenges(e.target.value)}
                  placeholder="Describe technical, operational, or resource roadblocks encountered and how you mitigated them..."
                  className="w-full text-xs p-3 rounded-lg border border-stone-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              {/* Skills Developed */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-stone-900">
                  Skills Developed & Certifications
                </label>
                <textarea
                  rows={2}
                  disabled={!canEdit}
                  value={skillsDeveloped}
                  onChange={(e) => setSkillsDeveloped(e.target.value)}
                  placeholder="List new domain expertise, tools mastered, or certifications achieved..."
                  className="w-full text-xs p-3 rounded-lg border border-stone-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>

              {/* Development Interests */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-stone-900">
                  Career Aspirations & Growth Interests
                </label>
                <textarea
                  rows={2}
                  disabled={!canEdit}
                  value={developmentInterests}
                  onChange={(e) => setDevelopmentInterests(e.target.value)}
                  placeholder="What projects, leadership opportunities, or technical disciplines would you like to explore next?"
                  className="w-full text-xs p-3 rounded-lg border border-stone-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveStep(competencies.length > 0 ? 'COMPETENCIES' : 'GOALS')}
              className="flex items-center gap-1"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Back</span>
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setActiveStep('EVIDENCE')}
              className="bg-stone-900 text-white flex items-center gap-1.5"
            >
              <span>Next: Evidence</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 4: SUPPORTING EVIDENCE */}
      {activeStep === 'EVIDENCE' && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-stone-900">
              Supporting Evidence & Artifacts
            </h3>
            <p className="text-xs text-stone-500">
              Attach project documentation, presentation decks, or links validating your
              achievements.
            </p>
          </div>

          <Card className="border border-stone-200 bg-white">
            <CardContent className="p-6 space-y-6">
              {canEdit && (
                <div className="flex flex-col sm:flex-row gap-4">
                  {/* File Upload Zone */}
                  <div className="flex-1 border-2 border-dashed border-stone-200 rounded-xl p-6 text-center hover:border-amber-500 transition-colors">
                    <UploadCloud className="h-8 w-8 text-stone-400 mx-auto mb-2" />
                    <p className="text-xs font-medium text-stone-700">Upload Evidence Document</p>
                    <p className="text-[10px] text-stone-400 mt-0.5">
                      PDF, PNG, JPG, DOCX up to 10MB
                    </p>
                    <label className="mt-3 inline-block">
                      <input
                        type="file"
                        onChange={handleFileUpload}
                        disabled={isUploading}
                        className="hidden"
                      />
                      <span className="px-3 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-medium cursor-pointer inline-flex items-center gap-1">
                        {isUploading ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Paperclip className="h-3.5 w-3.5" />
                        )}
                        <span>{isUploading ? 'Uploading...' : 'Choose File'}</span>
                      </span>
                    </label>
                  </div>

                  {/* External Link Zone */}
                  <div className="flex-1 border border-stone-200 rounded-xl p-6 text-center flex flex-col items-center justify-center bg-stone-50/50">
                    <ExternalLink className="h-8 w-8 text-stone-400 mb-2" />
                    <p className="text-xs font-medium text-stone-700">Attach Evidence Link</p>
                    <p className="text-[10px] text-stone-400 mt-0.5">
                      Jira ticket, GitHub PR, Google Drive, or intranet URL
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsLinkModalOpen(true)}
                      className="mt-3 text-xs"
                    >
                      Add Web Link
                    </Button>
                  </div>
                </div>
              )}

              {/* Attachments List */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-stone-800">
                  Attached Evidence ({attachments.length})
                </h4>

                {attachments.length === 0 ? (
                  <p className="text-xs text-stone-400 italic">
                    No attachments or links added yet.
                  </p>
                ) : (
                  <div className="divide-y divide-stone-100 rounded-lg border border-stone-200">
                    {attachments.map((att, idx) => (
                      <div
                        key={idx}
                        className="p-3 flex items-center justify-between text-xs hover:bg-stone-50"
                      >
                        <div className="flex items-center gap-2.5 truncate max-w-md">
                          <Paperclip className="h-4 w-4 text-stone-400 shrink-0" />
                          <span className="font-medium text-stone-900 truncate">{att.name}</span>
                          {att.size && (
                            <span className="text-[10px] text-stone-400">
                              ({(att.size / 1024).toFixed(1)} KB)
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <a
                            href={att.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-amber-700 hover:text-amber-900 font-medium text-xs flex items-center gap-1"
                          >
                            <span>Open</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                          {canEdit && (
                            <button
                              onClick={() => handleRemoveAttachment(idx)}
                              className="text-stone-400 hover:text-rose-600 p-1"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveStep('REFLECTION')}
              className="flex items-center gap-1"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Back: Reflection</span>
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setActiveStep('SUBMIT')}
              className="bg-stone-900 text-white flex items-center gap-1.5"
            >
              <span>Next: Review & Submit</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 5: REVIEW & SUBMIT */}
      {activeStep === 'SUBMIT' && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-stone-900">
              Final Review & Submission Validation
            </h3>
            <p className="text-xs text-stone-500">
              Verify that all mandatory evaluation criteria and reflections are complete before
              formal submission.
            </p>
          </div>

          {/* Validation Checklist Card */}
          <Card className="border border-stone-200 bg-white">
            <CardContent className="p-6 space-y-4">
              <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
                Submission Readiness
              </h4>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-stone-50 text-xs">
                  <div className="flex items-center gap-2">
                    {goalsEvaluatedCount === goals.length ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    ) : (
                      <Clock className="h-4 w-4 text-amber-600 shrink-0" />
                    )}
                    <span className="font-medium text-stone-800">Performance Goals Evaluated</span>
                  </div>
                  <span className="font-semibold text-stone-700">
                    {goalsEvaluatedCount} / {goals.length} Goals
                  </span>
                </div>

                {competencies.length > 0 && (
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-stone-50 text-xs">
                    <div className="flex items-center gap-2">
                      {competenciesEvaluatedCount === competencies.length ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      ) : (
                        <Clock className="h-4 w-4 text-amber-600 shrink-0" />
                      )}
                      <span className="font-medium text-stone-800">Core Competencies Rated</span>
                    </div>
                    <span className="font-semibold text-stone-700">
                      {competenciesEvaluatedCount} / {competencies.length} Competencies
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between p-2.5 rounded-lg bg-stone-50 text-xs">
                  <div className="flex items-center gap-2">
                    {selfSummary.trim().length >= 10 ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                    )}
                    <span className="font-medium text-stone-800">
                      Executive Summary (Required, &ge; 10 chars)
                    </span>
                  </div>
                  <span
                    className={`font-semibold ${
                      selfSummary.trim().length >= 10 ? 'text-emerald-700' : 'text-rose-600'
                    }`}
                  >
                    {selfSummary.trim().length >= 10 ? 'Complete' : 'Missing'}
                  </span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-lg bg-stone-50 text-xs">
                  <div className="flex items-center gap-2">
                    {selfAchievements.trim().length >= 10 ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                    )}
                    <span className="font-medium text-stone-800">
                      Key Achievements (Required, &ge; 10 chars)
                    </span>
                  </div>
                  <span
                    className={`font-semibold ${
                      selfAchievements.trim().length >= 10 ? 'text-emerald-700' : 'text-rose-600'
                    }`}
                  >
                    {selfAchievements.trim().length >= 10 ? 'Complete' : 'Missing'}
                  </span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-lg bg-stone-50 text-xs">
                  <div className="flex items-center gap-2">
                    <Paperclip className="h-4 w-4 text-stone-400 shrink-0" />
                    <span className="font-medium text-stone-800">Evidence Attachments</span>
                  </div>
                  <span className="font-semibold text-stone-700">
                    {attachments.length} attached
                  </span>
                </div>
              </div>

              {/* Submit CTA */}
              {canEdit && (
                <div className="pt-4 border-t border-stone-100 flex items-center justify-between">
                  <p className="text-xs text-stone-500">
                    Once submitted, this review will be locked for editing until manager evaluation.
                  </p>
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => setIsSubmitConfirmOpen(true)}
                    disabled={!isReflectionComplete || isSubmitting}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-semibold flex items-center gap-2"
                  >
                    <Send className="h-4 w-4" />
                    <span>Submit Self-Assessment</span>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Audit History Timeline */}
          {review?.history && review.history.length > 0 && (
            <Card className="border border-stone-200 bg-white">
              <CardHeader className="pb-3">
                <CardTitle className="text-xs font-bold text-stone-800 uppercase tracking-wider flex items-center gap-2">
                  <History className="h-4 w-4 text-stone-400" />
                  <span>Audit History Timeline</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 pt-0">
                <div className="space-y-4">
                  {review.history.map((hist, i) => (
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
                          <p className="text-stone-600 text-[11px] mt-0.5">{hist.changeReason}</p>
                        )}
                        {hist.actor && (
                          <span className="text-[10px] text-stone-400 block mt-0.5">
                            Performed by: {hist.actor.displayName} ({hist.actor.employeeCode})
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* External Link Modal */}
      <Dialog
        isOpen={isLinkModalOpen}
        onClose={() => setIsLinkModalOpen(false)}
        title="Add Supporting Web Link"
      >
        <div className="space-y-4 p-2">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-stone-800">Link Title / Label</label>
            <input
              type="text"
              value={externalLinkName}
              onChange={(e) => setExternalLinkName(e.target.value)}
              placeholder="e.g. Q3 Architecture RFC / PR #1024"
              className="w-full text-xs p-2.5 rounded-lg border border-stone-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-stone-800">URL</label>
            <input
              type="url"
              value={externalLinkUrl}
              onChange={(e) => setExternalLinkUrl(e.target.value)}
              placeholder="https://github.com/org/repo/pull/1024"
              className="w-full text-xs p-2.5 rounded-lg border border-stone-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setIsLinkModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleAddExternalLink}
              className="bg-amber-600 text-white"
            >
              Add Link
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Final Submit Confirmation Dialog */}
      <Dialog
        isOpen={isSubmitConfirmOpen}
        onClose={() => setIsSubmitConfirmOpen(false)}
        title="Confirm Formal Self-Assessment Submission"
      >
        <div className="space-y-4 p-2">
          <p className="text-xs text-stone-600">
            You are about to formally submit your self-assessment for <strong>{cycle.name}</strong>.
          </p>
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1">
            <p className="font-semibold">Important Notes:</p>
            <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
              <li>Your submission will be frozen and sent to your manager for evaluation.</li>
              <li>You will not be able to edit responses unless reopened by HR.</li>
              <li>
                All ratings and reflections will become part of your auditable performance record.
              </li>
            </ul>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsSubmitConfirmOpen(false)}
              disabled={isSubmitting}
            >
              Review Further
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSubmitFinal}
              disabled={isSubmitting}
              className="bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              <span>Confirm & Submit</span>
            </Button>
          </div>
        </div>
      </Dialog>

      {/* HR Reopen Modal */}
      <Dialog
        isOpen={isReopenModalOpen}
        onClose={() => setIsReopenModalOpen(false)}
        title="Reopen Self-Assessment for Employee"
      >
        <div className="space-y-4 p-2">
          <p className="text-xs text-stone-600">
            Reopening unlocks this review for editing by the employee. A mandatory audit log entry
            will be recorded.
          </p>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-stone-800">
              Authorized Reopening Reason <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={3}
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              placeholder="e.g. Employee requested correction of Q3 project metrics with manager approval..."
              className="w-full text-xs p-2.5 rounded-lg border border-stone-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsReopenModalOpen(false)}
              disabled={isReopening}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleReopen}
              disabled={isReopening || !reopenReason.trim()}
              className="bg-amber-600 text-white flex items-center gap-1.5"
            >
              {isReopening ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RotateCcw className="h-3.5 w-3.5" />
              )}
              <span>Reopen Assessment</span>
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};
