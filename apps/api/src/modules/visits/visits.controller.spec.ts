import { Test, TestingModule } from '@nestjs/testing';
import { VisitsController } from './visits.controller';
import { VisitsService } from './visits.service';
import { AuthenticatedUser } from '../auth/interfaces/auth.interface';
import { VisitStatus } from '@hrms/database';

describe('VisitsController', () => {
  let controller: VisitsController;
  let visitsService: {
    createVisit: jest.Mock;
    getVisits: jest.Mock;
    getVisitById: jest.Mock;
    updateVisit: jest.Mock;
    cancelVisit: jest.Mock;
  };

  const mockUser: AuthenticatedUser = {
    id: 'usr-1',
    email: 'alice@company.com',
    organizationId: 'org-1',
    firstName: 'Alice',
    lastName: 'Smith',
    employeeCode: 'EMP101',
    status: 'ACTIVE' as any,
    roles: ['EMPLOYEE' as any],
    permissions: ['VISIT_APPLY', 'VISIT_VIEW'],
    sessionId: 'session-alice',
  };

  beforeEach(async () => {
    visitsService = {
      createVisit: jest.fn(),
      getVisits: jest.fn(),
      getVisitById: jest.fn(),
      updateVisit: jest.fn(),
      cancelVisit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VisitsController],
      providers: [{ provide: VisitsService, useValue: visitsService }],
    }).compile();

    controller = module.get<VisitsController>(VisitsController);
  });

  describe('POST /visits', () => {
    it('calls visitsService.createVisit with user and DTO', async () => {
      const dto = {
        title: 'Client Visit',
        purpose: 'Architecture Review',
        startDate: '2026-10-25',
        endDate: '2026-10-26',
        destinations: [
          {
            destinationName: 'Client Site',
            latitude: 12.97,
            longitude: 77.59,
          },
        ],
      };
      visitsService.createVisit.mockResolvedValue({
        message: 'Official visit created successfully',
        data: { id: 'vis-1', ...dto, status: VisitStatus.SUBMITTED },
      });

      const res = await controller.createVisit(mockUser, dto as any);
      expect(visitsService.createVisit).toHaveBeenCalledWith(mockUser, dto);
      expect(res.data.id).toBe('vis-1');
    });
  });

  describe('GET /visits/my', () => {
    it('calls visitsService.getVisits forcing scope="my"', async () => {
      visitsService.getVisits.mockResolvedValue({
        message: 'Official visits retrieved successfully',
        data: [{ id: 'vis-1' }],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      });

      const res = await controller.getMyVisits(mockUser, { page: 1, limit: 10 });
      expect(visitsService.getVisits).toHaveBeenCalledWith(mockUser, {
        page: 1,
        limit: 10,
        scope: 'my',
      });
      expect(res.data.length).toBe(1);
    });
  });

  describe('GET /visits', () => {
    it('calls visitsService.getVisits with query params', async () => {
      const query = { page: 2, limit: 5, scope: 'team' as const, status: VisitStatus.SUBMITTED };
      visitsService.getVisits.mockResolvedValue({
        message: 'Official visits retrieved successfully',
        data: [],
        meta: { total: 0, page: 2, limit: 5, totalPages: 0 },
      });

      const res = await controller.getVisits(mockUser, query);
      expect(visitsService.getVisits).toHaveBeenCalledWith(mockUser, query);
      expect(res.meta.page).toBe(2);
    });
  });

  describe('GET /visits/:id', () => {
    it('calls visitsService.getVisitById with id', async () => {
      visitsService.getVisitById.mockResolvedValue({
        message: 'Official visit retrieved successfully',
        data: { id: 'vis-123' },
      });

      const res = await controller.getVisitById(mockUser, 'vis-123');
      expect(visitsService.getVisitById).toHaveBeenCalledWith(mockUser, 'vis-123');
      expect(res.data.id).toBe('vis-123');
    });
  });

  describe('PATCH /visits/:id', () => {
    it('calls visitsService.updateVisit with id and update DTO', async () => {
      const dto = { title: 'Updated Title' };
      visitsService.updateVisit.mockResolvedValue({
        message: 'Official visit updated successfully',
        data: { id: 'vis-123', title: 'Updated Title' },
        reapprovalTriggered: false,
      });

      const res = await controller.updateVisit(mockUser, 'vis-123', dto);
      expect(visitsService.updateVisit).toHaveBeenCalledWith(mockUser, 'vis-123', dto);
      expect(res.data.title).toBe('Updated Title');
    });
  });

  describe('POST /visits/:id/cancel', () => {
    it('calls visitsService.cancelVisit with id and cancellation reason', async () => {
      const dto = { cancellationReason: 'Client meeting cancelled' };
      visitsService.cancelVisit.mockResolvedValue({
        message: 'Official visit cancelled successfully',
        data: { id: 'vis-123', status: VisitStatus.CANCELLED },
      });

      const res = await controller.cancelVisit(mockUser, 'vis-123', dto);
      expect(visitsService.cancelVisit).toHaveBeenCalledWith(mockUser, 'vis-123', dto);
      expect(res.data.status).toBe(VisitStatus.CANCELLED);
    });
  });
});
