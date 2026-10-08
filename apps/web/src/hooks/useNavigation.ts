'use client';

import { useMemo } from 'react';
import { useRole } from '../context/RoleContext';
import { useAuth } from '../context/AuthContext';
import { NAVIGATION_CONFIG, filterNavigationItems } from '@hrms/config';
import { NavigationItem, RoleType } from '@hrms/types';

export interface UseNavigationReturn {
  navItems: NavigationItem[];
  role: RoleType;
  isAdmin: boolean;
  isAuthenticated: boolean;
}

/**
 * Permission-aware navigation hook.
 *
 * Filters sidebar navigation items based on the authenticated user's
 * granted permissions and application role. If in unauthenticated preview mode,
 * displays the selected persona's default configuration.
 */
export function useNavigation(): UseNavigationReturn {
  const { role } = useRole();
  const { permissions, roles, isAuthenticated } = useAuth();

  const isAdmin = roles.includes('ADMIN');

  const navItems = useMemo<NavigationItem[]>(() => {
    const rawItems = NAVIGATION_CONFIG[role] || [];

    if (!isAuthenticated) {
      // In preview mode, return full role preset items
      return rawItems;
    }

    // In authenticated mode, apply strict permission filtering
    return filterNavigationItems(rawItems, permissions, isAdmin);
  }, [role, permissions, isAdmin, isAuthenticated]);

  return {
    navItems,
    role,
    isAdmin,
    isAuthenticated,
  };
}
