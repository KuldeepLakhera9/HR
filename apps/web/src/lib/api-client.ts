import {
  AuthUser,
  LoginCredentials,
  ApiResponse,
  DailyAttendanceReportFilterDto,
  DailyAttendanceReportResponse,
  MonthlyAttendanceReportFilterDto,
  MonthlyAttendanceReportResponse,
  EmployeeDashboardResponse,
  UnifiedRequestsQuery,
  UnifiedRequestsResponse,
  EmployeeDocumentItem,
  EmployeeDocumentStats,
  AnnouncementItem,
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
  UserSessionItem,
  PerformanceGoalDto,
  CreateGoalDto,
  UpdateGoalDto,
  CreateGoalProgressUpdateDto,
  GoalProgressUpdateDto,
  ApproveGoalDto,
  PerformanceGoalStats,
  ReviewCycleDto,
  ReviewCycleParticipantDto,
  CreateReviewCycleDto,
  UpdateReviewCycleDto,
  TransitionCycleStageDto,
  ReopenCycleDto,
  ReassignManagerDto,
  ExemptParticipantDto,
  EligibilityPreviewDto,
  PerformanceReviewDto,
  SaveSelfAssessmentDraftDto,
  SubmitSelfAssessmentDto,
  ReopenSelfAssessmentDto,
  EmployeeActiveReviewContextDto,
  SelfAssessmentAttachment,
  ManagerReviewInboxItemDto,
  ManagerReviewDetailDto,
  SaveManagerReviewDraftDto,
  SubmitManagerReviewDto,
  ReturnReviewForCorrectionDto,
  FinalizeReviewDto,
  DevelopmentPlanDto,
  CreateDevelopmentPlanDto,
  UpdateDevelopmentPlanDto,
  PerformanceFeedbackDto,
  CreatePerformanceFeedbackDto,
  DevelopmentPlansOverviewDto,
  RecalculateReviewScoreDto,
  CalculationBreakdownDto,
  RecalculateReviewResultDto,
  EmployeePerformanceDashboardDto,
  ManagerPerformanceDashboardDto,
  HrAdminPerformanceDashboardDto,
  HrPerformanceReportQueryDto,
  TriggerPerformanceRemindersDto,
  TriggerRemindersResultDto,
  ExecutiveDashboardSummaryDto,
  PerformanceAnalyticsOverviewDto,
  GoalProgressAnalyticsDto,
  DevelopmentPlanAnalyticsDto,
  MisReportCatalogItemDto,
  SavedReportDefinitionDto,
  CreateSavedReportDto,
  ExecuteSavedReportResultDto,
} from '@hrms/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

// In-memory access token store — NEVER persisted to localStorage/sessionStorage
let inMemoryAccessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;
let authFailureCallback: (() => void) | null = null;

export const setAccessToken = (token: string | null): void => {
  inMemoryAccessToken = token;
};

export const getAccessToken = (): string | null => {
  return inMemoryAccessToken;
};

export const setOnAuthFailure = (callback: () => void): void => {
  authFailureCallback = callback;
};

export interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
}

/**
 * Core authenticated fetch client with transparent refresh token rotation
 */
export async function fetchWithAuth<T = unknown>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
  const headers = new Headers(options.headers);

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // Inject in-memory access token if present
  if (!options.skipAuth && inMemoryAccessToken) {
    headers.set('Authorization', `Bearer ${inMemoryAccessToken}`);
  }

  const fetchOptions: RequestInit = {
    ...options,
    headers,
    credentials: 'include', // Ensures HttpOnly refresh cookie is sent and received
  };

  let response: Response;
  try {
    response = await fetch(url, fetchOptions);
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Network connection failure: ${error.message}`
        : 'Network connection failure',
    );
  }

  // Handle 401 Unauthorized by executing transparent token refresh
  if (
    response.status === 401 &&
    !options.skipAuth &&
    endpoint !== '/auth/login' &&
    endpoint !== '/auth/refresh'
  ) {
    try {
      const newAccessToken = await handleTokenRefresh();
      if (newAccessToken) {
        // Retry original request with newly acquired access token
        headers.set('Authorization', `Bearer ${newAccessToken}`);
        const retryResponse = await fetch(url, {
          ...fetchOptions,
          headers,
        });

        if (!retryResponse.ok) {
          const errData = await retryResponse.json().catch(() => ({}));
          throw new Error(errData.message || `Request failed with status ${retryResponse.status}`);
        }

        return await retryResponse.json();
      }
    } catch {
      // Refresh failed — notify listener to clear auth state and redirect
      if (authFailureCallback) {
        authFailureCallback();
      }
      throw new Error('Session expired. Please log in again.');
    }
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMessage = data.message || `Request failed with status ${response.status}`;
    throw new Error(errorMessage);
  }

  return data as ApiResponse<T>;
}

/**
 * Singleton refresh token handler preventing concurrent refresh requests
 */
async function handleTokenRefresh(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        setAccessToken(null);
        return null;
      }

      const result = await response.json();
      const token = result?.data?.accessToken || null;
      setAccessToken(token);
      return token;
    } catch {
      setAccessToken(null);
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Authentication REST API contracts
 */
export const authApi = {
  /**
   * Log in user using email and password
   */
  async login(credentials: LoginCredentials): Promise<{ accessToken: string; user: AuthUser }> {
    const response = await fetchWithAuth<{ accessToken: string; user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
      skipAuth: true,
    });

    if (response?.data?.accessToken) {
      setAccessToken(response.data.accessToken);
    }

    return response.data;
  },

  /**
   * Refresh session using HttpOnly cookie
   */
  async refresh(): Promise<{ accessToken: string; user: AuthUser } | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        setAccessToken(null);
        return null;
      }

      const result = await response.json();
      if (result?.data?.accessToken) {
        setAccessToken(result.data.accessToken);
        return result.data;
      }
      return null;
    } catch {
      setAccessToken(null);
      return null;
    }
  },

  /**
   * Revoke active session on server and clear refresh cookie
   */
  async logout(): Promise<void> {
    try {
      await fetchWithAuth('/auth/logout', {
        method: 'POST',
      });
    } catch {
      // Ignore network errors during logout
    } finally {
      setAccessToken(null);
    }
  },

  /**
   * Fetch current authenticated user profile
   */
  async getMe(): Promise<AuthUser> {
    const response = await fetchWithAuth<AuthUser>('/auth/me', {
      method: 'GET',
    });
    return response.data;
  },

  /**
   * Request password reset instructions
   */
  async forgotPassword(email: string): Promise<{ message: string }> {
    const response = await fetchWithAuth<null>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
      skipAuth: true,
    });
    return { message: response.message };
  },

  /**
   * Reset user password with cryptographically secure token
   */
  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const response = await fetchWithAuth<null>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
      skipAuth: true,
    });
    return { message: response.message };
  },

  /**
   * Change user account password and terminate other active sessions (Phase 8 Step 6)
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
    const response = await fetchWithAuth<null>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    return { message: response.message };
  },

  /**
   * Retrieve active login sessions for current user (Phase 8 Step 6)
   */
  async getSessions(): Promise<UserSessionItem[]> {
    const response = await fetchWithAuth<UserSessionItem[]>('/auth/sessions', {
      method: 'GET',
    });
    return response.data || [];
  },

  /**
   * Revoke a specific active session by ID
   */
  async revokeSession(sessionId: string): Promise<{ success: boolean; isCurrentSession: boolean }> {
    const response = await fetchWithAuth<{ success: boolean; isCurrentSession: boolean }>(
      `/auth/sessions/${sessionId}`,
      {
        method: 'DELETE',
      },
    );
    return response.data;
  },

  /**
   * Terminate all other active login sessions except current session
   */
  async revokeOtherSessions(): Promise<{ revokedCount: number }> {
    const response = await fetchWithAuth<{ revokedCount: number }>('/auth/sessions', {
      method: 'DELETE',
    });
    return response.data;
  },
};

/**
 * Organization REST API contracts (Phase 3)
 */
export const organizationApi = {
  async getOverview() {
    const res = await fetchWithAuth<any>('/organizations/overview');
    return res.data;
  },

  async getCurrent() {
    const res = await fetchWithAuth<any>('/organizations/current');
    return res.data;
  },

  async updateCurrent(data: any) {
    const res = await fetchWithAuth<any>('/organizations/current', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async getBranches(params?: {
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: string;
  }) {
    const cleanParams: Record<string, string> = {};
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          cleanParams[k] = String(v);
        }
      });
    }
    const query = new URLSearchParams(cleanParams).toString();
    const res = await fetchWithAuth<any[]>(`/branches${query ? `?${query}` : ''}`);
    const items = res.data || [];
    (items as any).meta = res.meta;
    return items;
  },

  async createBranch(data: any) {
    const res = await fetchWithAuth<any>('/branches', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async updateBranch(id: string, data: any) {
    const res = await fetchWithAuth<any>(`/branches/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async activateBranch(id: string) {
    const res = await fetchWithAuth<any>(`/branches/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: true }),
    });
    return res.data;
  },

  async deactivateBranch(id: string, reason?: string) {
    const res = await fetchWithAuth<any>(`/branches/${id}/deactivate`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    });
    return res.data;
  },

  async getDepartments(params?: {
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: string;
  }) {
    const cleanParams: Record<string, string> = {};
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          cleanParams[k] = String(v);
        }
      });
    }
    const query = new URLSearchParams(cleanParams).toString();
    const res = await fetchWithAuth<any[]>(`/departments${query ? `?${query}` : ''}`);
    const items = res.data || [];
    (items as any).meta = res.meta;
    return items;
  },

  async createDepartment(data: any) {
    const res = await fetchWithAuth<any>('/departments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async updateDepartment(id: string, data: any) {
    const res = await fetchWithAuth<any>(`/departments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async activateDepartment(id: string) {
    const res = await fetchWithAuth<any>(`/departments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: true }),
    });
    return res.data;
  },

  async deactivateDepartment(id: string, reason?: string) {
    const res = await fetchWithAuth<any>(`/departments/${id}/deactivate`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    });
    return res.data;
  },

  async getDesignations(params?: {
    departmentId?: string;
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: string;
  }) {
    const cleanParams: Record<string, string> = {};
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          cleanParams[k] = String(v);
        }
      });
    }
    const query = new URLSearchParams(cleanParams).toString();
    const res = await fetchWithAuth<any[]>(`/designations${query ? `?${query}` : ''}`);
    const items = res.data || [];
    (items as any).meta = res.meta;
    return items;
  },

  async createDesignation(data: any) {
    const res = await fetchWithAuth<any>('/designations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async updateDesignation(id: string, data: any) {
    const res = await fetchWithAuth<any>(`/designations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async activateDesignation(id: string) {
    const res = await fetchWithAuth<any>(`/designations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: true }),
    });
    return res.data;
  },

  async deactivateDesignation(id: string, reason?: string) {
    const res = await fetchWithAuth<any>(`/designations/${id}/deactivate`, {
      method: 'PATCH',
      body: JSON.stringify({ reason }),
    });
    return res.data;
  },
};

/**
 * Employees REST API contracts (Phase 3)
 */
export const employeesApi = {
  async findAll(query?: Record<string, any>) {
    const params = new URLSearchParams();
    if (query) {
      Object.entries(query).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          params.append(k, String(v));
        }
      });
    }
    const qStr = params.toString();
    const res = await fetchWithAuth<any[]>(`/employees${qStr ? `?${qStr}` : ''}`);
    return { items: res.data, meta: res.meta };
  },

  async getMe() {
    const res = await fetchWithAuth<any>('/employees/me');
    return res.data;
  },

  async getMyDashboard() {
    const res = await fetchWithAuth<EmployeeDashboardResponse>('/employees/me/dashboard');
    return res.data;
  },

  async findOne(id: string) {
    const res = await fetchWithAuth<any>(`/employees/${id}`);
    return res.data;
  },

  async create(data: any) {
    const res = await fetchWithAuth<any>('/employees', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async update(id: string, data: any) {
    const res = await fetchWithAuth<any>(`/employees/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async transitionStatus(
    id: string,
    data: { status: string; reason?: string; effectiveDate?: string },
  ) {
    const res = await fetchWithAuth<any>(`/employees/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async deactivate(id: string) {
    const res = await fetchWithAuth<any>(`/employees/${id}`, {
      method: 'DELETE',
    });
    return res.data;
  },

  async getHistory(id: string) {
    const res = await fetchWithAuth<any[]>(`/employees/${id}/history`);
    return res.data;
  },

  async getManager(id: string) {
    const res = await fetchWithAuth<any>(`/employees/${id}/manager`);
    return res.data;
  },

  async getDirectReports(id: string) {
    const res = await fetchWithAuth<any[]>(`/employees/${id}/direct-reports`);
    return res.data;
  },

  async getTeam(id: string, maxDepth?: number) {
    const query = maxDepth ? `?maxDepth=${maxDepth}` : '';
    const res = await fetchWithAuth<any>(`/employees/${id}/team${query}`);
    return res.data;
  },

  async getOrgChart(params?: {
    departmentId?: string;
    branchId?: string;
    rootEmployeeId?: string;
  }) {
    const cleanParams: Record<string, string> = {};
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          cleanParams[k] = String(v);
        }
      });
    }
    const query = new URLSearchParams(cleanParams).toString();
    const res = await fetchWithAuth<any[]>(`/org-chart${query ? `?${query}` : ''}`);
    return res.data;
  },

  async previewImport(formData: FormData) {
    const res = await fetchWithAuth<any>('/employees/import/preview', {
      method: 'POST',
      body: formData,
    });
    return res.data;
  },

  async confirmImport(rows: any[]) {
    const res = await fetchWithAuth<any>('/employees/import/confirm', {
      method: 'POST',
      body: JSON.stringify({ rows }),
    });
    return res.data;
  },

  async export(format: 'csv' | 'xlsx' = 'csv', query?: Record<string, any>) {
    const params = new URLSearchParams({ format });
    if (query) {
      Object.entries(query).forEach(([k, v]) => {
        if (v) params.append(k, String(v));
      });
    }
    const token = getAccessToken();
    const response = await fetch(`${API_BASE_URL}/employees/export?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Export download failed');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `employees_export_${new Date().toISOString().split('T')[0]}.${format}`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  async createProfileChangeRequest(data: {
    personalEmail?: string;
    phone?: string;
    alternatePhone?: string;
    address?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    emergencyContacts?: Array<{
      name: string;
      relationship: string;
      phone: string;
      alternatePhone?: string;
      address?: string;
      isPrimary?: boolean;
    }>;
    reason?: string;
  }) {
    const res = await fetchWithAuth<any>('/employees/me/profile-change-request', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async getMyProfileChangeRequests() {
    const res = await fetchWithAuth<any[]>('/employees/me/profile-change-requests');
    return res.data;
  },

  async cancelProfileChangeRequest(id: string) {
    const res = await fetchWithAuth<any>(`/employees/me/profile-change-requests/${id}/cancel`, {
      method: 'POST',
    });
    return res.data;
  },

  async getProfileChangeRequests(params?: { status?: string; page?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.status && params.status !== 'ALL') query.set('status', params.status);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetchWithAuth<any[]>(`/employees/profile-change-requests${qs}`);
    return { items: res.data, meta: res.meta };
  },

  async reviewProfileChangeRequest(
    id: string,
    data: { decision: 'APPROVED' | 'REJECTED'; reviewNotes?: string },
  ) {
    const res = await fetchWithAuth<any>(`/employees/profile-change-requests/${id}/review`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async getMyRequests(params?: UnifiedRequestsQuery): Promise<UnifiedRequestsResponse> {
    const query = new URLSearchParams();
    if (params?.type && params.type !== 'ALL') query.set('type', params.type);
    if (params?.status && params.status !== 'ALL') query.set('status', params.status);
    if (params?.search) query.set('search', params.search);
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetchWithAuth<UnifiedRequestsResponse>(`/employees/me/requests${qs}`);
    return res.data;
  },
};

export const officeLocationsApi = {
  async getAll(params?: {
    branchId?: string;
    search?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  }) {
    const query = new URLSearchParams();
    if (params?.branchId) query.append('branchId', params.branchId);
    if (params?.search) query.append('search', params.search);
    if (params?.isActive !== undefined) query.append('isActive', String(params.isActive));
    if (params?.page) query.append('page', String(params.page));
    if (params?.limit) query.append('limit', String(params.limit));
    const qs = query.toString();
    const res = await fetchWithAuth<any>(`/attendance/locations${qs ? `?${qs}` : ''}`);
    return res;
  },

  async getById(id: string) {
    const res = await fetchWithAuth<any>(`/attendance/locations/${id}`);
    return res.data;
  },

  async create(data: any) {
    const res = await fetchWithAuth<any>('/attendance/locations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async update(id: string, data: any) {
    const res = await fetchWithAuth<any>(`/attendance/locations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async delete(id: string) {
    const res = await fetchWithAuth<any>(`/attendance/locations/${id}`, {
      method: 'DELETE',
    });
    return res;
  },

  async validateLocation(data: {
    officeLocationId?: string;
    branchId?: string;
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
    timestamp?: string | number;
  }) {
    const res = await fetchWithAuth<any>('/attendance/locations/validate', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },
};

export const visitsApi = {
  async getMyVisits(params?: { status?: string; search?: string; page?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.search) query.set('search', params.search);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetchWithAuth<any>(`/visits/my${qs}`);
    return res;
  },

  async getVisitById(id: string) {
    const res = await fetchWithAuth<any>(`/visits/${id}`);
    return res.data;
  },

  async createVisit(payload: {
    title: string;
    purpose: string;
    startDate: string;
    endDate: string;
    status?: 'DRAFT' | 'SUBMITTED';
    destinations: Array<{
      destinationName: string;
      address?: string;
      city?: string;
      latitude?: number;
      longitude?: number;
      radiusMeters?: number;
      isGeofenceRequired?: boolean;
    }>;
  }) {
    const res = await fetchWithAuth<any>('/visits', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res;
  },

  async updateVisit(
    id: string,
    payload: {
      title?: string;
      purpose?: string;
      startDate?: string;
      endDate?: string;
      status?: 'DRAFT' | 'SUBMITTED';
      destinations?: Array<{
        destinationName: string;
        address?: string;
        city?: string;
        latitude?: number;
        longitude?: number;
        radiusMeters?: number;
        isGeofenceRequired?: boolean;
      }>;
    },
  ) {
    const res = await fetchWithAuth<any>(`/visits/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    return res;
  },

  async cancelVisit(id: string, cancellationReason: string) {
    const res = await fetchWithAuth<any>(`/visits/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ cancellationReason }),
    });
    return res;
  },

  async verifyLocation(payload: {
    visitId?: string;
    destinationId?: string;
    latitude?: number;
    longitude?: number;
    accuracyMeters?: number;
    clientTimestamp?: string;
    gpsExceptionReason?: string;
    deviceInfo?: string;
  }) {
    const res = await fetchWithAuth<any>('/visits/verify-location', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  async getManagerPendingVisits(params?: { search?: string; page?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetchWithAuth<any>(`/visits/manager/pending${qs}`);
    return res;
  },

  async decideVisit(id: string, payload: { decision: 'APPROVED' | 'REJECTED'; comments?: string }) {
    const res = await fetchWithAuth<any>(`/visits/${id}/decide`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res;
  },

  async getTeamVisits(params?: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const query = new URLSearchParams({ scope: 'team' });
    if (params?.status) query.set('status', params.status);
    if (params?.search) query.set('search', params.search);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const res = await fetchWithAuth<any>(`/visits?${query.toString()}`);
    return res;
  },

  async getOrganizationVisits(params?: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const query = new URLSearchParams({ scope: 'organization' });
    if (params?.status) query.set('status', params.status);
    if (params?.search) query.set('search', params.search);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const res = await fetchWithAuth<any>(`/visits?${query.toString()}`);
    return res;
  },

  async getOperationsOverview(params?: {
    status?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
  }) {
    const query = new URLSearchParams();
    if (params?.status && params.status !== 'ALL') query.set('status', params.status);
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    if (params?.search) query.set('search', params.search);
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetchWithAuth<any>(`/visits/operations/overview${qs}`);
    return res.data;
  },
};

export const attendanceApi = {
  async getToday() {
    const res = await fetchWithAuth<any>('/attendance/today');
    return res.data;
  },

  async checkIn(payload: {
    latitude?: number;
    longitude?: number;
    accuracyMeters?: number;
    timestamp?: string | number;
    idempotencyKey: string;
    officeLocationId?: string;
    attendanceMode?: string;
    officialVisitId?: string;
    wfhRequestId?: string;
    destinationId?: string;
    gpsExceptionReason?: string;
    deviceInfo?: string;
  }) {
    const res = await fetchWithAuth<any>('/attendance/check-in', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res;
  },

  async checkOut(payload: {
    idempotencyKey: string;
    latitude?: number;
    longitude?: number;
    accuracyMeters?: number;
    timestamp?: string | number;
    officialVisitId?: string;
    wfhRequestId?: string;
    isVisitConcluded?: boolean;
    deviceInfo?: string;
  }) {
    const res = await fetchWithAuth<any>('/attendance/check-out', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res;
  },

  async startBreak(payload: { idempotencyKey: string; reason?: string; deviceInfo?: string }) {
    const res = await fetchWithAuth<any>('/attendance/break/start', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res;
  },

  async endBreak(payload: { idempotencyKey: string; reason?: string; deviceInfo?: string }) {
    const res = await fetchWithAuth<any>('/attendance/break/end', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res;
  },

  async reconcileMissing() {
    const res = await fetchWithAuth<any>('/attendance/reconcile-missing', {
      method: 'POST',
    });
    return res;
  },

  async getTodaySummary() {
    const res = await fetchWithAuth<any>('/attendance/summary');
    return res.data;
  },

  async getPolicy() {
    const res = await fetchWithAuth<any>('/attendance/policy');
    return res.data;
  },

  async getMyHistory(
    params?: number | { limit?: number; page?: number; startDate?: string; endDate?: string },
  ) {
    const query = new URLSearchParams();
    if (typeof params === 'number') {
      query.set('limit', String(params));
    } else if (params) {
      if (params.limit) query.set('limit', String(params.limit));
      if (params.page) query.set('page', String(params.page));
      if (params.startDate) query.set('startDate', params.startDate);
      if (params.endDate) query.set('endDate', params.endDate);
    } else {
      query.set('limit', '30');
    }
    const res = await fetchWithAuth<any>(`/attendance/my-history?${query.toString()}`);
    return res.data;
  },

  async submitCorrectionRequest(payload: {
    targetDate: string;
    requestedCheckIn?: string;
    requestedCheckOut?: string;
    reasonCategory?: string;
    reason: string;
    evidenceMetadata?: any;
  }) {
    const res = await fetchWithAuth<any>('/attendance/correction-request', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res;
  },

  async getMyCorrections() {
    const res = await fetchWithAuth<any>('/attendance/my-corrections');
    return res.data;
  },

  async getOperationsDashboard(query?: {
    date?: string;
    branchId?: string;
    departmentId?: string;
  }) {
    const params = new URLSearchParams();
    if (query?.date) params.append('date', query.date);
    if (query?.branchId) params.append('branchId', query.branchId);
    if (query?.departmentId) params.append('departmentId', query.departmentId);
    const qs = params.toString();
    const res = await fetchWithAuth<any>(`/attendance/operations/dashboard${qs ? `?${qs}` : ''}`);
    return res.data;
  },

  async getOperationsRecords(query?: {
    date?: string;
    search?: string;
    branchId?: string;
    departmentId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const params = new URLSearchParams();
    if (query?.date) params.append('date', query.date);
    if (query?.search) params.append('search', query.search);
    if (query?.branchId) params.append('branchId', query.branchId);
    if (query?.departmentId) params.append('departmentId', query.departmentId);
    if (query?.status && query.status !== 'ALL') params.append('status', query.status);
    if (query?.page) params.append('page', String(query.page));
    if (query?.limit) params.append('limit', String(query.limit));
    const qs = params.toString();
    const res = await fetchWithAuth<any>(`/attendance/operations/records${qs ? `?${qs}` : ''}`);
    return res;
  },

  async getOperationsEmployeeDetail(employeeId: string, date?: string) {
    const qs = date ? `?date=${encodeURIComponent(date)}` : '';
    const res = await fetchWithAuth<any>(`/attendance/operations/records/${employeeId}${qs}`);
    return res.data;
  },

  async recalculate(payload: {
    startDate: string;
    endDate?: string;
    employeeId?: string;
    force?: boolean;
  }) {
    const res = await fetchWithAuth<any>('/attendance/recalculate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res;
  },

  async getManagerDashboard(date?: string) {
    const qs = date ? `?date=${encodeURIComponent(date)}` : '';
    const res = await fetchWithAuth<any>(`/attendance/manager/dashboard${qs}`);
    return res.data;
  },

  async getRemoteFieldOverview(query?: {
    date?: string;
    startDate?: string;
    endDate?: string;
    branchId?: string;
    departmentId?: string;
    managerId?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const params = new URLSearchParams();
    if (query?.date) params.append('date', query.date);
    if (query?.startDate) params.append('startDate', query.startDate);
    if (query?.endDate) params.append('endDate', query.endDate);
    if (query?.branchId) params.append('branchId', query.branchId);
    if (query?.departmentId) params.append('departmentId', query.departmentId);
    if (query?.managerId) params.append('managerId', query.managerId);
    if (query?.status && query.status !== 'ALL') params.append('status', query.status);
    if (query?.search) params.append('search', query.search);
    if (query?.page) params.append('page', String(query.page));
    if (query?.limit) params.append('limit', String(query.limit));
    const qs = params.toString();
    const res = await fetchWithAuth<any>(
      `/attendance/overview/remote-and-field${qs ? `?${qs}` : ''}`,
    );
    return res.data;
  },

  async getManagerRecords(query?: {
    date?: string;
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const params = new URLSearchParams();
    if (query?.date) params.append('date', query.date);
    if (query?.search) params.append('search', query.search);
    if (query?.status && query.status !== 'ALL') params.append('status', query.status);
    if (query?.page) params.append('page', String(query.page));
    if (query?.limit) params.append('limit', String(query.limit));
    const qs = params.toString();
    const res = await fetchWithAuth<any>(`/attendance/manager/records${qs ? `?${qs}` : ''}`);
    return res;
  },

  async getManagerCorrections() {
    const res = await fetchWithAuth<any>('/attendance/manager/corrections');
    return res.data;
  },

  async getOperationsCorrections(status?: string) {
    const qs = status && status !== 'ALL' ? `?status=${encodeURIComponent(status)}` : '';
    const res = await fetchWithAuth<any>(`/attendance/operations/corrections${qs}`);
    return res.data;
  },

  async decideCorrectionRequest(
    requestId: string,
    payload: { decision: 'APPROVED' | 'REJECTED'; reviewNotes?: string },
  ) {
    const res = await fetchWithAuth<any>(`/attendance/corrections/${requestId}/decide`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res;
  },

  async getManagerEmployeeDetail(employeeId: string, date?: string) {
    const qs = date ? `?date=${encodeURIComponent(date)}` : '';
    const res = await fetchWithAuth<any>(`/attendance/manager/records/${employeeId}${qs}`);
    return res.data;
  },

  async getExceptions(query?: {
    status?: string;
    exceptionType?: string;
    severity?: string;
    employeeId?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    const params = new URLSearchParams();
    if (query?.status && query.status !== 'ALL') params.append('status', query.status);
    if (query?.exceptionType && query.exceptionType !== 'ALL')
      params.append('exceptionType', query.exceptionType);
    if (query?.severity && query.severity !== 'ALL') params.append('severity', query.severity);
    if (query?.employeeId) params.append('employeeId', query.employeeId);
    if (query?.startDate) params.append('startDate', query.startDate);
    if (query?.endDate) params.append('endDate', query.endDate);
    if (query?.page) params.append('page', String(query.page));
    if (query?.limit) params.append('limit', String(query.limit));
    const qs = params.toString();
    const res = await fetchWithAuth<any>(`/attendance/exceptions${qs ? `?${qs}` : ''}`);
    return res.data;
  },

  async getExceptionById(id: string) {
    const res = await fetchWithAuth<any>(`/attendance/exceptions/${id}`);
    return res.data;
  },

  async resolveException(
    id: string,
    payload: { status: 'RESOLVED' | 'DISMISSED'; resolutionNotes: string },
  ) {
    const res = await fetchWithAuth<any>(`/attendance/exceptions/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res.data;
  },

  async scanExceptions(targetDate?: string) {
    const res = await fetchWithAuth<any>('/attendance/exceptions/scan', {
      method: 'POST',
      body: JSON.stringify(targetDate ? { targetDate } : {}),
    });
    return res.data;
  },

  async getDailyReport(
    query?: DailyAttendanceReportFilterDto,
  ): Promise<DailyAttendanceReportResponse> {
    const params = new URLSearchParams();
    if (query?.startDate) params.append('startDate', query.startDate);
    if (query?.endDate) params.append('endDate', query.endDate);
    if (query?.branchId) params.append('branchId', query.branchId);
    if (query?.departmentId) params.append('departmentId', query.departmentId);
    if (query?.employeeId) params.append('employeeId', query.employeeId);
    if (query?.shiftId) params.append('shiftId', query.shiftId);
    if (query?.status) params.append('status', query.status);
    if (query?.search) params.append('search', query.search);
    if (query?.page) params.append('page', String(query.page));
    if (query?.limit) params.append('limit', String(query.limit));
    const qs = params.toString();
    const res = await fetchWithAuth<DailyAttendanceReportResponse>(
      `/attendance/reports/daily${qs ? `?${qs}` : ''}`,
    );
    return res.data;
  },

  async getMonthlyReport(
    query: MonthlyAttendanceReportFilterDto,
  ): Promise<MonthlyAttendanceReportResponse> {
    const params = new URLSearchParams();
    if (query.month) params.append('month', String(query.month));
    if (query.year) params.append('year', String(query.year));
    if (query.branchId) params.append('branchId', query.branchId);
    if (query.departmentId) params.append('departmentId', query.departmentId);
    if (query.employeeId) params.append('employeeId', query.employeeId);
    if (query.shiftId) params.append('shiftId', query.shiftId);
    if (query.status) params.append('status', query.status);
    if (query.search) params.append('search', query.search);
    if (query.page) params.append('page', String(query.page));
    if (query.limit) params.append('limit', String(query.limit));
    const qs = params.toString();
    const res = await fetchWithAuth<MonthlyAttendanceReportResponse>(
      `/attendance/reports/monthly${qs ? `?${qs}` : ''}`,
    );
    return res.data;
  },
};

export const notificationsApi = {
  async getNotifications(params?: { type?: string; isRead?: boolean; limit?: number }) {
    const q = new URLSearchParams();
    if (params?.type) q.append('type', params.type);
    if (params?.isRead !== undefined) q.append('isRead', String(params.isRead));
    if (params?.limit) q.append('limit', String(params.limit));
    const qs = q.toString();
    const res = await fetchWithAuth<any[]>(`/notifications${qs ? `?${qs}` : ''}`);
    return res.data;
  },
  async markRead(id: string) {
    const res = await fetchWithAuth<any>(`/notifications/${id}/read`, {
      method: 'PATCH',
    });
    return res.data;
  },
  async markAllRead() {
    const res = await fetchWithAuth<any>('/notifications/read-all', {
      method: 'PATCH',
    });
    return res.data;
  },
};

export const managerAlertsApi = {
  async getAlerts(params?: { type?: string; isRead?: boolean; limit?: number }) {
    const q = new URLSearchParams();
    if (params?.type) q.append('type', params.type);
    if (params?.isRead !== undefined) q.append('isRead', String(params.isRead));
    if (params?.limit) q.append('limit', String(params.limit));
    const qs = q.toString();
    const res = await fetchWithAuth<{ alerts: any[]; total: number; unreadCount: number }>(
      `/manager/alerts${qs ? `?${qs}` : ''}`,
    );
    return res.data;
  },
  async scanUpcoming() {
    const res = await fetchWithAuth<{ scannedCount: number; alertedCount: number; alerts: any[] }>(
      '/manager/alerts/scan-upcoming',
      { method: 'POST' },
    );
    return res.data;
  },
};

export const attendancePoliciesApi = {
  async getAll(branchId?: string) {
    const query = branchId ? `?branchId=${branchId}` : '';
    const res = await fetchWithAuth<any[]>(`/attendance/policies${query}`);
    return res.data;
  },

  async getById(id: string) {
    const res = await fetchWithAuth<any>(`/attendance/policies/${id}`);
    return res.data;
  },

  async create(data: any) {
    const res = await fetchWithAuth<any>('/attendance/policies', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async update(id: string, data: any) {
    const res = await fetchWithAuth<any>(`/attendance/policies/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async delete(id: string) {
    const res = await fetchWithAuth<any>(`/attendance/policies/${id}`, {
      method: 'DELETE',
    });
    return res;
  },

  async simulate(data: any) {
    const res = await fetchWithAuth<any>('/attendance/policies/simulate', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },
};

export const shiftsApi = {
  async getAll() {
    const res = await fetchWithAuth<any[]>('/attendance/shifts');
    return res.data;
  },

  async getById(id: string) {
    const res = await fetchWithAuth<any>(`/attendance/shifts/${id}`);
    return res.data;
  },

  async create(data: any) {
    const res = await fetchWithAuth<any>('/attendance/shifts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async update(id: string, data: any) {
    const res = await fetchWithAuth<any>(`/attendance/shifts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async delete(id: string) {
    const res = await fetchWithAuth<any>(`/attendance/shifts/${id}`, {
      method: 'DELETE',
    });
    return res;
  },

  async getAssignments(employeeId?: string) {
    const query = employeeId ? `?employeeId=${employeeId}` : '';
    const res = await fetchWithAuth<any[]>(`/attendance/shifts/assignments/list${query}`);
    return res.data;
  },

  async assign(data: {
    employeeId: string;
    shiftId: string;
    effectiveFrom: string;
    effectiveTo?: string;
  }) {
    const res = await fetchWithAuth<any>('/attendance/shifts/assignments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async deleteAssignment(id: string) {
    const res = await fetchWithAuth<any>(`/attendance/shifts/assignments/${id}`, {
      method: 'DELETE',
    });
    return res;
  },
};

export const wfhApi = {
  async getMyWfh(params?: { status?: string; search?: string; page?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.status && params.status !== 'ALL') query.set('status', params.status);
    if (params?.search) query.set('search', params.search);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetchWithAuth<any>(`/wfh/my${qs}`);
    return res;
  },

  async getWfhById(id: string) {
    const res = await fetchWithAuth<any>(`/wfh/${id}`);
    return res.data;
  },

  async createWfh(payload: {
    startDate: string;
    endDate: string;
    durationType: string;
    reason: string;
  }) {
    const res = await fetchWithAuth<any>('/wfh', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res;
  },

  async updateWfh(
    id: string,
    payload: {
      startDate?: string;
      endDate?: string;
      durationType?: string;
      reason?: string;
    },
  ) {
    const res = await fetchWithAuth<any>(`/wfh/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    return res;
  },

  async cancelWfh(id: string, payload: { reason?: string; cancellationReason?: string }) {
    const res = await fetchWithAuth<any>(`/wfh/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({
        cancellationReason: payload.cancellationReason || payload.reason || 'Cancelled by employee',
      }),
    });
    return res;
  },

  async decideWfh(
    id: string,
    payload: {
      decision: 'APPROVED' | 'REJECTED';
      comments?: string;
    },
  ) {
    const res = await fetchWithAuth<any>(`/wfh/${id}/decide`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res;
  },

  async getManagerPending(params?: { search?: string; page?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetchWithAuth<any>(`/wfh/manager/pending${qs}`);
    return res;
  },

  async getOperationsOverview(params?: {
    status?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
  }) {
    const query = new URLSearchParams();
    if (params?.status && params.status !== 'ALL') query.set('status', params.status);
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    if (params?.search) query.set('search', params.search);
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetchWithAuth<any>(`/wfh/operations/overview${qs}`);
    return res.data;
  },
};

export const leaveApi = {
  async getBalances(params?: { employeeId?: string; year?: number }) {
    const query = new URLSearchParams();
    if (params?.employeeId) query.set('employeeId', params.employeeId);
    if (params?.year) query.set('year', String(params.year));
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetchWithAuth<any>(`/leave/balances${qs}`);
    return res;
  },

  async getLeaveTypes() {
    const res = await fetchWithAuth<any>('/leave/types');
    return res;
  },

  async calculate(payload: {
    leaveTypeId: string;
    startDate: string;
    endDate: string;
    durationType?: string;
    employeeId?: string;
  }) {
    const res = await fetchWithAuth<any>('/leave/calculate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res;
  },

  async apply(payload: {
    leaveTypeId: string;
    startDate: string;
    endDate: string;
    durationType?: string;
    reason: string;
    attachmentUrl?: string;
    attachmentName?: string;
  }) {
    const res = await fetchWithAuth<any>('/leave/apply', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res;
  },

  async getRequests(params?: {
    status?: string;
    leaveTypeId?: string;
    employeeId?: string;
    search?: string;
    page?: number;
    limit?: number;
    startDate?: string;
    endDate?: string;
    leaveYear?: number;
  }) {
    const query = new URLSearchParams();
    if (params?.status && params.status !== 'ALL') query.set('status', params.status);
    if (params?.leaveTypeId && params.leaveTypeId !== 'ALL')
      query.set('leaveTypeId', params.leaveTypeId);
    if (params?.employeeId) query.set('employeeId', params.employeeId);
    if (params?.search) query.set('search', params.search);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    if (params?.leaveYear) query.set('leaveYear', String(params.leaveYear));
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetchWithAuth<any>(`/leave/requests${qs}`);
    return res;
  },

  async getManagerPending(params?: {
    search?: string;
    page?: number;
    limit?: number;
    leaveTypeId?: string;
    escalatedOnly?: boolean;
  }) {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.leaveTypeId && params.leaveTypeId !== 'ALL')
      query.set('leaveTypeId', params.leaveTypeId);
    if (params?.escalatedOnly) query.set('escalatedOnly', 'true');
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetchWithAuth<any>(`/leave/manager/pending${qs}`);
    return res;
  },

  async getOverview() {
    const res = await fetchWithAuth<any>('/leave/overview');
    return res;
  },

  async getRequestById(id: string) {
    const res = await fetchWithAuth<any>(`/leave/requests/${id}`);
    return res;
  },

  async cancelRequest(id: string, payload: { reason?: string; cancellationReason?: string }) {
    const res = await fetchWithAuth<any>(`/leave/requests/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({
        cancellationReason: payload.cancellationReason || payload.reason || 'Cancelled by employee',
      }),
    });
    return res;
  },

  async decideRequest(
    id: string,
    payload: { decision: 'APPROVED' | 'REJECTED'; comments?: string },
  ) {
    const res = await fetchWithAuth<any>(`/leave/requests/${id}/decide`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return res;
  },

  async getHolidays(params?: { year?: number; branchId?: string }) {
    const query = new URLSearchParams();
    if (params?.year) query.set('year', String(params.year));
    if (params?.branchId) query.set('branchId', params.branchId);
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetchWithAuth<any>(`/leave/holidays${qs}`);
    return res;
  },

  async getCalendar(params: {
    startDate: string;
    endDate: string;
    scope?: 'my' | 'team' | 'organization';
    employeeId?: string;
    departmentId?: string;
    branchId?: string;
    leaveTypeId?: string;
  }) {
    const query = new URLSearchParams();
    query.set('startDate', params.startDate);
    query.set('endDate', params.endDate);
    if (params.scope) query.set('scope', params.scope);
    if (params.employeeId) query.set('employeeId', params.employeeId);
    if (params.departmentId) query.set('departmentId', params.departmentId);
    if (params.branchId) query.set('branchId', params.branchId);
    if (params.leaveTypeId) query.set('leaveTypeId', params.leaveTypeId);
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetchWithAuth<any>(`/leave/calendar${qs}`);
    return res;
  },

  // HR / Admin Operations
  async createLeaveType(data: any) {
    const res = await fetchWithAuth<any>('/leave/types', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res;
  },

  async updateLeaveType(id: string, data: any) {
    const res = await fetchWithAuth<any>(`/leave/types/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res;
  },

  async deleteLeaveType(id: string) {
    const res = await fetchWithAuth<any>(`/leave/types/${id}`, {
      method: 'DELETE',
    });
    return res;
  },

  async getLeavePolicies() {
    const res = await fetchWithAuth<any>('/leave/policies');
    return res;
  },

  async createLeavePolicy(data: any) {
    const res = await fetchWithAuth<any>('/leave/policies', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res;
  },

  async updateLeavePolicy(id: string, data: any) {
    const res = await fetchWithAuth<any>(`/leave/policies/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res;
  },

  async assignPolicy(data: {
    employeeId: string;
    leavePolicyId: string;
    effectiveFrom?: string;
    effectiveTo?: string;
  }) {
    const res = await fetchWithAuth<any>('/leave/policies/assign', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res;
  },

  async getPolicyAssignments(params?: {
    leavePolicyId?: string;
    departmentId?: string;
    branchId?: string;
    employeeId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const query = new URLSearchParams();
    if (params?.leavePolicyId) query.set('leavePolicyId', params.leavePolicyId);
    if (params?.departmentId) query.set('departmentId', params.departmentId);
    if (params?.branchId) query.set('branchId', params.branchId);
    if (params?.employeeId) query.set('employeeId', params.employeeId);
    if (params?.search) query.set('search', params.search);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetchWithAuth<any>(`/leave/policies/assignments${qs}`);
    return res;
  },

  async createHoliday(data: any) {
    const res = await fetchWithAuth<any>('/leave/holidays', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res;
  },

  async updateHoliday(id: string, data: any) {
    const res = await fetchWithAuth<any>(`/leave/holidays/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res;
  },

  async deleteHoliday(id: string) {
    const res = await fetchWithAuth<any>(`/leave/holidays/${id}`, {
      method: 'DELETE',
    });
    return res;
  },

  async adjustBalance(data: {
    employeeId: string;
    leaveTypeId: string;
    leaveYear: number;
    amount: number;
    reason: string;
  }) {
    const res = await fetchWithAuth<any>('/leave/balances/adjust', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res;
  },

  async getBalanceReconciliation(params?: {
    leaveYear?: number;
    leaveTypeId?: string;
    departmentId?: string;
    employeeId?: string;
    discrepantOnly?: boolean;
    page?: number;
    limit?: number;
  }) {
    const query = new URLSearchParams();
    if (params?.leaveYear) query.set('leaveYear', String(params.leaveYear));
    if (params?.leaveTypeId && params.leaveTypeId !== 'ALL')
      query.set('leaveTypeId', params.leaveTypeId);
    if (params?.departmentId && params.departmentId !== 'ALL')
      query.set('departmentId', params.departmentId);
    if (params?.employeeId) query.set('employeeId', params.employeeId);
    if (params?.discrepantOnly) query.set('discrepantOnly', 'true');
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetchWithAuth<any>(`/leave/balances/reconciliation${qs}`);
    return res;
  },

  async reconcileAccount(id: string) {
    const res = await fetchWithAuth<any>(`/leave/balances/reconcile/${id}`, {
      method: 'POST',
    });
    return res;
  },

  async getAccountLedger(accountId: string) {
    const res = await fetchWithAuth<any>(`/leave/balances/ledger/${accountId}`);
    return res;
  },

  async getReports(params?: {
    startDate?: string;
    endDate?: string;
    leaveTypeId?: string;
    departmentId?: string;
    branchId?: string;
    status?: string;
    page?: number;
    limit?: number;
    format?: 'json' | 'csv';
  }) {
    const query = new URLSearchParams();
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    if (params?.leaveTypeId && params.leaveTypeId !== 'ALL')
      query.set('leaveTypeId', params.leaveTypeId);
    if (params?.departmentId && params.departmentId !== 'ALL')
      query.set('departmentId', params.departmentId);
    if (params?.branchId && params.branchId !== 'ALL') query.set('branchId', params.branchId);
    if (params?.status && params.status !== 'ALL') query.set('status', params.status);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.format) query.set('format', params.format);
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetchWithAuth<any>(`/leave/reports${qs}`);
    return res;
  },
};

export const reportsApi = {
  async getDailyAttendance(query?: {
    startDate?: string;
    endDate?: string;
    branchId?: string;
    departmentId?: string;
    employeeId?: string;
    shiftId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const params = new URLSearchParams();
    if (query?.startDate) params.append('startDate', query.startDate);
    if (query?.endDate) params.append('endDate', query.endDate);
    if (query?.branchId && query.branchId !== 'ALL') params.append('branchId', query.branchId);
    if (query?.departmentId && query.departmentId !== 'ALL')
      params.append('departmentId', query.departmentId);
    if (query?.employeeId && query.employeeId !== 'ALL')
      params.append('employeeId', query.employeeId);
    if (query?.shiftId && query.shiftId !== 'ALL') params.append('shiftId', query.shiftId);
    if (query?.status && query.status !== 'ALL') params.append('status', query.status);
    if (query?.page) params.append('page', String(query.page));
    if (query?.limit) params.append('limit', String(query.limit));
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetchWithAuth<any>(`/reports/attendance/daily${qs}`);
    return res.data || res;
  },

  async getWeeklyAttendance(query?: {
    startDate?: string;
    endDate?: string;
    branchId?: string;
    departmentId?: string;
    shiftId?: string;
    employeeId?: string;
  }) {
    const params = new URLSearchParams();
    if (query?.startDate) params.append('startDate', query.startDate);
    if (query?.endDate) params.append('endDate', query.endDate);
    if (query?.branchId && query.branchId !== 'ALL') params.append('branchId', query.branchId);
    if (query?.departmentId && query.departmentId !== 'ALL')
      params.append('departmentId', query.departmentId);
    if (query?.shiftId && query.shiftId !== 'ALL') params.append('shiftId', query.shiftId);
    if (query?.employeeId && query.employeeId !== 'ALL')
      params.append('employeeId', query.employeeId);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetchWithAuth<any>(`/reports/attendance/weekly${qs}`);
    return res.data;
  },

  async getMonthlyAttendance(query?: {
    year?: number;
    month?: number;
    branchId?: string;
    departmentId?: string;
    employeeId?: string;
    shiftId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const params = new URLSearchParams();
    if (query?.year) params.append('year', String(query.year));
    if (query?.month) params.append('month', String(query.month));
    if (query?.branchId && query.branchId !== 'ALL') params.append('branchId', query.branchId);
    if (query?.departmentId && query.departmentId !== 'ALL')
      params.append('departmentId', query.departmentId);
    if (query?.employeeId && query.employeeId !== 'ALL')
      params.append('employeeId', query.employeeId);
    if (query?.shiftId && query.shiftId !== 'ALL') params.append('shiftId', query.shiftId);
    if (query?.status && query.status !== 'ALL') params.append('status', query.status);
    if (query?.page) params.append('page', String(query.page));
    if (query?.limit) params.append('limit', String(query.limit));
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetchWithAuth<any>(`/reports/attendance/monthly${qs}`);
    return res.data || res;
  },

  async getAttendanceExceptions(query?: {
    startDate?: string;
    endDate?: string;
    status?: string;
    exceptionType?: string;
    severity?: string;
    branchId?: string;
    departmentId?: string;
    shiftId?: string;
    employeeId?: string;
    page?: number;
    limit?: number;
  }) {
    const params = new URLSearchParams();
    if (query?.startDate) params.append('startDate', query.startDate);
    if (query?.endDate) params.append('endDate', query.endDate);
    if (query?.status && query.status !== 'ALL') params.append('status', query.status);
    if (query?.exceptionType && query.exceptionType !== 'ALL')
      params.append('exceptionType', query.exceptionType);
    if (query?.severity && query.severity !== 'ALL') params.append('severity', query.severity);
    if (query?.branchId && query.branchId !== 'ALL') params.append('branchId', query.branchId);
    if (query?.departmentId && query.departmentId !== 'ALL')
      params.append('departmentId', query.departmentId);
    if (query?.shiftId && query.shiftId !== 'ALL') params.append('shiftId', query.shiftId);
    if (query?.employeeId && query.employeeId !== 'ALL')
      params.append('employeeId', query.employeeId);
    if (query?.page) params.append('page', String(query.page));
    if (query?.limit) params.append('limit', String(query.limit));
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetchWithAuth<any>(`/reports/attendance/exceptions${qs}`);
    return res.data;
  },

  async getExecutiveDashboard(query?: {
    asOfDate?: string;
    startDate?: string;
    endDate?: string;
    departmentId?: string;
    branchId?: string;
  }): Promise<{
    summary: ExecutiveDashboardSummaryDto;
    departmentBreakdown: Array<{
      departmentId: string;
      departmentName: string;
      headcount: number;
      percentage: number;
      isSuppressed: boolean;
    }>;
    branchBreakdown: Array<{
      branchId: string;
      branchName: string;
      headcount: number;
      percentage: number;
    }>;
    attendanceTrend: Array<{
      date: string;
      presentCount: number;
      leaveCount: number;
      absentCount: number;
      attendanceRate: number;
    }>;
    metadata: {
      scopeType: 'ORGANIZATION' | 'TEAM';
      appliedDepartmentId: string | null;
      appliedBranchId: string | null;
      filterEmployeeCount: number;
    };
  }> {
    const params = new URLSearchParams();
    if (query?.asOfDate) params.append('asOfDate', query.asOfDate);
    if (query?.startDate) params.append('startDate', query.startDate);
    if (query?.endDate) params.append('endDate', query.endDate);
    if (query?.departmentId && query.departmentId !== 'ALL')
      params.append('departmentId', query.departmentId);
    if (query?.branchId && query.branchId !== 'ALL') params.append('branchId', query.branchId);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetchWithAuth<any>(`/reports/executive/dashboard${qs}`);
    return res.data;
  },

  async getWorkforceHeadcount(query?: {
    asOfDate?: string;
    departmentId?: string;
    branchId?: string;
    designationId?: string;
    employmentType?: string;
  }) {
    const params = new URLSearchParams();
    if (query?.asOfDate) params.append('asOfDate', query.asOfDate);
    if (query?.departmentId && query.departmentId !== 'ALL')
      params.append('departmentId', query.departmentId);
    if (query?.branchId && query.branchId !== 'ALL') params.append('branchId', query.branchId);
    if (query?.designationId && query.designationId !== 'ALL')
      params.append('designationId', query.designationId);
    if (query?.employmentType && query.employmentType !== 'ALL')
      params.append('employmentType', query.employmentType);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetchWithAuth<any>(`/reports/workforce/headcount${qs}`);
    return res.data;
  },

  async getWorkforceMovement(query?: {
    startDate?: string;
    endDate?: string;
    departmentId?: string;
    branchId?: string;
    page?: number;
    limit?: number;
  }) {
    const params = new URLSearchParams();
    if (query?.startDate) params.append('startDate', query.startDate);
    if (query?.endDate) params.append('endDate', query.endDate);
    if (query?.departmentId && query.departmentId !== 'ALL')
      params.append('departmentId', query.departmentId);
    if (query?.branchId && query.branchId !== 'ALL') params.append('branchId', query.branchId);
    if (query?.page) params.append('page', String(query.page));
    if (query?.limit) params.append('limit', String(query.limit));
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetchWithAuth<any>(`/reports/workforce/movement${qs}`);
    return res.data;
  },

  async getWorkforceTrends(query?: { months?: number; departmentId?: string; branchId?: string }) {
    const params = new URLSearchParams();
    if (query?.months) params.append('months', String(query.months));
    if (query?.departmentId && query.departmentId !== 'ALL')
      params.append('departmentId', query.departmentId);
    if (query?.branchId && query.branchId !== 'ALL') params.append('branchId', query.branchId);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetchWithAuth<any>(`/reports/workforce/trends${qs}`);
    return res.data;
  },

  async getLeaveUtilization(query?: {
    startDate?: string;
    endDate?: string;
    leaveTypeId?: string;
    departmentId?: string;
    branchId?: string;
    employeeId?: string;
  }) {
    const params = new URLSearchParams();
    if (query?.startDate) params.append('startDate', query.startDate);
    if (query?.endDate) params.append('endDate', query.endDate);
    if (query?.leaveTypeId && query.leaveTypeId !== 'ALL')
      params.append('leaveTypeId', query.leaveTypeId);
    if (query?.departmentId && query.departmentId !== 'ALL')
      params.append('departmentId', query.departmentId);
    if (query?.branchId && query.branchId !== 'ALL') params.append('branchId', query.branchId);
    if (query?.employeeId && query.employeeId !== 'ALL')
      params.append('employeeId', query.employeeId);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetchWithAuth<any>(`/reports/requests/utilization${qs}`);
    return res.data;
  },

  async getRequestVolumes(query?: {
    startDate?: string;
    endDate?: string;
    requestType?: string;
    status?: string;
    departmentId?: string;
    branchId?: string;
    employeeId?: string;
  }) {
    const params = new URLSearchParams();
    if (query?.startDate) params.append('startDate', query.startDate);
    if (query?.endDate) params.append('endDate', query.endDate);
    if (query?.requestType && query.requestType !== 'ALL')
      params.append('requestType', query.requestType);
    if (query?.status && query.status !== 'ALL') params.append('status', query.status);
    if (query?.departmentId && query.departmentId !== 'ALL')
      params.append('departmentId', query.departmentId);
    if (query?.branchId && query.branchId !== 'ALL') params.append('branchId', query.branchId);
    if (query?.employeeId && query.employeeId !== 'ALL')
      params.append('employeeId', query.employeeId);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetchWithAuth<any>(`/reports/requests/volumes${qs}`);
    return res.data;
  },

  async getApprovalTurnaround(query?: {
    startDate?: string;
    endDate?: string;
    requestType?: string;
    departmentId?: string;
    branchId?: string;
    employeeId?: string;
  }) {
    const params = new URLSearchParams();
    if (query?.startDate) params.append('startDate', query.startDate);
    if (query?.endDate) params.append('endDate', query.endDate);
    if (query?.requestType && query.requestType !== 'ALL')
      params.append('requestType', query.requestType);
    if (query?.departmentId && query.departmentId !== 'ALL')
      params.append('departmentId', query.departmentId);
    if (query?.branchId && query.branchId !== 'ALL') params.append('branchId', query.branchId);
    if (query?.employeeId && query.employeeId !== 'ALL')
      params.append('employeeId', query.employeeId);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetchWithAuth<any>(`/reports/requests/turnaround${qs}`);
    return res.data;
  },

  async getPerformanceOverview(query?: {
    cycleId?: string;
    departmentId?: string;
    branchId?: string;
    employeeId?: string;
  }): Promise<PerformanceAnalyticsOverviewDto> {
    const params = new URLSearchParams();
    if (query?.cycleId && query.cycleId !== 'ALL') params.append('cycleId', query.cycleId);
    if (query?.departmentId && query.departmentId !== 'ALL')
      params.append('departmentId', query.departmentId);
    if (query?.branchId && query.branchId !== 'ALL') params.append('branchId', query.branchId);
    if (query?.employeeId && query.employeeId !== 'ALL')
      params.append('employeeId', query.employeeId);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetchWithAuth<any>(`/reports/performance/overview${qs}`);
    return res.data;
  },

  async getPerformanceGoals(query?: {
    cycleId?: string;
    departmentId?: string;
    branchId?: string;
    employeeId?: string;
  }): Promise<GoalProgressAnalyticsDto> {
    const params = new URLSearchParams();
    if (query?.cycleId && query.cycleId !== 'ALL') params.append('cycleId', query.cycleId);
    if (query?.departmentId && query.departmentId !== 'ALL')
      params.append('departmentId', query.departmentId);
    if (query?.branchId && query.branchId !== 'ALL') params.append('branchId', query.branchId);
    if (query?.employeeId && query.employeeId !== 'ALL')
      params.append('employeeId', query.employeeId);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetchWithAuth<any>(`/reports/performance/goals${qs}`);
    return res.data;
  },

  async getPerformanceDevelopmentPlans(query?: {
    cycleId?: string;
    departmentId?: string;
    branchId?: string;
    employeeId?: string;
  }): Promise<DevelopmentPlanAnalyticsDto> {
    const params = new URLSearchParams();
    if (query?.cycleId && query.cycleId !== 'ALL') params.append('cycleId', query.cycleId);
    if (query?.departmentId && query.departmentId !== 'ALL')
      params.append('departmentId', query.departmentId);
    if (query?.branchId && query.branchId !== 'ALL') params.append('branchId', query.branchId);
    if (query?.employeeId && query.employeeId !== 'ALL')
      params.append('employeeId', query.employeeId);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetchWithAuth<any>(`/reports/performance/development-plans${qs}`);
    return res.data;
  },

  // ---------------------------------------------------------------------------
  // MIS Report Library API
  // ---------------------------------------------------------------------------
  async getReportCatalog(query?: {
    category?: string;
    search?: string;
  }): Promise<MisReportCatalogItemDto[]> {
    const params = new URLSearchParams();
    if (query?.category && query.category !== 'ALL') params.append('category', query.category);
    if (query?.search) params.append('search', query.search);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetchWithAuth<any>(`/reports/library/catalog${qs}`);
    return res.data;
  },

  async getSavedReports(query?: {
    reportKey?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: SavedReportDefinitionDto[]; total: number }> {
    const params = new URLSearchParams();
    if (query?.reportKey) params.append('reportKey', query.reportKey);
    if (query?.search) params.append('search', query.search);
    if (query?.page) params.append('page', String(query.page));
    if (query?.limit) params.append('limit', String(query.limit));
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetchWithAuth<any>(`/reports/library/saved${qs}`);
    return res.data;
  },

  async createSavedReport(data: CreateSavedReportDto): Promise<SavedReportDefinitionDto> {
    const res = await fetchWithAuth<any>('/reports/library/saved', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async deleteSavedReport(id: string): Promise<{ success: boolean }> {
    const res = await fetchWithAuth<any>(`/reports/library/saved/${id}`, {
      method: 'DELETE',
    });
    return res.data;
  },

  async executeSavedReport(id: string): Promise<ExecuteSavedReportResultDto> {
    const res = await fetchWithAuth<any>(`/reports/library/saved/${id}/execute`, {
      method: 'POST',
    });
    return res.data;
  },

  async exportReportCsv(query: {
    reportKey: string;
    asOfDate?: string;
    startDate?: string;
    endDate?: string;
    departmentId?: string;
    branchId?: string;
    cycleId?: string;
    requestType?: string;
    status?: string;
    limit?: number;
  }): Promise<void> {
    const params = new URLSearchParams();
    params.append('reportKey', query.reportKey);
    if (query.asOfDate) params.append('asOfDate', query.asOfDate);
    if (query.startDate) params.append('startDate', query.startDate);
    if (query.endDate) params.append('endDate', query.endDate);
    if (query.departmentId && query.departmentId !== 'ALL')
      params.append('departmentId', query.departmentId);
    if (query.branchId && query.branchId !== 'ALL') params.append('branchId', query.branchId);
    if (query.cycleId && query.cycleId !== 'ALL') params.append('cycleId', query.cycleId);
    if (query.requestType && query.requestType !== 'ALL')
      params.append('requestType', query.requestType);
    if (query.status && query.status !== 'ALL') params.append('status', query.status);
    if (query.limit) params.append('limit', String(query.limit));

    const token = getAccessToken();
    const response = await fetch(`${API_BASE_URL}/reports/export/csv?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || 'Report export failed');
    }

    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition');
    let filename = `hrms-export-${query.reportKey}-${new Date().toISOString().split('T')[0]}.csv`;
    if (disposition && disposition.indexOf('filename=') !== -1) {
      const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
      if (matches != null && matches[1]) {
        filename = matches[1].replace(/['"]/g, '');
      }
    }
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  async getReconciliationAudit(query?: { domain?: string; severity?: string }): Promise<any> {
    const params = new URLSearchParams();
    if (query?.domain && query.domain !== 'ALL') params.append('domain', query.domain);
    if (query?.severity && query.severity !== 'ALL') params.append('severity', query.severity);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetchWithAuth<any>(`/reports/reconciliation/audit${qs}`);
    return res.data || res;
  },
};

export const managerApi = {
  async getDashboardOverview(params?: { targetDate?: string }) {
    const query = new URLSearchParams();
    if (params?.targetDate) query.set('targetDate', params.targetDate);
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetchWithAuth<any>(`/manager/dashboard/overview${qs}`);
    return res;
  },

  async getTeamDirectory(params?: {
    search?: string;
    departmentId?: string;
    branchId?: string;
    workMode?: string;
    availabilityStatus?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    page?: number;
    limit?: number;
  }) {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.departmentId) query.set('departmentId', params.departmentId);
    if (params?.branchId) query.set('branchId', params.branchId);
    if (params?.workMode) query.set('workMode', params.workMode);
    if (params?.availabilityStatus) query.set('availabilityStatus', params.availabilityStatus);
    if (params?.sortBy) query.set('sortBy', params.sortBy);
    if (params?.sortOrder) query.set('sortOrder', params.sortOrder);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetchWithAuth<any>(`/manager/team/directory${qs}`);
    return res;
  },

  async getTeamMember(id: string) {
    const res = await fetchWithAuth<any>(`/manager/team/members/${id}`);
    return res;
  },

  async getUnifiedApprovals(params?: {
    type?: 'ALL' | 'LEAVE' | 'WFH' | 'VISIT';
    status?: 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
    search?: string;
    departmentId?: string;
    branchId?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const query = new URLSearchParams();
    if (params?.type && params.type !== 'ALL') query.set('type', params.type);
    if (params?.status && params.status !== 'ALL') query.set('status', params.status);
    if (params?.search) query.set('search', params.search);
    if (params?.departmentId && params.departmentId !== 'ALL')
      query.set('departmentId', params.departmentId);
    if (params?.branchId && params.branchId !== 'ALL') query.set('branchId', params.branchId);
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.sortBy) query.set('sortBy', params.sortBy);
    if (params?.sortOrder) query.set('sortOrder', params.sortOrder);
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetchWithAuth<any>(`/manager/approvals${qs}`);
    return res;
  },

  async getUnifiedApprovalDetail(type: string, id: string) {
    const res = await fetchWithAuth<any>(`/manager/approvals/${type}/${id}`);
    return res;
  },

  async decideUnifiedApproval(data: {
    type: string;
    requestId: string;
    decision: 'APPROVED' | 'REJECTED';
    reason?: string;
  }) {
    const res = await fetchWithAuth<any>('/manager/approvals/decide', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res;
  },

  async cancelUnifiedApproval(data: { type: string; requestId: string; reason: string }) {
    const res = await fetchWithAuth<any>('/manager/approvals/cancel', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res;
  },

  async getTeamAttendanceReport(params?: {
    startDate?: string;
    endDate?: string;
    employeeId?: string;
    departmentId?: string;
    branchId?: string;
    scope?: 'ALL' | 'DIRECT';
    status?: string;
    mode?: string;
    page?: number;
    limit?: number;
    format?: 'json' | 'csv';
  }) {
    const query = new URLSearchParams();
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    if (params?.employeeId && params.employeeId !== 'ALL')
      query.set('employeeId', params.employeeId);
    if (params?.departmentId && params.departmentId !== 'ALL')
      query.set('departmentId', params.departmentId);
    if (params?.branchId && params.branchId !== 'ALL') query.set('branchId', params.branchId);
    if (params?.scope) query.set('scope', params.scope);
    if (params?.status && params.status !== 'ALL') query.set('status', params.status);
    if (params?.mode && params.mode !== 'ALL') query.set('mode', params.mode);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.format) query.set('format', params.format);
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetchWithAuth<any>(`/manager/reports/attendance${qs}`);
    return res;
  },

  async getTeamExceptionReport(params?: {
    startDate?: string;
    endDate?: string;
    employeeId?: string;
    departmentId?: string;
    branchId?: string;
    scope?: 'ALL' | 'DIRECT';
    exceptionType?: string;
    severity?: string;
    status?: string;
    page?: number;
    limit?: number;
    format?: 'json' | 'csv';
  }) {
    const query = new URLSearchParams();
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    if (params?.employeeId && params.employeeId !== 'ALL')
      query.set('employeeId', params.employeeId);
    if (params?.departmentId && params.departmentId !== 'ALL')
      query.set('departmentId', params.departmentId);
    if (params?.branchId && params.branchId !== 'ALL') query.set('branchId', params.branchId);
    if (params?.scope) query.set('scope', params.scope);
    if (params?.exceptionType && params.exceptionType !== 'ALL')
      query.set('exceptionType', params.exceptionType);
    if (params?.severity && params.severity !== 'ALL') query.set('severity', params.severity);
    if (params?.status && params.status !== 'ALL') query.set('status', params.status);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.format) query.set('format', params.format);
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetchWithAuth<any>(`/manager/reports/exceptions${qs}`);
    return res;
  },

  async getTeamApprovalReport(params?: {
    startDate?: string;
    endDate?: string;
    employeeId?: string;
    departmentId?: string;
    branchId?: string;
    scope?: 'ALL' | 'DIRECT';
    type?: string;
    decision?: string;
    page?: number;
    limit?: number;
    format?: 'json' | 'csv';
  }) {
    const query = new URLSearchParams();
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    if (params?.employeeId && params.employeeId !== 'ALL')
      query.set('employeeId', params.employeeId);
    if (params?.departmentId && params.departmentId !== 'ALL')
      query.set('departmentId', params.departmentId);
    if (params?.branchId && params.branchId !== 'ALL') query.set('branchId', params.branchId);
    if (params?.scope) query.set('scope', params.scope);
    if (params?.type && params.type !== 'ALL') query.set('type', params.type);
    if (params?.decision && params.decision !== 'ALL') query.set('decision', params.decision);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.format) query.set('format', params.format);
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetchWithAuth<any>(`/manager/reports/approvals${qs}`);
    return res;
  },

  async getTeamAvailabilityReport(params?: {
    startDate?: string;
    endDate?: string;
    employeeId?: string;
    departmentId?: string;
    branchId?: string;
    scope?: 'ALL' | 'DIRECT';
    minAvailabilityPct?: number;
    page?: number;
    limit?: number;
    format?: 'json' | 'csv';
  }) {
    const query = new URLSearchParams();
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    if (params?.employeeId && params.employeeId !== 'ALL')
      query.set('employeeId', params.employeeId);
    if (params?.departmentId && params.departmentId !== 'ALL')
      query.set('departmentId', params.departmentId);
    if (params?.branchId && params.branchId !== 'ALL') query.set('branchId', params.branchId);
    if (params?.scope) query.set('scope', params.scope);
    if (params?.minAvailabilityPct !== undefined)
      query.set('minAvailabilityPct', String(params.minAvailabilityPct));
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.format) query.set('format', params.format);
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetchWithAuth<any>(`/manager/reports/availability${qs}`);
    return res;
  },
};

export const documentsApi = {
  async getMyDocuments(): Promise<{ items: EmployeeDocumentItem[]; stats: EmployeeDocumentStats }> {
    const res = await fetchWithAuth<any>('/documents/me');
    return res.data;
  },

  async uploadMyDocument(formData: FormData): Promise<EmployeeDocumentItem> {
    const token = getAccessToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}/documents/me/upload`, {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'include',
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || `Upload failed with status ${response.status}`);
    }

    const result = await response.json();
    return result.data;
  },

  async downloadMyDocument(documentId: string, fileName?: string): Promise<void> {
    const token = getAccessToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}/documents/me/${documentId}/download`, {
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || 'Download failed');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'document';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  async getPreviewBlob(documentId: string): Promise<{ url: string; mimeType: string }> {
    const token = getAccessToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE_URL}/documents/me/${documentId}/preview`, {
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to load document preview');
    }

    const mimeType = response.headers.get('Content-Type') || 'application/pdf';
    const blob = await response.blob();
    return {
      url: window.URL.createObjectURL(blob),
      mimeType,
    };
  },

  async deleteMyDocument(documentId: string): Promise<{ message: string }> {
    const res = await fetchWithAuth<any>(`/documents/me/${documentId}`, {
      method: 'DELETE',
    });
    return res;
  },

  async getCompanyPolicies(): Promise<any[]> {
    const res = await fetchWithAuth<any[]>('/documents/policies');
    return res.data;
  },

  async getEmployeeDocuments(
    employeeId: string,
  ): Promise<{ items: EmployeeDocumentItem[]; stats: EmployeeDocumentStats }> {
    const res = await fetchWithAuth<any>(`/documents/employee/${employeeId}`);
    return res.data;
  },

  async verifyDocument(
    documentId: string,
    data: { decision: 'VERIFIED' | 'REJECTED'; notes?: string },
  ): Promise<EmployeeDocumentItem> {
    const res = await fetchWithAuth<any>(`/documents/${documentId}/verify`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },
};

export const announcementsApi = {
  async getMyAnnouncements(): Promise<AnnouncementItem[]> {
    const res = await fetchWithAuth<any>('/announcements');
    return res.data;
  },

  async getAdminAnnouncements(params?: {
    status?: string;
    search?: string;
  }): Promise<AnnouncementItem[]> {
    const q = new URLSearchParams();
    if (params?.status) q.append('status', params.status);
    if (params?.search) q.append('search', params.search);
    const queryString = q.toString() ? `?${q.toString()}` : '';
    const res = await fetchWithAuth<any>(`/announcements/admin${queryString}`);
    return res.data;
  },

  async createAnnouncement(data: CreateAnnouncementDto): Promise<AnnouncementItem> {
    const res = await fetchWithAuth<any>('/announcements', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async updateAnnouncement(id: string, data: UpdateAnnouncementDto): Promise<AnnouncementItem> {
    const res = await fetchWithAuth<any>(`/announcements/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async archiveAnnouncement(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetchWithAuth<any>(`/announcements/${id}`, {
      method: 'DELETE',
    });
    return res;
  },
};

export const performanceApi = {
  async getGoals(params?: {
    employeeId?: string;
    cycleId?: string;
    status?: string;
    category?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    items: PerformanceGoalDto[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const q = new URLSearchParams();
    if (params?.employeeId) q.append('employeeId', params.employeeId);
    if (params?.cycleId) q.append('cycleId', params.cycleId);
    if (params?.status) q.append('status', params.status);
    if (params?.category) q.append('category', params.category);
    if (params?.search) q.append('search', params.search);
    if (params?.page) q.append('page', params.page.toString());
    if (params?.limit) q.append('limit', params.limit.toString());
    const queryString = q.toString() ? `?${q.toString()}` : '';
    const res = await fetchWithAuth<any>(`/performance/goals${queryString}`);
    return res.data;
  },

  async getGoalStats(cycleId?: string): Promise<PerformanceGoalStats> {
    const q = cycleId ? `?cycleId=${encodeURIComponent(cycleId)}` : '';
    const res = await fetchWithAuth<any>(`/performance/goals/stats${q}`);
    return res.data;
  },

  async getGoalById(id: string): Promise<PerformanceGoalDto> {
    const res = await fetchWithAuth<any>(`/performance/goals/${id}`);
    return res.data;
  },

  async createGoal(data: CreateGoalDto): Promise<PerformanceGoalDto> {
    const res = await fetchWithAuth<any>('/performance/goals', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async updateGoal(id: string, data: UpdateGoalDto): Promise<PerformanceGoalDto> {
    const res = await fetchWithAuth<any>(`/performance/goals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async submitGoal(id: string): Promise<PerformanceGoalDto> {
    const res = await fetchWithAuth<any>(`/performance/goals/${id}/submit`, {
      method: 'POST',
    });
    return res.data;
  },

  async approveGoal(id: string, data: ApproveGoalDto): Promise<PerformanceGoalDto> {
    const res = await fetchWithAuth<any>(`/performance/goals/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async updateProgress(
    id: string,
    data: CreateGoalProgressUpdateDto,
    file?: File,
  ): Promise<{ progressRecord: GoalProgressUpdateDto; updatedGoal: PerformanceGoalDto }> {
    let body: any;
    if (file) {
      const formData = new FormData();
      formData.append('note', data.note);
      if (data.currentValue !== undefined)
        formData.append('currentValue', data.currentValue.toString());
      if (data.progressPercentage !== undefined)
        formData.append('progressPercentage', data.progressPercentage.toString());
      formData.append('evidence', file);
      body = formData;
    } else {
      body = JSON.stringify(data);
    }

    const res = await fetchWithAuth<any>(`/performance/goals/${id}/progress`, {
      method: 'POST',
      body,
    });
    return res.data;
  },

  async deleteGoal(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetchWithAuth<any>(`/performance/goals/${id}`, {
      method: 'DELETE',
    });
    return res;
  },

  // Review Cycles Administration
  async getCycles(params?: { status?: string; search?: string }): Promise<ReviewCycleDto[]> {
    const q = new URLSearchParams();
    if (params?.status) q.append('status', params.status);
    if (params?.search) q.append('search', params.search);
    const queryString = q.toString() ? `?${q.toString()}` : '';
    const res = await fetchWithAuth<any>(`/performance/cycles${queryString}`);
    return res.data;
  },

  async getCycleById(id: string): Promise<ReviewCycleDto> {
    const res = await fetchWithAuth<any>(`/performance/cycles/${id}`);
    return res.data;
  },

  async createCycle(data: CreateReviewCycleDto): Promise<ReviewCycleDto> {
    const res = await fetchWithAuth<any>('/performance/cycles', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async updateCycle(id: string, data: UpdateReviewCycleDto): Promise<ReviewCycleDto> {
    const res = await fetchWithAuth<any>(`/performance/cycles/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async previewEligibility(id: string): Promise<EligibilityPreviewDto> {
    const res = await fetchWithAuth<any>(`/performance/cycles/${id}/eligibility-preview`);
    return res.data;
  },

  async enrollParticipants(
    id: string,
  ): Promise<{ success: boolean; enrolledCount: number; message: string }> {
    const res = await fetchWithAuth<any>(`/performance/cycles/${id}/enroll`, {
      method: 'POST',
    });
    return res.data;
  },

  async transitionCycleStage(id: string, data: TransitionCycleStageDto): Promise<ReviewCycleDto> {
    const res = await fetchWithAuth<any>(`/performance/cycles/${id}/transition`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async reopenCycle(id: string, data: ReopenCycleDto): Promise<ReviewCycleDto> {
    const res = await fetchWithAuth<any>(`/performance/cycles/${id}/reopen`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async getCycleParticipants(
    id: string,
    params?: { status?: string; search?: string; page?: number; limit?: number },
  ): Promise<{
    items: ReviewCycleParticipantDto[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const q = new URLSearchParams();
    if (params?.status) q.append('status', params.status);
    if (params?.search) q.append('search', params.search);
    if (params?.page) q.append('page', params.page.toString());
    if (params?.limit) q.append('limit', params.limit.toString());
    const queryString = q.toString() ? `?${q.toString()}` : '';
    const res = await fetchWithAuth<any>(`/performance/cycles/${id}/participants${queryString}`);
    return res.data;
  },

  async reassignManager(
    cycleId: string,
    participantId: string,
    data: ReassignManagerDto,
  ): Promise<ReviewCycleParticipantDto> {
    const res = await fetchWithAuth<any>(
      `/performance/cycles/${cycleId}/participants/${participantId}/reassign-manager`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    );
    return res.data;
  },

  async exemptParticipant(
    cycleId: string,
    participantId: string,
    data: ExemptParticipantDto,
  ): Promise<ReviewCycleParticipantDto> {
    const res = await fetchWithAuth<any>(
      `/performance/cycles/${cycleId}/participants/${participantId}/exempt`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    );
    return res.data;
  },

  // Employee Self-Assessment
  async getSelfAssessmentContext(cycleId?: string): Promise<EmployeeActiveReviewContextDto> {
    const q = cycleId ? `?cycleId=${encodeURIComponent(cycleId)}` : '';
    const res = await fetchWithAuth<any>(`/performance/self-assessment/context${q}`);
    return res.data;
  },

  async saveSelfAssessmentDraft(data: SaveSelfAssessmentDraftDto): Promise<PerformanceReviewDto> {
    const res = await fetchWithAuth<any>('/performance/self-assessment/draft', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async submitSelfAssessment(data: SubmitSelfAssessmentDto): Promise<PerformanceReviewDto> {
    const res = await fetchWithAuth<any>('/performance/self-assessment/submit', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async getSelfAssessmentReview(id: string): Promise<PerformanceReviewDto> {
    const res = await fetchWithAuth<any>(`/performance/self-assessment/review/${id}`);
    return res.data;
  },

  async reopenSelfAssessment(id: string, reason: string): Promise<PerformanceReviewDto> {
    const res = await fetchWithAuth<any>(`/performance/self-assessment/review/${id}/reopen`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    return res.data;
  },

  async uploadSelfAssessmentEvidence(file: File): Promise<SelfAssessmentAttachment> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetchWithAuth<any>('/performance/self-assessment/evidence', {
      method: 'POST',
      body: formData,
    });
    return res.data;
  },

  // Manager Performance Assessment
  async getManagerReviewInbox(params?: {
    cycleId?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    items: ManagerReviewInboxItemDto[];
    meta: { total: number; page: number; limit: number; totalPages: number };
    counts: {
      all: number;
      pendingReview: number;
      submitted: number;
      finalized: number;
      overdue: number;
    };
  }> {
    const q = new URLSearchParams();
    if (params?.cycleId) q.append('cycleId', params.cycleId);
    if (params?.status) q.append('status', params.status);
    if (params?.search) q.append('search', params.search);
    if (params?.page) q.append('page', params.page.toString());
    if (params?.limit) q.append('limit', params.limit.toString());
    const queryString = q.toString() ? `?${q.toString()}` : '';
    const res = await fetchWithAuth<any>(`/performance/manager-reviews/inbox${queryString}`);
    return res.data;
  },

  async getManagerReviewDetail(id: string): Promise<ManagerReviewDetailDto> {
    const res = await fetchWithAuth<any>(`/performance/manager-reviews/${id}`);
    return res.data;
  },

  async saveManagerReviewDraft(
    id: string,
    data: SaveManagerReviewDraftDto,
  ): Promise<ManagerReviewDetailDto> {
    const res = await fetchWithAuth<any>(`/performance/manager-reviews/${id}/draft`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async submitManagerReview(
    id: string,
    data: SubmitManagerReviewDto,
  ): Promise<ManagerReviewDetailDto> {
    const res = await fetchWithAuth<any>(`/performance/manager-reviews/${id}/submit`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async returnReviewForCorrection(id: string, reason: string): Promise<ManagerReviewDetailDto> {
    const res = await fetchWithAuth<any>(`/performance/manager-reviews/${id}/return`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    return res.data;
  },

  async finalizeManagerReview(id: string, finalComments?: string): Promise<ManagerReviewDetailDto> {
    const res = await fetchWithAuth<any>(`/performance/manager-reviews/${id}/finalize`, {
      method: 'POST',
      body: JSON.stringify({ finalComments }),
    });
    return res.data;
  },

  // -----------------------------------------------------------------------------
  // Development Plans & Feedback
  // -----------------------------------------------------------------------------
  async getDevelopmentOverview(employeeId?: string): Promise<DevelopmentPlansOverviewDto> {
    const q = employeeId ? `?employeeId=${encodeURIComponent(employeeId)}` : '';
    const res = await fetchWithAuth<any>(`/performance/development-plans/overview${q}`);
    return res.data;
  },

  async createDevelopmentPlan(data: CreateDevelopmentPlanDto): Promise<DevelopmentPlanDto> {
    const res = await fetchWithAuth<any>('/performance/development-plans', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async updateDevelopmentPlan(
    id: string,
    data: UpdateDevelopmentPlanDto,
  ): Promise<DevelopmentPlanDto> {
    const res = await fetchWithAuth<any>(`/performance/development-plans/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async deleteDevelopmentPlan(id: string): Promise<{ success: boolean }> {
    const res = await fetchWithAuth<any>(`/performance/development-plans/${id}`, {
      method: 'DELETE',
    });
    return res.data;
  },

  async addPerformanceFeedback(
    data: CreatePerformanceFeedbackDto,
  ): Promise<PerformanceFeedbackDto> {
    const res = await fetchWithAuth<any>('/performance/development-plans/feedback', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async deletePerformanceFeedback(id: string): Promise<{ success: boolean }> {
    const res = await fetchWithAuth<any>(`/performance/development-plans/feedback/${id}`, {
      method: 'DELETE',
    });
    return res.data;
  },

  async sendDevelopmentReminder(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetchWithAuth<any>(`/performance/development-plans/${id}/remind`, {
      method: 'POST',
    });
    return res.data;
  },

  // -----------------------------------------------------------------------------
  // Rating Calculation Engine
  // -----------------------------------------------------------------------------
  async recalculateReviewScore(
    reviewId: string,
    data: RecalculateReviewScoreDto,
  ): Promise<RecalculateReviewResultDto> {
    const res = await fetchWithAuth<any>(`/performance/rating-engine/recalculate/${reviewId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.data;
  },

  async previewRatingCalculation(
    cycleId: string,
    items: Array<{
      goalId?: string;
      competencyId?: string;
      managerRating?: number;
      isNotApplicable?: boolean;
    }>,
  ): Promise<CalculationBreakdownDto> {
    const res = await fetchWithAuth<any>('/performance/rating-engine/preview', {
      method: 'POST',
      body: JSON.stringify({ cycleId, items }),
    });
    return res.data;
  },

  // -----------------------------------------------------------------------------
  // Dashboards & Reports
  // -----------------------------------------------------------------------------
  async getEmployeePerformanceDashboard(): Promise<EmployeePerformanceDashboardDto> {
    const res = await fetchWithAuth<any>('/performance/dashboards/employee');
    return res.data;
  },

  async getManagerPerformanceDashboard(): Promise<ManagerPerformanceDashboardDto> {
    const res = await fetchWithAuth<any>('/performance/dashboards/manager');
    return res.data;
  },

  async getHrAdminPerformanceDashboard(
    query?: HrPerformanceReportQueryDto,
  ): Promise<HrAdminPerformanceDashboardDto> {
    const params = new URLSearchParams();
    if (query?.cycleId) params.append('cycleId', query.cycleId);
    if (query?.departmentId) params.append('departmentId', query.departmentId);
    if (query?.branchId) params.append('branchId', query.branchId);
    if (query?.status) params.append('status', query.status);
    if (query?.search) params.append('search', query.search);
    const queryString = params.toString() ? `?${params.toString()}` : '';

    const res = await fetchWithAuth<any>(`/performance/dashboards/hr-admin${queryString}`);
    return res.data;
  },

  async exportPerformanceReport(query?: HrPerformanceReportQueryDto): Promise<void> {
    const params = new URLSearchParams();
    if (query?.cycleId) params.append('cycleId', query.cycleId);
    if (query?.departmentId) params.append('departmentId', query.departmentId);
    if (query?.branchId) params.append('branchId', query.branchId);
    if (query?.status) params.append('status', query.status);
    if (query?.search) params.append('search', query.search);
    const queryString = params.toString() ? `?${params.toString()}` : '';

    const token = getAccessToken();
    const response = await fetch(`${API_BASE_URL}/performance/dashboards/export${queryString}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Export download failed');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `performance_reviews_mis_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  // -----------------------------------------------------------------------------
  // Notifications & Reminders
  // -----------------------------------------------------------------------------
  async triggerPerformanceReminders(
    data?: TriggerPerformanceRemindersDto,
  ): Promise<TriggerRemindersResultDto> {
    const res = await fetchWithAuth<any>('/performance/reminders/trigger', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
    return res.data;
  },

  async sendGoalNudge(goalId: string): Promise<{ success: boolean; message: string }> {
    const res = await fetchWithAuth<any>(`/performance/reminders/goal/${goalId}/nudge`, {
      method: 'POST',
    });
    return res.data;
  },

  async sendReviewNudge(reviewId: string): Promise<{ success: boolean; message: string }> {
    const res = await fetchWithAuth<any>(`/performance/reminders/review/${reviewId}/nudge`, {
      method: 'POST',
    });
    return res.data;
  },
};

// -----------------------------------------------------------------------------
// Payroll: Components & Structures
// -----------------------------------------------------------------------------
export const payrollApi = {
  async getSalaryComponents(params?: {
    category?: string;
    type?: string;
    search?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  }) {
    const query = new URLSearchParams();
    if (params?.category && params.category !== 'ALL') query.set('category', params.category);
    if (params?.type && params.type !== 'ALL') query.set('type', params.type);
    if (params?.search) query.set('search', params.search);
    if (params?.isActive !== undefined) query.set('isActive', String(params.isActive));
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetchWithAuth<any>(`/payroll/components${qs}`);
    return res;
  },

  async getSalaryComponent(id: string) {
    const res = await fetchWithAuth<any>(`/payroll/components/${id}`);
    return res;
  },

  async createSalaryComponent(data: any) {
    const res = await fetchWithAuth<any>('/payroll/components', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res;
  },

  async updateSalaryComponent(id: string, data: any) {
    const res = await fetchWithAuth<any>(`/payroll/components/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return res;
  },

  async deleteSalaryComponent(id: string) {
    const res = await fetchWithAuth<any>(`/payroll/components/${id}`, {
      method: 'DELETE',
    });
    return res;
  },

  async getSalaryStructures(params?: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const query = new URLSearchParams();
    if (params?.status && params.status !== 'ALL') query.set('status', params.status);
    if (params?.search) query.set('search', params.search);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetchWithAuth<any>(`/payroll/structures${qs}`);
    return res;
  },

  async getSalaryStructure(id: string) {
    const res = await fetchWithAuth<any>(`/payroll/structures/${id}`);
    return res;
  },

  async createSalaryStructure(data: any) {
    const res = await fetchWithAuth<any>('/payroll/structures', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res;
  },

  async updateSalaryStructure(id: string, data: any) {
    const res = await fetchWithAuth<any>(`/payroll/structures/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return res;
  },

  async cloneSalaryStructure(id: string, data?: any) {
    const res = await fetchWithAuth<any>(`/payroll/structures/${id}/clone`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
    return res;
  },

  async activateSalaryStructure(id: string) {
    const res = await fetchWithAuth<any>(`/payroll/structures/${id}/activate`, {
      method: 'POST',
    });
    return res;
  },

  async retireSalaryStructure(id: string) {
    const res = await fetchWithAuth<any>(`/payroll/structures/${id}/retire`, {
      method: 'POST',
    });
    return res;
  },

  async previewSalaryStructure(data: {
    structureId?: string;
    annualCtc: number;
    customItems?: any[];
  }) {
    const res = await fetchWithAuth<any>('/payroll/structures/preview', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res;
  },

  // -----------------------------------------------------------------------------
  // Employee Compensation
  // -----------------------------------------------------------------------------
  async getEmployeeCompensation(employeeId: string) {
    const res = await fetchWithAuth<any>(`/payroll/employees/${employeeId}/compensation`);
    return res;
  },

  async createEmployeeCompensation(employeeId: string, data: any) {
    const res = await fetchWithAuth<any>(`/payroll/employees/${employeeId}/compensation`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res;
  },

  async approveCompensation(id: string, data?: { comments?: string }) {
    const res = await fetchWithAuth<any>(`/payroll/compensations/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
    return res;
  },

  async rejectCompensation(id: string, data: { rejectionReason: string }) {
    const res = await fetchWithAuth<any>(`/payroll/compensations/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res;
  },

  async cancelCompensation(id: string) {
    const res = await fetchWithAuth<any>(`/payroll/compensations/${id}/cancel`, {
      method: 'POST',
    });
    return res;
  },

  async getApplicableCompensation(
    employeeId: string,
    params?: { date?: string; startDate?: string; endDate?: string },
  ) {
    const query = new URLSearchParams();
    if (params?.date) query.set('date', params.date);
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetchWithAuth<any>(
      `/payroll/employees/${employeeId}/compensation/applicable${qs}`,
    );
    return res;
  },

  async exportEmployeeCompensation(employeeId: string) {
    const token = getAccessToken();
    const response = await fetch(
      `${API_BASE_URL}/payroll/employees/${employeeId}/compensation/export`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      },
    );

    if (!response.ok) {
      throw new Error('Export download failed');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compensation_history_${employeeId}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  // -----------------------------------------------------------------------------
  // Payroll Periods
  // -----------------------------------------------------------------------------
  async getPayrollPeriods(params?: { year?: number; status?: string }) {
    const query = new URLSearchParams();
    if (params?.year) query.set('year', String(params.year));
    if (params?.status && params.status !== 'ALL') query.set('status', params.status);
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetchWithAuth<any>(`/payroll/periods${qs}`);
    return res;
  },

  async createPayrollPeriod(data: any) {
    const res = await fetchWithAuth<any>('/payroll/periods', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res;
  },

  async getPayrollPeriod(id: string) {
    const res = await fetchWithAuth<any>(`/payroll/periods/${id}`);
    return res;
  },

  async updatePayrollPeriod(id: string, data: any) {
    const res = await fetchWithAuth<any>(`/payroll/periods/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return res;
  },

  async closePayrollPeriod(id: string) {
    const res = await fetchWithAuth<any>(`/payroll/periods/${id}/close`, {
      method: 'POST',
    });
    return res;
  },

  // -----------------------------------------------------------------------------
  // Payroll Runs Orchestration
  // -----------------------------------------------------------------------------
  async previewPayrollRunScope(data: { periodId?: string; scope?: string; scopeConfig?: any }) {
    const res = await fetchWithAuth<any>('/payroll/runs/scope/preview', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res;
  },

  async getPayrollRuns(params?: {
    periodId?: string;
    status?: string;
    scope?: string;
    page?: number;
    limit?: number;
  }) {
    const query = new URLSearchParams();
    if (params?.periodId) query.set('periodId', params.periodId);
    if (params?.status && params.status !== 'ALL') query.set('status', params.status);
    if (params?.scope) query.set('scope', params.scope);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetchWithAuth<any>(`/payroll/runs${qs}`);
    return res;
  },

  async createPayrollRun(data: any) {
    const res = await fetchWithAuth<any>('/payroll/runs', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res;
  },

  async getPayrollRun(id: string) {
    const res = await fetchWithAuth<any>(`/payroll/runs/${id}`);
    return res;
  },

  async getPayrollRunSnapshots(
    id: string,
    params?: {
      page?: number;
      limit?: number;
      search?: string;
      isException?: boolean;
    },
  ) {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.search) query.set('search', params.search);
    if (params?.isException !== undefined) query.set('isException', String(params.isException));
    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetchWithAuth<any>(`/payroll/runs/${id}/snapshots${qs}`);
    return res;
  },

  async calculatePayrollRun(id: string) {
    const res = await fetchWithAuth<any>(`/payroll/runs/${id}/calculate`, {
      method: 'POST',
    });
    return res;
  },

  async retryPayrollRun(id: string) {
    const res = await fetchWithAuth<any>(`/payroll/runs/${id}/retry`, {
      method: 'POST',
    });
    return res;
  },

  async recalculatePayrollRun(id: string) {
    const res = await fetchWithAuth<any>(`/payroll/runs/${id}/recalculate`, {
      method: 'POST',
    });
    return res;
  },

  async approvePayrollRun(id: string, data?: { comments?: string }) {
    const res = await fetchWithAuth<any>(`/payroll/runs/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
    return res;
  },

  async rejectPayrollRun(id: string, data: { rejectionReason: string }) {
    const res = await fetchWithAuth<any>(`/payroll/runs/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res;
  },

  async lockPayrollRun(id: string, data?: { notes?: string }) {
    const res = await fetchWithAuth<any>(`/payroll/runs/${id}/lock`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
    return res;
  },

  async publishPayrollRun(id: string) {
    const res = await fetchWithAuth<any>(`/payroll/runs/${id}/publish`, {
      method: 'POST',
    });
    return res;
  },

  async cancelPayrollRun(id: string, reason?: string) {
    const res = await fetchWithAuth<any>(`/payroll/runs/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    return res;
  },

  async createCorrectionPayrollRun(id: string, data: { correctionReason: string; notes?: string }) {
    const res = await fetchWithAuth<any>(`/payroll/runs/${id}/correction`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res;
  },
};

export const apiClient = {
  ...payrollApi,
};
