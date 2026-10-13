// Mock React useCallback for headless testing
jest.mock('react', () => {
  const original = jest.requireActual('react');
  return {
    ...original,
    useCallback: (fn: any) => fn,
  };
});

// Mock AuthContext
jest.mock('../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

import { usePermissions } from '../hooks/usePermissions';
import { useAuth } from '../context/AuthContext';

describe('Frontend Auth & Permissions: usePermissions Hook', () => {
  const mockedUseAuth = useAuth as jest.Mock;

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should grant all permissions when user has ADMIN role', () => {
    mockedUseAuth.mockReturnValue({
      user: { id: 'usr-1', email: 'admin@corp.com', roles: ['ADMIN'] },
      roles: ['ADMIN'],
      permissions: [],
      isAdmin: true,
    });

    const { isAdmin, hasPermission, hasAnyPermission, hasAllPermissions } = usePermissions();

    expect(isAdmin).toBe(true);
    expect(hasPermission('payroll.manage')).toBe(true);
    expect(hasPermission('employee.delete')).toBe(true);
    expect(hasAnyPermission(['nonexistent.permission'])).toBe(true);
    expect(hasAllPermissions(['any.perm.1', 'any.perm.2'])).toBe(true);
  });

  it('should enforce strict granular permissions for non-admin roles (HR / MANAGER / EMPLOYEE)', () => {
    mockedUseAuth.mockReturnValue({
      user: { id: 'usr-2', email: 'hr@corp.com', roles: ['HR'] },
      roles: ['HR'],
      permissions: ['employee.read', 'employee.manage', 'leave.approve'],
      isAdmin: false,
    });

    const { isAdmin, hasPermission, hasAnyPermission, hasAllPermissions } = usePermissions();

    expect(isAdmin).toBe(false);
    expect(hasPermission('employee.read')).toBe(true);
    expect(hasPermission('leave.approve')).toBe(true);
    expect(hasPermission('payroll.finalize')).toBe(false); // Prohibited!
    expect(hasAnyPermission(['payroll.finalize', 'employee.read'])).toBe(true);
    expect(hasAllPermissions(['employee.read', 'payroll.finalize'])).toBe(false);
  });

  it('should deny all permissions when user is unauthenticated or null', () => {
    mockedUseAuth.mockReturnValue({
      user: null,
      roles: [],
      permissions: [],
      isAdmin: false,
    });

    const { isAdmin, hasPermission, hasAnyPermission, hasAllPermissions } = usePermissions();

    expect(isAdmin).toBe(false);
    expect(hasPermission('employee.read')).toBe(false);
    expect(hasAnyPermission(['employee.read'])).toBe(false);
    expect(hasAllPermissions(['employee.read'])).toBe(false);
  });
});
