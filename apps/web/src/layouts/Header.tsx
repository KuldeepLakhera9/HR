'use client';

import React, { useState } from 'react';
import { useRole } from '../context/RoleContext';
import { RoleType } from '@hrms/types';
import { Search, Bell, Menu, Shield } from 'lucide-react';
import { UserMenu, NotificationMenu } from '@hrms/ui';

export const Header: React.FC<{ onToggleMobileMenu: () => void }> = ({ onToggleMobileMenu }) => {
  const { role, setRole, currentUser } = useRole();
  const [searchVal, setSearchVal] = useState('');

  const notifications = [
    {
      id: '1',
      title: 'Dussehra Holiday Notice',
      message: 'All office hubs remain closed on Oct 12.',
      time: '2h ago',
      isRead: false,
    },
    {
      id: '2',
      title: 'Attendance Policy Updated',
      message: 'Grace period set to 15 mins across branches.',
      time: '5h ago',
      isRead: false,
    },
    {
      id: '3',
      title: 'Database Backup Completed',
      message: 'Automated snapshot generated at 04:00 AM.',
      time: '7h ago',
      isRead: true,
    },
  ];

  return (
    <header className="h-16 bg-white border-b border-stone-200/80 px-4 md:px-8 flex items-center justify-between sticky top-0 z-20">
      {/* Left: Mobile Toggle & Global Search */}
      <div className="flex items-center gap-3 flex-1 max-w-md">
        <button
          onClick={onToggleMobileMenu}
          className="p-2 rounded-lg text-stone-500 hover:bg-stone-100 md:hidden"
          aria-label="Toggle Navigation"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="relative w-full max-w-xs hidden sm:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 pointer-events-none" />
          <input
            type="text"
            value={searchVal}
            onChange={(e) => setSearchVal(e.target.value)}
            placeholder="Search employees, leaves, reports..."
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-stone-200 bg-stone-50/60 text-xs text-stone-900 placeholder:text-stone-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 transition-all"
          />
        </div>
      </div>

      {/* Right: Role Switcher Pill + Notifications + User Menu */}
      <div className="flex items-center gap-3">
        {/* Role Switcher Pill (Phase 1 interactive test shell) */}
        <div className="flex items-center gap-1.5 bg-stone-100/80 p-1 rounded-xl border border-stone-200">
          <span className="text-[10px] font-semibold text-stone-500 px-1 hidden lg:inline">
            ROLE:
          </span>
          {(['ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'] as RoleType[]).map((r) => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                role === r
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-white/60'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        {/* Notification Menu */}
        <NotificationMenu notifications={notifications} />

        {/* User Menu */}
        <UserMenu name={currentUser.name} email={currentUser.email} role={role} avatarUrl={null} />
      </div>
    </header>
  );
};
