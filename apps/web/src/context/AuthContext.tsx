'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { AuthUser, LoginCredentials, RoleType } from '@hrms/types';
import { authApi, setOnAuthFailure, setAccessToken } from '../lib/api-client';

export interface AuthContextType {
  user: AuthUser | null;
  roles: RoleType[];
  permissions: string[];
  primaryRole: RoleType;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (credentials: LoginCredentials) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
  hasRole: (required: RoleType | RoleType[]) => boolean;
  hasPermission: (required: string | string[]) => boolean;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const roles = useMemo<RoleType[]>(() => {
    return user?.roles || [];
  }, [user]);

  const permissions = useMemo<string[]>(() => {
    return user?.permissions || [];
  }, [user]);

  const primaryRole = useMemo<RoleType>(() => {
    if (roles.length > 0) {
      if (roles.includes('ADMIN')) return 'ADMIN';
      if (roles.includes('HR')) return 'HR';
      if (roles.includes('MANAGER')) return 'MANAGER';
      return roles[0];
    }
    return 'EMPLOYEE';
  }, [roles]);

  const isAuthenticated = Boolean(user && user.id);

  const hasRole = useCallback(
    (required: RoleType | RoleType[]): boolean => {
      if (!user) return false;
      if (user.roles.includes('ADMIN')) return true;
      const targetRoles = Array.isArray(required) ? required : [required];
      return targetRoles.some((r) => user.roles.includes(r));
    },
    [user],
  );

  const hasPermission = useCallback(
    (required: string | string[]): boolean => {
      if (!user) return false;
      if (user.roles.includes('ADMIN')) return true;
      const targetPermissions = Array.isArray(required) ? required : [required];
      return targetPermissions.some((p) => user.permissions.includes(p));
    },
    [user],
  );

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await authApi.logout();
    } finally {
      setUser(null);
      setAccessToken(null);
      setIsLoading(false);
      router.push('/login');
    }
  }, [router]);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    try {
      const data = await authApi.refresh();
      if (data?.user) {
        setUser(data.user);
        setError(null);
        return true;
      }
      setUser(null);
      return false;
    } catch {
      setUser(null);
      return false;
    }
  }, []);

  const login = useCallback(async (credentials: LoginCredentials): Promise<AuthUser> => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await authApi.login(credentials);
      setUser(result.user);
      return result.user;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid credentials';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initialize session on mount via HttpOnly refresh cookie
  useEffect(() => {
    setOnAuthFailure(() => {
      setUser(null);
      setAccessToken(null);
      router.push('/login');
    });

    let isMounted = true;

    async function initializeAuth() {
      setIsLoading(true);
      try {
        const data = await authApi.refresh();
        if (isMounted && data?.user) {
          setUser(data.user);
        }
      } catch {
        if (isMounted) {
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    initializeAuth();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      roles,
      permissions,
      primaryRole,
      isAuthenticated,
      isLoading,
      error,
      login,
      logout,
      refreshSession,
      hasRole,
      hasPermission,
      clearError,
    }),
    [
      user,
      roles,
      permissions,
      primaryRole,
      isAuthenticated,
      isLoading,
      error,
      login,
      logout,
      refreshSession,
      hasRole,
      hasPermission,
      clearError,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
