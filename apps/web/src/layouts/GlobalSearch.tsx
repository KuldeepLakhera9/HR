'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useNavigation } from '../hooks/useNavigation';
import { Search, X, ArrowRight, ExternalLink, Command } from 'lucide-react';

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { navItems } = useNavigation();

  // Filtered navigation results
  const filteredNav = useMemo(() => {
    if (!query.trim()) return navItems;
    const lower = query.toLowerCase();
    return navItems.filter(
      (item) => item.label.toLowerCase().includes(lower) || item.href.toLowerCase().includes(lower),
    );
  }, [navItems, query]);

  const totalResults = useMemo(() => {
    return filteredNav.map((n) => ({ type: 'nav' as const, ...n }));
  }, [filteredNav]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleSelect = useCallback(
    (item: { href: string }) => {
      router.push(item.href);
      onClose();
    },
    [router, onClose],
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
  }, [isOpen, onClose, totalResults, selectedIndex, handleSelect]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-stone-900/40 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command search palette"
      >
        {/* Search Input Bar */}
        <div className="relative border-b border-stone-150 px-4 flex items-center">
          <Search className="h-5 w-5 text-stone-400 shrink-0 mr-3" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a module or route name to navigate..."
            className="w-full h-14 bg-transparent text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none"
            aria-label="Search navigation and actions"
          />
          {query && (
            <button
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="p-1 text-stone-400 hover:text-stone-600 rounded-md"
              aria-label="Clear query"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-[10px] font-semibold text-stone-400 bg-stone-100 rounded border border-stone-200 ml-2">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-4">
          {filteredNav.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-stone-400">
                Authorized Navigation
              </div>
              <div className="space-y-0.5 mt-1">
                {filteredNav.map((item, idx) => {
                  const isSelected = selectedIndex === idx;
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleSelect(item)}
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

          {/* Empty state */}
          {totalResults.length === 0 && (
            <div className="text-center py-8 px-4">
              <Search className="h-8 w-8 text-stone-300 mx-auto mb-2" />
              <p className="text-xs font-medium text-stone-700">No matching routes or actions</p>
              <p className="text-[11px] text-stone-400 mt-0.5">
                Try searching for attendance, leave, directory, or reports.
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
            <span className="ml-2">Select:</span>
            <kbd className="px-1.5 py-0.5 bg-white border border-stone-200 rounded text-[10px]">
              ↵
            </kbd>
          </div>
          <span className="text-[10px] text-stone-400 flex items-center gap-1">
            <Command className="h-3 w-3" /> PeopleOS Search
          </span>
        </div>
      </div>
    </div>
  );
};
