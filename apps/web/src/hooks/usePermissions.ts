'use client';

import { useAuth } from '../context/AuthContext';
import { useCallback } from 'react';

export interface UsePermissionsReturn {
  permissions: string[];
  isAdmin: boolean;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  hasAllPermissions: (permissions: string[]) => boolean;
}

/**
 * Hook for querying and asserting current user permissions
 */
export function usePermissions(): UsePermissionsReturn {
  const { permissions, roles, user } = useAuth();
  const isAdmin = roles.includes('ADMIN');

  const hasPermission = useCallback(
    (permission: string): boolean => {
      if (!user) return false;
      if (isAdmin) return true;
      return permissions.includes(permission);
    },
    [user, isAdmin, permissions],
  );

  const hasAnyPermission = useCallback(
    (targetPermissions: string[]): boolean => {
      if (!user) return false;
      if (isAdmin) return true;
      return targetPermissions.some((p) => permissions.includes(p));
    },
    [user, isAdmin, permissions],
  );

  const hasAllPermissions = useCallback(
    (targetPermissions: string[]): boolean => {
      if (!user) return false;
      if (isAdmin) return true;
      return targetPermissions.every((p) => permissions.includes(p));
    },
    [user, isAdmin, permissions],
  );

  return {
    permissions,
    isAdmin,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
  };
}
