import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateOfficeLocationDto,
  UpdateOfficeLocationDto,
  OfficeLocationFilterDto,
  ValidateLocationDto,
} from './dto/office-location.dto';
import { evaluateGeofenceLocation, OfficeGeofenceTarget } from './utils/geofence.util';
import { LocationValidationResultDto } from '@hrms/types';

@Injectable()
export class OfficeLocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * 1. List office locations with filters and pagination
   */
  async findAll(params: {
    organizationId: string;
    branchId?: string;
    search?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {
      organizationId: params.organizationId,
    };

    if (params.branchId) {
      where.branchId = params.branchId;
    }

    if (params.isActive !== undefined) {
      where.isActive = params.isActive;
    }

    if (params.search) {
      const search = params.search.trim();
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.officeLocation.count({ where }),
      this.prisma.officeLocation.findMany({
        where,
        include: {
          branch: {
            select: {
              id: true,
              name: true,
              code: true,
              city: true,
              state: true,
            },
          },
        },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        skip,
        take: limit,
      }),
    ]);

    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 2. Find single office location by ID
   */
  async findById(id: string, organizationId: string) {
    const location = await this.prisma.officeLocation.findFirst({
      where: { id, organizationId },
      include: {
        branch: {
          select: {
            id: true,
            name: true,
            code: true,
            city: true,
            state: true,
          },
        },
      },
    });

    if (!location) {
      throw new NotFoundException(`Office location #${id} not found.`);
    }

    return location;
  }

  /**
   * 3. Create a new office location
   */
  async create(dto: CreateOfficeLocationDto, organizationId: string, actorUserId: string) {
    // If branchId is supplied, verify it belongs to this organization
    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, organizationId },
      });
      if (!branch) {
        throw new BadRequestException(
          `Branch #${dto.branchId} does not exist in this organization.`,
        );
      }
    }

    // Check unique name per organization
    const existing = await this.prisma.officeLocation.findFirst({
      where: {
        organizationId,
        name: { equals: dto.name.trim(), mode: 'insensitive' },
      },
    });

    if (existing) {
      throw new ConflictException(`Office location with name "${dto.name}" already exists.`);
    }

    const location = await this.prisma.officeLocation.create({
      data: {
        organizationId,
        branchId: dto.branchId || null,
        name: dto.name.trim(),
        code: dto.code?.trim() || null,
        address: dto.address?.trim() || null,
        latitude: dto.latitude,
        longitude: dto.longitude,
        geofenceRadiusMeters: dto.geofenceRadiusMeters ?? 100,
        timezone: dto.timezone || 'Asia/Kolkata',
        isActive: dto.isActive ?? true,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date(),
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
      },
      include: {
        branch: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    await this.auditService.record({
      action: 'OFFICE_LOCATION_CREATED',
      entity: 'OfficeLocation',
      entityId: location.id,
      userId: actorUserId,
      organizationId,
      metadata: {
        newValues: {
          name: location.name,
          latitude: location.latitude,
          longitude: location.longitude,
          geofenceRadiusMeters: location.geofenceRadiusMeters,
        },
      },
    });

    return location;
  }

  /**
   * 4. Update an existing office location
   */
  async update(
    id: string,
    dto: UpdateOfficeLocationDto,
    organizationId: string,
    actorUserId: string,
  ) {
    const existing = await this.findById(id, organizationId);

    if (dto.branchId && dto.branchId !== existing.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, organizationId },
      });
      if (!branch) {
        throw new BadRequestException(
          `Branch #${dto.branchId} does not exist in this organization.`,
        );
      }
    }

    if (dto.name && dto.name.trim() !== existing.name) {
      const duplicate = await this.prisma.officeLocation.findFirst({
        where: {
          organizationId,
          name: { equals: dto.name.trim(), mode: 'insensitive' },
          id: { not: id },
        },
      });
      if (duplicate) {
        throw new ConflictException(`Office location with name "${dto.name}" already exists.`);
      }
    }

    const updated = await this.prisma.officeLocation.update({
      where: { id },
      data: {
        ...(dto.branchId !== undefined && { branchId: dto.branchId || null }),
        ...(dto.name && { name: dto.name.trim() }),
        ...(dto.code !== undefined && { code: dto.code?.trim() || null }),
        ...(dto.address !== undefined && { address: dto.address?.trim() || null }),
        ...(dto.latitude !== undefined && { latitude: dto.latitude }),
        ...(dto.longitude !== undefined && { longitude: dto.longitude }),
        ...(dto.geofenceRadiusMeters !== undefined && {
          geofenceRadiusMeters: dto.geofenceRadiusMeters,
        }),
        ...(dto.timezone && { timezone: dto.timezone }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.effectiveFrom && { effectiveFrom: new Date(dto.effectiveFrom) }),
        ...(dto.effectiveTo !== undefined && {
          effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        }),
      },
      include: {
        branch: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    await this.auditService.record({
      action: 'OFFICE_LOCATION_UPDATED',
      entity: 'OfficeLocation',
      entityId: updated.id,
      userId: actorUserId,
      organizationId,
      metadata: {
        oldValues: {
          name: existing.name,
          latitude: existing.latitude,
          longitude: existing.longitude,
          geofenceRadiusMeters: existing.geofenceRadiusMeters,
          isActive: existing.isActive,
        },
        newValues: {
          name: updated.name,
          latitude: updated.latitude,
          longitude: updated.longitude,
          geofenceRadiusMeters: updated.geofenceRadiusMeters,
          isActive: updated.isActive,
        },
      },
    });

    return updated;
  }

  /**
   * 5. Delete or deactivate an office location
   */
  async delete(id: string, organizationId: string, actorUserId: string) {
    const location = await this.findById(id, organizationId);

    // Check if attendance events exist
    const eventsCount = await this.prisma.attendanceEvent.count({
      where: { officeLocationId: id },
    });

    if (eventsCount > 0) {
      // Soft-deactivate if historical events reference it
      const deactivated = await this.prisma.officeLocation.update({
        where: { id },
        data: { isActive: false },
      });

      await this.auditService.record({
        action: 'OFFICE_LOCATION_DEACTIVATED',
        entity: 'OfficeLocation',
        entityId: id,
        userId: actorUserId,
        organizationId,
        metadata: { reason: 'Has historical attendance events, soft-deactivated' },
      });

      return {
        success: true,
        message:
          'Office location has historical attendance events and was deactivated instead of deleted.',
        data: deactivated,
      };
    }

    await this.prisma.officeLocation.delete({
      where: { id },
    });

    await this.auditService.record({
      action: 'OFFICE_LOCATION_DELETED',
      entity: 'OfficeLocation',
      entityId: id,
      userId: actorUserId,
      organizationId,
      metadata: { oldValues: { name: location.name } },
    });

    return {
      success: true,
      message: 'Office location deleted successfully.',
    };
  }

  /**
   * 6. Validate Client Geolocation against Office Geofence (Haversine Testing)
   */
  async validateLocation(
    dto: ValidateLocationDto,
    organizationId: string,
    userId?: string,
  ): Promise<LocationValidationResultDto> {
    let officeTarget: OfficeGeofenceTarget | null = null;

    // Strategy A: If explicit officeLocationId is requested
    if (dto.officeLocationId) {
      const loc = await this.prisma.officeLocation.findFirst({
        where: { id: dto.officeLocationId, organizationId },
      });
      if (loc) {
        officeTarget = {
          id: loc.id,
          name: loc.name,
          latitude: loc.latitude,
          longitude: loc.longitude,
          geofenceRadiusMeters: loc.geofenceRadiusMeters,
          timezone: loc.timezone,
          isActive: loc.isActive,
          effectiveFrom: loc.effectiveFrom,
          effectiveTo: loc.effectiveTo,
        };
      }
    }

    // Strategy B: If branchId is specified, check branch's office locations or branch coordinates
    if (!officeTarget && dto.branchId) {
      const loc = await this.prisma.officeLocation.findFirst({
        where: { branchId: dto.branchId, organizationId, isActive: true },
      });

      if (loc) {
        officeTarget = {
          id: loc.id,
          name: loc.name,
          latitude: loc.latitude,
          longitude: loc.longitude,
          geofenceRadiusMeters: loc.geofenceRadiusMeters,
          timezone: loc.timezone,
          isActive: loc.isActive,
          effectiveFrom: loc.effectiveFrom,
          effectiveTo: loc.effectiveTo,
        };
      } else {
        const branch = await this.prisma.branch.findFirst({
          where: { id: dto.branchId, organizationId },
        });
        if (branch && branch.latitude && branch.longitude) {
          officeTarget = {
            id: branch.id,
            name: `${branch.name} (Branch Office)`,
            latitude: branch.latitude,
            longitude: branch.longitude,
            geofenceRadiusMeters: branch.geofenceRadiusMeters || 100,
            timezone: branch.timezone,
            isActive: branch.isActive,
          };
        }
      }
    }

    // Strategy C: If user is supplied, look up their assigned branch
    if (!officeTarget && userId) {
      const employee = await this.prisma.employee.findFirst({
        where: { userId, organizationId },
        include: {
          employment: {
            include: {
              branch: true,
            },
          },
        },
      });

      if (employee?.employment?.branch) {
        const branch = employee.employment.branch;
        // Check if branch has designated officeLocation
        const loc = await this.prisma.officeLocation.findFirst({
          where: { branchId: branch.id, organizationId, isActive: true },
        });

        if (loc) {
          officeTarget = {
            id: loc.id,
            name: loc.name,
            latitude: loc.latitude,
            longitude: loc.longitude,
            geofenceRadiusMeters: loc.geofenceRadiusMeters,
            timezone: loc.timezone,
            isActive: loc.isActive,
          };
        } else if (branch.latitude && branch.longitude) {
          officeTarget = {
            id: branch.id,
            name: `${branch.name} (Branch Office)`,
            latitude: branch.latitude,
            longitude: branch.longitude,
            geofenceRadiusMeters: branch.geofenceRadiusMeters || 100,
            timezone: branch.timezone,
            isActive: branch.isActive,
          };
        }
      }
    }

    // Strategy D: Fall back to first active office location of the organization
    if (!officeTarget) {
      const loc = await this.prisma.officeLocation.findFirst({
        where: { organizationId, isActive: true },
        orderBy: { createdAt: 'asc' },
      });

      if (loc) {
        officeTarget = {
          id: loc.id,
          name: loc.name,
          latitude: loc.latitude,
          longitude: loc.longitude,
          geofenceRadiusMeters: loc.geofenceRadiusMeters,
          timezone: loc.timezone,
          isActive: loc.isActive,
        };
      }
    }

    // Run the Geofence Evaluation Engine
    const evalResult = evaluateGeofenceLocation({
      clientLatitude: dto.latitude,
      clientLongitude: dto.longitude,
      clientAccuracyMeters: dto.accuracyMeters,
      clientTimestamp: dto.timestamp,
      office: officeTarget,
    });

    return {
      outcome: evalResult.outcome,
      isWithinGeofence: evalResult.isWithinGeofence,
      distanceMeters: evalResult.distanceMeters,
      allowedRadiusMeters: evalResult.allowedRadiusMeters,
      accuracyMeters: evalResult.accuracyMeters,
      timeSkewSeconds: evalResult.timeSkewSeconds,
      office: officeTarget
        ? {
            id: officeTarget.id || '',
            name: officeTarget.name || 'Office',
            latitude: officeTarget.latitude,
            longitude: officeTarget.longitude,
            geofenceRadiusMeters: officeTarget.geofenceRadiusMeters,
            timezone: officeTarget.timezone || 'Asia/Kolkata',
          }
        : null,
      message: evalResult.message,
    };
  }
}
