import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { OfficeLocationsService } from './office-locations.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('OfficeLocationsService', () => {
  let service: OfficeLocationsService;
  let prisma: any;
  let audit: any;

  const mockOrgId = 'org-123';
  const mockUserId = 'user-admin';

  const mockLocation = {
    id: 'loc-1',
    organizationId: mockOrgId,
    branchId: 'branch-1',
    name: 'Bengaluru HQ',
    code: 'BLR-01',
    address: 'Prestige Tech Cloud',
    latitude: 12.9716,
    longitude: 77.5946,
    geofenceRadiusMeters: 100,
    timezone: 'Asia/Kolkata',
    isActive: true,
    effectiveFrom: new Date('2026-01-01'),
    effectiveTo: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      officeLocation: {
        findMany: jest.fn().mockResolvedValue([mockLocation]),
        count: jest.fn().mockResolvedValue(1),
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue(mockLocation),
        update: jest.fn(),
        delete: jest.fn().mockResolvedValue(mockLocation),
      },
      branch: {
        findFirst: jest.fn().mockResolvedValue({ id: 'branch-1', organizationId: mockOrgId }),
      },
      attendanceEvent: {
        count: jest.fn().mockResolvedValue(0),
      },
      employee: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    audit = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OfficeLocationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get<OfficeLocationsService>(OfficeLocationsService);
  });

  describe('findAll', () => {
    it('should return paginated list of office locations scoped to organization', async () => {
      const result = await service.findAll({ organizationId: mockOrgId, page: 1, limit: 10 });
      expect(result.items).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(prisma.officeLocation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: mockOrgId }),
        }),
      );
    });

    it('should filter by branchId and search query', async () => {
      await service.findAll({
        organizationId: mockOrgId,
        branchId: 'branch-1',
        search: 'Tech Cloud',
      });
      expect(prisma.officeLocation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: mockOrgId,
            branchId: 'branch-1',
          }),
        }),
      );
    });
  });

  describe('findById', () => {
    it('should return location when it belongs to organization', async () => {
      prisma.officeLocation.findFirst.mockResolvedValue(mockLocation);
      const res = await service.findById('loc-1', mockOrgId);
      expect(res.id).toBe('loc-1');
      expect(prisma.officeLocation.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'loc-1', organizationId: mockOrgId },
        }),
      );
    });

    it('should throw NotFoundException if location does not exist or belongs to another org', async () => {
      prisma.officeLocation.findFirst.mockResolvedValue(null);
      await expect(service.findById('non-existent', mockOrgId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create office location and write audit record', async () => {
      prisma.officeLocation.findFirst.mockResolvedValue(null); // No duplicates
      const dto = {
        name: 'Mumbai Office',
        latitude: 19.076,
        longitude: 72.8777,
        geofenceRadiusMeters: 150,
      };

      const created = await service.create(dto, mockOrgId, mockUserId);
      expect(created).toBeDefined();
      expect(prisma.officeLocation.create).toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'OFFICE_LOCATION_CREATED',
          organizationId: mockOrgId,
        }),
      );
    });

    it('should prevent duplicate names within same organization', async () => {
      prisma.officeLocation.findFirst.mockResolvedValue(mockLocation);
      const dto = {
        name: 'Bengaluru HQ',
        latitude: 12.9716,
        longitude: 77.5946,
      };

      await expect(service.create(dto, mockOrgId, mockUserId)).rejects.toThrow(ConflictException);
    });
  });

  describe('delete', () => {
    it('should hard-delete if no attendance events reference it', async () => {
      prisma.officeLocation.findFirst.mockResolvedValue(mockLocation);
      prisma.attendanceEvent.count.mockResolvedValue(0);

      const res = await service.delete('loc-1', mockOrgId, mockUserId);
      expect(res.success).toBe(true);
      expect(prisma.officeLocation.delete).toHaveBeenCalledWith({ where: { id: 'loc-1' } });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'OFFICE_LOCATION_DELETED' }),
      );
    });

    it('should soft-deactivate if historical attendance events exist', async () => {
      prisma.officeLocation.findFirst.mockResolvedValue(mockLocation);
      prisma.attendanceEvent.count.mockResolvedValue(14);
      prisma.officeLocation.update.mockResolvedValue({ ...mockLocation, isActive: false });

      const res = await service.delete('loc-1', mockOrgId, mockUserId);
      expect(res.success).toBe(true);
      expect(prisma.officeLocation.update).toHaveBeenCalledWith({
        where: { id: 'loc-1' },
        data: { isActive: false },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'OFFICE_LOCATION_DEACTIVATED' }),
      );
    });
  });

  describe('validateLocation', () => {
    it('should return VERIFIED when client is within designated office radius', async () => {
      prisma.officeLocation.findFirst.mockResolvedValue(mockLocation);

      const res = await service.validateLocation(
        {
          officeLocationId: 'loc-1',
          latitude: 12.9716,
          longitude: 77.5946,
          accuracyMeters: 10,
        },
        mockOrgId,
      );

      expect(res.outcome).toBe('VERIFIED');
      expect(res.isWithinGeofence).toBe(true);
      expect(res.distanceMeters).toBe(0);
      expect(res.office?.name).toBe('Bengaluru HQ');
    });

    it('should return OUTSIDE_GEOFENCE when client is far away', async () => {
      prisma.officeLocation.findFirst.mockResolvedValue(mockLocation);

      const res = await service.validateLocation(
        {
          officeLocationId: 'loc-1',
          latitude: 12.9716 + 0.05, // ~5.5 km away
          longitude: 77.5946,
          accuracyMeters: 10,
        },
        mockOrgId,
      );

      expect(res.outcome).toBe('OUTSIDE_GEOFENCE');
      expect(res.isWithinGeofence).toBe(false);
      expect(res.distanceMeters).toBeGreaterThan(100);
    });

    it('should return LOW_ACCURACY when accuracy exceeds 100m', async () => {
      prisma.officeLocation.findFirst.mockResolvedValue(mockLocation);

      const res = await service.validateLocation(
        {
          officeLocationId: 'loc-1',
          latitude: 12.9716,
          longitude: 77.5946,
          accuracyMeters: 250,
        },
        mockOrgId,
      );

      expect(res.outcome).toBe('LOW_ACCURACY');
      expect(res.isWithinGeofence).toBe(false);
    });

    it('should return LOCATION_UNAVAILABLE if office is not found', async () => {
      prisma.officeLocation.findFirst.mockResolvedValue(null);

      const res = await service.validateLocation(
        {
          officeLocationId: 'non-existent',
          latitude: 12.9716,
          longitude: 77.5946,
        },
        mockOrgId,
      );

      expect(res.outcome).toBe('LOCATION_UNAVAILABLE');
    });
  });
});
