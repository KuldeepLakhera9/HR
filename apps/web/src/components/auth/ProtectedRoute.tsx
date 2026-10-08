'use client';

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { RoleType } from '@hrms/types';
import { LoadingState } from '@hrms/ui';

export interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: RoleType[];
  requiredPermissions?: string[];
  fallback?: React.ReactNode;
}

/**
 * Client-side route protection guard enforcing authentication,
 * application role membership, and granular permissions.
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRoles,
  requiredPermissions,
  fallback,
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const { user, roles, permissions, isAuthenticated, isLoading } = useAuth();

  const isAdmin = roles.includes('ADMIN');

  const hasRoleAccess =
    !allowedRoles ||
    allowedRoles.length === 0 ||
    isAdmin ||
    allowedRoles.some((r) => roles.includes(r));

  const hasPermissionAccess =
    !requiredPermissions ||
    requiredPermissions.length === 0 ||
    isAdmin ||
    requiredPermissions.every((p) => permissions.includes(p));

  const isAuthorized = hasRoleAccess && hasPermissionAccess;

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        const redirectUrl = pathname ? `/login?redirect=${encodeURIComponent(pathname)}` : '/login';
        router.replace(redirectUrl);
      } else if (!isAuthorized) {
        router.replace('/unauthorized');
      }
    }
  }, [isLoading, isAuthenticated, isAuthorized, router, pathname]);

  // Loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <LoadingState message="Verifying security credentials..." />
      </div>
    );
  }

  // Not authenticated
  if (!isAuthenticated) {
    return fallback ? (
      <>{fallback}</>
    ) : (
      <div className="min-h-[50vh] flex items-center justify-center">
        <LoadingState message="Redirecting to secure login..." />
      </div>
    );
  }

  // Authenticated but unauthorized
  if (!isAuthorized) {
    return fallback ? (
      <>{fallback}</>
    ) : (
      <div className="min-h-[50vh] flex items-center justify-center">
        <LoadingState message="Redirecting..." />
      </div>
    );
  }

  return <>{children}</>;
};
