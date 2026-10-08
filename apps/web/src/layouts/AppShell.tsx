'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { Breadcrumb } from '@hrms/ui';
import { useRole } from '../context/RoleContext';

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const { role } = useRole();

  // Generate breadcrumb path
  const pathSegments = pathname.split('/').filter(Boolean);
  const breadcrumbs = [
    { label: 'Home', href: '/dashboard' },
    ...pathSegments.map((segment, index) => {
      const href = '/' + pathSegments.slice(0, index + 1).join('/');
      const label = segment.charAt(0).toUpperCase() + segment.slice(1);
      return { label, href };
    }),
  ];

  return (
    <div className="min-h-screen bg-[#FAF8F5] flex">
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
            <span className="text-[11px] font-medium text-stone-500">
              Active Persona: <strong className="text-amber-700">{role}</strong>
            </span>
          </div>

          {/* Child Page Content */}
          {children}
        </main>
      </div>
    </div>
  );
};
