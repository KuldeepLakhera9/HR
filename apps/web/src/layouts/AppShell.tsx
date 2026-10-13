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

  // Close mobile menu on Escape key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    if (mobileMenuOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

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
      {/* Skip to Main Content Link for Keyboard and Screen Readers */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-amber-600 focus:text-white focus:rounded-lg focus:shadow-md focus:outline-none focus:ring-2 focus:ring-amber-400 text-xs font-semibold transition-all"
      >
        Skip to main content
      </a>

      {/* Desktop Sidebar */}
      <div className="hidden md:flex shrink-0">
        <Sidebar isOpen={true} />
      </div>

      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden flex"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation"
        >
          <div
            className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-50 flex">
            <Sidebar isOpen={true} onClose={() => setMobileMenuOpen(false)} />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)} />

        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 p-3 sm:p-5 md:p-8 max-w-7xl w-full mx-auto space-y-4 focus:outline-none"
        >
          {/* Breadcrumb row */}
          <div className="pb-1 flex flex-wrap items-center justify-between gap-2">
            <Breadcrumb items={breadcrumbs} />
            <div className="flex items-center gap-2">
              {isAuthenticated ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200">
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"
                    aria-hidden="true"
                  />
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
