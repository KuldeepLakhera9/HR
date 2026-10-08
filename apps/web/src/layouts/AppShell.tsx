'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { Breadcrumb } from '@hrms/ui';
import { useRole } from '../context/RoleContext';
import { useAuth } from '../context/AuthContext';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';

export interface AppShellProps {
  children: React.ReactNode;
  requireAuth?: boolean;
}

export const AppShell: React.FC<AppShellProps> = ({ children, requireAuth = false }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const { role } = useRole();
  const { isAuthenticated, user } = useAuth();

  // Generate breadcrumb path
  const pathSegments = (pathname || '').split('/').filter(Boolean);
  const breadcrumbs = [
    { label: 'Home', href: '/dashboard' },
    ...pathSegments.map((segment, index) => {
      const href = '/' + pathSegments.slice(0, index + 1).join('/');
      const label = segment
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      return { label, href };
    }),
  ];

  return (
    <div className="min-h-screen bg-ivory-50 flex">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex shrink-0">
        <Sidebar isOpen={true} />
      </div>

      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden flex">
          <div
            className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-50 flex">
            <Sidebar isOpen={true} onClose={() => setMobileMenuOpen(false)} />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)} />

        <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto space-y-4">
          {/* Breadcrumb row */}
          <div className="pb-1 flex items-center justify-between">
            <Breadcrumb items={breadcrumbs} />
            <div className="flex items-center gap-2">
              {isAuthenticated ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {user?.firstName} ({role})
                </span>
              ) : (
                <span className="text-[11px] font-medium text-stone-500">
                  Active Persona: <strong className="text-amber-700">{role}</strong>
                </span>
              )}
            </div>
          </div>

          {/* Child Page Content */}
          {requireAuth ? <ProtectedRoute>{children}</ProtectedRoute> : children}
        </main>
      </div>
    </div>
  );
};
