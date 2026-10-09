import { NavigationItem, RoleType } from '@hrms/types';

/**
 * HRMS Design System Tokens
 * Warm professional palette inspired by modern HR SaaS (Keka, greytHR)
 */
export const DESIGN_TOKENS = {
  colors: {
    // Primary - Warm Amber / Gold
    primary: {
      50: '#FFFBEB',
      100: '#FEF3C7',
      200: '#FDE68A',
      300: '#FCD34D',
      400: '#FBBF24',
      500: '#F59E0B',
      600: '#D97706', // Primary Brand Color
      700: '#B45309', // Hover state
      800: '#92400E',
      900: '#78350F',
      foreground: '#FFFFFF',
    },
    // Backgrounds - Warm Ivory & Off-white
    background: {
      default: '#FAF8F5',
      subtle: '#F5F2EB',
      muted: '#EFECE6',
    },
    // Surfaces - Crisp Clean White & Elevated cards
    surface: {
      default: '#FFFFFF',
      subtle: '#FAF9F6',
      elevated: '#FFFFFF',
      border: '#E7E2DA',
      borderSubtle: '#F0ECE4',
    },
    // Text - Deep Charcoal
    text: {
      primary: '#1C1917', // Deep Charcoal
      secondary: '#44403C', // Secondary text
      muted: '#78716C', // Warm gray placeholder/meta
      caption: '#A8A29E', // Inactive/captions
    },
    // Status Semantics
    status: {
      success: {
        bg: '#ECFDF5',
        border: '#A7F3D0',
        text: '#065F46',
        solid: '#10B981',
      },
      warning: {
        bg: '#FFFBEB',
        border: '#FDE68A',
        text: '#92400E',
        solid: '#F59E0B',
      },
      danger: {
        bg: '#FEF2F2',
        border: '#FECACA',
        text: '#991B1B',
        solid: '#EF4444',
      },
      info: {
        bg: '#EFF6FF',
        border: '#BFDBFE',
        text: '#1E40AF',
        solid: '#3B82F6',
      },
      purple: {
        bg: '#FAF5FF',
        border: '#E9D5FF',
        text: '#6B21A8',
        solid: '#8B5CF6',
      },
    },
  },
  borderRadius: {
    sm: '0.375rem', // 6px
    md: '0.5rem', // 8px
    lg: '0.75rem', // 12px
    xl: '1rem', // 16px
    full: '9999px',
  },
  shadows: {
    card: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.03)',
    cardHover: '0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -1px rgba(0, 0, 0, 0.04)',
    elevated: '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.04)',
  },
  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    scale: {
      display: { fontSize: '1.875rem', lineHeight: '2.25rem', fontWeight: '700' },
      pageTitle: { fontSize: '1.5rem', lineHeight: '2rem', fontWeight: '700' },
      sectionTitle: { fontSize: '1.125rem', lineHeight: '1.75rem', fontWeight: '600' },
      body: { fontSize: '0.875rem', lineHeight: '1.25rem', fontWeight: '400' },
      label: { fontSize: '0.75rem', lineHeight: '1rem', fontWeight: '600' },
      caption: { fontSize: '0.6875rem', lineHeight: '0.875rem', fontWeight: '500' },
      kpiValue: { fontSize: '1.75rem', lineHeight: '2rem', fontWeight: '700' },
    },
  },
  spacing: {
    xs: '0.25rem', // 4px
    sm: '0.5rem', // 8px
    md: '1rem', // 16px
    lg: '1.5rem', // 24px
    xl: '2rem', // 32px
    '2xl': '3rem', // 48px
  },
} as const;

/**
 * Role-Based Navigation Configuration
 */
export const NAVIGATION_CONFIG: Record<RoleType, NavigationItem[]> = {
  ADMIN: [
    {
      id: 'admin-dashboard',
      label: 'Dashboard',
      href: '/dashboard',
      icon: 'LayoutDashboard',
      allowedRoles: ['ADMIN'],
    },
    {
      id: 'admin-org',
      label: 'Organization',
      href: '/organization',
      icon: 'Building2',
      allowedRoles: ['ADMIN'],
      requiredPermission: 'ORGANIZATION_VIEW',
    },
    {
      id: 'admin-employees',
      label: 'Employees',
      href: '/employees',
      icon: 'Users',
      allowedRoles: ['ADMIN'],
      requiredPermission: 'EMPLOYEE_VIEW',
    },
    {
      id: 'admin-org-chart',
      label: 'Org Chart',
      href: '/org-chart',
      icon: 'GitFork',
      allowedRoles: ['ADMIN'],
      requiredPermission: 'ORG_CHART_VIEW',
    },
    {
      id: 'admin-attendance',
      label: 'Attendance',
      href: '/attendance',
      icon: 'Clock',
      allowedRoles: ['ADMIN'],
      requiredPermission: 'ATTENDANCE_VIEW',
    },
    {
      id: 'admin-leaves',
      label: 'Leave & Holidays',
      href: '/leave',
      icon: 'CalendarDays',
      allowedRoles: ['ADMIN'],
      requiredPermission: 'LEAVE_VIEW',
    },
    {
      id: 'admin-visits',
      label: 'Official Visits',
      href: '/visits',
      icon: 'Briefcase',
      allowedRoles: ['ADMIN'],
      requiredPermission: 'ATTENDANCE_VIEW',
    },
    {
      id: 'admin-wfh',
      label: 'Work From Home',
      href: '/wfh',
      icon: 'Home',
      allowedRoles: ['ADMIN'],
      requiredPermission: 'WFH_VIEW',
    },
    {
      id: 'admin-reports',
      label: 'Analytics & Reports',
      href: '/reports',
      icon: 'BarChart3',
      allowedRoles: ['ADMIN'],
      requiredPermission: 'REPORT_VIEW',
    },
    {
      id: 'admin-roles',
      label: 'Roles & Access',
      href: '/roles',
      icon: 'ShieldCheck',
      allowedRoles: ['ADMIN'],
      requiredPermission: 'ROLE_VIEW',
    },
    {
      id: 'admin-audit',
      label: 'Audit Logs',
      href: '/audit',
      icon: 'FileText',
      allowedRoles: ['ADMIN'],
      requiredPermission: 'AUDIT_VIEW',
    },
    {
      id: 'admin-settings',
      label: 'System Settings',
      href: '/settings',
      icon: 'Settings',
      allowedRoles: ['ADMIN'],
      requiredPermission: 'SETTING_VIEW',
    },
    {
      id: 'admin-design-system',
      label: 'Design System',
      href: '/design-system',
      icon: 'Palette',
      allowedRoles: ['ADMIN'],
      requiredPermission: 'SETTING_VIEW',
    },
  ],
  HR: [
    {
      id: 'hr-dashboard',
      label: 'HR Dashboard',
      href: '/dashboard',
      icon: 'LayoutDashboard',
      allowedRoles: ['HR'],
    },
    {
      id: 'hr-employees',
      label: 'Employee Directory',
      href: '/employees',
      icon: 'Users',
      allowedRoles: ['HR'],
      requiredPermission: 'EMPLOYEE_VIEW',
    },
    {
      id: 'hr-org-chart',
      label: 'Org Chart',
      href: '/org-chart',
      icon: 'GitFork',
      allowedRoles: ['HR'],
      requiredPermission: 'ORG_CHART_VIEW',
    },
    {
      id: 'hr-org',
      label: 'Organization',
      href: '/organization',
      icon: 'Building2',
      allowedRoles: ['HR'],
      requiredPermission: 'ORGANIZATION_VIEW',
    },
    {
      id: 'hr-attendance',
      label: 'Attendance Hub',
      href: '/attendance',
      icon: 'Clock',
      allowedRoles: ['HR'],
      requiredPermission: 'ATTENDANCE_VIEW',
    },
    {
      id: 'hr-leaves',
      label: 'Leave Requests',
      href: '/leave',
      icon: 'CalendarCheck',
      allowedRoles: ['HR'],
      requiredPermission: 'LEAVE_VIEW',
      badge: '3',
    },
    {
      id: 'hr-visits',
      label: 'Official Visits',
      href: '/visits',
      icon: 'MapPin',
      allowedRoles: ['HR'],
      requiredPermission: 'ATTENDANCE_VIEW',
      badge: '2',
    },
    {
      id: 'hr-wfh',
      label: 'WFH Requests',
      href: '/wfh',
      icon: 'Home',
      allowedRoles: ['HR'],
      requiredPermission: 'WFH_VIEW',
    },
    {
      id: 'hr-progress',
      label: 'Employee Progress',
      href: '/progress',
      icon: 'TrendingUp',
      allowedRoles: ['HR'],
      requiredPermission: 'EMPLOYEE_VIEW',
    },
    {
      id: 'hr-documents',
      label: 'Documents',
      href: '/documents',
      icon: 'Files',
      allowedRoles: ['HR'],
      requiredPermission: 'DOCUMENT_VIEW',
    },
    {
      id: 'hr-reports',
      label: 'MIS & Analytics',
      href: '/reports',
      icon: 'BarChart3',
      allowedRoles: ['HR'],
      requiredPermission: 'REPORT_VIEW',
    },
  ],
  MANAGER: [
    {
      id: 'mgr-dashboard',
      label: 'Team Dashboard',
      href: '/dashboard',
      icon: 'LayoutDashboard',
      allowedRoles: ['MANAGER'],
    },
    {
      id: 'mgr-team',
      label: 'My Team',
      href: '/employees',
      icon: 'Users',
      allowedRoles: ['MANAGER'],
      requiredPermission: 'EMPLOYEE_VIEW',
    },
    {
      id: 'mgr-org-chart',
      label: 'Org Chart',
      href: '/org-chart',
      icon: 'GitFork',
      allowedRoles: ['MANAGER'],
      requiredPermission: 'ORG_CHART_VIEW',
    },
    {
      id: 'mgr-attendance',
      label: 'Team Attendance',
      href: '/attendance',
      icon: 'Clock',
      allowedRoles: ['MANAGER'],
      requiredPermission: 'ATTENDANCE_VIEW',
    },
    {
      id: 'mgr-approvals',
      label: 'Leave Approvals',
      href: '/leave',
      icon: 'CheckSquare',
      allowedRoles: ['MANAGER'],
      requiredPermission: 'LEAVE_VIEW',
      badge: '2',
    },
    {
      id: 'mgr-visits',
      label: 'Visit Approvals',
      href: '/visits',
      icon: 'MapPin',
      allowedRoles: ['MANAGER'],
      requiredPermission: 'VISIT_VIEW',
      badge: '1',
    },
    {
      id: 'mgr-wfh',
      label: 'WFH Approvals',
      href: '/wfh',
      icon: 'Home',
      allowedRoles: ['MANAGER'],
      requiredPermission: 'WFH_VIEW',
    },
    {
      id: 'mgr-progress',
      label: 'Team Progress',
      href: '/progress',
      icon: 'LineChart',
      allowedRoles: ['MANAGER'],
      requiredPermission: 'REPORT_VIEW',
    },
  ],
  EMPLOYEE: [
    {
      id: 'emp-dashboard',
      label: 'My Space',
      href: '/dashboard',
      icon: 'Home',
      allowedRoles: ['EMPLOYEE'],
    },
    {
      id: 'emp-attendance',
      label: 'My Attendance',
      href: '/attendance',
      icon: 'Clock',
      allowedRoles: ['EMPLOYEE'],
      requiredPermission: 'ATTENDANCE_VIEW',
    },
    {
      id: 'emp-leave',
      label: 'Apply Leave',
      href: '/leave',
      icon: 'Calendar',
      allowedRoles: ['EMPLOYEE'],
      requiredPermission: 'LEAVE_APPLY',
    },
    {
      id: 'emp-visits',
      label: 'Official Visits',
      href: '/visits',
      icon: 'Briefcase',
      allowedRoles: ['EMPLOYEE'],
      requiredPermission: 'VISIT_VIEW',
    },
    {
      id: 'emp-wfh',
      label: 'Work From Home',
      href: '/wfh',
      icon: 'Home',
      allowedRoles: ['EMPLOYEE'],
      requiredPermission: 'WFH_VIEW',
    },
    {
      id: 'emp-docs',
      label: 'My Documents',
      href: '/documents',
      icon: 'FolderLock',
      allowedRoles: ['EMPLOYEE'],
      requiredPermission: 'DOCUMENT_VIEW',
    },
    {
      id: 'emp-profile',
      label: 'Profile',
      href: '/profile',
      icon: 'UserCircle',
      allowedRoles: ['EMPLOYEE'],
    },
  ],
};

/**
 * Filter navigation items based on user roles and permissions.
 * Admins bypass permission filtering; other roles must possess the exact requiredPermission.
 */
export function filterNavigationItems(
  items: NavigationItem[],
  permissions: string[] = [],
  isAdmin: boolean = false,
): NavigationItem[] {
  return items.filter((item) => {
    if (isAdmin) return true;
    if (!item.requiredPermission) return true;
    return permissions.includes(item.requiredPermission);
  });
}
