'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useRole } from '../context/RoleContext';
import { useNavigation } from '../hooks/useNavigation';
import { RoleType } from '@hrms/types';
import {
  Search,
  X,
  ArrowRight,
  Shield,
  UserCheck,
  Briefcase,
  User,
  ExternalLink,
  Command,
} from 'lucide-react';

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { role, setRole } = useRole();
  const { navItems } = useNavigation();

  // Filtered navigation results
  const filteredNav = React.useMemo(() => {
    return navItems.filter(
      (item) =>
        item.label.toLowerCase().includes(query.toLowerCase()) ||
        item.href.toLowerCase().includes(query.toLowerCase()),
    );
  }, [navItems, query]);

  // Quick Persona switch actions
  const roleActions = React.useMemo(() => {
    return (
      [
        {
          label: 'Switch to Super Administrator (ADMIN)',
          roleTarget: 'ADMIN' as RoleType,
          icon: <Shield className="h-4 w-4 text-amber-600" />,
        },
        {
          label: 'Switch to HR Operations Lead (HR)',
          roleTarget: 'HR' as RoleType,
          icon: <UserCheck className="h-4 w-4 text-emerald-600" />,
        },
        {
          label: 'Switch to Engineering Director (MANAGER)',
          roleTarget: 'MANAGER' as RoleType,
          icon: <Briefcase className="h-4 w-4 text-sky-600" />,
        },
        {
          label: 'Switch to Senior Engineer (EMPLOYEE)',
          roleTarget: 'EMPLOYEE' as RoleType,
          icon: <User className="h-4 w-4 text-stone-600" />,
        },
      ] as { label: string; roleTarget: RoleType; icon: React.ReactNode }[]
    ).filter(
      (action) =>
        action.roleTarget !== role &&
        (action.label.toLowerCase().includes(query.toLowerCase()) ||
          action.roleTarget.toLowerCase().includes(query.toLowerCase())),
    );
  }, [role, query]);

  const totalResults = React.useMemo(() => {
    return [
      ...filteredNav.map((n) => ({ type: 'nav', ...n })),
      ...roleActions.map((r) => ({ type: 'role', ...r })),
    ];
  }, [filteredNav, roleActions]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleSelect = React.useCallback(
    (item: any) => {
      if (item.type === 'nav') {
        router.push(item.href);
        onClose();
      } else if (item.type === 'role') {
        setRole(item.roleTarget);
        onClose();
      }
    },
    [router, onClose, setRole],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1 < totalResults.length ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : totalResults.length - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (totalResults[selectedIndex]) {
          handleSelect(totalResults[selectedIndex]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, totalResults, selectedIndex, handleSelect, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 sm:px-6">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-stone-900/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-stone-150 gap-3">
          <Search className="h-5 w-5 text-amber-600 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder={`Search ${role} navigation, modules, personas...`}
            className="w-full text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none bg-transparent"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 rounded-md text-stone-400 hover:text-stone-600 hover:bg-stone-100"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-semibold text-stone-500 bg-stone-100 rounded border border-stone-200">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-4">
          {/* Navigation Items for Current Role */}
          {filteredNav.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-stone-400 flex items-center justify-between">
                <span>{role} Navigation</span>
                <span className="text-[10px] text-stone-400 font-normal">
                  {filteredNav.length} available
                </span>
              </div>
              <div className="space-y-0.5 mt-1">
                {filteredNav.map((item, idx) => {
                  const isSelected = selectedIndex === idx;
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelect({ type: 'nav', ...item })}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer text-xs transition-colors ${
                        isSelected
                          ? 'bg-amber-500/10 text-amber-900 font-semibold'
                          : 'text-stone-700 hover:bg-stone-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <ArrowRight
                          className={`h-3.5 w-3.5 ${
                            isSelected ? 'text-amber-700' : 'text-stone-400'
                          }`}
                        />
                        <span>{item.label}</span>
                      </div>
                      <span className="text-[11px] text-stone-400 font-mono">{item.href}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Persona Switchers */}
          {roleActions.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                Switch Persona
              </div>
              <div className="space-y-0.5 mt-1">
                {roleActions.map((action, idx) => {
                  const actualIdx = filteredNav.length + idx;
                  const isSelected = selectedIndex === actualIdx;
                  return (
                    <div
                      key={action.roleTarget}
                      onClick={() => handleSelect({ type: 'role', ...action })}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer text-xs transition-colors ${
                        isSelected
                          ? 'bg-amber-500/10 text-amber-900 font-semibold'
                          : 'text-stone-700 hover:bg-stone-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        {action.icon}
                        <span>{action.label}</span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-stone-100 text-stone-600">
                        Switch
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {totalResults.length === 0 && (
            <div className="text-center py-8 px-4">
              <Search className="h-8 w-8 text-stone-300 mx-auto mb-2" />
              <p className="text-xs font-medium text-stone-700">No matching routes or actions</p>
              <p className="text-[11px] text-stone-400 mt-0.5">
                Try searching for attendance, leaves, employees, or switch persona.
              </p>
            </div>
          )}
        </div>

        {/* Footer shortcuts helper */}
        <div className="px-4 py-2.5 bg-stone-50 border-t border-stone-150 flex items-center justify-between text-[11px] text-stone-500">
          <div className="flex items-center gap-2">
            <span>Navigate:</span>
            <kbd className="px-1.5 py-0.5 bg-white border border-stone-200 rounded text-[10px]">
              ↑
            </kbd>
            <kbd className="px-1.5 py-0.5 bg-white border border-stone-200 rounded text-[10px]">
              ↓
            </kbd>
            <span>Select:</span>
            <kbd className="px-1.5 py-0.5 bg-white border border-stone-200 rounded text-[10px]">
              ↵
            </kbd>
          </div>
          <span className="text-[10px] text-amber-700 font-medium">PeopleOS Command Palette</span>
        </div>
      </div>
    </div>
  );
};
