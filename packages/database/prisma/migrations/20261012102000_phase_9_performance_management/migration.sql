-- CreateEnum
CREATE TYPE "ReviewCycleType" AS ENUM ('ANNUAL', 'SEMI_ANNUAL', 'QUARTERLY', 'PROBATION');

-- CreateEnum
CREATE TYPE "ReviewCycleStatus" AS ENUM ('DRAFT', 'GOAL_SETTING', 'SELF_ASSESSMENT', 'MANAGER_REVIEW', 'HR_CALIBRATION', 'FINALIZED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "GoalCategory" AS ENUM ('QUANTITATIVE', 'QUALITATIVE', 'DEVELOPMENT', 'TEAM');

-- CreateEnum
CREATE TYPE "GoalMeasurementType" AS ENUM ('NUMERIC', 'PERCENTAGE', 'CURRENCY', 'BOOLEAN', 'MILESTONE', 'QUALITATIVE');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'IN_PROGRESS', 'ON_TRACK', 'NEEDS_ATTENTION', 'AT_RISK', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GoalActionType" AS ENUM ('CREATED', 'UPDATED', 'SUBMITTED', 'APPROVED', 'REJECTED', 'TARGET_CHANGED', 'WEIGHT_CHANGED', 'STATUS_CHANGED', 'PROGRESS_UPDATED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PerformanceReviewStatus" AS ENUM ('NOT_STARTED', 'SELF_ASSESSMENT_DRAFT', 'SELF_ASSESSMENT_SUBMITTED', 'MANAGER_REVIEW_DRAFT', 'MANAGER_REVIEW_SUBMITTED', 'HR_CALIBRATION', 'REOPENED', 'FINALIZED');

-- CreateEnum
CREATE TYPE "CompetencyCategory" AS ENUM ('CORE_VALUES', 'FUNCTIONAL_EXPERTISE', 'LEADERSHIP', 'COMMUNICATION', 'PROBLEM_SOLVING');

-- CreateEnum
CREATE TYPE "DevelopmentPlanStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FeedbackVisibility" AS ENUM ('EMPLOYEE_VISIBLE', 'MANAGER_ONLY', 'HR_CONFIDENTIAL');

-- CreateTable
CREATE TABLE "review_cycles" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "type" "ReviewCycleType" NOT NULL DEFAULT 'ANNUAL',
    "status" "ReviewCycleStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "goalSettingDeadline" TIMESTAMP(3),
    "selfAssessmentDeadline" TIMESTAMP(3),
    "managerReviewDeadline" TIMESTAMP(3),
    "finalizationDeadline" TIMESTAMP(3),
    "goalsWeightPercentage" DOUBLE PRECISION NOT NULL DEFAULT 70.0,
    "competenciesWeightPercentage" DOUBLE PRECISION NOT NULL DEFAULT 30.0,
    "allowEmployeeGoalCreation" BOOLEAN NOT NULL DEFAULT true,
    "requireGoalApproval" BOOLEAN NOT NULL DEFAULT true,
    "ratingScaleMax" INTEGER NOT NULL DEFAULT 5,
    "eligibleDepartmentIds" JSONB,
    "eligibleBranchIds" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_goals" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cycleId" TEXT,
    "employeeId" TEXT NOT NULL,
    "assignedById" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "businessRationale" TEXT,
    "alignmentKey" TEXT,
    "category" "GoalCategory" NOT NULL DEFAULT 'QUANTITATIVE',
    "measurementType" "GoalMeasurementType" NOT NULL DEFAULT 'NUMERIC',
    "unit" TEXT,
    "baselineValue" DOUBLE PRECISION DEFAULT 0.0,
    "targetValue" DOUBLE PRECISION,
    "currentValue" DOUBLE PRECISION DEFAULT 0.0,
    "evaluationCriteria" TEXT,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 20.0,
    "status" "GoalStatus" NOT NULL DEFAULT 'DRAFT',
    "progressPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "policyReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performance_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goal_progress_updates" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "previousValue" DOUBLE PRECISION,
    "newValue" DOUBLE PRECISION,
    "previousProgress" DOUBLE PRECISION NOT NULL,
    "newProgress" DOUBLE PRECISION NOT NULL,
    "note" TEXT NOT NULL,
    "evidenceUrl" TEXT,
    "evidenceFileName" TEXT,
    "evidenceFileSize" INTEGER,
    "evidenceMimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goal_progress_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goal_histories" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" "GoalActionType" NOT NULL,
    "changeReason" TEXT,
    "previousState" JSONB,
    "newState" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goal_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_competencies" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "category" "CompetencyCategory" NOT NULL DEFAULT 'CORE_VALUES',
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 20.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performance_competencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_reviews" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "managerId" TEXT,
    "status" "PerformanceReviewStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "selfSummary" TEXT,
    "selfAchievements" TEXT,
    "selfChallenges" TEXT,
    "selfSubmittedAt" TIMESTAMP(3),
    "managerSummary" TEXT,
    "managerStrengths" TEXT,
    "managerImprovements" TEXT,
    "managerSubmittedAt" TIMESTAMP(3),
    "calculatedGoalsScore" DOUBLE PRECISION,
    "calculatedCompetenciesScore" DOUBLE PRECISION,
    "overallScore" DOUBLE PRECISION,
    "calculationBreakdown" JSONB,
    "scoreExplanation" TEXT,
    "reopenReason" TEXT,
    "reopenedById" TEXT,
    "finalizedById" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "employeeAcknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performance_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_review_items" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "goalId" TEXT,
    "competencyId" TEXT,
    "selfRating" DOUBLE PRECISION,
    "selfComments" TEXT,
    "managerRating" DOUBLE PRECISION,
    "managerComments" TEXT,
    "isNotApplicable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performance_review_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_feedbacks" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "visibility" "FeedbackVisibility" NOT NULL DEFAULT 'EMPLOYEE_VISIBLE',
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "development_plans" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "actionSteps" TEXT NOT NULL,
    "targetDate" TIMESTAMP(3),
    "status" "DevelopmentPlanStatus" NOT NULL DEFAULT 'PLANNED',
    "responsiblePerson" TEXT,
    "trainingNeeds" TEXT,
    "followUpNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "development_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "review_cycles_organizationId_status_idx" ON "review_cycles"("organizationId", "status");

-- CreateIndex
CREATE INDEX "review_cycles_startDate_endDate_idx" ON "review_cycles"("startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "review_cycles_organizationId_code_key" ON "review_cycles"("organizationId", "code");

-- CreateIndex
CREATE INDEX "performance_goals_organizationId_status_idx" ON "performance_goals"("organizationId", "status");

-- CreateIndex
CREATE INDEX "performance_goals_employeeId_status_idx" ON "performance_goals"("employeeId", "status");

-- CreateIndex
CREATE INDEX "performance_goals_cycleId_idx" ON "performance_goals"("cycleId");

-- CreateIndex
CREATE INDEX "performance_goals_dueDate_idx" ON "performance_goals"("dueDate");

-- CreateIndex
CREATE INDEX "goal_progress_updates_goalId_idx" ON "goal_progress_updates"("goalId");

-- CreateIndex
CREATE INDEX "goal_progress_updates_createdAt_idx" ON "goal_progress_updates"("createdAt");

-- CreateIndex
CREATE INDEX "goal_histories_goalId_idx" ON "goal_histories"("goalId");

-- CreateIndex
CREATE INDEX "goal_histories_createdAt_idx" ON "goal_histories"("createdAt");

-- CreateIndex
CREATE INDEX "performance_competencies_cycleId_idx" ON "performance_competencies"("cycleId");

-- CreateIndex
CREATE INDEX "performance_reviews_organizationId_cycleId_idx" ON "performance_reviews"("organizationId", "cycleId");

-- CreateIndex
CREATE INDEX "performance_reviews_managerId_status_idx" ON "performance_reviews"("managerId", "status");

-- CreateIndex
CREATE INDEX "performance_reviews_employeeId_status_idx" ON "performance_reviews"("employeeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "performance_reviews_cycleId_employeeId_key" ON "performance_reviews"("cycleId", "employeeId");

-- CreateIndex
CREATE INDEX "performance_review_items_reviewId_idx" ON "performance_review_items"("reviewId");

-- CreateIndex
CREATE INDEX "performance_feedbacks_reviewId_visibility_idx" ON "performance_feedbacks"("reviewId", "visibility");

-- CreateIndex
CREATE INDEX "development_plans_reviewId_idx" ON "development_plans"("reviewId");

-- CreateIndex
CREATE INDEX "development_plans_employeeId_status_idx" ON "development_plans"("employeeId", "status");

-- AddForeignKey
ALTER TABLE "review_cycles" ADD CONSTRAINT "review_cycles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_goals" ADD CONSTRAINT "performance_goals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_goals" ADD CONSTRAINT "performance_goals_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "review_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_goals" ADD CONSTRAINT "performance_goals_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_goals" ADD CONSTRAINT "performance_goals_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_goals" ADD CONSTRAINT "performance_goals_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_progress_updates" ADD CONSTRAINT "goal_progress_updates_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "performance_goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_progress_updates" ADD CONSTRAINT "goal_progress_updates_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_histories" ADD CONSTRAINT "goal_histories_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "performance_goals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goal_histories" ADD CONSTRAINT "goal_histories_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_competencies" ADD CONSTRAINT "performance_competencies_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "review_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "review_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_reviews" ADD CONSTRAINT "performance_reviews_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_review_items" ADD CONSTRAINT "performance_review_items_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "performance_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_review_items" ADD CONSTRAINT "performance_review_items_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "performance_goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_review_items" ADD CONSTRAINT "performance_review_items_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "performance_competencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_feedbacks" ADD CONSTRAINT "performance_feedbacks_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "performance_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_feedbacks" ADD CONSTRAINT "performance_feedbacks_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "development_plans" ADD CONSTRAINT "development_plans_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "performance_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "development_plans" ADD CONSTRAINT "development_plans_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

