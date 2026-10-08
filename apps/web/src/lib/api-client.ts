import { AuthUser, LoginCredentials, ApiResponse } from '@hrms/types';

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
