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
  const { user, primaryRole, isAuthenticated } = useAuth();

  // The active role is strictly locked to the authenticated user's assigned role throughout the session.
  // Role switching during an active session is completely disabled.
  const activeRole: RoleType = primaryRole || 'EMPLOYEE';

  const setRole = (newRole: RoleType) => {
    console.warn(
      `[RoleSecurity] Role switching during an active session is disabled. Session remains locked to ${activeRole}.`,
    );
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
        availableRoles: [activeRole],
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
