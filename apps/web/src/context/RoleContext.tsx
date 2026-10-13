'use client';

import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { RoleType } from '@hrms/types';
import { useAuth } from './AuthContext';

export interface RoleUser {
  name: string;
  email: string;
  role: RoleType;
  title: string;
}

interface RoleContextType {
  role: RoleType;
  setRole: (role: RoleType) => void;
  currentUser: RoleUser;
  availableRoles: RoleType[];
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export const RoleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, primaryRole, isAuthenticated, roles } = useAuth();
  const [selectedRole, setSelectedRole] = useState<RoleType | null>(null);

  // Sync role with authenticated user's primary role upon login
  useEffect(() => {
    if (isAuthenticated && primaryRole) {
      // If currently selected role is not among user's genuine assigned roles, reset to primary
      if (!selectedRole || !roles.includes(selectedRole)) {
        setSelectedRole(primaryRole);
      }
    } else {
      setSelectedRole(null);
    }
  }, [isAuthenticated, primaryRole, roles, selectedRole]);

  // Strictly bound to user's assigned roles: user CANNOT assume an ungranted role
  const activeRole: RoleType =
    selectedRole && roles.includes(selectedRole) ? selectedRole : primaryRole || 'EMPLOYEE';

  const setRole = (newRole: RoleType) => {
    // Only allow switching to a role that the authenticated user actually possesses
    if (roles.includes(newRole)) {
      setSelectedRole(newRole);
    } else {
      console.warn(`[RoleSecurity] Rejected unauthorized role elevation attempt to ${newRole}`);
    }
  };

  const currentUser: RoleUser = useMemo(() => {
    if (user && isAuthenticated) {
      return {
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
        email: user.email,
        role: activeRole,
        title: user.employeeCode ? `Emp ID: ${user.employeeCode}` : 'Team Member',
      };
    }
    return {
      name: 'Unauthenticated User',
      email: '',
      role: 'EMPLOYEE',
      title: 'Guest',
    };
  }, [user, isAuthenticated, activeRole]);

  return (
    <RoleContext.Provider
      value={{
        role: activeRole,
        setRole,
        currentUser,
        availableRoles: roles,
      }}
    >
      {children}
    </RoleContext.Provider>
  );
};

export const useRole = () => {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return context;
};
