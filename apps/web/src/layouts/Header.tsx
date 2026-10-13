'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRole } from '../context/RoleContext';
import { useAuth } from '../context/AuthContext';
import { RoleType } from '@hrms/types';
import { Search, Menu, LogIn, Shield } from 'lucide-react';
import { UserMenu, NotificationMenu, Button, Badge } from '@hrms/ui';
import { GlobalSearch } from './GlobalSearch';
import { notificationsApi } from '../lib/api-client';

export const Header: React.FC<{ onToggleMobileMenu: () => void }> = ({ onToggleMobileMenu }) => {
  const router = useRouter();
  const { role, setRole, currentUser, availableRoles } = useRole();
  const { isAuthenticated, logout, user } = useAuth();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    if (isAuthenticated) {
      notificationsApi
        .getNotifications({ limit: 10 })
        .then((items) => {
          if (Array.isArray(items)) {
            setNotifications(items);
          }
        })
        .catch(() => {
          setNotifications([]);
        });
    } else {
      setNotifications([]);
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

  const handleMarkAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    notificationsApi.markAllRead().catch(() => {});
  }, []);

  const handleSelectNotification = useCallback(
    (item: any) => {
      if (!item.isRead) {
        notificationsApi.markRead(item.id).catch(() => {});
        setNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)),
        );
      }
      if (item.link) {
        router.push(item.link);
      }
    },
    [router],
  );

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

        {/* Right: Authenticated Role Indicator + Notifications + User Menu */}
        <div className="flex items-center gap-2 sm:gap-3">
          {isAuthenticated && (
            <>
              {/* If user possesses multiple verified roles (e.g. Employee & Manager), allow switching between their own roles only */}
              {availableRoles && availableRoles.length > 1 ? (
                <div className="flex items-center gap-1.5">
                  <label htmlFor="user-role-select" className="sr-only">
                    Select Active Role
                  </label>
                  <select
                    id="user-role-select"
                    value={role}
                    onChange={(e) => setRole(e.target.value as RoleType)}
                    className="h-8 px-2 text-xs font-semibold bg-amber-50/90 text-amber-900 border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                  >
                    {availableRoles.map((r) => (
                      <option key={r} value={r}>
                        Role: {r}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-stone-200 bg-stone-50 text-stone-700 text-xs font-semibold">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span className="text-[10px] uppercase tracking-wider text-stone-400">Role:</span>
                  <span>{role}</span>
                </div>
              )}

              {/* Notification Menu */}
              <NotificationMenu
                notifications={notifications}
                onMarkAllRead={handleMarkAllRead}
                onSelectNotification={handleSelectNotification}
              />

              {/* User Menu */}
              <UserMenu
                name={currentUser.name}
                email={currentUser.email}
                role={role}
                avatarUrl={null}
                onProfileClick={() => {
                  router.push('/profile');
                }}
                onLogout={() => {
                  logout();
                }}
              />
            </>
          )}

          {!isAuthenticated && (
            <Link href="/login">
              <Button variant="primary" size="sm" leftIcon={<LogIn className="h-3.5 w-3.5" />}>
                Sign In
              </Button>
            </Link>
          )}
        </div>
      </header>

      {/* Global Command Palette Search Modal */}
      <GlobalSearch isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </>
  );
};
