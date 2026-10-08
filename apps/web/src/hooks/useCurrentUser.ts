'use client';

import { useAuth } from '../context/AuthContext';
import { AuthUser, RoleType } from '@hrms/types';

export interface UseCurrentUserReturn {
  user: AuthUser | null;
  roles: RoleType[];
  primaryRole: RoleType;
  isAuthenticated: boolean;
  isLoading: boolean;
}

/**
 * Hook providing direct access to current authenticated user identity and state
 */
export function useCurrentUser(): UseCurrentUserReturn {
  const { user, roles, primaryRole, isAuthenticated, isLoading } = useAuth();

  return {
    user,
    roles,
    primaryRole,
    isAuthenticated,
    isLoading,
  };
}
