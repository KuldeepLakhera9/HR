'use client';

import React, { useEffect, useState } from 'react';
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
} from '@hrms/ui';
import {
  Users,
  Building2,
  ChevronDown,
  ChevronRight,
  MapPin,
  Briefcase,
  Layers,
  Search,
  ExternalLink,
  RefreshCw,
  GitFork,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react';

interface OrgNode {
  id: string;
  name: string;
  employeeCode: string;
  designation: string;
  department: string;
  branch: string;
  status: string;
  profilePhoto?: string | null;
  directReportsCount: number;
  children: OrgNode[];
}

// Recursive Org Chart Node Component
function OrgChartNodeComponent({ node, depth = 0 }: { node: OrgNode; depth?: number }) {
  const [isExpanded, setIsExpanded] = useState<boolean>(depth < 2);
  const hasReports = node.children && node.children.length > 0;

  return (
    <div className="flex flex-col items-center">
      {/* Node Card */}
      <div
        className={`relative z-10 w-72 rounded-2xl border transition-all duration-200 shadow-xs hover:shadow-md ${
          depth === 0
            ? 'bg-amber-900/90 text-white border-amber-800 ring-2 ring-amber-500/20'
            : depth === 1
              ? 'bg-stone-900 text-stone-100 border-stone-800'
              : 'bg-white text-stone-900 border-stone-200/90 hover:border-amber-400'
        } p-4.5`}
      >
        <div className="flex items-start gap-3.5">
          <Avatar
            name={node.name}
            src={node.profilePhoto || undefined}
            size="md"
            status={node.status === 'ACTIVE' ? 'online' : 'away'}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1.5">
              <h4 className="text-sm font-bold truncate tracking-tight">{node.name}</h4>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold ${
                  depth <= 1 ? 'bg-white/10 text-stone-300' : 'bg-stone-100 text-stone-600'
                }`}
              >
                {node.employeeCode}
              </span>
            </div>
            <p
              className={`text-xs font-medium truncate mt-0.5 ${
                depth <= 1 ? 'text-stone-300' : 'text-stone-600'
              }`}
            >
              {node.designation}
            </p>
            <div className="flex items-center gap-2 mt-2 text-[11px]">
              <span
                className={`flex items-center gap-1 truncate ${
                  depth <= 1 ? 'text-stone-400' : 'text-stone-500'
                }`}
              >
                <Building2 className="h-3 w-3 shrink-0" />
                {node.department}
              </span>
              <span
                className={`flex items-center gap-1 truncate ${
                  depth <= 1 ? 'text-stone-400' : 'text-stone-500'
                }`}
              >
                <MapPin className="h-3 w-3 shrink-0" />
                {node.branch}
              </span>
            </div>
          </div>
        </div>

        {/* Card Footer Actions */}
        <div
          className={`mt-3 pt-2.5 border-t flex items-center justify-between text-xs ${
            depth <= 1 ? 'border-white/10' : 'border-stone-100'
          }`}
        >
          <div className="flex items-center gap-1.5">
            {hasReports ? (
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full transition-colors ${
                  depth <= 1
                    ? 'bg-white/15 hover:bg-white/25 text-amber-200'
                    : 'bg-amber-50 hover:bg-amber-100 text-amber-800'
                }`}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                <span>
                  {node.directReportsCount} {node.directReportsCount === 1 ? 'report' : 'reports'}
                </span>
              </button>
            ) : (
              <span
                className={`text-[10px] font-medium ${
                  depth <= 1 ? 'text-stone-400' : 'text-stone-400'
                }`}
              >
                Individual Contributor
              </span>
            )}
          </div>

          <Link
            href={`/employees/${node.id}`}
            className={`flex items-center gap-1 text-[11px] font-medium transition-colors ${
              depth <= 1 ? 'text-stone-300 hover:text-white' : 'text-amber-800 hover:text-amber-900'
            }`}
          >
            <span>Profile</span>
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Children Connectors & Sub-tree */}
      {hasReports && isExpanded && (
        <div className="flex flex-col items-center">
          {/* Vertical stem from parent */}
          <div className="w-0.5 h-6 bg-stone-300"></div>

          {/* Children container */}
          <div className="flex items-start justify-center gap-6 relative pt-4">
            {node.children.length > 1 && (
              <div
                className="absolute top-0 h-0.5 bg-stone-300"
                style={{
                  left: '18%',
                  right: '18%',
                }}
              />
            )}

            {node.children.map((child) => (
              <div key={child.id} className="relative flex flex-col items-center">
                {/* Vertical stem into child */}
                <div className="w-0.5 h-4 bg-stone-300 -mt-4 mb-0"></div>
                <OrgChartNodeComponent node={child} depth={depth + 1} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrgChartPage() {
  const [treeData, setTreeData] = useState<OrgNode[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [selectedDept, setSelectedDept] = useState<string>('');
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [chartRes, deptRes, branchRes] = await Promise.all([
        employeesApi.getOrgChart({
          departmentId: selectedDept || undefined,
          branchId: selectedBranch || undefined,
        }),
        organizationApi.getDepartments(),
        organizationApi.getBranches(),
      ]);

      setTreeData(chartRes || []);
      setDepartments(deptRes || []);
      setBranches(branchRes || []);
    } catch (err) {
      console.error('Failed to load org chart:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedDept, selectedBranch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <GitFork className="h-6 w-6 text-amber-700" />
              <h1 className="text-xl md:text-2xl font-bold text-stone-900 tracking-tight">
                Organization Chart
              </h1>
            </div>
            <p className="text-xs md:text-sm text-stone-500 mt-1">
              Interactive structural hierarchy of executive leadership, management reporting lines,
              and teams.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setZoomLevel((z) => Math.max(0.7, z - 0.1))}
              className="gap-1 text-stone-600"
              title="Zoom Out"
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs font-mono font-medium text-stone-500 w-12 text-center">
              {Math.round(zoomLevel * 100)}%
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setZoomLevel((z) => Math.min(1.4, z + 0.1))}
              className="gap-1 text-stone-600"
              title="Zoom In"
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setZoomLevel(1)}
              className="gap-1 text-stone-600"
              title="Reset Zoom"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              className="gap-1.5 text-stone-600"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="bg-white p-4 rounded-2xl border border-stone-200/80 shadow-xs flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 min-w-48">
            <Building2 className="h-4 w-4 text-stone-400" />
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="w-full text-xs font-medium rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-800"
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 min-w-48">
            <MapPin className="h-4 w-4 text-stone-400" />
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="w-full text-xs font-medium rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-800"
            >
              <option value="">All Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.city})
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
              className="text-xs text-amber-800 hover:text-amber-900"
            >
              Clear Filters
            </Button>
          )}
        </div>

        {/* Interactive Chart Canvas */}
        <div className="bg-stone-50/70 border border-stone-200 rounded-3xl p-8 min-h-[550px] overflow-auto flex items-start justify-center shadow-inner relative">
          {loading ? (
            <div className="flex flex-col items-center justify-center my-32 space-y-3">
              <RefreshCw className="h-8 w-8 text-amber-700 animate-spin" />
              <p className="text-xs text-stone-500 font-medium">
                Assembling organizational hierarchy...
              </p>
            </div>
          ) : treeData.length === 0 ? (
            <div className="flex flex-col items-center justify-center my-32 text-center max-w-sm">
              <div className="h-12 w-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-800 mb-3">
                <Users className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-stone-800">No hierarchy records matched</h3>
              <p className="text-xs text-stone-500 mt-1">
                Try changing your department or branch filter to inspect other reporting structures.
              </p>
            </div>
          ) : (
            <div
              className="transition-transform duration-200 origin-top flex flex-col items-center gap-12 pb-16 pt-4"
              style={{ transform: `scale(${zoomLevel})` }}
            >
              {treeData.map((rootNode) => (
                <OrgChartNodeComponent key={rootNode.id} node={rootNode} depth={0} />
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
