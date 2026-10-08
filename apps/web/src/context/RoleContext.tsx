'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { RoleType } from '@hrms/types';

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
  const [role, setRoleState] = useState<RoleType>('ADMIN');

  useEffect(() => {
    const saved = localStorage.getItem('hrms_preview_role') as RoleType;
    if (saved && ['ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'].includes(saved)) {
      setRoleState(saved);
    }
  }, []);

  const setRole = (newRole: RoleType) => {
    setRoleState(newRole);
    if (typeof window !== 'undefined') {
      localStorage.setItem('hrms_preview_role', newRole);
    }
  };

  return (
    <RoleContext.Provider
      value={{
        role,
        setRole,
        currentUser: ROLE_PRESETS[role],
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
