import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { AuthorizationModule } from '../../common/authorization/authorization.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmployeesModule } from '../employees/employees.module';
import { GoalsService } from './goals.service';
import { GoalsController } from './goals.controller';
import { ReviewCyclesService } from './review-cycles.service';
import { ReviewCyclesController } from './review-cycles.controller';
import { SelfAssessmentService } from './self-assessment.service';
import { SelfAssessmentController } from './self-assessment.controller';
import { ManagerReviewsService } from './manager-reviews.service';
import { ManagerReviewsController } from './manager-reviews.controller';
import { DevelopmentPlansService } from './development-plans.service';
import { DevelopmentPlansController } from './development-plans.controller';
import { RatingCalculationService } from './rating-calculation.service';
import { RatingCalculationController } from './rating-calculation.controller';
import { PerformanceReportsService } from './performance-reports.service';
import { PerformanceReportsController } from './performance-reports.controller';
import { PerformanceNotificationsService } from './performance-notifications.service';
import { PerformanceNotificationsController } from './performance-notifications.controller';

@Module({
  imports: [PrismaModule, AuthorizationModule, AuditModule, NotificationsModule, EmployeesModule],
  controllers: [
    GoalsController,
    ReviewCyclesController,
    SelfAssessmentController,
    ManagerReviewsController,
    DevelopmentPlansController,
    RatingCalculationController,
    PerformanceReportsController,
    PerformanceNotificationsController,
  ],
  providers: [
    GoalsService,
    ReviewCyclesService,
    SelfAssessmentService,
    ManagerReviewsService,
    DevelopmentPlansService,
    RatingCalculationService,
    PerformanceReportsService,
    PerformanceNotificationsService,
  ],
  exports: [
    GoalsService,
    ReviewCyclesService,
    SelfAssessmentService,
    ManagerReviewsService,
    DevelopmentPlansService,
    RatingCalculationService,
    PerformanceReportsService,
    PerformanceNotificationsService,
  ],
})
export class PerformanceModule {}
