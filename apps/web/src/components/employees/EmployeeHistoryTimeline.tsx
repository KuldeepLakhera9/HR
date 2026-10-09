'use client';

import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  Building2,
  Briefcase,
  GitFork,
  MapPin,
  Award,
  ArrowRightLeft,
  RefreshCw,
  Laptop,
  LogOut,
  ShieldCheck,
  Lock,
  Clock,
  Search,
  ArrowDownUp,
  Filter,
  CheckCircle2,
  ArrowRight,
  UserCheck,
  Calendar,
  User,
  Info,
} from 'lucide-react';
import { Badge, Button } from '@hrms/ui';
import { employeesApi } from '../../lib/api-client';

export type HistoryEventType =
  | 'JOINED'
  | 'DEPARTMENT_CHANGED'
  | 'DESIGNATION_CHANGED'
  | 'MANAGER_CHANGED'
  | 'BRANCH_CHANGED'
  | 'PROMOTED'
  | 'TRANSFERRED'
  | 'STATUS_CHANGED'
  | 'WORK_MODE_CHANGED'
  | 'EXITED'
  | string;

export interface HistoryRecord {
  id: string;
  employeeId: string;
  eventType: HistoryEventType;
  previousValue: string | null;
  newValue: string | null;
  effectiveDate?: string | null;
  reason?: string | null;
  timestamp: string;
  metadata?: Record<string, any> | null;
  performedById?: string | null;
  performedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email?: string;
  } | null;
}

interface EmployeeHistoryTimelineProps {
  initialHistory?: HistoryRecord[];
  employeeId: string;
  employeeName?: string;
}

// -----------------------------------------------------------------------------
// Visual Event Configuration & Palette
// -----------------------------------------------------------------------------

interface EventConfig {
  label: string;
  category: 'LIFECYCLE' | 'ORGANIZATION' | 'CAREER' | 'WORK_SETUP';
  categoryLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeColor: string;
  iconBg: string;
  iconColor: string;
  borderColor: string;
}

const EVENT_CONFIGS: Record<string, EventConfig> = {
  JOINED: {
    label: 'Joined Organization',
    category: 'LIFECYCLE',
    categoryLabel: 'Lifecycle',
    icon: Sparkles,
    badgeColor: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-700',
    borderColor: 'border-emerald-200',
  },
  DEPARTMENT_CHANGED: {
    label: 'Department Changed',
    category: 'ORGANIZATION',
    categoryLabel: 'Organization',
    icon: Building2,
    badgeColor: 'bg-sky-50 text-sky-800 border-sky-200',
    iconBg: 'bg-sky-100',
    iconColor: 'text-sky-700',
    borderColor: 'border-sky-200',
  },
  DESIGNATION_CHANGED: {
    label: 'Designation Changed',
    category: 'CAREER',
    categoryLabel: 'Career Progression',
    icon: Briefcase,
    badgeColor: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    iconBg: 'bg-indigo-100',
    iconColor: 'text-indigo-700',
    borderColor: 'border-indigo-200',
  },
  MANAGER_CHANGED: {
    label: 'Reporting Manager Changed',
    category: 'ORGANIZATION',
    categoryLabel: 'Organization',
    icon: GitFork,
    badgeColor: 'bg-purple-50 text-purple-800 border-purple-200',
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-700',
    borderColor: 'border-purple-200',
  },
  BRANCH_CHANGED: {
    label: 'Branch Office Changed',
    category: 'ORGANIZATION',
    categoryLabel: 'Organization',
    icon: MapPin,
    badgeColor: 'bg-teal-50 text-teal-800 border-teal-200',
    iconBg: 'bg-teal-100',
    iconColor: 'text-teal-700',
    borderColor: 'border-teal-200',
  },
  PROMOTED: {
    label: 'Promoted',
    category: 'CAREER',
    categoryLabel: 'Career Progression',
    icon: Award,
    badgeColor: 'bg-amber-50 text-amber-900 border-amber-300 ring-1 ring-amber-400/30',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-800',
    borderColor: 'border-amber-300',
  },
  TRANSFERRED: {
    label: 'Transferred',
    category: 'ORGANIZATION',
    categoryLabel: 'Organization',
    icon: ArrowRightLeft,
    badgeColor: 'bg-cyan-50 text-cyan-800 border-cyan-200',
    iconBg: 'bg-cyan-100',
    iconColor: 'text-cyan-700',
    borderColor: 'border-cyan-200',
  },
  STATUS_CHANGED: {
    label: 'Status Changed',
    category: 'LIFECYCLE',
    categoryLabel: 'Lifecycle',
    icon: RefreshCw,
    badgeColor: 'bg-orange-50 text-orange-800 border-orange-200',
    iconBg: 'bg-orange-100',
    iconColor: 'text-orange-700',
    borderColor: 'border-orange-200',
  },
  WORK_MODE_CHANGED: {
    label: 'Work Mode Changed',
    category: 'WORK_SETUP',
    categoryLabel: 'Work Setup',
    icon: Laptop,
    badgeColor: 'bg-stone-100 text-stone-800 border-stone-200',
    iconBg: 'bg-stone-200',
    iconColor: 'text-stone-700',
    borderColor: 'border-stone-300',
  },
  EXITED: {
    label: 'Exited Organization',
    category: 'LIFECYCLE',
    categoryLabel: 'Lifecycle',
    icon: LogOut,
    badgeColor: 'bg-rose-50 text-rose-800 border-rose-200',
    iconBg: 'bg-rose-100',
    iconColor: 'text-rose-700',
    borderColor: 'border-rose-200',
  },
};

const DEFAULT_CONFIG: EventConfig = {
  label: 'Lifecycle Event',
  category: 'LIFECYCLE',
  categoryLabel: 'Audit Event',
  icon: Clock,
  badgeColor: 'bg-stone-100 text-stone-700 border-stone-200',
  iconBg: 'bg-stone-100',
  iconColor: 'text-stone-600',
  borderColor: 'border-stone-200',
};

// -----------------------------------------------------------------------------
// Helper Date Formatting Functions
// -----------------------------------------------------------------------------

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 2592000) return `${Math.floor(diffSec / 86400)}d ago`;
    if (diffSec < 31536000) return `${Math.floor(diffSec / 2592000)}mo ago`;
    return `${Math.floor(diffSec / 31536000)}y ago`;
  } catch {
    return '';
  }
}

function formatFullDateTime(dateString: string): { date: string; time: string } {
  try {
    const d = new Date(dateString);
    return {
      date: d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
      time: d.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };
  } catch {
    return { date: dateString, time: '' };
  }
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function EmployeeHistoryTimeline({
  initialHistory = [],
  employeeId,
  employeeName,
}: EmployeeHistoryTimelineProps) {
  const [historyList, setHistoryList] = useState<HistoryRecord[]>(initialHistory);
  const [loading, setLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Sync if initialHistory changes
  React.useEffect(() => {
    if (initialHistory && initialHistory.length > 0) {
      setHistoryList(initialHistory);
    }
  }, [initialHistory]);

  // Refresh history on demand
  const handleRefresh = async () => {
    setLoading(true);
    try {
      const data = await employeesApi.getHistory(employeeId);
      if (Array.isArray(data)) {
        setHistoryList(data);
      }
    } catch (err) {
      console.error('Failed to refresh employee history:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter & Sort History Records
  const filteredRecords = useMemo(() => {
    let records = [...historyList];

    // Filter by category
    if (selectedCategory !== 'ALL') {
      records = records.filter((r) => {
        const config = EVENT_CONFIGS[r.eventType] || DEFAULT_CONFIG;
        return config.category === selectedCategory;
      });
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      records = records.filter((r) => {
        const config = EVENT_CONFIGS[r.eventType] || DEFAULT_CONFIG;
        const performerName = r.performedBy
          ? `${r.performedBy.firstName} ${r.performedBy.lastName}`.toLowerCase()
          : '';
        return (
          config.label.toLowerCase().includes(q) ||
          r.eventType.toLowerCase().includes(q) ||
          (r.previousValue && r.previousValue.toLowerCase().includes(q)) ||
          (r.newValue && r.newValue.toLowerCase().includes(q)) ||
          (r.reason && r.reason.toLowerCase().includes(q)) ||
          performerName.includes(q)
        );
      });
    }

    // Sort order (timestamp)
    records.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });

    return records;
  }, [historyList, selectedCategory, searchQuery, sortOrder]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      ALL: historyList.length,
      LIFECYCLE: 0,
      ORGANIZATION: 0,
      CAREER: 0,
      WORK_SETUP: 0,
    };
    historyList.forEach((r) => {
      const config = EVENT_CONFIGS[r.eventType] || DEFAULT_CONFIG;
      if (counts[config.category] !== undefined) {
        counts[config.category]++;
      }
    });
    return counts;
  }, [historyList]);

  return (
    <div className="space-y-6">
      {/* Header Info & Security Notice */}
      <div className="bg-stone-50 border border-stone-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5 text-stone-700">
          <div className="h-8 w-8 rounded-xl bg-amber-900/10 border border-amber-900/20 flex items-center justify-center text-amber-800 shrink-0">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <div className="font-bold text-stone-900 flex items-center gap-1.5">
              <span>Chronological Career & Lifecycle Trail</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 bg-stone-200 text-stone-700 rounded-sm font-semibold">
                READ-ONLY AUDIT
              </span>
            </div>
            <p className="text-[11px] text-stone-500 mt-0.5">
              All records are cryptographically sealed system events. Direct modifications or
              deletions are strictly prohibited.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortOrder((s) => (s === 'desc' ? 'asc' : 'desc'))}
            className="text-xs h-8 text-stone-600 gap-1.5"
            title="Toggle chronological sorting"
          >
            <ArrowDownUp className="h-3.5 w-3.5" />
            <span>{sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="text-xs h-8 text-stone-600 gap-1"
            title="Refresh history logs from server"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Toolbar: Category Pills & Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {[
            { id: 'ALL', label: 'All Events', count: categoryCounts.ALL },
            { id: 'LIFECYCLE', label: 'Lifecycle', count: categoryCounts.LIFECYCLE },
            { id: 'CAREER', label: 'Career Growth', count: categoryCounts.CAREER },
            { id: 'ORGANIZATION', label: 'Organization', count: categoryCounts.ORGANIZATION },
            { id: 'WORK_SETUP', label: 'Work Setup', count: categoryCounts.WORK_SETUP },
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-amber-900 text-white font-semibold shadow-xs'
                  : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
              }`}
            >
              <span>{cat.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  selectedCategory === cat.id
                    ? 'bg-amber-800 text-amber-100 font-bold'
                    : 'bg-stone-100 text-stone-600'
                }`}
              >
                {cat.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search events, values, actors..."
            className="w-full pl-9 pr-3 py-1.5 text-xs font-medium rounded-xl border border-stone-200 bg-white text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-800/20 focus:border-amber-800"
          />
        </div>
      </div>

      {/* Timeline Stream */}
      {filteredRecords.length === 0 ? (
        <div className="py-16 text-center space-y-2 bg-stone-50/50 rounded-2xl border border-stone-200/70">
          <div className="p-3 bg-stone-100 text-stone-400 rounded-2xl inline-flex">
            <Clock className="h-6 w-6" />
          </div>
          <h4 className="text-sm font-bold text-stone-800">No History Records Found</h4>
          <p className="text-xs text-stone-500 max-w-sm mx-auto">
            {searchQuery || selectedCategory !== 'ALL'
              ? 'No events matched your search or category filter. Try clearing the filter.'
              : 'No historical event records have been created for this employee yet.'}
          </p>
          {(searchQuery || selectedCategory !== 'ALL') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('ALL');
              }}
              className="mt-2 text-xs"
            >
              Reset Filters
            </Button>
          )}
        </div>
      ) : (
        <div className="relative pl-6 sm:pl-8 space-y-6 before:absolute before:left-3 sm:before:left-4 before:top-3 before:bottom-3 before:w-0.5 before:bg-stone-200">
          {filteredRecords.map((record, index) => {
            const config = EVENT_CONFIGS[record.eventType] || DEFAULT_CONFIG;
            const EventIcon = config.icon;
            const { date, time } = formatFullDateTime(record.timestamp);
            const relativeTime = formatRelativeTime(record.timestamp);

            return (
              <div key={record.id || index} className="relative group text-xs">
                {/* Timeline Node Icon Indicator */}
                <div
                  className={`absolute -left-6 sm:-left-8 top-1.5 h-6 w-6 rounded-full border-2 border-white shadow-xs flex items-center justify-center ${config.iconBg} ${config.iconColor}`}
                  title={config.label}
                >
                  <EventIcon className="h-3 w-3" />
                </div>

                {/* Event Card */}
                <div className="p-4 rounded-2xl bg-white border border-stone-200/90 shadow-xs hover:border-amber-400 hover:shadow-md transition-all space-y-3">
                  {/* Top Row: Event Name, Category, Date & Relative Time */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-stone-900 text-sm tracking-tight">
                        {config.label}
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${config.badgeColor}`}
                      >
                        {config.categoryLabel}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-stone-400 text-[11px] font-mono shrink-0">
                      <span className="flex items-center gap-1 text-stone-600 font-medium">
                        <Calendar className="h-3 w-3 text-stone-400" />
                        {date}
                      </span>
                      <span>•</span>
                      <span>{time}</span>
                      {relativeTime && (
                        <span className="px-1.5 py-0.2 rounded bg-stone-100 text-stone-600 font-sans font-medium text-[10px]">
                          {relativeTime}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Middle Row: Value Transition Diff */}
                  <div className="bg-stone-50/80 rounded-xl p-3 border border-stone-100/90">
                    <div className="text-[11px] font-bold text-stone-400 uppercase tracking-wider mb-2">
                      Event Transition Details
                    </div>

                    {record.previousValue ? (
                      /* Side-by-Side Before -> After transition */
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 text-xs">
                        <div className="flex-1 bg-white p-2.5 rounded-lg border border-stone-200/80 shadow-xs">
                          <span className="text-[10px] font-semibold text-stone-400 uppercase block">
                            Previous Value
                          </span>
                          <span className="font-medium text-stone-700 line-through decoration-rose-400 mt-0.5 block truncate">
                            {record.previousValue}
                          </span>
                        </div>

                        <div className="flex justify-center text-amber-800 shrink-0">
                          <ArrowRight className="h-4 w-4 hidden sm:block" />
                          <span className="sm:hidden text-[10px] font-bold text-amber-800">
                            UPDATED TO ↓
                          </span>
                        </div>

                        <div className="flex-1 bg-amber-50/70 p-2.5 rounded-lg border border-amber-200 shadow-xs">
                          <span className="text-[10px] font-semibold text-amber-800 uppercase block">
                            New Value
                          </span>
                          <span className="font-bold text-stone-900 mt-0.5 block truncate">
                            {record.newValue || 'Not specified'}
                          </span>
                        </div>
                      </div>
                    ) : (
                      /* Initial Assigned Value (e.g. JOINED) */
                      <div className="bg-white p-2.5 rounded-lg border border-stone-200/80 shadow-xs">
                        <span className="text-[10px] font-semibold text-stone-400 uppercase block">
                          Assigned Value
                        </span>
                        <span className="font-bold text-stone-900 mt-0.5 block">
                          {record.newValue || 'Initial Record Provisioned'}
                        </span>
                      </div>
                    )}

                    {/* Metadata Context Chips (Department, Designation, Branch from metadata) */}
                    {record.metadata && Object.keys(record.metadata).length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-stone-200/60 flex flex-wrap gap-2 text-[11px]">
                        {record.metadata.department && (
                          <span className="px-2 py-0.5 rounded bg-white border border-stone-200 text-stone-600 flex items-center gap-1">
                            <Building2 className="h-3 w-3 text-amber-700" />
                            {record.metadata.department}
                          </span>
                        )}
                        {record.metadata.designation && (
                          <span className="px-2 py-0.5 rounded bg-white border border-stone-200 text-stone-600 flex items-center gap-1">
                            <Briefcase className="h-3 w-3 text-amber-700" />
                            {record.metadata.designation}
                          </span>
                        )}
                        {record.metadata.branch && (
                          <span className="px-2 py-0.5 rounded bg-white border border-stone-200 text-stone-600 flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-amber-700" />
                            {record.metadata.branch}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Transition Reason (If documented) */}
                  {(record.reason || record.metadata?.reason) && (
                    <div className="p-2.5 rounded-xl bg-amber-50/50 border border-amber-100 text-xs text-amber-950 flex items-start gap-2">
                      <Info className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-amber-900">Recorded Reason:</span>{' '}
                        <span>{record.reason || record.metadata?.reason}</span>
                      </div>
                    </div>
                  )}

                  {/* Bottom Row: Performed By & Audit Verification */}
                  <div className="pt-2 border-t border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-stone-500">
                    <div className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-stone-400" />
                      <span>Performed by:</span>
                      {record.performedBy ? (
                        <span className="font-semibold text-stone-800">
                          {record.performedBy.firstName} {record.performedBy.lastName}
                          {record.performedBy.email && (
                            <span className="text-stone-400 font-normal ml-1">
                              ({record.performedBy.email})
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="font-medium text-stone-600">Automated System Process</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 text-stone-400">
                      <Lock className="h-3 w-3 text-amber-800" />
                      <span className="text-[10px] font-mono">
                        Immutable Log #{record.id?.slice(-8) || index + 1}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
export default EmployeeHistoryTimeline;
