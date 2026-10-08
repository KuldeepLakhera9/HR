'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { RoleType } from '@hrms/types';
import { useAuth } from './AuthContext';

interface RoleUser {
  name: string;
  email: string;
  role: RoleType;
  title: string;
}

const ROLE_PRESETS: Record<RoleType, RoleUser> = {
  ADMIN: {
    name: 'Vikram Aditya',
    email: 'admin@peopleos.local',
    role: 'ADMIN',
    title: 'Super Administrator',
  },
  HR: {
    name: 'Ananya Sharma',
    email: 'hr@peopleos.local',
    role: 'HR',
    title: 'Head of People Operations',
  },
  MANAGER: {
    name: 'Rajesh Kumar',
    email: 'manager@peopleos.local',
    role: 'MANAGER',
    title: 'Engineering Director',
  },
  EMPLOYEE: {
    name: 'Priya Nair',
    email: 'employee@peopleos.local',
    role: 'EMPLOYEE',
    title: 'Senior Frontend Engineer',
  },
};

interface RoleContextType {
  role: RoleType;
  setRole: (role: RoleType) => void;
  currentUser: RoleUser;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export const RoleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, primaryRole, isAuthenticated } = useAuth();
  const [roleOverride, setRoleOverride] = useState<RoleType | null>(null);

  // Sync role with authenticated user's primary role upon login
  useEffect(() => {
    if (isAuthenticated && primaryRole) {
      setRoleOverride(primaryRole);
    }
  }, [isAuthenticated, primaryRole]);

  // Load preview role from localStorage if in preview mode
  useEffect(() => {
    if (!isAuthenticated) {
      const saved = localStorage.getItem('hrms_preview_role') as RoleType;
      if (saved && ['ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'].includes(saved)) {
        setRoleOverride(saved);
      }
    }
  }, [isAuthenticated]);

  const activeRole: RoleType = roleOverride || primaryRole || 'ADMIN';

  const setRole = (newRole: RoleType) => {
    setRoleOverride(newRole);
    if (typeof window !== 'undefined') {
      localStorage.setItem('hrms_preview_role', newRole);
    }
  };

  const currentUser: RoleUser = React.useMemo(() => {
    if (user && isAuthenticated) {
      return {
        name: `${user.firstName} ${user.lastName}`.trim(),
        email: user.email,
        role: activeRole,
        title: user.employeeCode ? `Emp ID: ${user.employeeCode}` : 'Team Member',
      };
    }
    return ROLE_PRESETS[activeRole] || ROLE_PRESETS.ADMIN;
  }, [user, isAuthenticated, activeRole]);

  return (
    <RoleContext.Provider
      value={{
        role: activeRole,
        setRole,
        currentUser,
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
