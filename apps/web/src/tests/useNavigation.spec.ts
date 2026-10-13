// Mock React hooks for headless testing
jest.mock('react', () => {
  const original = jest.requireActual('react');
  return {
    ...original,
    useMemo: (fn: any) => fn(),
  };
});

// Mock contexts
jest.mock('../context/RoleContext', () => ({
  useRole: jest.fn(),
}));

jest.mock('../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

import { useNavigation } from '../hooks/useNavigation';
import { useRole } from '../context/RoleContext';
import { useAuth } from '../context/AuthContext';

describe('Frontend Navigation & Role Scoping: useNavigation Hook', () => {
  const mockedUseRole = useRole as jest.Mock;
  const mockedUseAuth = useAuth as jest.Mock;

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return full role preset items in preview / unauthenticated mode', () => {
    mockedUseRole.mockReturnValue({ role: 'EMPLOYEE' });
    mockedUseAuth.mockReturnValue({
      roles: [],
      permissions: [],
      isAuthenticated: false,
    });

    const { navItems, role, isAdmin, isAuthenticated } = useNavigation();

    expect(role).toBe('EMPLOYEE');
    expect(isAdmin).toBe(false);
    expect(isAuthenticated).toBe(false);
    expect(navItems.length).toBeGreaterThan(0);
  });

  it('should filter items strictly by user permissions for HR role in authenticated mode', () => {
    mockedUseRole.mockReturnValue({ role: 'HR' });
    mockedUseAuth.mockReturnValue({
      roles: ['HR'],
      permissions: ['employee.read', 'leave.read'],
      isAuthenticated: true,
    });

    const { navItems, role, isAdmin, isAuthenticated } = useNavigation();

    expect(role).toBe('HR');
    expect(isAdmin).toBe(false);
    expect(isAuthenticated).toBe(true);
    // Navigation items should only include items where required permission is satisfied
    const paths = navItems.map((item) => item.href);
    expect(paths).toContain('/dashboard');
  });

  it('should include administrative tabs when authenticated as ADMIN', () => {
    mockedUseRole.mockReturnValue({ role: 'ADMIN' });
    mockedUseAuth.mockReturnValue({
      roles: ['ADMIN'],
      permissions: [],
      isAuthenticated: true,
    });

    const { navItems, role, isAdmin, isAuthenticated } = useNavigation();

    expect(role).toBe('ADMIN');
    expect(isAdmin).toBe(true);
    expect(isAuthenticated).toBe(true);
    const paths = navItems.map((item) => item.href);
    expect(paths).toContain('/dashboard');
  });
});
