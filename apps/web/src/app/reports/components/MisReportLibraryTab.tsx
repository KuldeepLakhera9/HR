'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ChartCard, KPICard, Button } from '@hrms/ui';
import { reportsApi } from '../../../lib/api-client';
import {
  MisReportCatalogItemDto,
  SavedReportDefinitionDto,
  ExecuteSavedReportResultDto,
  ReportCategory,
} from '@hrms/types';
import {
  Library,
  Bookmark,
  Play,
  Trash2,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Users,
  Calendar,
  Award,
  RefreshCw,
  Table as TableIcon,
  BarChart3,
  ExternalLink,
  ChevronRight,
  Info,
} from 'lucide-react';

export function MisReportLibraryTab() {
  const [subTab, setSubTab] = useState<'CATALOG' | 'SAVED'>('CATALOG');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filter States
  const [category, setCategory] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Data states
  const [catalog, setCatalog] = useState<MisReportCatalogItemDto[]>([]);
  const [savedReports, setSavedReports] = useState<SavedReportDefinitionDto[]>([]);
  const [savedTotal, setSavedTotal] = useState<number>(0);

  // Execution & Modal States
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [executionResult, setExecutionResult] = useState<ExecuteSavedReportResultDto | null>(null);
  const [saveModalOpen, setSaveModalOpen] = useState<boolean>(false);
  const [targetCatalogItem, setTargetCatalogItem] = useState<MisReportCatalogItemDto | null>(null);
  const [saveName, setSaveName] = useState<string>('');
  const [saveDesc, setSaveDesc] = useState<string>('');
  const [saveConfigJson, setSaveConfigJson] = useState<string>('{}');
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load catalog
  const loadCatalog = useCallback(async () => {
    try {
      const items = await reportsApi.getReportCatalog({
        category: category !== 'ALL' ? category : undefined,
        search: searchTerm.trim() || undefined,
      });
      setCatalog(items);
    } catch (err: any) {
      setError(err.message || 'Failed to load report catalog');
    }
  }, [category, searchTerm]);

  // Load saved reports
  const loadSavedReports = useCallback(async () => {
    try {
      const res = await reportsApi.getSavedReports({
        search: searchTerm.trim() || undefined,
      });
      setSavedReports(res.items);
      setSavedTotal(res.total);
    } catch (err: any) {
      setError(err.message || 'Failed to load saved report definitions');
    }
  }, [searchTerm]);

  const loadData = useCallback(
    async (isBackground = false) => {
      if (!isBackground) setLoading(true);
      else setRefreshing(true);
      setError(null);

      try {
        if (subTab === 'CATALOG') {
          await loadCatalog();
        } else {
          await loadSavedReports();
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [subTab, loadCatalog, loadSavedReports],
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Save Report Submission
  const handleSaveReport = async () => {
    if (!targetCatalogItem || !saveName.trim()) {
      setSaveError('Report name is required');
      return;
    }

    let parsedConfig: Record<string, any> = {};
    try {
      parsedConfig = JSON.parse(saveConfigJson);
      if (typeof parsedConfig !== 'object' || Array.isArray(parsedConfig)) {
        throw new Error('Filter config must be a JSON object');
      }
    } catch (e: any) {
      setSaveError(`Invalid JSON format: ${e.message}`);
      return;
    }

    try {
      await reportsApi.createSavedReport({
        reportKey: targetCatalogItem.key,
        name: saveName.trim(),
        description: saveDesc.trim() || undefined,
        filterConfig: parsedConfig,
      });
      setSaveModalOpen(false);
      setSaveName('');
      setSaveDesc('');
      setSaveConfigJson('{}');
      setSaveError(null);
      // Refresh saved reports
      loadSavedReports();
    } catch (err: any) {
      setSaveError(err.message || 'Failed to create saved report definition');
    }
  };

  // Handle Execute Saved Report
  const handleExecute = async (id: string) => {
    setExecutingId(id);
    setError(null);
    try {
      const res = await reportsApi.executeSavedReport(id);
      setExecutionResult(res);
    } catch (err: any) {
      setError(err.message || 'Failed to execute saved report definition');
    } finally {
      setExecutingId(null);
    }
  };

  // Handle Delete Saved Report
  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this saved report definition?')) return;
    try {
      await reportsApi.deleteSavedReport(id);
      loadSavedReports();
      if (executionResult?.savedReport.id === id) {
        setExecutionResult(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete saved report definition');
    }
  };

  // Category Icon helper
  const renderCategoryIcon = (cat: ReportCategory) => {
    switch (cat) {
      case 'WORKFORCE':
        return <Users className="h-4 w-4 text-amber-600" />;
      case 'ATTENDANCE':
        return <Clock className="h-4 w-4 text-emerald-600" />;
      case 'LEAVE_REQUESTS':
        return <Calendar className="h-4 w-4 text-blue-600" />;
      case 'PERFORMANCE':
        return <Award className="h-4 w-4 text-purple-600" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Policy & Governance Notice */}
      <div className="rounded-xl border border-stone-200 bg-stone-50/90 p-3.5 text-xs text-stone-700 flex items-start gap-2.5">
        <ShieldCheck className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
        <div className="leading-relaxed">
          <strong>Centralized MIS Library & Dynamic Authorization:</strong> All reports in this
          library are governed by organizational RBAC rules. Saved report definitions preserve only
          safe, parameterized filter presets. Every execution re-validates the caller's current
          permissions and organizational reporting scope in real time. Arbitrary SQL queries or
          bypasses are strictly prevented.
        </div>
      </div>

      {/* Header & Sub-Tabs Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSubTab('CATALOG')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              subTab === 'CATALOG'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
            }`}
          >
            <Library className="h-3.5 w-3.5" />
            Report Catalog ({catalog.length})
          </button>
          <button
            onClick={() => setSubTab('SAVED')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
              subTab === 'SAVED'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
            }`}
          >
            <Bookmark className="h-3.5 w-3.5" />
            My Saved Reports ({savedTotal})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => loadData(true)}
            disabled={loading || refreshing}
            leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Search & Category Filter Controls */}
      <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {/* Keyword Search */}
          <div className="flex items-center gap-2 bg-white border border-stone-200 rounded-lg px-2.5 py-1 w-full sm:w-64">
            <Search className="h-3.5 w-3.5 text-stone-400" />
            <input
              type="text"
              placeholder="Search reports or formulas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-transparent text-xs text-stone-800 placeholder-stone-400 focus:outline-none w-full"
            />
          </div>

          {/* Category Selector (Catalog View only) */}
          {subTab === 'CATALOG' && (
            <div className="flex items-center gap-1 bg-white border border-stone-200 rounded-lg p-1 overflow-x-auto">
              {(
                [
                  { id: 'ALL', label: 'All Categories' },
                  { id: 'WORKFORCE', label: 'Workforce' },
                  { id: 'ATTENDANCE', label: 'Attendance' },
                  { id: 'LEAVE_REQUESTS', label: 'Leave & Requests' },
                  { id: 'PERFORMANCE', label: 'Performance' },
                ] as const
              ).map((catItem) => (
                <button
                  key={catItem.id}
                  onClick={() => setCategory(catItem.id)}
                  className={`px-2.5 py-1 font-medium rounded-md text-xs transition-colors whitespace-nowrap ${
                    category === catItem.id
                      ? 'bg-stone-900 text-white'
                      : 'text-stone-600 hover:bg-stone-100'
                  }`}
                >
                  {catItem.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600" />
            <span>{error}</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => loadData()}>
            Retry
          </Button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-48 rounded-xl border border-stone-200 bg-white p-5 animate-pulse flex flex-col justify-between"
            >
              <div className="h-4 bg-stone-200 rounded w-1/3"></div>
              <div className="h-12 bg-stone-100 rounded w-full"></div>
              <div className="h-4 bg-stone-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      )}

      {/* SUB-VIEW 1: CATALOG OF REPORTS */}
      {!loading && subTab === 'CATALOG' && (
        <div className="space-y-6">
          {catalog.length === 0 ? (
            <div className="rounded-xl border border-stone-200 bg-white p-8 text-center text-xs text-stone-400">
              No reports match your selected category or search query.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {catalog.map((item) => (
                <div
                  key={item.key}
                  className="rounded-xl border border-stone-200 bg-white p-5 flex flex-col justify-between hover:border-amber-400 hover:shadow-sm transition-all"
                >
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {renderCategoryIcon(item.category)}
                        <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                          {item.key}
                        </span>
                      </div>
                      <span className="rounded bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-600 uppercase">
                        {item.category.replace('_', ' ')}
                      </span>
                    </div>

                    {/* Title & Description */}
                    <div>
                      <h3 className="text-sm font-bold text-stone-900 leading-snug">
                        {item.title}
                      </h3>
                      <p className="text-xs text-stone-500 mt-1 line-clamp-2 leading-relaxed">
                        {item.description}
                      </p>
                    </div>

                    {/* Metric Formulas Summary */}
                    <div className="rounded-lg bg-stone-50 p-2.5 space-y-1.5 text-[11px] border border-stone-100">
                      <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide block">
                        Core Metric Definitions
                      </span>
                      {item.metricDefinitions.map((m) => (
                        <div key={m.code} className="leading-tight">
                          <span className="font-semibold text-stone-700">{m.name}</span>:{' '}
                          <span className="text-stone-500 italic">{m.formula}</span>
                        </div>
                      ))}
                    </div>

                    {/* Filters & Freshness Badges */}
                    <div className="space-y-1 text-[11px] text-stone-500">
                      <div>
                        <span className="font-medium text-stone-600">Filters:</span>{' '}
                        {item.supportedFilters.slice(0, 4).join(', ')}
                        {item.supportedFilters.length > 4 ? '...' : ''}
                      </div>
                      <div className="flex items-center gap-1.5 text-stone-400 text-[10px]">
                        <Clock className="h-3 w-3" />
                        <span>{item.dataFreshness}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="pt-4 mt-3 border-t border-stone-100 flex items-center justify-between gap-2">
                    <button
                      onClick={() => {
                        setTargetCatalogItem(item);
                        setSaveName(`${item.title} (Preset)`);
                        setSaveDesc(`Preset configuration for ${item.title}`);
                        setSaveConfigJson('{}');
                        setSaveModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-900 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" /> Save Preset
                    </button>
                    <span className="text-[10px] text-stone-400">
                      Roles: {item.allowedRoles.join(', ')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUB-VIEW 2: SAVED REPORTS */}
      {!loading && subTab === 'SAVED' && (
        <div className="space-y-6">
          {savedReports.length === 0 ? (
            <div className="rounded-xl border border-stone-200 bg-white p-8 text-center text-xs text-stone-400">
              You have no saved report definitions yet. Explore the Catalog to save customized
              filter presets.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-stone-500">
                    <th className="py-3 px-4">Preset Name</th>
                    <th className="py-3 px-4">Report Key</th>
                    <th className="py-3 px-4">Configured Filters</th>
                    <th className="py-3 px-4">Last Updated</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {savedReports.map((saved) => (
                    <tr key={saved.id} className="hover:bg-stone-50 transition-colors">
                      <td className="py-3 px-4 font-semibold text-stone-900">
                        {saved.name}
                        {saved.description && (
                          <span className="block font-normal text-[11px] text-stone-400">
                            {saved.description}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-amber-700">
                        {saved.reportKey}
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-stone-500 max-w-xs truncate">
                        {JSON.stringify(saved.filterConfig)}
                      </td>
                      <td className="py-3 px-4 text-stone-500 text-[11px]">
                        {new Date(saved.updatedAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleExecute(saved.id)}
                          disabled={executingId === saved.id}
                          leftIcon={
                            <Play
                              className={`h-3 w-3 ${executingId === saved.id ? 'animate-spin' : ''}`}
                            />
                          }
                        >
                          Execute
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDelete(saved.id)}
                          leftIcon={<Trash2 className="h-3 w-3 text-rose-600" />}
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Dynamic Execution Output Card */}
          {executionResult && (
            <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-stone-900">
                      Live Execution: {executionResult.savedReport.name}
                    </h3>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                      Authoritative Scope: {executionResult.scopeType}
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 mt-0.5">
                    {executionResult.catalogItem.title} • Executed at{' '}
                    {new Date(executionResult.executedAt).toLocaleTimeString()}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setExecutionResult(null)}>
                  Close
                </Button>
              </div>

              {/* Dynamic JSON Output Inspector */}
              <div className="rounded-lg bg-stone-900 p-4 text-[11px] font-mono text-emerald-400 overflow-x-auto max-h-96">
                <pre>{JSON.stringify(executionResult.data, null, 2)}</pre>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Save Preset Modal */}
      {saveModalOpen && targetCatalogItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="text-base font-bold text-stone-900">
                Save Report Preset ({targetCatalogItem.key})
              </h3>
              <button
                onClick={() => setSaveModalOpen(false)}
                className="text-stone-400 hover:text-stone-700 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            {saveError && (
              <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800">
                {saveError}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-stone-700 mb-1">Preset Title</label>
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-xs text-stone-900 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-stone-700 mb-1">Description</label>
                <input
                  type="text"
                  value={saveDesc}
                  onChange={(e) => setSaveDesc(e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-xs text-stone-900 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-stone-700">
                    Safe Parameterized Filters (JSON)
                  </label>
                  <span className="text-[10px] text-stone-400">
                    Allowed: {targetCatalogItem.supportedFilters.join(', ')}
                  </span>
                </div>
                <textarea
                  rows={4}
                  value={saveConfigJson}
                  onChange={(e) => setSaveConfigJson(e.target.value)}
                  className="w-full font-mono text-xs rounded-lg border border-stone-200 p-3 text-stone-900 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-stone-100 flex items-center justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setSaveModalOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSaveReport}>
                Save Definition
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
