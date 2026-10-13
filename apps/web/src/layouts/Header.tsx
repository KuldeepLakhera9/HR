'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRole } from '../context/RoleContext';
import { useAuth } from '../context/AuthContext';
import { RoleType } from '@hrms/types';
import { Search, Menu, Command, LogIn } from 'lucide-react';
import { UserMenu, NotificationMenu, Button } from '@hrms/ui';
import { GlobalSearch } from './GlobalSearch';

import { notificationsApi } from '../lib/api-client';

const INITIAL_NOTIFICATIONS = [
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

export const Header: React.FC<{ onToggleMobileMenu: () => void }> = ({ onToggleMobileMenu }) => {
  const router = useRouter();
  const { role, setRole, currentUser } = useRole();
  const { isAuthenticated, logout } = useAuth();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS);

  useEffect(() => {
    if (isAuthenticated) {
      notificationsApi
        .getNotifications()
        .then((items) => {
          if (Array.isArray(items) && items.length > 0) {
            setNotifications(items);
          }
        })
        .catch(() => {
          // Non-fatal fallback
        });
    }
  }, [isAuthenticated]);

  // Global keyboard shortcut listener (Ctrl+K or Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    notificationsApi.markAllRead().catch(() => {
      // Fallback per item
      notifications.forEach((n) => {
        if (!n.isRead) {
          notificationsApi.markRead(n.id).catch(() => {});
        }
      });
    });
  };

  const handleSelectNotification = (item: any) => {
    if (!item.isRead) {
      notificationsApi.markRead(item.id).catch(() => {});
      setNotifications((prev) => prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)));
    }
    if (item.link) {
      router.push(item.link);
    }
  };

  return (
    <>
      <header className="h-16 bg-white border-b border-stone-200/80 px-4 md:px-8 flex items-center justify-between sticky top-0 z-20">
        {/* Left: Mobile Toggle & Global Search Trigger */}
        <div className="flex items-center gap-3 flex-1 max-w-md">
          <button
            onClick={onToggleMobileMenu}
            className="p-2 rounded-lg text-stone-500 hover:bg-stone-100 md:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30"
            aria-label="Toggle navigation menu"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>

          {/* Desktop Search Button Trigger */}
          <button
            onClick={() => setIsSearchOpen(true)}
            className="relative w-full max-w-xs hidden sm:flex items-center justify-between h-9 pl-9 pr-2.5 rounded-lg border border-stone-200 bg-stone-50/60 text-xs text-stone-500 hover:bg-white hover:border-stone-300 transition-all text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30"
          >
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 group-hover:text-amber-600 transition-colors pointer-events-none"
              aria-hidden="true"
            />
            <span className="truncate">Search modules, actions...</span>
            <kbd className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-semibold text-stone-400 bg-white border border-stone-200 rounded">
              <span className="text-[9px]">Ctrl</span> K
            </kbd>
          </button>

          {/* Mobile Search Icon Trigger */}
          <button
            onClick={() => setIsSearchOpen(true)}
            className="p-2 rounded-lg text-stone-500 hover:bg-stone-100 sm:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30"
            aria-label="Open command palette search"
          >
            <Search className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Right: Role Switcher + Notifications + User Menu */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Mobile Compact Role Selector */}
          <div className="sm:hidden flex items-center">
            <label htmlFor="mobile-header-role" className="sr-only">
              Active Persona Role
            </label>
            <select
              id="mobile-header-role"
              value={role}
              onChange={(e) => setRole(e.target.value as RoleType)}
              className="h-8 px-2 text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            >
              {(['ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'] as RoleType[]).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* Desktop/Tablet Segmented Role Pills */}
          <div className="hidden sm:flex items-center gap-1 bg-stone-100/90 p-1 rounded-xl border border-stone-200">
            <span className="text-[10px] font-semibold text-stone-500 px-1 hidden lg:inline">
              ROLE:
            </span>
            {(['ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'] as RoleType[]).map((r) => (
              <button
                key={r}
                onClick={() => setRole(r)}
                aria-pressed={role === r}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all shrink-0 ${
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
          <NotificationMenu
            notifications={notifications}
            onMarkAllRead={handleMarkAllRead}
            onSelectNotification={handleSelectNotification}
          />

          {/* User Menu or Sign In Button */}
          {isAuthenticated ? (
            <UserMenu
              name={currentUser.name}
              email={currentUser.email}
              role={role}
              avatarUrl={null}
              onProfileClick={() => {
                window.location.href = '/profile';
              }}
              onLogout={() => {
                logout();
              }}
            />
          ) : (
            <div className="flex items-center gap-2">
              <UserMenu
                name={currentUser.name}
                email={currentUser.email}
                role={role}
                avatarUrl={null}
                onProfileClick={() => {
                  window.location.href = '/profile';
                }}
                onLogout={() => {
                  window.location.href = '/login';
                }}
              />
              <Link href="/login" className="hidden sm:inline-flex">
                <Button variant="outline" size="sm" leftIcon={<LogIn className="h-3.5 w-3.5" />}>
                  Sign In
                </Button>
              </Link>
            </div>
          )}
        </div>
      </header>

      {/* Global Command Palette Search Modal */}
      <GlobalSearch isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </>
  );
};
