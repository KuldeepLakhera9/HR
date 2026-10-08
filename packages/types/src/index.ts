/**
 * @hrms/types
 * Core domain types and API contracts for HRMS
 */

// 1. Roles & Permissions (Minimal user-facing roles as per Phase 1 Requirement 26)
export type RoleType = 'ADMIN' | 'HR' | 'MANAGER' | 'EMPLOYEE';

export const USER_ROLES: RoleType[] = ['ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'];

export interface PermissionDefinition {
  id: string;
  name: string;
  code: string; // e.g., 'employees:read', 'leave:approve'
  module: string; // 'attendance', 'leave', 'organization', etc.
  description?: string;
}

// 2. Attendance Modes (Requirement 25)
export type AttendanceMode = 'OFFICE' | 'OFFICIAL_VISIT' | 'WORK_FROM_HOME';

export type AttendanceStatus =
  'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'ON_LEAVE' | 'HOLIDAY' | 'WEEK_OFF';

// 3. User & Auth Profile
export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  role: RoleType;
  organizationId: string;
  organizationName?: string;
  departmentId?: string | null;
  departmentName?: string | null;
  designationId?: string | null;
  designationTitle?: string | null;
  isActive: boolean;
}

// 4. API Standard Envelope (Requirement 5)
export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
    [key: string]: unknown;
  };
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  statusCode: number;
  errors?: unknown;
  timestamp: string;
  path: string;
}

// 5. System Health Status (Requirement 22)
export interface SystemHealth {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  version: string;
  uptime: number;
  environment: string;
  services: {
    database: {
      status: 'connected' | 'disconnected' | 'unknown';
      latencyMs?: number;
      message?: string;
    };
    api: {
      status: 'healthy';
    };
  };
}

// 6. Navigation Types (Requirement 10)
export interface NavigationItem {
  id: string;
  label: string;
  href: string;
  icon: string; // icon identifier
  badge?: string | number;
  allowedRoles: RoleType[];
  children?: NavigationItem[];
}

// 7. Dashboard Metrics Types (Requirements 11-14)
export interface AdminDashboardData {
  stats: {
    totalEmployees: number;
    presentToday: number;
    onLeaveToday: number;
    absentToday: number;
  };
  organizationOverview: {
    branchesCount: number;
    departmentsCount: number;
    averageAttendanceRate: number;
    activeWorkflows: number;
  };
  attendanceTrend: Array<{
    date: string;
    present: number;
    absent: number;
    leave: number;
  }>;
  departmentDistribution: Array<{
    name: string;
    employeeCount: number;
    attendanceRate: number;
  }>;
  recentActivity: Array<{
    id: string;
    actorName: string;
    action: string;
    target: string;
    timestamp: string;
    type: 'auth' | 'org' | 'attendance' | 'system';
  }>;
}

export interface HRDashboardData {
  stats: {
    totalEmployees: number;
    activeEmployees: number;
    newJoiners: number;
    exitedEmployees: number;
    presentToday: number;
    absentToday: number;
    onLeaveToday: number;
    officialVisitsToday: number;
  };
  attendanceTrend: Array<{
    date: string;
    present: number;
    wfh: number;
    officialVisit: number;
    leave: number;
  }>;
  employeeProgress: Array<{
    category: string;
    completed: number;
    inProgress: number;
    target: number;
  }>;
  pendingActions: Array<{
    id: string;
    title: string;
    type: 'leave' | 'visit' | 'document' | 'onboarding';
    employeeName: string;
    requestedAt: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  departmentOverview: Array<{
    department: string;
    headCount: number;
    onLeave: number;
    attendancePercentage: number;
  }>;
}

export interface ManagerDashboardData {
  stats: {
    teamSize: number;
    presentToday: number;
    absentToday: number;
    onLeaveToday: number;
    pendingApprovals: number;
  };
  teamAttendance: Array<{
    employeeId: string;
    name: string;
    designation: string;
    status: AttendanceStatus;
    mode: AttendanceMode;
    checkInTime?: string;
  }>;
  teamActivity: Array<{
    id: string;
    employeeName: string;
    activity: string;
    time: string;
  }>;
  teamProgress: Array<{
    projectName: string;
    completionRate: number;
    status: 'on_track' | 'at_risk' | 'delayed';
  }>;
  upcomingEvents: Array<{
    id: string;
    title: string;
    date: string;
    type: 'leave' | 'visit' | 'review';
    participant: string;
  }>;
}

export interface EmployeeDashboardData {
  todayAttendance: {
    status: AttendanceStatus;
    checkInTime: string | null;
    checkOutTime: string | null;
    durationMinutes: number;
    workingStatus: 'Working' | 'Completed' | 'Not Checked In' | 'On Leave';
    mode: AttendanceMode;
  };
  leaveBalances: Array<{
    type: string;
    available: number;
    total: number;
    used: number;
  }>;
  upcomingLeaves: Array<{
    id: string;
    startDate: string;
    endDate: string;
    leaveType: string;
    status: 'APPROVED' | 'PENDING' | 'REJECTED';
  }>;
  officialVisits: Array<{
    id: string;
    destination: string;
    date: string;
    purpose: string;
    status: 'APPROVED' | 'PENDING' | 'PLANNED';
  }>;
  notifications: Array<{
    id: string;
    title: string;
    message: string;
    createdAt: string;
    isRead: boolean;
  }>;
}
