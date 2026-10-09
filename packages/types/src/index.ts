/**
 * @hrms/types
 * Core domain types and API contracts for HRMS
 */

// 1. Roles & Permissions (Minimal user-facing roles as per Phase 1 Requirement 26)
export type RoleType = 'ADMIN' | 'HR' | 'MANAGER' | 'EMPLOYEE';

export const USER_ROLES: RoleType[] = ['ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'];

// 1b. Data Access Scopes (Phase 2 Step 6)
export type AccessScope = 'GLOBAL' | 'ORGANIZATION' | 'TEAM' | 'SELF';

export const ACCESS_SCOPES: AccessScope[] = ['GLOBAL', 'ORGANIZATION', 'TEAM', 'SELF'];

export interface ResourceTarget {
  id?: string;
  userId?: string;
  organizationId?: string;
  departmentId?: string | null;
  branchId?: string | null;
  managerId?: string | null;
  [key: string]: unknown;
}

export interface PermissionDefinition {
  id: string;
  name: string;
  code: string; // e.g., 'employees:read', 'leave:approve'
  module: string; // 'attendance', 'leave', 'organization', etc.
  description?: string;
}

// 2. Attendance Modes & Statuses
export type AttendanceMode = 'OFFICE' | 'OFFICIAL_VISIT' | 'WFH' | 'WORK_FROM_HOME';

export type AttendanceStatus =
  | 'PRESENT'
  | 'ABSENT'
  | 'HALF_DAY'
  | 'LATE'
  | 'ON_LEAVE'
  | 'HOLIDAY'
  | 'WEEK_OFF'
  | 'WEEKEND_OFF'
  | 'INCOMPLETE'
  | 'PENDING_REVIEW'
  | 'NOT_SCHEDULED'
  | 'PENDING';

// 3. User & Auth Profile
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'LOCKED';

export interface AuthUser {
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

export interface LoginCredentials {
  email: string;
  password: string;
}

export type UserProfile = AuthUser;

export interface SessionInfo {
  id: string;
  userId: string;
  expiresAt: string;
  revokedAt?: string | null;
  lastUsedAt: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceName?: string | null;
  createdAt: string;
}

export interface PasswordResetTokenInfo {
  id: string;
  userId: string;
  expiresAt: string;
  usedAt?: string | null;
  createdAt: string;
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
  requiredPermission?: string; // RESOURCE_ACTION e.g. 'EMPLOYEE_VIEW', 'REPORT_VIEW'
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

// -----------------------------------------------------------------------------
// 8. Phase 3: Organization & Hierarchy Entities
// -----------------------------------------------------------------------------

export interface OrganizationEntity {
  id: string;
  code: string;
  name: string;
  legalName?: string | null;
  logo?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  timezone: string;
  currency: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BranchEntity {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  country: string;
  postalCode?: string | null;
  timezone: string;
  latitude?: number | null;
  longitude?: number | null;
  geofenceRadiusMeters?: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  employeeCount?: number;
}

export interface DepartmentEntity {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  description?: string | null;
  parentDepartmentId?: string | null;
  departmentHeadId?: string | null;
  departmentHead?: {
    id: string;
    displayName: string;
    employeeCode: string;
  } | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  employeeCount?: number;
}

export interface DesignationEntity {
  id: string;
  organizationId: string;
  departmentId?: string | null;
  title: string;
  name?: string | null;
  code: string;
  description?: string | null;
  level?: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  employeeCount?: number;
}

// -----------------------------------------------------------------------------
// 9. Phase 3: Normalized Employee Models & Lifecycle
// -----------------------------------------------------------------------------

export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERN' | 'CONSULTANT';

export const EMPLOYMENT_TYPES: EmploymentType[] = [
  'FULL_TIME',
  'PART_TIME',
  'CONTRACT',
  'INTERN',
  'CONSULTANT',
];

export type EmploymentStatus =
  'PROBATION' | 'ACTIVE' | 'ON_NOTICE' | 'RESIGNED' | 'TERMINATED' | 'EXITED';

export const EMPLOYMENT_STATUSES: EmploymentStatus[] = [
  'PROBATION',
  'ACTIVE',
  'ON_NOTICE',
  'RESIGNED',
  'TERMINATED',
  'EXITED',
];

export type WorkMode = 'OFFICE' | 'HYBRID' | 'REMOTE';

export const WORK_MODES: WorkMode[] = ['OFFICE', 'HYBRID', 'REMOTE'];

export type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY';

export type EmployeeHistoryEventType =
  | 'JOINED'
  | 'DEPARTMENT_CHANGED'
  | 'DESIGNATION_CHANGED'
  | 'MANAGER_CHANGED'
  | 'BRANCH_CHANGED'
  | 'PROMOTED'
  | 'TRANSFERRED'
  | 'STATUS_CHANGED'
  | 'WORK_MODE_CHANGED'
  | 'EXITED';

export interface EmployeeListItem {
  id: string;
  userId?: string | null;
  employeeCode: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  displayName: string;
  profilePhoto?: string | null;
  status: EmploymentStatus;
  joiningDate: string;
  workEmail?: string | null;
  phone?: string | null;
  branchName?: string | null;
  branchId?: string | null;
  departmentName?: string | null;
  departmentId?: string | null;
  designationTitle?: string | null;
  designationId?: string | null;
  managerName?: string | null;
  managerId?: string | null;
  employmentType?: EmploymentType | null;
  workMode?: WorkMode | null;
}

export interface EmployeeDetailResponse {
  id: string;
  userId?: string | null;
  organizationId: string;
  employeeCode: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  displayName: string;
  profilePhoto?: string | null;
  dateOfBirth?: string | null;
  gender?: Gender | null;
  status: EmploymentStatus;
  joiningDate: string;
  exitDate?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;

  employment?: {
    id: string;
    branchId: string;
    branch: BranchEntity;
    departmentId: string;
    department: DepartmentEntity;
    designationId: string;
    designation: DesignationEntity;
    managerId?: string | null;
    manager?: {
      id: string;
      displayName: string;
      employeeCode: string;
      profilePhoto?: string | null;
      designationTitle?: string | null;
    } | null;
    employmentType: EmploymentType;
    employmentStatus: EmploymentStatus;
    workMode: WorkMode;
    joiningDate: string;
    probationEndDate?: string | null;
    confirmationDate?: string | null;
    noticePeriodDays: number;
  } | null;

  contact?: {
    id: string;
    workEmail: string;
    personalEmail?: string | null;
    phone?: string | null;
    alternatePhone?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    country: string;
  } | null;

  emergencyContacts: Array<{
    id: string;
    name: string;
    relationship: string;
    phone: string;
    alternatePhone?: string | null;
    address?: string | null;
    isPrimary: boolean;
  }>;

  documents: Array<{
    id: string;
    documentType: string;
    documentName: string;
    documentNumber?: string | null;
    fileUrl?: string | null;
    mimeType?: string | null;
    fileSize?: number | null;
    issueDate?: string | null;
    expiryDate?: string | null;
    isVerified: boolean;
  }>;

  history: Array<{
    id: string;
    eventType: EmployeeHistoryEventType;
    previousValue?: string | null;
    newValue?: string | null;
    performedBy?: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    } | null;
    timestamp: string;
    metadata?: Record<string, unknown> | null;
  }>;
}

// -----------------------------------------------------------------------------
// 10. Org Chart Hierarchy Models
// -----------------------------------------------------------------------------

export interface OrgChartNode {
  id: string;
  employeeCode: string;
  name: string;
  designation: string;
  department: string;
  branch: string;
  avatarUrl?: string | null;
  status: EmploymentStatus;
  workMode: WorkMode;
  managerId?: string | null;
  directReportsCount: number;
  subordinates: OrgChartNode[];
}

// -----------------------------------------------------------------------------
// 11. Bulk Import & Export DTOs
// -----------------------------------------------------------------------------

export interface EmployeeImportRow {
  rowNumber: number;
  employeeCode: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  workEmail: string;
  phone?: string;
  departmentCode: string;
  designationCode: string;
  branchCode: string;
  managerEmployeeCode?: string;
  employmentType?: EmploymentType;
  employmentStatus?: EmploymentStatus;
  workMode?: WorkMode;
  joiningDate?: string;
}

export interface EmployeeImportRowError {
  row: number;
  field: string;
  value: unknown;
  message: string;
}

export interface EmployeeImportPreviewResult {
  totalRows: number;
  validRowsCount: number;
  errorRowsCount: number;
  errors: EmployeeImportRowError[];
  previewData: EmployeeImportRow[];
}

// -----------------------------------------------------------------------------
// 12. Phase 4: Attendance Engine Types & DTOs
// -----------------------------------------------------------------------------

export type AttendanceEventType = 'CHECK_IN' | 'CHECK_OUT' | 'BREAK_START' | 'BREAK_END';

export type GeofenceVerificationStatus =
  'VERIFIED' | 'OUTSIDE_GEOFENCE' | 'LOW_ACCURACY' | 'EXEMPT' | 'FAILED';

export type AttendanceDayStatus =
  | 'PRESENT'
  | 'HALF_DAY'
  | 'LATE'
  | 'ABSENT'
  | 'ON_LEAVE'
  | 'HOLIDAY'
  | 'WEEKEND_OFF'
  | 'WEEK_OFF'
  | 'INCOMPLETE'
  | 'PENDING_REVIEW'
  | 'NOT_SCHEDULED'
  | 'PENDING';

export type CorrectionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export type AttendanceExceptionType =
  | 'OUTSIDE_GEOFENCE'
  | 'LOW_GPS_ACCURACY'
  | 'MISSING_CHECKOUT'
  | 'OVERLAPPING_SESSION'
  | 'SUSPICIOUS_TIMING'
  | 'POLICY_VIOLATION';

export type SessionStatus = 'OPEN' | 'COMPLETED' | 'AUTO_CLOSED';

export interface AttendancePolicyDto {
  id: string;
  organizationId: string;
  branchId?: string | null;
  name: string;
  code: string;
  description?: string | null;
  isDefault: boolean;
  standardWorkMinutes: number;
  halfDayThresholdMinutes: number;
  fullDayThresholdMinutes: number;
  gracePeriodMinutes: number;
  maxCheckInDelayMinutes: number;
  maxDailyBreakMinutes: number;
  maxSingleBreakMinutes: number;
  allowMultipleSessions: boolean;
  overnightShiftAllowed: boolean;
  workingDayStartHour: number;
  timezone: string;
  geofenceEnforcement: boolean;
  maxGpsAccuracyMeters: number;
  version: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
  isActive: boolean;
}

export interface ShiftDto {
  id: string;
  organizationId: string;
  policyId?: string | null;
  policy?: AttendancePolicyDto | null;
  name: string;
  code: string;
  description?: string | null;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  isOvernight: boolean;
  workDays: number[];
  breakDurationMinutes: number;
  color?: string | null;
  isActive: boolean;
}

export interface ShiftAssignmentDto {
  id: string;
  organizationId: string;
  employeeId: string;
  shiftId: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  shift?: ShiftDto;
}

export interface AttendanceSessionDto {
  id: string;
  organizationId: string;
  employeeId: string;
  date: string;
  sessionNumber: number;
  checkInTime: string;
  checkOutTime?: string | null;
  totalWorkMinutes: number;
  totalBreakMinutes: number;
  status: SessionStatus;
}

export interface AttendanceEventDto {
  id: string;
  organizationId: string;
  employeeId: string;
  sessionId?: string | null;
  eventType: AttendanceEventType;
  eventTimestamp: string;
  attendanceMode: AttendanceMode;
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
  branchId?: string | null;
  distanceFromOfficeMeters?: number | null;
  geofenceStatus: GeofenceVerificationStatus;
  idempotencyKey: string;
  createdAt: string;
}

export interface AttendanceDailySummaryDto {
  id: string;
  organizationId: string;
  employeeId: string;
  date: string;
  firstCheckIn?: string | null;
  lastCheckOut?: string | null;
  totalWorkMinutes: number;
  totalBreakMinutes: number;
  lateMinutes: number;
  earlyExitMinutes: number;
  overtimeMinutes: number;
  status: AttendanceDayStatus;
  shiftId?: string | null;
  policyId?: string | null;
  isCorrected: boolean;
  correctionNotes?: string | null;
}

export interface AttendanceCorrectionRequestDto {
  id: string;
  organizationId: string;
  employeeId: string;
  targetDate: string;
  requestedCheckIn?: string | null;
  requestedCheckOut?: string | null;
  reason: string;
  status: CorrectionStatus;
  submittedAt: string;
  decision?: {
    reviewerName?: string;
    decision: CorrectionStatus;
    reviewNotes?: string;
    decidedAt: string;
  } | null;
}

export interface PunchRequestDto {
  eventType: AttendanceEventType;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  timestamp?: string; // Client timestamp for freshness skew check
  idempotencyKey: string;
  deviceInfo?: string;
}

export interface CheckInRequestDto {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  timestamp?: string | number;
  idempotencyKey: string;
  officeLocationId?: string;
  attendanceMode?: string;
  deviceInfo?: string;
}

export interface CheckOutRequestDto {
  idempotencyKey: string;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
  timestamp?: string | number;
  deviceInfo?: string;
}

export interface BreakRequestDto {
  idempotencyKey: string;
  reason?: string;
  deviceInfo?: string;
}

export interface TodayAttendanceStatusDto {
  date: string;
  workingDateUtc: string;
  employee: {
    id: string;
    employeeCode: string;
    displayName: string;
    branchId?: string | null;
  };
  currentStatus: {
    isCheckedIn: boolean;
    isOnBreak: boolean;
    canCheckIn: boolean;
    canCheckOut: boolean;
    canStartBreak: boolean;
    canEndBreak: boolean;
  };
  activeSession: AttendanceSessionDto | null;
  sessions: AttendanceSessionDto[];
  events: AttendanceEventDto[];
  summary: AttendanceDailySummaryDto | null;
  policy: AttendancePolicyDto;
  shift: ShiftDto | null;
  office: OfficeLocationDto | null;
}

export interface PunchResponseDto {
  success: boolean;
  message: string;
  event: AttendanceEventDto;
  session: AttendanceSessionDto;
  summary?: AttendanceDailySummaryDto | null;
}

export interface OfficeLocationDto {
  id: string;
  organizationId: string;
  branchId?: string | null;
  branch?: {
    id: string;
    name: string;
    code: string;
  } | null;
  name: string;
  code?: string | null;
  address?: string | null;
  latitude: number;
  longitude: number;
  geofenceRadiusMeters: number;
  timezone: string;
  isActive: boolean;
  effectiveFrom: string;
  effectiveTo?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOfficeLocationDto {
  branchId?: string;
  name: string;
  code?: string;
  address?: string;
  latitude: number;
  longitude: number;
  geofenceRadiusMeters?: number;
  timezone?: string;
  isActive?: boolean;
  effectiveFrom?: string;
  effectiveTo?: string;
}

export interface UpdateOfficeLocationDto {
  branchId?: string;
  name?: string;
  code?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  geofenceRadiusMeters?: number;
  timezone?: string;
  isActive?: boolean;
  effectiveFrom?: string;
  effectiveTo?: string;
}

export type LocationValidationOutcome =
  'VERIFIED' | 'OUTSIDE_GEOFENCE' | 'LOW_ACCURACY' | 'STALE_LOCATION' | 'LOCATION_UNAVAILABLE';

export interface ValidateLocationDto {
  officeLocationId?: string;
  branchId?: string;
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  timestamp?: string | number; // ISO string or epoch ms
}

export interface LocationValidationResultDto {
  outcome: LocationValidationOutcome;
  isWithinGeofence: boolean;
  distanceMeters: number | null;
  allowedRadiusMeters: number;
  accuracyMeters: number | null;
  timeSkewSeconds: number | null;
  office: {
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    geofenceRadiusMeters: number;
    timezone: string;
  } | null;
  message: string;
}

export interface CreateAttendancePolicyDto {
  branchId?: string | null;
  name: string;
  code: string;
  description?: string;
  isDefault?: boolean;
  standardWorkMinutes?: number;
  halfDayThresholdMinutes?: number;
  fullDayThresholdMinutes?: number;
  gracePeriodMinutes?: number;
  maxCheckInDelayMinutes?: number;
  maxDailyBreakMinutes?: number;
  maxSingleBreakMinutes?: number;
  allowMultipleSessions?: boolean;
  overnightShiftAllowed?: boolean;
  workingDayStartHour?: number;
  timezone?: string;
  geofenceEnforcement?: boolean;
  maxGpsAccuracyMeters?: number;
  effectiveFrom?: string;
  effectiveTo?: string;
  isActive?: boolean;
}

export interface UpdateAttendancePolicyDto {
  branchId?: string | null;
  name?: string;
  code?: string;
  description?: string;
  isDefault?: boolean;
  standardWorkMinutes?: number;
  halfDayThresholdMinutes?: number;
  fullDayThresholdMinutes?: number;
  gracePeriodMinutes?: number;
  maxCheckInDelayMinutes?: number;
  maxDailyBreakMinutes?: number;
  maxSingleBreakMinutes?: number;
  allowMultipleSessions?: boolean;
  overnightShiftAllowed?: boolean;
  workingDayStartHour?: number;
  timezone?: string;
  geofenceEnforcement?: boolean;
  maxGpsAccuracyMeters?: number;
  effectiveFrom?: string;
  effectiveTo?: string;
  isActive?: boolean;
}

export interface CreateShiftDto {
  policyId?: string;
  name: string;
  code: string;
  description?: string;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  isOvernight?: boolean;
  workDays?: number[];
  breakDurationMinutes?: number;
  color?: string;
  isActive?: boolean;
}

export interface UpdateShiftDto {
  policyId?: string;
  name?: string;
  code?: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  isOvernight?: boolean;
  workDays?: number[];
  breakDurationMinutes?: number;
  color?: string;
  isActive?: boolean;
}

export interface AssignShiftDto {
  employeeId: string;
  shiftId: string;
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface ResolvedPolicyAndShift {
  policy: AttendancePolicyDto;
  shift: ShiftDto | null;
  source: 'EMPLOYEE_ASSIGNMENT' | 'BRANCH_OVERRIDE' | 'ORGANIZATION_DEFAULT';
}

export interface PolicyEvaluationResultDto {
  workingDate: string;
  shiftStartLocal: string;
  shiftEndLocal: string;
  isOvernight: boolean;
  graceWindowEndLocal: string;
  lateArrivalMinutes: number;
  earlyDepartureMinutes: number;
  grossMinutes: number;
  breakDeductionMinutes: number;
  netWorkMinutes: number;
  overtimeMinutes: number;
  status: AttendanceDayStatus;
  isMissingCheckout: boolean;
  source: string;
}
