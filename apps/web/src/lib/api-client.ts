import {
  AuthUser,
  LoginCredentials,
  ApiResponse,
  DailyAttendanceReportFilterDto,
  DailyAttendanceReportResponse,
  MonthlyAttendanceReportFilterDto,
  MonthlyAttendanceReportResponse,
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

  async getMyHistory(limit = 30) {
    const res = await fetchWithAuth<any>(`/attendance/my-history?limit=${limit}`);
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
  getDailyAttendance: attendanceApi.getDailyReport,
  getMonthlyAttendance: attendanceApi.getMonthlyReport,
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
