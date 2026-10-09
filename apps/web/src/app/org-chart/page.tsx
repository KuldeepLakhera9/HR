'use client';

import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import { AppShell } from '../../layouts/AppShell';
import { employeesApi, organizationApi } from '../../lib/api-client';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Avatar,
  Button,
  Drawer,
  Input,
} from '@hrms/ui';
import {
  Users,
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  MapPin,
  Briefcase,
  Search,
  ExternalLink,
  RefreshCw,
  GitFork,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Eye,
  Mail,
  Phone,
  Calendar,
  Focus,
  X,
  Filter,
  CheckCircle2,
  ListTree,
  FolderTree,
  Sparkles,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';

export interface OrgNode {
  id: string;
  name: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  employeeCode: string;
  designation: string;
  designationCode?: string;
  department: string;
  departmentId?: string | null;
  departmentCode?: string;
  branch: string;
  branchId?: string | null;
  status: string;
  workMode?: string;
  employmentType?: string;
  joiningDate?: string | null;
  workEmail?: string | null;
  phone?: string | null;
  profilePhoto?: string | null;
  avatarUrl?: string | null;
  managerId?: string | null;
  managerName?: string | null;
  directReportsCount: number;
  subordinates?: OrgNode[];
  children: OrgNode[];
}

// -----------------------------------------------------------------------------
// Interactive Tree Node Component
// -----------------------------------------------------------------------------

interface NodeCardProps {
  node: OrgNode;
  depth: number;
  isExpanded: boolean;
  isMatched: boolean;
  isCurrentMatch: boolean;
  onToggleExpand: (id: string) => void;
  onSelectProfile: (node: OrgNode) => void;
  onFocusNode: (id: string) => void;
}

function OrgChartNode({
  node,
  depth,
  isExpanded,
  isMatched,
  isCurrentMatch,
  onToggleExpand,
  onSelectProfile,
  onFocusNode,
}: NodeCardProps) {
  const reports = node.children || node.subordinates || [];
  const hasReports = reports.length > 0 || node.directReportsCount > 0;

  // Visual tiers: Executive (depth 0), Directors/Managers (depth 1), Leads (depth 2), Team Members (depth 3+)
  const isExecutive = depth === 0;
  const isDirector = depth === 1;

  return (
    <div
      id={`org-node-${node.id}`}
      className={`relative z-10 w-80 rounded-2xl border transition-all duration-200 shadow-xs hover:shadow-lg ${
        isCurrentMatch
          ? 'ring-4 ring-amber-500 border-amber-500 scale-105 shadow-xl bg-amber-50/90'
          : isMatched
            ? 'ring-2 ring-amber-400/70 border-amber-400 bg-amber-50/50'
            : isExecutive
              ? 'bg-gradient-to-br from-amber-950 via-stone-900 to-amber-900 text-white border-amber-700/60 ring-2 ring-amber-500/20'
              : isDirector
                ? 'bg-stone-900 text-stone-100 border-stone-800'
                : 'bg-white text-stone-900 border-stone-200/90 hover:border-amber-300'
      } p-4 text-left select-none`}
    >
      {/* Node Header: Avatar & Core Information */}
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => onSelectProfile(node)}
          className="relative group focus:outline-none"
          title="Click to view quick profile"
        >
          <Avatar
            name={node.name}
            src={node.profilePhoto || node.avatarUrl || undefined}
            size="md"
            status={node.status === 'ACTIVE' ? 'online' : 'away'}
          />
          <span className="absolute inset-0 rounded-full bg-amber-950/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
            <Eye className="h-3.5 w-3.5 text-white drop-shadow" />
          </span>
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1.5">
            <button
              type="button"
              onClick={() => onSelectProfile(node)}
              className="text-left font-bold text-sm truncate tracking-tight hover:underline focus:outline-none"
              title={node.name}
            >
              {node.name}
            </button>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold shrink-0 ${
                isExecutive || isDirector
                  ? 'bg-white/15 text-stone-200'
                  : 'bg-stone-100 text-stone-600'
              }`}
            >
              {node.employeeCode}
            </span>
          </div>

          <p
            className={`text-xs font-medium truncate mt-0.5 ${
              isExecutive || isDirector ? 'text-amber-200/90' : 'text-stone-600'
            }`}
          >
            {node.designation}
          </p>

          {/* Department & Branch Meta */}
          <div className="flex items-center gap-2 mt-2 text-[11px] flex-wrap">
            <span
              className={`flex items-center gap-1 truncate ${
                isExecutive || isDirector ? 'text-stone-300' : 'text-stone-500'
              }`}
            >
              <Building2 className="h-3 w-3 shrink-0 text-amber-500" />
              {node.department}
            </span>
            <span
              className={`flex items-center gap-1 truncate ${
                isExecutive || isDirector ? 'text-stone-300' : 'text-stone-500'
              }`}
            >
              <MapPin className="h-3 w-3 shrink-0 text-amber-500" />
              {node.branch}
            </span>
          </div>
        </div>
      </div>

      {/* Node Actions Footer */}
      <div
        className={`mt-3 pt-2.5 border-t flex items-center justify-between text-xs ${
          isExecutive || isDirector ? 'border-white/10' : 'border-stone-100'
        }`}
      >
        <div className="flex items-center gap-1.5">
          {hasReports ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand(node.id);
              }}
              className={`flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full transition-all cursor-pointer ${
                isExecutive || isDirector
                  ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-200'
                  : 'bg-amber-50 hover:bg-amber-100 text-amber-800'
              }`}
              title={isExpanded ? 'Collapse reporting team' : 'Expand reporting team'}
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              <span>
                {node.directReportsCount || reports.length}{' '}
                {(node.directReportsCount || reports.length) === 1 ? 'report' : 'reports'}
              </span>
            </button>
          ) : (
            <span
              className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                isExecutive || isDirector
                  ? 'bg-white/5 text-stone-400'
                  : 'bg-stone-50 text-stone-400'
              }`}
            >
              Individual Contributor
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {hasReports && (
            <button
              type="button"
              onClick={() => onFocusNode(node.id)}
              className={`p-1 rounded-lg transition-colors ${
                isExecutive || isDirector
                  ? 'text-stone-300 hover:text-white hover:bg-white/10'
                  : 'text-stone-500 hover:text-stone-800 hover:bg-stone-100'
              }`}
              title="Focus view on this manager's sub-tree"
            >
              <Focus className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => onSelectProfile(node)}
            className={`flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg transition-colors ${
              isExecutive || isDirector
                ? 'text-amber-200 hover:text-white hover:bg-white/10'
                : 'text-amber-800 hover:text-amber-900 hover:bg-amber-50'
            }`}
            title="Open quick profile preview"
          >
            <span>Quick View</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Recursive Tree Branch Renderer
// -----------------------------------------------------------------------------

interface BranchProps {
  node: OrgNode;
  depth: number;
  expandedIds: Set<string>;
  matchedIds: Set<string>;
  currentMatchId: string | null;
  onToggleExpand: (id: string) => void;
  onSelectProfile: (node: OrgNode) => void;
  onFocusNode: (id: string) => void;
}

function OrgChartBranch({
  node,
  depth,
  expandedIds,
  matchedIds,
  currentMatchId,
  onToggleExpand,
  onSelectProfile,
  onFocusNode,
}: BranchProps) {
  const isExpanded = expandedIds.has(node.id);
  const reports = node.children || node.subordinates || [];
  const hasReports = reports.length > 0;

  return (
    <div className="flex flex-col items-center">
      <OrgChartNode
        node={node}
        depth={depth}
        isExpanded={isExpanded}
        isMatched={matchedIds.has(node.id)}
        isCurrentMatch={currentMatchId === node.id}
        onToggleExpand={onToggleExpand}
        onSelectProfile={onSelectProfile}
        onFocusNode={onFocusNode}
      />

      {/* Children Connectors & Sub-tree - ONLY rendered in DOM when expanded for performance */}
      {hasReports && isExpanded && (
        <div className="flex flex-col items-center">
          {/* Vertical stem from parent */}
          <div className="w-0.5 h-6 bg-stone-300"></div>

          {/* Children container */}
          <div className="flex items-start justify-center gap-8 relative pt-4">
            {reports.length > 1 && (
              <div
                className="absolute top-0 h-0.5 bg-stone-300 transition-all duration-300"
                style={{
                  left: `${100 / (reports.length * 2)}%`,
                  right: `${100 / (reports.length * 2)}%`,
                }}
              />
            )}

            {reports.map((child) => (
              <div key={child.id} className="relative flex flex-col items-center">
                {/* Vertical stem into child */}
                <div className="w-0.5 h-4 bg-stone-300 -mt-4 mb-0"></div>
                <OrgChartBranch
                  node={child}
                  depth={depth + 1}
                  expandedIds={expandedIds}
                  matchedIds={matchedIds}
                  currentMatchId={currentMatchId}
                  onToggleExpand={onToggleExpand}
                  onSelectProfile={onSelectProfile}
                  onFocusNode={onFocusNode}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Main Organization Chart Page Component
// -----------------------------------------------------------------------------

export default function OrgChartPage() {
  const [treeData, setTreeData] = useState<OrgNode[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [orgOverview, setOrgOverview] = useState<any>(null);

  // Filters & Search
  const [selectedDept, setSelectedDept] = useState<string>('');
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(0);

  // Tree Navigation & View State
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [focusedRootId, setFocusedRootId] = useState<string | null>(null);
  const [selectedProfileNode, setSelectedProfileNode] = useState<OrgNode | null>(null);
  const [viewMode, setViewMode] = useState<'tree' | 'directory'>('tree');
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);

  // Flat lookup of all nodes for fast searching and ancestor path retrieval
  const nodeLookup = useMemo(() => {
    const map = new Map<string, OrgNode>();
    const parentMap = new Map<string, string>(); // childId -> parentId

    function traverse(nodes: OrgNode[], parentId?: string) {
      for (const n of nodes) {
        map.set(n.id, n);
        if (parentId) parentMap.set(n.id, parentId);
        const children = n.children || n.subordinates || [];
        if (children.length > 0) {
          traverse(children, n.id);
        }
      }
    }
    traverse(treeData);
    return { nodes: map, parents: parentMap };
  }, [treeData]);

  // Load Organization & Hierarchy Data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [chartRes, deptRes, branchRes, overviewRes] = await Promise.all([
        employeesApi.getOrgChart({
          departmentId: selectedDept || undefined,
          branchId: selectedBranch || undefined,
        }),
        organizationApi.getDepartments({ status: 'active', limit: 100 }),
        organizationApi.getBranches({ status: 'active', limit: 100 }),
        organizationApi.getOverview().catch(() => null),
      ]);

      const data = chartRes || [];
      setTreeData(data);
      setDepartments(deptRes || []);
      setBranches(branchRes || []);
      if (overviewRes) setOrgOverview(overviewRes);

      // Default expansion: expand root nodes and level 1 directors for optimal performance
      const initialExpanded = new Set<string>();
      data.forEach((root: OrgNode) => {
        initialExpanded.add(root.id);
        const children = root.children || root.subordinates || [];
        children.forEach((c) => initialExpanded.add(c.id));
      });
      setExpandedIds(initialExpanded);
    } catch (err) {
      console.error('Failed to load organization chart:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedDept, selectedBranch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Compute matched nodes based on search query
  const matchedNodes = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    const results: OrgNode[] = [];

    nodeLookup.nodes.forEach((node) => {
      if (
        node.name?.toLowerCase().includes(q) ||
        node.employeeCode?.toLowerCase().includes(q) ||
        node.designation?.toLowerCase().includes(q) ||
        node.department?.toLowerCase().includes(q)
      ) {
        results.push(node);
      }
    });
    return results;
  }, [searchQuery, nodeLookup.nodes]);

  const matchedIdsSet = useMemo(() => {
    return new Set(matchedNodes.map((m) => m.id));
  }, [matchedNodes]);

  const currentMatchedNode = matchedNodes[currentMatchIndex] || null;

  // Auto-expand ancestors and scroll to matched node
  const navigateToMatch = useCallback(
    (index: number) => {
      if (matchedNodes.length === 0) return;
      const target = matchedNodes[index];
      if (!target) return;

      // Expand all ancestors up to root
      setExpandedIds((prev) => {
        const next = new Set(prev);
        let currId: string | undefined = target.id;
        while (currId) {
          const parentId = nodeLookup.parents.get(currId);
          if (parentId) {
            next.add(parentId);
          }
          currId = parentId;
        }
        return next;
      });

      // Scroll into view
      setTimeout(() => {
        const el = document.getElementById(`org-node-${target.id}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        }
      }, 100);
    },
    [matchedNodes, nodeLookup.parents],
  );

  useEffect(() => {
    if (matchedNodes.length > 0) {
      setCurrentMatchIndex(0);
      navigateToMatch(0);
    }
  }, [matchedNodes, navigateToMatch]);

  const handleNextMatch = () => {
    if (matchedNodes.length === 0) return;
    const nextIdx = (currentMatchIndex + 1) % matchedNodes.length;
    setCurrentMatchIndex(nextIdx);
    navigateToMatch(nextIdx);
  };

  const handlePrevMatch = () => {
    if (matchedNodes.length === 0) return;
    const prevIdx = (currentMatchIndex - 1 + matchedNodes.length) % matchedNodes.length;
    setCurrentMatchIndex(prevIdx);
    navigateToMatch(prevIdx);
  };

  // Toggle single node expansion
  const handleToggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Expand all nodes
  const handleExpandAll = () => {
    const all = new Set<string>();
    nodeLookup.nodes.forEach((node, id) => {
      const children = node.children || node.subordinates || [];
      if (children.length > 0) {
        all.add(id);
      }
    });
    setExpandedIds(all);
  };

  // Collapse all nodes except roots
  const handleCollapseAll = () => {
    setExpandedIds(new Set());
  };

  // Expand to Level 2
  const handleExpandLevel2 = () => {
    const next = new Set<string>();
    treeData.forEach((root) => {
      next.add(root.id);
      const level1 = root.children || root.subordinates || [];
      level1.forEach((child) => next.add(child.id));
    });
    setExpandedIds(next);
  };

  // Focus sub-tree
  const handleFocusNode = (id: string) => {
    setFocusedRootId(id);
    setExpandedIds((prev) => new Set(prev).add(id));
  };

  // Active display tree roots (either focused node or original treeData)
  const displayRoots = useMemo(() => {
    if (focusedRootId && nodeLookup.nodes.has(focusedRootId)) {
      return [nodeLookup.nodes.get(focusedRootId)!];
    }
    return treeData;
  }, [focusedRootId, nodeLookup.nodes, treeData]);

  // Compute total headcounts and managers for executive overview
  const stats = useMemo(() => {
    const total = nodeLookup.nodes.size;
    let managersCount = 0;
    nodeLookup.nodes.forEach((n) => {
      if ((n.children || n.subordinates || []).length > 0) {
        managersCount++;
      }
    });
    return {
      totalEmployees: total,
      managersCount,
      departmentsCount: departments.length,
      branchesCount: branches.length,
    };
  }, [nodeLookup.nodes, departments, branches]);

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Top Header & Executive Overview */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-amber-900/10 border border-amber-900/20 flex items-center justify-center text-amber-800">
                <GitFork className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-stone-900 tracking-tight">
                  Organization Hierarchy
                </h1>
                <p className="text-xs md:text-sm text-stone-500">
                  {orgOverview?.name || 'Company'} reporting structure, department leadership, and
                  team relationships.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="flex items-center gap-3 bg-white px-4 py-2.5 rounded-2xl border border-stone-200/80 shadow-xs text-xs">
            <div className="flex items-center gap-1.5">
              <Users className="h-4 w-4 text-amber-700" />
              <span className="font-semibold text-stone-800">{stats.totalEmployees}</span>
              <span className="text-stone-500">Employees</span>
            </div>
            <div className="h-3 w-px bg-stone-200" />
            <div className="flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-amber-700" />
              <span className="font-semibold text-stone-800">{stats.departmentsCount}</span>
              <span className="text-stone-500">Departments</span>
            </div>
            <div className="h-3 w-px bg-stone-200" />
            <div className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-amber-700" />
              <span className="font-semibold text-stone-800">{stats.branchesCount}</span>
              <span className="text-stone-500">Branches</span>
            </div>
            <div className="h-3 w-px bg-stone-200" />
            <div className="flex items-center gap-1.5">
              <Briefcase className="h-4 w-4 text-amber-700" />
              <span className="font-semibold text-stone-800">{stats.managersCount}</span>
              <span className="text-stone-500">Managers</span>
            </div>
          </div>
        </div>

        {/* Toolbar & Controls Bar */}
        <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          {/* Left: Search & Filter inputs */}
          <div className="flex flex-wrap items-center gap-3 flex-1">
            {/* Search Input with Match Navigator */}
            <div className="relative min-w-[260px] flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, code, designation..."
                className="w-full pl-9 pr-24 py-1.5 text-xs font-medium rounded-xl border border-stone-200 bg-stone-50/50 text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-800/20 focus:border-amber-800"
              />
              {searchQuery && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[11px] font-mono text-stone-500 bg-white px-1.5 py-0.5 rounded border border-stone-200">
                  <span>
                    {matchedNodes.length > 0
                      ? `${currentMatchIndex + 1}/${matchedNodes.length}`
                      : '0'}
                  </span>
                  {matchedNodes.length > 1 && (
                    <div className="flex items-center ml-1 gap-0.5">
                      <button
                        type="button"
                        onClick={handlePrevMatch}
                        className="hover:text-amber-800 p-0.5"
                        title="Previous match"
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={handleNextMatch}
                        className="hover:text-amber-800 p-0.5"
                        title="Next match"
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="hover:text-stone-700 ml-1"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>

            {/* Department Filter */}
            <div className="flex items-center gap-1.5 min-w-[160px]">
              <Building2 className="h-3.5 w-3.5 text-stone-400 shrink-0" />
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="w-full text-xs font-medium rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-800/20 focus:border-amber-800"
              >
                <option value="">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} {d.code ? `(${d.code})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Branch Filter */}
            <div className="flex items-center gap-1.5 min-w-[150px]">
              <MapPin className="h-3.5 w-3.5 text-stone-400 shrink-0" />
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="w-full text-xs font-medium rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-800/20 focus:border-amber-800"
              >
                <option value="">All Branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} {b.city ? `(${b.city})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {(selectedDept || selectedBranch) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedDept('');
                  setSelectedBranch('');
                }}
                className="text-xs text-amber-800 hover:text-amber-900 h-8"
              >
                Clear
              </Button>
            )}
          </div>

          {/* Right: Expand/Collapse & Zoom & View Mode */}
          <div className="flex items-center gap-2 shrink-0">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-stone-100 p-0.5 rounded-xl border border-stone-200">
              <button
                type="button"
                onClick={() => setViewMode('tree')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  viewMode === 'tree'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
                title="Tree view canvas"
              >
                <FolderTree className="h-3.5 w-3.5" />
                <span>Tree</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('directory')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  viewMode === 'directory'
                    ? 'bg-white text-stone-900 shadow-xs'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
                title="Directory list view"
              >
                <ListTree className="h-3.5 w-3.5" />
                <span>Directory</span>
              </button>
            </div>

            {/* Expansion shortcuts */}
            <div className="hidden sm:flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExpandLevel2}
                className="text-xs h-8 text-stone-600"
                title="Expand up to Level 2 (Managers & Directors)"
              >
                Level 2
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExpandAll}
                className="text-xs h-8 text-stone-600"
                title="Expand all branches"
              >
                Expand All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCollapseAll}
                className="text-xs h-8 text-stone-600"
                title="Collapse to top leaders"
              >
                Collapse
              </Button>
            </div>

            {/* Zoom Controls (Tree view only) */}
            {viewMode === 'tree' && (
              <div className="flex items-center gap-1 border-l border-stone-200 pl-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setZoomLevel((z) => Math.max(0.6, z - 0.1))}
                  className="h-8 w-8 p-0 text-stone-600"
                  title="Zoom Out"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </Button>
                <span className="text-[11px] font-mono text-stone-500 w-9 text-center">
                  {Math.round(zoomLevel * 100)}%
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setZoomLevel((z) => Math.min(1.4, z + 0.1))}
                  className="h-8 w-8 p-0 text-stone-600"
                  title="Zoom In"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setZoomLevel(1)}
                  className="h-8 w-8 p-0 text-stone-600"
                  title="Reset Zoom"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              className="h-8 gap-1 text-stone-600"
              title="Refresh hierarchy data"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Focused Sub-Tree Breadcrumb Header */}
        {focusedRootId && nodeLookup.nodes.has(focusedRootId) && (
          <div className="flex items-center justify-between bg-amber-50 border border-amber-200 px-4 py-2.5 rounded-2xl text-xs">
            <div className="flex items-center gap-2 text-amber-900 font-medium">
              <Focus className="h-4 w-4 text-amber-700" />
              <span>Viewing Sub-tree for:</span>
              <span className="font-bold">{nodeLookup.nodes.get(focusedRootId)?.name}</span>
              <span className="text-amber-700">
                ({nodeLookup.nodes.get(focusedRootId)?.designation})
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFocusedRootId(null)}
              className="h-7 text-xs bg-white text-amber-900 border-amber-300 hover:bg-amber-100"
            >
              Reset to Full Organization
            </Button>
          </div>
        )}

        {/* Main Content Area */}
        {loading ? (
          <div className="bg-white rounded-3xl border border-stone-200 p-24 flex flex-col items-center justify-center">
            <RefreshCw className="h-8 w-8 text-amber-700 animate-spin mb-3" />
            <h3 className="text-sm font-semibold text-stone-800">
              Assembling Organizational Chart
            </h3>
            <p className="text-xs text-stone-500 mt-1">
              Traversing management hierarchy and reporting relationships...
            </p>
          </div>
        ) : displayRoots.length === 0 ? (
          <div className="bg-white rounded-3xl border border-stone-200 p-24 flex flex-col items-center justify-center text-center max-w-lg mx-auto">
            <div className="h-12 w-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-800 mb-4">
              <Users className="h-6 w-6" />
            </div>
            <h3 className="text-base font-bold text-stone-900">No Hierarchy Matches</h3>
            <p className="text-xs text-stone-500 mt-1.5 max-w-sm">
              No employees matched the selected department or branch filters. Try resetting the
              filters to inspect other departments.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedDept('');
                setSelectedBranch('');
                setFocusedRootId(null);
              }}
              className="mt-4"
            >
              Reset All Filters
            </Button>
          </div>
        ) : viewMode === 'tree' ? (
          /* Tree View Interactive Canvas */
          <div className="bg-stone-50/80 border border-stone-200/90 rounded-3xl p-8 min-h-[600px] max-h-[820px] overflow-auto flex items-start justify-center shadow-inner relative">
            <div
              className="transition-transform duration-200 origin-top flex flex-col items-center gap-12 pb-20 pt-4"
              style={{ transform: `scale(${zoomLevel})` }}
            >
              {displayRoots.map((rootNode) => (
                <OrgChartBranch
                  key={rootNode.id}
                  node={rootNode}
                  depth={0}
                  expandedIds={expandedIds}
                  matchedIds={matchedIdsSet}
                  currentMatchId={currentMatchedNode?.id || null}
                  onToggleExpand={handleToggleExpand}
                  onSelectProfile={(node) => setSelectedProfileNode(node)}
                  onFocusNode={handleFocusNode}
                />
              ))}
            </div>
          </div>
        ) : (
          /* Directory List View (Alternative high-density view for enterprise) */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from(nodeLookup.nodes.values())
              .filter((n) => {
                if (selectedDept && n.departmentId !== selectedDept) return false;
                if (selectedBranch && n.branchId !== selectedBranch) return false;
                if (
                  searchQuery &&
                  !n.name?.toLowerCase().includes(searchQuery.toLowerCase()) &&
                  !n.employeeCode?.toLowerCase().includes(searchQuery.toLowerCase()) &&
                  !n.designation?.toLowerCase().includes(searchQuery.toLowerCase())
                ) {
                  return false;
                }
                return true;
              })
              .map((employee) => (
                <div
                  key={employee.id}
                  className="bg-white rounded-2xl border border-stone-200 p-4 shadow-xs hover:border-amber-300 hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div className="flex items-start gap-3">
                    <Avatar
                      name={employee.name}
                      src={employee.profilePhoto || employee.avatarUrl || undefined}
                      size="md"
                      status={employee.status === 'ACTIVE' ? 'online' : 'away'}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <h4 className="text-sm font-bold text-stone-900 truncate">
                          {employee.name}
                        </h4>
                        <span className="text-[10px] font-mono bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded font-semibold">
                          {employee.employeeCode}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-stone-600 truncate mt-0.5">
                        {employee.designation}
                      </p>
                      <div className="flex items-center gap-2 mt-2 text-[11px] text-stone-500">
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3 text-amber-700" />
                          {employee.department}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-amber-700" />
                          {employee.branch}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-xs">
                    <div className="text-[11px] text-stone-500">
                      {employee.managerName ? (
                        <span>
                          Reports to:{' '}
                          <strong className="text-stone-700">{employee.managerName}</strong>
                        </span>
                      ) : (
                        <span className="text-amber-800 font-semibold">Executive Level</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedProfileNode(employee)}
                        className="text-amber-800 font-medium hover:underline text-xs"
                      >
                        Quick View
                      </button>
                      <Link
                        href={`/employees/${employee.id}`}
                        className="text-stone-600 hover:text-stone-900"
                        title="View Full Profile"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* Quick Profile Flyout Drawer */}
        <Drawer
          isOpen={!!selectedProfileNode}
          onClose={() => setSelectedProfileNode(null)}
          title="Employee Profile Card"
        >
          {selectedProfileNode && (
            <div className="space-y-6">
              {/* Profile Card Header */}
              <div className="flex items-start gap-4 pb-4 border-b border-stone-100">
                <Avatar
                  name={selectedProfileNode.name}
                  src={
                    selectedProfileNode.profilePhoto || selectedProfileNode.avatarUrl || undefined
                  }
                  size="lg"
                  status={selectedProfileNode.status === 'ACTIVE' ? 'online' : 'away'}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-stone-900 truncate">
                      {selectedProfileNode.name}
                    </h3>
                    <Badge
                      variant={selectedProfileNode.status === 'ACTIVE' ? 'success' : 'default'}
                      className="text-[10px]"
                    >
                      {selectedProfileNode.status}
                    </Badge>
                  </div>
                  <p className="text-xs font-semibold text-amber-800 mt-0.5">
                    {selectedProfileNode.designation}
                  </p>
                  <p className="text-xs font-mono text-stone-500 mt-0.5">
                    {selectedProfileNode.employeeCode}
                  </p>
                </div>
              </div>

              {/* Department & Assignment */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-400">
                  Employment Details
                </h4>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-100">
                    <span className="text-[11px] text-stone-500 flex items-center gap-1">
                      <Building2 className="h-3 w-3 text-amber-700" /> Department
                    </span>
                    <p className="font-semibold text-stone-900 mt-1 truncate">
                      {selectedProfileNode.department}
                    </p>
                  </div>

                  <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-100">
                    <span className="text-[11px] text-stone-500 flex items-center gap-1">
                      <MapPin className="h-3 w-3 text-amber-700" /> Branch
                    </span>
                    <p className="font-semibold text-stone-900 mt-1 truncate">
                      {selectedProfileNode.branch}
                    </p>
                  </div>

                  <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-100">
                    <span className="text-[11px] text-stone-500 flex items-center gap-1">
                      <Briefcase className="h-3 w-3 text-amber-700" /> Work Mode
                    </span>
                    <p className="font-semibold text-stone-900 mt-1">
                      {selectedProfileNode.workMode || 'OFFICE'}
                    </p>
                  </div>

                  <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-100">
                    <span className="text-[11px] text-stone-500 flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-amber-700" /> Joined
                    </span>
                    <p className="font-semibold text-stone-900 mt-1">
                      {selectedProfileNode.joiningDate
                        ? new Date(selectedProfileNode.joiningDate).toLocaleDateString()
                        : 'Active'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Reporting Hierarchy Details */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-400">
                  Hierarchy & Reporting
                </h4>

                {/* Manager */}
                <div className="bg-stone-50 p-3 rounded-xl border border-stone-100">
                  <span className="text-[11px] font-medium text-stone-500">
                    Reports Directly To:
                  </span>
                  {selectedProfileNode.managerId &&
                  nodeLookup.nodes.has(selectedProfileNode.managerId) ? (
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-2.5">
                        <Avatar
                          name={nodeLookup.nodes.get(selectedProfileNode.managerId)!.name}
                          src={
                            nodeLookup.nodes.get(selectedProfileNode.managerId)!.profilePhoto ||
                            undefined
                          }
                          size="sm"
                        />
                        <div>
                          <p className="text-xs font-bold text-stone-900">
                            {nodeLookup.nodes.get(selectedProfileNode.managerId)!.name}
                          </p>
                          <p className="text-[11px] text-stone-500">
                            {nodeLookup.nodes.get(selectedProfileNode.managerId)!.designation}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const mgr = nodeLookup.nodes.get(selectedProfileNode.managerId!);
                          if (mgr) setSelectedProfileNode(mgr);
                        }}
                        className="text-xs font-semibold text-amber-800 hover:underline"
                      >
                        Inspect
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs font-semibold text-stone-700 mt-1">
                      Executive Leadership (No superior manager assigned)
                    </p>
                  )}
                </div>

                {/* Direct Reports */}
                <div className="bg-stone-50 p-3 rounded-xl border border-stone-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-medium text-stone-500">Direct Reports</span>
                    <span className="text-xs font-bold font-mono text-stone-800">
                      {
                        (selectedProfileNode.children || selectedProfileNode.subordinates || [])
                          .length
                      }
                    </span>
                  </div>

                  {(selectedProfileNode.children || selectedProfileNode.subordinates || []).length >
                  0 ? (
                    <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                      {(selectedProfileNode.children || selectedProfileNode.subordinates || []).map(
                        (report) => (
                          <div
                            key={report.id}
                            className="flex items-center justify-between p-1.5 rounded-lg bg-white border border-stone-100 hover:border-amber-200 transition-colors"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Avatar
                                name={report.name}
                                src={report.profilePhoto || undefined}
                                size="sm"
                              />
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-stone-900 truncate">
                                  {report.name}
                                </p>
                                <p className="text-[10px] text-stone-500 truncate">
                                  {report.designation}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSelectedProfileNode(report)}
                              className="text-[11px] text-amber-800 font-medium hover:underline shrink-0 ml-2"
                            >
                              View
                            </button>
                          </div>
                        ),
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-stone-400 italic">No direct reports assigned</p>
                  )}
                </div>
              </div>

              {/* Contact Information */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-stone-400">
                  Contact Coordinates
                </h4>
                <div className="space-y-2 text-xs">
                  {selectedProfileNode.workEmail && (
                    <a
                      href={`mailto:${selectedProfileNode.workEmail}`}
                      className="flex items-center gap-2 p-2 rounded-xl bg-stone-50 hover:bg-stone-100 text-stone-700 transition-colors"
                    >
                      <Mail className="h-4 w-4 text-amber-700 shrink-0" />
                      <span className="truncate">{selectedProfileNode.workEmail}</span>
                    </a>
                  )}
                  {selectedProfileNode.phone && (
                    <a
                      href={`tel:${selectedProfileNode.phone}`}
                      className="flex items-center gap-2 p-2 rounded-xl bg-stone-50 hover:bg-stone-100 text-stone-700 transition-colors"
                    >
                      <Phone className="h-4 w-4 text-amber-700 shrink-0" />
                      <span className="truncate">{selectedProfileNode.phone}</span>
                    </a>
                  )}
                </div>
              </div>

              {/* Actions Footer */}
              <div className="pt-4 border-t border-stone-100 space-y-2">
                <Link
                  href={`/employees/${selectedProfileNode.id}`}
                  className="w-full flex items-center justify-center gap-2 bg-amber-900 hover:bg-amber-800 text-white font-medium text-xs py-2.5 rounded-xl transition-colors shadow-xs"
                >
                  <span>View Full Employee Profile</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>

                {(selectedProfileNode.children || selectedProfileNode.subordinates || []).length >
                  0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      handleFocusNode(selectedProfileNode.id);
                      setSelectedProfileNode(null);
                    }}
                    className="w-full text-xs text-stone-700 gap-1.5"
                  >
                    <Focus className="h-3.5 w-3.5" />
                    <span>Focus Chart on This Team</span>
                  </Button>
                )}
              </div>
            </div>
          )}
        </Drawer>
      </div>
    </AppShell>
  );
}
