import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { AuthenticatedUser } from '../../modules/auth/interfaces/auth.interface';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;

    if (!user || !user.permissions || user.permissions.length === 0) {
      throw new ForbiddenException(
        'Access denied: You do not possess the required privilege to perform this action.',
      );
    }

    const missingPermissions = requiredPermissions.filter(
      (perm) => !user.permissions.includes(perm),
    );

    if (missingPermissions.length > 0) {
      throw new ForbiddenException(
        `Access denied: Missing required permission(s): [${missingPermissions.join(', ')}].`,
      );
    }

    return true;
  }
}
