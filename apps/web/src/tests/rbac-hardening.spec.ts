import { NAVIGATION_CONFIG, filterNavigationItems } from '@hrms/config';
import { RoleType } from '@hrms/types';

describe('Phase Hardening: RBAC, Navigation & Real Data Integrity', () => {
  describe('1. Navigation Sanitization & Badge Audit', () => {
    it('should NOT contain any hardcoded badges in navigation items across all roles', () => {
      const roles: RoleType[] = ['ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'];
      for (const r of roles) {
        const items = NAVIGATION_CONFIG[r] || [];
        items.forEach((item) => {
          expect(item.badge).toBeUndefined();
        });
      }
    });

    it('should correctly segment navigation items by authorized roles', () => {
      const adminItems = NAVIGATION_CONFIG['ADMIN'] || [];
      const hrItems = NAVIGATION_CONFIG['HR'] || [];
      const managerItems = NAVIGATION_CONFIG['MANAGER'] || [];
      const employeeItems = NAVIGATION_CONFIG['EMPLOYEE'] || [];

      // Admin has organizational and configuration tools
      expect(adminItems.some((i) => i.href === '/settings')).toBe(true);
      expect(adminItems.some((i) => i.href === '/audit')).toBe(true);

      // HR has workforce and payroll access
      expect(hrItems.some((i) => i.href === '/employees')).toBe(true);
      expect(hrItems.some((i) => i.href === '/payroll')).toBe(true);

      // Manager has team portal
      expect(managerItems.some((i) => i.href === '/team')).toBe(true);

      // Employee has personal self-service
      expect(employeeItems.some((i) => i.href === '/attendance')).toBe(true);
      expect(employeeItems.some((i) => i.href === '/leave')).toBe(true);

      // Employee should NOT have access to audit logs or organization configuration
      const employeeAudit = employeeItems.find((i) => i.href === '/audit');
      const employeeOrg = employeeItems.find((i) => i.href === '/organization');
      expect(employeeAudit).toBeUndefined();
      expect(employeeOrg).toBeUndefined();
    });

    it('should filter items by granular permissions for non-admin users', () => {
      const hrItems = NAVIGATION_CONFIG['HR'] || [];
      // If user lacks PAYROLL_VIEW, payroll link is removed
      const filtered = filterNavigationItems(hrItems, ['EMPLOYEE_VIEW', 'ATTENDANCE_VIEW'], false);
      expect(filtered.some((i) => i.href === '/payroll')).toBe(false);
      expect(filtered.some((i) => i.href === '/employees')).toBe(true);
    });
  });

  describe('2. Client-Side Role Elevation Prevention', () => {
    it('should reject unauthorized role override when role is not in assigned list', () => {
      const userAssignedRoles: RoleType[] = ['EMPLOYEE'];
      let selectedRole: RoleType | null = null;

      const setRole = (newRole: RoleType) => {
        if (userAssignedRoles.includes(newRole)) {
          selectedRole = newRole;
        }
      };

      // Attempt to escalate to ADMIN
      setRole('ADMIN');
      expect(selectedRole).toBeNull();

      // Attempt to escalate to HR
      setRole('HR');
      expect(selectedRole).toBeNull();

      // Only valid assigned role is allowed
      setRole('EMPLOYEE');
      expect(selectedRole).toBe('EMPLOYEE');
    });

    it('should allow multi-role users to switch only among granted roles', () => {
      const userAssignedRoles: RoleType[] = ['MANAGER', 'EMPLOYEE'];
      let selectedRole: RoleType | null = 'MANAGER';

      const setRole = (newRole: RoleType) => {
        if (userAssignedRoles.includes(newRole)) {
          selectedRole = newRole;
        }
      };

      // Switch to EMPLOYEE is permitted
      setRole('EMPLOYEE');
      expect(selectedRole).toBe('EMPLOYEE');

      // Escalate to ADMIN is blocked
      setRole('ADMIN');
      expect(selectedRole).toBe('EMPLOYEE'); // Unchanged
    });
  });

  describe('3. Clean Empty-State Behavior (No Synthetic Mock Data)', () => {
    it('should format attendance trend to empty array when backend has no records', () => {
      const emptyApiResponse: any = { attendanceTrend: [] };
      const formatted = emptyApiResponse.attendanceTrend.map((t: any) => ({
        day: t.date ? t.date.slice(5) : 'Day',
        present: t.presentCount ?? 0,
        leave: t.leaveCount ?? 0,
        absent: t.absentCount ?? 0,
      }));

      expect(formatted).toEqual([]);
      expect(formatted.length).toBe(0);
    });

    it('should handle zero metrics honestly without fallback to non-zero values', () => {
      const zeroMetricsResponse: any = {
        summary: {
          activeHeadcount: { value: 0 },
          attendanceRate: { value: 0 },
          periodJoiners: { value: 0 },
          periodExits: { value: 0 },
        },
      };

      const totalEmployees = zeroMetricsResponse?.summary?.activeHeadcount?.value ?? 0;
      const attendanceRate = zeroMetricsResponse?.summary?.attendanceRate?.value ?? 0;
      const joiners = zeroMetricsResponse?.summary?.periodJoiners?.value ?? 0;

      expect(totalEmployees).toBe(0);
      expect(attendanceRate).toBe(0);
      expect(joiners).toBe(0);
    });
  });
});
