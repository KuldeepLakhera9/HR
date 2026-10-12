'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { performanceApi } from '../../lib/api-client';
import {
  ReviewCycleDto,
  ReviewCycleParticipantDto,
  CreateReviewCycleDto,
  UpdateReviewCycleDto,
  ReviewCycleStatus,
  ReviewCycleType,
  ParticipantStatus,
  EligibilityPreviewDto,
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
  Calendar,
  Layers,
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  Plus,
  RefreshCw,
  Search,
  ArrowRight,
  ShieldAlert,
  Sliders,
  History,
  UserCheck,
  UserX,
  UserMinus,
  Edit,
  X,
  CheckSquare,
  Lock,
  Unlock,
  Eye,
  FileText,
} from 'lucide-react';

export interface ReviewCyclesViewProps {
  onNotify: (msg: string, type: 'success' | 'error') => void;
}

export const ReviewCyclesView: React.FC<ReviewCyclesViewProps> = ({ onNotify }) => {
  const [cycles, setCycles] = useState<ReviewCycleDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingCycle, setEditingCycle] = useState<ReviewCycleDto | null>(null);
  const [previewCycle, setPreviewCycle] = useState<ReviewCycleDto | null>(null);
  const [previewData, setPreviewData] = useState<EligibilityPreviewDto | null>(null);
  const [transitionCycle, setTransitionCycle] = useState<ReviewCycleDto | null>(null);
  const [reopenCycleTarget, setReopenCycleTarget] = useState<ReviewCycleDto | null>(null);
  const [participantsCycle, setParticipantsCycle] = useState<ReviewCycleDto | null>(null);
  const [participants, setParticipants] = useState<ReviewCycleParticipantDto[]>([]);
  const [participantsTotal, setParticipantsTotal] = useState(0);
  const [participantsPage, setParticipantsPage] = useState(1);
  const [participantsSearch, setParticipantsSearch] = useState('');
  const [reassignTarget, setReassignTarget] = useState<ReviewCycleParticipantDto | null>(null);
  const [exemptTarget, setExemptTarget] = useState<ReviewCycleParticipantDto | null>(null);
  const [historyCycle, setHistoryCycle] = useState<ReviewCycleDto | null>(null);

  // Form states
  const [cycleForm, setCycleForm] = useState<CreateReviewCycleDto>({
    name: '',
    code: '',
    description: '',
    type: 'ANNUAL',
    startDate: '',
    endDate: '',
    goalSettingDeadline: '',
    selfAssessmentDeadline: '',
    managerReviewDeadline: '',
    finalizationDeadline: '',
    goalsWeightPercentage: 70,
    competenciesWeightPercentage: 30,
    allowEmployeeGoalCreation: true,
    requireGoalApproval: true,
    ratingScaleMax: 5,
    autoEnroll: false,
  });

  const [transitionTargetStatus, setTransitionTargetStatus] =
    useState<ReviewCycleStatus>('GOAL_SETTING');
  const [transitionReason, setTransitionReason] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [extendedFinalizationDate, setExtendedFinalizationDate] = useState('');
  const [reassignManagerId, setReassignManagerId] = useState('');
  const [reassignReason, setReassignReason] = useState('');
  const [exemptionReason, setExemptionReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchCycles = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await performanceApi.getCycles({
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        search: searchQuery.trim() || undefined,
      });
      setCycles(data || []);
    } catch (err: any) {
      onNotify(err.message || 'Failed to load review cycles', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, searchQuery, onNotify]);

  useEffect(() => {
    fetchCycles();
  }, [fetchCycles]);

  const handleSaveCycle = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingCycle) {
        await performanceApi.updateCycle(editingCycle.id, {
          name: cycleForm.name,
          description: cycleForm.description,
          startDate: cycleForm.startDate,
          endDate: cycleForm.endDate,
          goalSettingDeadline: cycleForm.goalSettingDeadline || undefined,
          selfAssessmentDeadline: cycleForm.selfAssessmentDeadline || undefined,
          managerReviewDeadline: cycleForm.managerReviewDeadline || undefined,
          finalizationDeadline: cycleForm.finalizationDeadline || undefined,
          goalsWeightPercentage: Number(cycleForm.goalsWeightPercentage),
          competenciesWeightPercentage: Number(cycleForm.competenciesWeightPercentage),
          allowEmployeeGoalCreation: cycleForm.allowEmployeeGoalCreation,
          requireGoalApproval: cycleForm.requireGoalApproval,
          ratingScaleMax: Number(cycleForm.ratingScaleMax),
          instructions: cycleForm.instructions,
        });
        onNotify('Review cycle updated successfully', 'success');
      } else {
        await performanceApi.createCycle({
          ...cycleForm,
          goalsWeightPercentage: Number(cycleForm.goalsWeightPercentage),
          competenciesWeightPercentage: Number(cycleForm.competenciesWeightPercentage),
          ratingScaleMax: Number(cycleForm.ratingScaleMax),
        });
        onNotify('Review cycle created successfully', 'success');
      }
      setIsCreateModalOpen(false);
      setEditingCycle(null);
      fetchCycles();
    } catch (err: any) {
      onNotify(err.message || 'Failed to save review cycle', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePreviewEligibility = async (cycle: ReviewCycleDto) => {
    setPreviewCycle(cycle);
    setIsSubmitting(true);
    try {
      const preview = await performanceApi.previewEligibility(cycle.id);
      setPreviewData(preview);
    } catch (err: any) {
      onNotify(err.message || 'Failed to preview eligibility', 'error');
      setPreviewCycle(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEnrollParticipants = async (cycleId: string) => {
    setIsSubmitting(true);
    try {
      const res = await performanceApi.enrollParticipants(cycleId);
      onNotify(res.message, 'success');
      setPreviewCycle(null);
      setPreviewData(null);
      fetchCycles();
    } catch (err: any) {
      onNotify(err.message || 'Failed to enroll participants', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTransitionStage = async () => {
    if (!transitionCycle) return;
    setIsSubmitting(true);
    try {
      await performanceApi.transitionCycleStage(transitionCycle.id, {
        targetStatus: transitionTargetStatus,
        reason: transitionReason || undefined,
      });
      onNotify(`Stage advanced to ${transitionTargetStatus}`, 'success');
      setTransitionCycle(null);
      setTransitionReason('');
      fetchCycles();
    } catch (err: any) {
      onNotify(err.message || 'Failed to advance workflow stage', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReopenCycle = async () => {
    if (!reopenCycleTarget) return;
    setIsSubmitting(true);
    try {
      await performanceApi.reopenCycle(reopenCycleTarget.id, {
        reopenReason,
        extendedFinalizationDeadline: extendedFinalizationDate || undefined,
      });
      onNotify('Review cycle reopened successfully for calibration/revision', 'success');
      setReopenCycleTarget(null);
      setReopenReason('');
      setExtendedFinalizationDate('');
      fetchCycles();
    } catch (err: any) {
      onNotify(err.message || 'Failed to reopen review cycle', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openParticipantsDrawer = async (cycle: ReviewCycleDto, page = 1) => {
    setParticipantsCycle(cycle);
    setParticipantsPage(page);
    try {
      const res = await performanceApi.getCycleParticipants(cycle.id, {
        page,
        limit: 15,
        search: participantsSearch.trim() || undefined,
      });
      setParticipants(res.items || []);
      setParticipantsTotal(res.meta?.total || 0);
    } catch (err: any) {
      onNotify(err.message || 'Failed to fetch participants', 'error');
    }
  };

  const handleReassignManager = async () => {
    if (!participantsCycle || !reassignTarget) return;
    setIsSubmitting(true);
    try {
      await performanceApi.reassignManager(participantsCycle.id, reassignTarget.id, {
        newManagerId: reassignManagerId,
        reason: reassignReason,
      });
      onNotify('Evaluating manager reassigned successfully', 'success');
      setReassignTarget(null);
      setReassignManagerId('');
      setReassignReason('');
      openParticipantsDrawer(participantsCycle, participantsPage);
    } catch (err: any) {
      onNotify(err.message || 'Failed to reassign manager', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExemptParticipant = async () => {
    if (!participantsCycle || !exemptTarget) return;
    setIsSubmitting(true);
    try {
      await performanceApi.exemptParticipant(participantsCycle.id, exemptTarget.id, {
        exemptionReason,
      });
      onNotify('Participant exempted from cycle due to leave of absence', 'success');
      setExemptTarget(null);
      setExemptionReason('');
      openParticipantsDrawer(participantsCycle, participantsPage);
    } catch (err: any) {
      onNotify(err.message || 'Failed to exempt participant', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadgeVariant = (status: ReviewCycleStatus) => {
    switch (status) {
      case 'GOAL_SETTING':
        return 'info';
      case 'SELF_ASSESSMENT':
        return 'warning';
      case 'MANAGER_REVIEW':
        return 'purple';
      case 'HR_CALIBRATION':
        return 'primary';
      case 'FINALIZED':
        return 'success';
      case 'ARCHIVED':
        return 'outline';
      case 'DRAFT':
      default:
        return 'default';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-stone-900 tracking-tight flex items-center gap-2">
            <span>Performance Review Cycles</span>
            <Badge variant="outline" size="sm">
              Admin & HR
            </Badge>
          </h2>
          <p className="text-xs text-stone-500">
            Configure evaluation periods, participant scope, workflow milestones, and rating
            templates.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchCycles}
            disabled={isLoading}
            className="border-stone-200 text-stone-700"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setEditingCycle(null);
              setCycleForm({
                name: '',
                code: '',
                description: '',
                type: 'ANNUAL',
                startDate: '',
                endDate: '',
                goalSettingDeadline: '',
                selfAssessmentDeadline: '',
                managerReviewDeadline: '',
                finalizationDeadline: '',
                goalsWeightPercentage: 70,
                competenciesWeightPercentage: 30,
                allowEmployeeGoalCreation: true,
                requireGoalApproval: true,
                ratingScaleMax: 5,
                autoEnroll: false,
              });
              setIsCreateModalOpen(true);
            }}
            className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5 shadow-xs font-medium"
          >
            <Plus className="h-4 w-4" />
            New Cycle
          </Button>
        </div>
      </div>

      {/* KPI Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Configured Cycles"
          value={`${cycles.length}`}
          description="Total in organization"
          icon={<Calendar className="h-5 w-5 text-amber-700" />}
        />
        <KPICard
          title="Active Stages"
          value={`${cycles.filter((c) => c.status !== 'DRAFT' && c.status !== 'FINALIZED' && c.status !== 'ARCHIVED').length}`}
          description="Currently underway"
          icon={<Clock className="h-5 w-5 text-blue-700" />}
        />
        <KPICard
          title="Enrolled Population"
          value={`${cycles.reduce((acc, c) => acc + (c._count?.participants || 0), 0)}`}
          description="Total active participants"
          icon={<Users className="h-5 w-5 text-emerald-700" />}
        />
        <KPICard
          title="Finalized Cycles"
          value={`${cycles.filter((c) => c.status === 'FINALIZED').length}`}
          description="Completed appraisals"
          icon={<CheckCircle2 className="h-5 w-5 text-stone-700" />}
        />
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-stone-200 pb-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-stone-400" />
          <input
            type="text"
            placeholder="Search by cycle name or code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 pr-3 py-1.5 text-xs md:text-sm rounded-lg border border-stone-200 bg-white text-stone-900 w-full focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs md:text-sm py-1.5 px-3 rounded-lg border border-stone-200 bg-white text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-500 w-full sm:w-auto"
          >
            <option value="ALL">All Stages</option>
            <option value="DRAFT">Draft</option>
            <option value="GOAL_SETTING">Goal Setting</option>
            <option value="SELF_ASSESSMENT">Self Assessment</option>
            <option value="MANAGER_REVIEW">Manager Review</option>
            <option value="HR_CALIBRATION">HR Calibration</option>
            <option value="FINALIZED">Finalized</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
      </div>

      {/* Cycles List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 rounded-xl bg-stone-100 animate-pulse border border-stone-200"
            />
          ))}
        </div>
      ) : cycles.length === 0 ? (
        <Card className="text-center py-10 border-dashed border-stone-200">
          <CardContent className="space-y-2">
            <Calendar className="h-8 w-8 text-stone-400 mx-auto" />
            <h4 className="text-sm font-semibold text-stone-800">No review cycles configured</h4>
            <p className="text-xs text-stone-500 max-w-sm mx-auto">
              Create an annual, quarterly or probationary appraisal cycle to launch organizational
              reviews.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {cycles.map((cycle) => (
            <div
              key={cycle.id}
              className="rounded-xl border border-stone-200 bg-white p-5 shadow-xs hover:shadow-md transition-shadow"
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-stone-500 bg-stone-100 px-2 py-0.5 rounded">
                      {cycle.code}
                    </span>
                    <Badge variant={getStatusBadgeVariant(cycle.status)} size="sm">
                      {cycle.status.replace(/_/g, ' ')}
                    </Badge>
                    <Badge variant="outline" size="sm">
                      {cycle.type}
                    </Badge>
                    <span className="text-[11px] font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      Template v{cycle.templateVersion}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-stone-900">{cycle.name}</h3>
                    {cycle.description && (
                      <p className="text-xs text-stone-600 mt-0.5 max-w-2xl">{cycle.description}</p>
                    )}
                  </div>

                  {/* Window & Deadlines */}
                  <div className="flex flex-wrap items-center gap-4 text-xs text-stone-600 pt-1">
                    <div className="flex items-center gap-1.5 font-medium">
                      <Calendar className="h-3.5 w-3.5 text-stone-400" />
                      <span>
                        Period: {new Date(cycle.startDate).toLocaleDateString()} &ndash;{' '}
                        {new Date(cycle.endDate).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-stone-500">
                      <span>
                        Weights: Goals <strong>{cycle.goalsWeightPercentage}%</strong> /
                        Competencies <strong>{cycle.competenciesWeightPercentage}%</strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Counts & Action Buttons */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 shrink-0 pt-3 lg:pt-0 border-t lg:border-t-0 border-stone-100">
                  <div className="flex items-center gap-3 text-xs text-stone-600 bg-stone-50 p-2.5 rounded-lg border border-stone-100">
                    <div>
                      <span className="text-stone-400 block text-[10px] uppercase font-semibold">
                        Participants
                      </span>
                      <strong className="text-stone-800 text-sm">
                        {cycle._count?.participants || 0}
                      </strong>
                    </div>
                    <div className="h-6 w-px bg-stone-200" />
                    <div>
                      <span className="text-stone-400 block text-[10px] uppercase font-semibold">
                        Goals
                      </span>
                      <strong className="text-stone-800 text-sm">{cycle._count?.goals || 0}</strong>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePreviewEligibility(cycle)}
                      className="text-xs h-8 text-stone-700"
                      title="Preview Eligibility & Enroll"
                    >
                      <UserCheck className="h-3.5 w-3.5 mr-1" />
                      Enroll
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openParticipantsDrawer(cycle)}
                      className="text-xs h-8 text-stone-700"
                      title="Manage Participants"
                    >
                      <Users className="h-3.5 w-3.5 mr-1" />
                      Audited Roster
                    </Button>

                    {cycle.status !== 'FINALIZED' && cycle.status !== 'ARCHIVED' && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          setTransitionCycle(cycle);
                          const nextMap: Record<string, ReviewCycleStatus> = {
                            DRAFT: 'GOAL_SETTING',
                            GOAL_SETTING: 'SELF_ASSESSMENT',
                            SELF_ASSESSMENT: 'MANAGER_REVIEW',
                            MANAGER_REVIEW: 'HR_CALIBRATION',
                            HR_CALIBRATION: 'FINALIZED',
                          };
                          setTransitionTargetStatus(nextMap[cycle.status] || 'FINALIZED');
                        }}
                        className="text-xs h-8 bg-amber-600 hover:bg-amber-700 text-white font-medium"
                      >
                        Advance Stage
                      </Button>
                    )}

                    {cycle.status === 'FINALIZED' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setReopenCycleTarget(cycle)}
                        className="text-xs h-8 border-rose-300 text-rose-700 hover:bg-rose-50"
                      >
                        <Unlock className="h-3.5 w-3.5 mr-1" />
                        Reopen
                      </Button>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingCycle(cycle);
                        setCycleForm({
                          name: cycle.name,
                          code: cycle.code,
                          description: cycle.description || '',
                          type: cycle.type,
                          startDate: cycle.startDate.split('T')[0],
                          endDate: cycle.endDate.split('T')[0],
                          goalSettingDeadline: cycle.goalSettingDeadline
                            ? cycle.goalSettingDeadline.split('T')[0]
                            : '',
                          selfAssessmentDeadline: cycle.selfAssessmentDeadline
                            ? cycle.selfAssessmentDeadline.split('T')[0]
                            : '',
                          managerReviewDeadline: cycle.managerReviewDeadline
                            ? cycle.managerReviewDeadline.split('T')[0]
                            : '',
                          finalizationDeadline: cycle.finalizationDeadline
                            ? cycle.finalizationDeadline.split('T')[0]
                            : '',
                          goalsWeightPercentage: cycle.goalsWeightPercentage,
                          competenciesWeightPercentage: cycle.competenciesWeightPercentage,
                          allowEmployeeGoalCreation: cycle.allowEmployeeGoalCreation,
                          requireGoalApproval: cycle.requireGoalApproval,
                          ratingScaleMax: cycle.ratingScaleMax,
                          instructions: cycle.instructions || '',
                        });
                        setIsCreateModalOpen(true);
                      }}
                      className="text-xs h-8 text-stone-600"
                      title="Edit Configuration"
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 1: Create / Edit Review Cycle                           */}
      {/* ------------------------------------------------------------- */}
      <Dialog
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setEditingCycle(null);
        }}
        title={
          editingCycle ? `Edit Review Cycle: ${editingCycle.name}` : 'Configure New Review Cycle'
        }
        description="Establish organizational review window, stage deadlines, rating weight policy, and instructions."
        maxWidth="lg"
      >
        <form onSubmit={handleSaveCycle} className="space-y-4 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Cycle Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={cycleForm.name}
                onChange={(e) => setCycleForm({ ...cycleForm, name: e.target.value })}
                placeholder="e.g. FY 2026-27 Annual Performance Appraisal"
                className="w-full text-sm px-3 py-2 rounded-lg border border-stone-200"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Cycle Code <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                disabled={!!editingCycle}
                value={cycleForm.code}
                onChange={(e) => setCycleForm({ ...cycleForm, code: e.target.value })}
                placeholder="e.g. CYCLE-2026-ANNUAL"
                className="w-full text-sm px-3 py-2 rounded-lg border border-stone-200 uppercase font-mono disabled:bg-stone-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Description & Purpose
            </label>
            <textarea
              rows={2}
              value={cycleForm.description || ''}
              onChange={(e) => setCycleForm({ ...cycleForm, description: e.target.value })}
              placeholder="Outline objectives, focus areas and executive guidelines for this appraisal..."
              className="w-full text-sm px-3 py-2 rounded-lg border border-stone-200"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">Cycle Type</label>
              <select
                value={cycleForm.type}
                onChange={(e) =>
                  setCycleForm({ ...cycleForm, type: e.target.value as ReviewCycleType })
                }
                className="w-full text-sm px-3 py-2 rounded-lg border border-stone-200 bg-white"
              >
                <option value="ANNUAL">Annual Appraisal</option>
                <option value="SEMI_ANNUAL">Half-Yearly Review</option>
                <option value="QUARTERLY">Quarterly OKRs</option>
                <option value="PROBATION">Probation Evaluation</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Start Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                required
                value={cycleForm.startDate}
                onChange={(e) => setCycleForm({ ...cycleForm, startDate: e.target.value })}
                className="w-full text-sm px-3 py-2 rounded-lg border border-stone-200"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                End Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                required
                value={cycleForm.endDate}
                onChange={(e) => setCycleForm({ ...cycleForm, endDate: e.target.value })}
                className="w-full text-sm px-3 py-2 rounded-lg border border-stone-200"
              />
            </div>
          </div>

          {/* Chronological Deadlines */}
          <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 space-y-3">
            <h4 className="text-xs font-semibold text-stone-800 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-stone-500" />
              Sequential Stage Deadlines (Enforced Chronologically)
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-stone-600 mb-1">
                  1. Goal-Setting
                </label>
                <input
                  type="date"
                  value={cycleForm.goalSettingDeadline || ''}
                  onChange={(e) =>
                    setCycleForm({ ...cycleForm, goalSettingDeadline: e.target.value })
                  }
                  className="w-full text-xs px-2.5 py-1.5 rounded border border-stone-200 bg-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-stone-600 mb-1">
                  2. Self-Assessment
                </label>
                <input
                  type="date"
                  value={cycleForm.selfAssessmentDeadline || ''}
                  onChange={(e) =>
                    setCycleForm({ ...cycleForm, selfAssessmentDeadline: e.target.value })
                  }
                  className="w-full text-xs px-2.5 py-1.5 rounded border border-stone-200 bg-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-stone-600 mb-1">
                  3. Manager-Review
                </label>
                <input
                  type="date"
                  value={cycleForm.managerReviewDeadline || ''}
                  onChange={(e) =>
                    setCycleForm({ ...cycleForm, managerReviewDeadline: e.target.value })
                  }
                  className="w-full text-xs px-2.5 py-1.5 rounded border border-stone-200 bg-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-stone-600 mb-1">
                  4. Finalization
                </label>
                <input
                  type="date"
                  value={cycleForm.finalizationDeadline || ''}
                  onChange={(e) =>
                    setCycleForm({ ...cycleForm, finalizationDeadline: e.target.value })
                  }
                  className="w-full text-xs px-2.5 py-1.5 rounded border border-stone-200 bg-white"
                />
              </div>
            </div>
          </div>

          {/* Rating & Weighting Policy */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Goals Weight (%) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                max="100"
                required
                value={cycleForm.goalsWeightPercentage}
                onChange={(e) => {
                  const gw = Number(e.target.value);
                  setCycleForm({
                    ...cycleForm,
                    goalsWeightPercentage: gw,
                    competenciesWeightPercentage: Math.max(0, 100 - gw),
                  });
                }}
                className="w-full text-sm px-3 py-2 rounded-lg border border-stone-200"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Competencies Weight (%) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                max="100"
                required
                value={cycleForm.competenciesWeightPercentage}
                onChange={(e) => {
                  const cw = Number(e.target.value);
                  setCycleForm({
                    ...cycleForm,
                    competenciesWeightPercentage: cw,
                    goalsWeightPercentage: Math.max(0, 100 - cw),
                  });
                }}
                className="w-full text-sm px-3 py-2 rounded-lg border border-stone-200"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Rating Scale Max
              </label>
              <input
                type="number"
                min="3"
                max="10"
                value={cycleForm.ratingScaleMax}
                onChange={(e) =>
                  setCycleForm({ ...cycleForm, ratingScaleMax: Number(e.target.value) })
                }
                className="w-full text-sm px-3 py-2 rounded-lg border border-stone-200"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Review Instructions
            </label>
            <textarea
              rows={2}
              value={cycleForm.instructions || ''}
              onChange={(e) => setCycleForm({ ...cycleForm, instructions: e.target.value })}
              placeholder="Instructions presented to employees and managers during evaluation..."
              className="w-full text-sm px-3 py-2 rounded-lg border border-stone-200"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-stone-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsCreateModalOpen(false);
                setEditingCycle(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting}
              className="bg-amber-600 hover:bg-amber-700 text-white font-medium"
            >
              {isSubmitting ? 'Saving...' : editingCycle ? 'Update Cycle' : 'Create Cycle'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* ------------------------------------------------------------- */}
      {/* MODAL 2: Eligibility Preview & Atomic Enrollment             */}
      {/* ------------------------------------------------------------- */}
      {previewCycle && (
        <Dialog
          isOpen={!!previewCycle}
          onClose={() => {
            setPreviewCycle(null);
            setPreviewData(null);
          }}
          title={`Eligibility & Enrollment: ${previewCycle.name}`}
          description="Audited population coverage calculation based on department, status, and joining date policy."
          maxWidth="lg"
        >
          <div className="space-y-4 pt-2">
            {previewData ? (
              <>
                <div className="grid grid-cols-3 gap-3 p-3 bg-stone-50 rounded-lg border border-stone-200 text-center">
                  <div>
                    <span className="text-[11px] text-stone-500 uppercase font-semibold">
                      Total Eligible
                    </span>
                    <strong className="text-lg font-bold text-stone-800 block">
                      {previewData.totalEligible}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[11px] text-stone-500 uppercase font-semibold">
                      Already Enrolled
                    </span>
                    <strong className="text-lg font-bold text-emerald-700 block">
                      {previewData.alreadyEnrolled}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[11px] text-stone-500 uppercase font-semibold">
                      Newly Eligible
                    </span>
                    <strong className="text-lg font-bold text-amber-700 block">
                      {previewData.newlyEligible}
                    </strong>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-stone-800 mb-1.5">
                    Sample Eligible Population Preview ({previewData.sampleEmployees.length})
                  </h4>
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-stone-200 divide-y divide-stone-100 text-xs">
                    {previewData.sampleEmployees.map((emp) => (
                      <div key={emp.id} className="p-2.5 flex items-center justify-between">
                        <div>
                          <strong className="text-stone-900">{emp.displayName}</strong>
                          <span className="text-stone-500 ml-2 font-mono">{emp.employeeCode}</span>
                          <span className="text-stone-400 ml-2">
                            &bull; {emp.department || 'No Dept'}
                          </span>
                        </div>
                        <div className="text-right text-[11px]">
                          {emp.manager ? (
                            <span className="text-stone-600">Mgr: {emp.manager}</span>
                          ) : (
                            <span className="text-amber-700 font-semibold flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" /> Missing Manager
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-stone-100">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setPreviewCycle(null);
                      setPreviewData(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    disabled={isSubmitting}
                    onClick={() => handleEnrollParticipants(previewCycle.id)}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-medium"
                  >
                    {isSubmitting
                      ? 'Enrolling...'
                      : `Enroll ${previewData.totalEligible} Participants`}
                  </Button>
                </div>
              </>
            ) : (
              <div className="py-8 text-center text-xs text-stone-500">
                Calculating eligibility metrics across organization...
              </div>
            )}
          </div>
        </Dialog>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 3: Advance Stage Dialog                                 */}
      {/* ------------------------------------------------------------- */}
      {transitionCycle && (
        <Dialog
          isOpen={!!transitionCycle}
          onClose={() => setTransitionCycle(null)}
          title={`Advance Stage: ${transitionCycle.name}`}
          description="Progress the review cycle to its next chronological workflow stage."
          maxWidth="md"
        >
          <div className="space-y-4 pt-2">
            <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 text-xs space-y-1">
              <div>
                Current Stage:{' '}
                <Badge variant="primary" size="sm">
                  {transitionCycle.status}
                </Badge>
              </div>
              <div>
                Target Stage:{' '}
                <Badge variant="success" size="sm">
                  {transitionTargetStatus}
                </Badge>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Select Stage Progression
              </label>
              <select
                value={transitionTargetStatus}
                onChange={(e) => setTransitionTargetStatus(e.target.value as ReviewCycleStatus)}
                className="w-full text-sm px-3 py-2 rounded-lg border border-stone-200 bg-white"
              >
                <option value="GOAL_SETTING">Goal Setting</option>
                <option value="SELF_ASSESSMENT">Self Assessment Window</option>
                <option value="MANAGER_REVIEW">Manager Review Window</option>
                <option value="HR_CALIBRATION">HR Calibration & Committee</option>
                <option value="FINALIZED">Finalize Appraisal Cycle</option>
                <option value="ARCHIVED">Archive Cycle</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Reason / Action Note
              </label>
              <textarea
                rows={2}
                value={transitionReason}
                onChange={(e) => setTransitionReason(e.target.value)}
                placeholder="e.g. Goal setting period completed; opening self-assessment submissions..."
                className="w-full text-sm px-3 py-2 rounded-lg border border-stone-200"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-stone-100">
              <Button variant="outline" onClick={() => setTransitionCycle(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={isSubmitting}
                onClick={handleTransitionStage}
                className="bg-amber-600 hover:bg-amber-700 text-white font-medium"
              >
                {isSubmitting ? 'Advancing...' : 'Confirm Stage Progression'}
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 4: Audited Reopening Dialog                             */}
      {/* ------------------------------------------------------------- */}
      {reopenCycleTarget && (
        <Dialog
          isOpen={!!reopenCycleTarget}
          onClose={() => setReopenCycleTarget(null)}
          title={`Reopen Finalized Cycle: ${reopenCycleTarget.name}`}
          description="Audited administrative workflow to permit late reviews, corrections, or calibration updates."
          maxWidth="md"
        >
          <div className="space-y-4 pt-2">
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
              <span>
                Reopening transitions the cycle back to <strong>HR Calibration</strong>. All
                previously finalized scores are protected, and the event will be recorded in the
                security audit log.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Formal Reopening Justification <span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                rows={3}
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder="State the formal business rationale (e.g. Sabbatical returns, medical leave exceptions)..."
                className="w-full text-sm px-3 py-2 rounded-lg border border-stone-200"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Extended Finalization Deadline (Optional)
              </label>
              <input
                type="date"
                value={extendedFinalizationDate}
                onChange={(e) => setExtendedFinalizationDate(e.target.value)}
                className="w-full text-sm px-3 py-2 rounded-lg border border-stone-200"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-stone-100">
              <Button variant="outline" onClick={() => setReopenCycleTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={isSubmitting || !reopenReason.trim()}
                onClick={handleReopenCycle}
                className="bg-rose-600 hover:bg-rose-700 text-white font-medium"
              >
                {isSubmitting ? 'Reopening...' : 'Confirm Reopen'}
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL 5: Manage Participants Drawer / Modal                   */}
      {/* ------------------------------------------------------------- */}
      {participantsCycle && (
        <Dialog
          isOpen={!!participantsCycle}
          onClose={() => setParticipantsCycle(null)}
          title={`Audited Roster: ${participantsCycle.name}`}
          description={`Viewing ${participantsTotal} enrolled participants, evaluator alignments, and status.`}
          maxWidth="2xl"
        >
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between gap-3">
              <input
                type="text"
                placeholder="Filter participants by employee name..."
                value={participantsSearch}
                onChange={(e) => {
                  setParticipantsSearch(e.target.value);
                  openParticipantsDrawer(participantsCycle, 1);
                }}
                className="text-xs px-3 py-1.5 rounded-lg border border-stone-200 w-64"
              />
              <span className="text-xs text-stone-500 font-medium">
                {participantsTotal} total enrolled
              </span>
            </div>

            <div className="max-h-80 overflow-y-auto rounded-lg border border-stone-200 divide-y divide-stone-100 text-xs">
              {participants.map((p) => (
                <div
                  key={p.id}
                  className="p-3 flex items-center justify-between hover:bg-stone-50/60 transition-colors"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <strong className="text-stone-900 font-semibold">
                        {p.employee?.displayName}
                      </strong>
                      <span className="font-mono text-[11px] text-stone-500">
                        {p.employee?.employeeCode}
                      </span>
                      <Badge variant={p.status === 'ENROLLED' ? 'success' : 'default'} size="sm">
                        {p.status}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-stone-500">
                      {p.employee?.employment?.department?.name || 'Department'} &bull; Evaluator:{' '}
                      <strong className="text-stone-700">{p.manager?.displayName || 'None'}</strong>
                    </div>
                    {p.exemptionReason && (
                      <p className="text-[11px] text-amber-700 italic">
                        Exempted: {p.exemptionReason}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setReassignTarget(p)}
                      className="text-xs h-7 px-2"
                      title="Reassign Evaluating Manager"
                    >
                      Reassign Mgr
                    </Button>
                    {p.status === 'ENROLLED' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setExemptTarget(p)}
                        className="text-xs h-7 px-2 text-rose-700 border-rose-200 hover:bg-rose-50"
                        title="Exempt from Cycle"
                      >
                        Exempt
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2 border-t border-stone-100">
              <Button variant="outline" onClick={() => setParticipantsCycle(null)}>
                Close Roster
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Reassign Manager Sub-Modal */}
      {reassignTarget && (
        <Dialog
          isOpen={!!reassignTarget}
          onClose={() => setReassignTarget(null)}
          title={`Reassign Manager for ${reassignTarget.employee?.displayName}`}
          description="Update evaluating manager mid-cycle due to promotion, transfer, or structural changes."
          maxWidth="sm"
        >
          <div className="space-y-3 pt-2">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                New Manager Employee ID / UUID <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={reassignManagerId}
                onChange={(e) => setReassignManagerId(e.target.value)}
                placeholder="Enter valid manager UUID..."
                className="w-full text-xs px-3 py-2 rounded border border-stone-200"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Reason for Reassignment <span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                rows={2}
                value={reassignReason}
                onChange={(e) => setReassignReason(e.target.value)}
                placeholder="Document organizational change reason..."
                className="w-full text-xs px-3 py-2 rounded border border-stone-200"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
              <Button variant="outline" onClick={() => setReassignTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={isSubmitting || !reassignManagerId.trim() || !reassignReason.trim()}
                onClick={handleReassignManager}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                Reassign
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Exempt Participant Sub-Modal */}
      {exemptTarget && (
        <Dialog
          isOpen={!!exemptTarget}
          onClose={() => setExemptTarget(null)}
          title={`Exempt ${exemptTarget.employee?.displayName} from Appraisal`}
          description="Document approved exemption reason (e.g. long medical leave, maternity, sabbatical)."
          maxWidth="sm"
        >
          <div className="space-y-3 pt-2">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Exemption Reason <span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                rows={3}
                value={exemptionReason}
                onChange={(e) => setExemptionReason(e.target.value)}
                placeholder="e.g. On approved 6-month maternity leave / sabbatical..."
                className="w-full text-xs px-3 py-2 rounded border border-stone-200"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
              <Button variant="outline" onClick={() => setExemptTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={isSubmitting || !exemptionReason.trim()}
                onClick={handleExemptParticipant}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                Confirm Exemption
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
};
