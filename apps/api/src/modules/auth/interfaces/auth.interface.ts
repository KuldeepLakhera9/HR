import { RoleType, UserStatus } from '@hrms/types';

export interface JwtPayload {
  sub: string;
  email: string;
  orgId: string;
  roles: RoleType[];
  sessionId: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  organizationId: string;
  branchId?: string | null;
  departmentId?: string | null;
  firstName: string;
  lastName: string;
  employeeCode: string;
  status: UserStatus;
  roles: RoleType[];
  permissions: string[];
  sessionId: string;
}

export interface SafeUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  organizationId: string;
  branchId?: string | null;
  departmentId?: string | null;
  status: UserStatus;
  roles: RoleType[];
  permissions: string[];
}

export interface LoginResult {
  accessToken: string;
  rawRefreshToken: string;
  user: SafeUser;
}

export interface RefreshResult {
  accessToken: string;
  rawRefreshToken: string;
  user: SafeUser;
}
