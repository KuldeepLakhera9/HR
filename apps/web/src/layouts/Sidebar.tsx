'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRole } from '../context/RoleContext';
import { NAVIGATION_CONFIG } from '@hrms/config';
import { cn } from '@hrms/ui';
import {
  LayoutDashboard,
  Building2,
  Users,
  Clock,
  CalendarDays,
  CalendarCheck,
  Calendar,
  Briefcase,
  MapPin,
  TrendingUp,
  LineChart,
  BarChart3,
  ShieldCheck,
  FileText,
  Files,
  FolderLock,
  Settings,
  CheckSquare,
  Home,
  UserCircle,
  Palette,
  LucideIcon,
  X,
} from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard,
  Building2,
  Users,
  Clock,
  CalendarDays,
  CalendarCheck,
  Calendar,
  Briefcase,
  MapPin,
  TrendingUp,
  LineChart,
  BarChart3,
  ShieldCheck,
  FileText,
  Files,
  FolderLock,
  Settings,
  CheckSquare,
  Home,
  UserCircle,
  Palette,
};

export const Sidebar: React.FC<{ isOpen?: boolean; onClose?: () => void }> = ({
  isOpen = true,
  onClose,
}) => {
  const pathname = usePathname();
  const { role } = useRole();
  const navItems = NAVIGATION_CONFIG[role] || [];

  return (
    <aside
      className={cn(
        'w-64 bg-white border-r border-stone-200/80 flex flex-col transition-all duration-200 z-30',
        isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
      )}
    >
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-5 border-b border-stone-150">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-amber-700 to-amber-500 flex items-center justify-center text-white font-bold text-lg shadow-sm shadow-amber-600/30">
            P
          </div>
          <div>
            <span className="font-bold text-base text-stone-900 tracking-tight block leading-tight">
              PeopleOS
            </span>
            <span className="text-[10px] uppercase font-semibold tracking-wider text-amber-700 block">
              Self-Hosted HRMS
            </span>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="md:hidden p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Role Navigation Items */}
      <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">
            Navigation
          </span>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 uppercase tracking-wide">
            {role}
          </span>
        </div>
        {navItems.map((item) => {
          const Icon = ICON_MAP[item.icon] || LayoutDashboard;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={onClose}
              className={cn(
                'flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all group',
                isActive
                  ? 'bg-amber-500/10 text-amber-900 font-semibold shadow-2xs'
                  : 'text-stone-600 hover:bg-stone-50 hover:text-stone-900',
              )}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={cn(
                    'h-4 w-4 transition-colors',
                    isActive ? 'text-amber-700' : 'text-stone-400 group-hover:text-stone-700',
                  )}
                />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span
                  className={cn(
                    'text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
                    isActive ? 'bg-amber-600 text-white' : 'bg-stone-100 text-stone-600',
                  )}
                >
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Footer Info */}
      <div className="p-4 border-t border-stone-150 bg-stone-50/50">
        <div className="flex items-center justify-between text-[11px] text-stone-500">
          <span className="font-medium">Self-Hosted Monolith</span>
          <span className="bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded text-[10px]">
            v1.0.0
          </span>
        </div>
      </div>
    </aside>
  );
};
