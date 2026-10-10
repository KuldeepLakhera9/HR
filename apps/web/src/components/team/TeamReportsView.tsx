'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  KPICard,
  Button,
} from '@hrms/ui';
import {
  Clock,
  AlertTriangle,
  CheckSquare,
  CalendarCheck,
  Download,
  Filter,
  RotateCw,
  Search,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  FileSpreadsheet,
  AlertCircle,
  Building2,
  Users,
  Calendar,
  Briefcase,
  Home,
  MapPin,
  TrendingUp,
} from 'lucide-react';
import { managerApi } from '../../lib/api-client';

type ReportTabType = 'attendance' | 'exceptions' | 'approvals' | 'availability';

export const TeamReportsView: React.FC = () => {
  // Current active report tab
  const [activeReport, setActiveReport] = useState<ReportTabType>('attendance');

  // Common Filter State
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [startDate, setStartDate] = useState<string>(thirtyDaysAgo);
  const [endDate, setEndDate] = useState<string>(today);
  const [scope, setScope] = useState<'ALL' | 'DIRECT'>('ALL');
  const [employeeId, setEmployeeId] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(20);

  // Attendance Filters
  const [attendanceStatus, setAttendanceStatus] = useState<string>('ALL');
  const [attendanceMode, setAttendanceMode] = useState<string>('ALL');

  // Exception Filters
  const [exceptionType, setExceptionType] = useState<string>('ALL');
  const [exceptionSeverity, setExceptionSeverity] = useState<string>('ALL');
  const [exceptionStatus, setExceptionStatus] = useState<string>('ALL');

  // Approval Filters
  const [approvalType, setApprovalType] = useState<string>('ALL');
  const [approvalDecision, setApprovalDecision] = useState<string>('ALL');

  // Availability Filters
  const [minAvailabilityPct, setMinAvailabilityPct] = useState<string>('');

  // Async States
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<any>(null);

  // Team roster for employee dropdown
  const [teamMembers, setTeamMembers] = useState<
    Array<{ id: string; displayName: string; employeeCode: string }>
  >([]);

  // Fetch Team Members for Filter Dropdown
  useEffect(() => {
    async function loadTeamMembers() {
      try {
        const res = await managerApi.getTeamDirectory({ limit: 100 });
        if (res.data?.items) {
          setTeamMembers(
            res.data.items.map((m: any) => ({
              id: m.id,
              displayName: m.displayName,
              employeeCode: m.employeeCode,
            })),
          );
        }
      } catch {
        // Silently continue if team dropdown fails
      }
    }
    loadTeamMembers();
  }, []);

  // Preset Date Range Helpers
  const applyDatePreset = (preset: 'LAST_7' | 'LAST_30' | 'THIS_MONTH') => {
    const now = new Date();
    const end = now.toISOString().split('T')[0];
    let start = end;

    if (preset === 'LAST_7') {
      start = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    } else if (preset === 'LAST_30') {
      start = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    } else if (preset === 'THIS_MONTH') {
      start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    }

    setStartDate(start);
    setEndDate(end);
    setPage(1);
  };

  // Main Report Fetcher
  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let res: any;
      if (activeReport === 'attendance') {
        res = await managerApi.getTeamAttendanceReport({
          startDate,
          endDate,
          scope,
          employeeId: employeeId || undefined,
          status: attendanceStatus !== 'ALL' ? attendanceStatus : undefined,
          mode: attendanceMode !== 'ALL' ? attendanceMode : undefined,
          page,
          limit,
        });
      } else if (activeReport === 'exceptions') {
        res = await managerApi.getTeamExceptionReport({
          startDate,
          endDate,
          scope,
          employeeId: employeeId || undefined,
          exceptionType: exceptionType !== 'ALL' ? exceptionType : undefined,
          severity: exceptionSeverity !== 'ALL' ? exceptionSeverity : undefined,
          status: exceptionStatus !== 'ALL' ? exceptionStatus : undefined,
          page,
          limit,
        });
      } else if (activeReport === 'approvals') {
        res = await managerApi.getTeamApprovalReport({
          startDate,
          endDate,
          scope,
          employeeId: employeeId || undefined,
          type: approvalType !== 'ALL' ? approvalType : undefined,
          decision: approvalDecision !== 'ALL' ? approvalDecision : undefined,
          page,
          limit,
        });
      } else if (activeReport === 'availability') {
        res = await managerApi.getTeamAvailabilityReport({
          startDate,
          endDate,
          scope,
          employeeId: employeeId || undefined,
          minAvailabilityPct: minAvailabilityPct ? Number(minAvailabilityPct) : undefined,
          page,
          limit,
        });
      }

      if (res.data) {
        setReportData(res.data);
      } else if (res.reportType || res.success) {
        setReportData(res);
      } else {
        setError(res.message || 'Failed to fetch report.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load report data.');
    } finally {
      setLoading(false);
    }
  }, [
    activeReport,
    startDate,
    endDate,
    scope,
    employeeId,
    attendanceStatus,
    attendanceMode,
    exceptionType,
    exceptionSeverity,
    exceptionStatus,
    approvalType,
    approvalDecision,
    minAvailabilityPct,
    page,
    limit,
  ]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // Handle Tab Switch
  const handleTabChange = (tab: ReportTabType) => {
    setActiveReport(tab);
    setPage(1);
    setReportData(null);
  };

  // Export to CSV Handler
  const handleExportCsv = async () => {
    setExporting(true);
    try {
      let res: any;
      const baseParams = {
        startDate,
        endDate,
        scope,
        employeeId: employeeId || undefined,
        format: 'csv' as const,
      };

      if (activeReport === 'attendance') {
        res = await managerApi.getTeamAttendanceReport({
          ...baseParams,
          status: attendanceStatus !== 'ALL' ? attendanceStatus : undefined,
          mode: attendanceMode !== 'ALL' ? attendanceMode : undefined,
        });
      } else if (activeReport === 'exceptions') {
        res = await managerApi.getTeamExceptionReport({
          ...baseParams,
          exceptionType: exceptionType !== 'ALL' ? exceptionType : undefined,
          severity: exceptionSeverity !== 'ALL' ? exceptionSeverity : undefined,
          status: exceptionStatus !== 'ALL' ? exceptionStatus : undefined,
        });
      } else if (activeReport === 'approvals') {
        res = await managerApi.getTeamApprovalReport({
          ...baseParams,
          type: approvalType !== 'ALL' ? approvalType : undefined,
          decision: approvalDecision !== 'ALL' ? approvalDecision : undefined,
        });
      } else if (activeReport === 'availability') {
        res = await managerApi.getTeamAvailabilityReport({
          ...baseParams,
          minAvailabilityPct: minAvailabilityPct ? Number(minAvailabilityPct) : undefined,
        });
      }

      const csvData = res.data?.csv || res.csv;
      const filename = res.data?.filename || res.filename || `team-${activeReport}-report.csv`;

      if (csvData) {
        const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err: any) {
      alert(`Export failed: ${err.message || 'Unknown error'}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Report Navigation Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200 pb-4">
        <div>
          <h2 className="text-lg md:text-xl font-bold tracking-tight text-stone-900 flex items-center gap-2">
            <Users className="h-5 w-5 text-amber-700" />
            Manager Team Reports
          </h2>
          <p className="text-xs text-stone-500 mt-0.5">
            Scoped reporting, server-side aggregations, and RFC 4180 CSV exports within your
            reporting hierarchy.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleExportCsv}
            disabled={exporting || loading}
            leftIcon={<Download className="h-4 w-4 text-stone-600" />}
          >
            {exporting ? 'Generating CSV...' : 'Export CSV'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => fetchReport()}
            disabled={loading}
            aria-label="Refresh report"
          >
            <RotateCw className={`h-4 w-4 text-stone-600 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* 4 Report Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-stone-200 pb-1">
        {[
          { id: 'attendance', label: 'Attendance Report', icon: Clock },
          { id: 'exceptions', label: 'Exception Report', icon: AlertTriangle },
          { id: 'approvals', label: 'Approval Activity', icon: CheckSquare },
          { id: 'availability', label: 'Team Availability', icon: CalendarCheck },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeReport === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id as ReportTabType)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? 'bg-amber-100 text-amber-900 font-semibold shadow-xs'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? 'text-amber-700' : 'text-stone-400'}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Common Filter Controls Card */}
      <div className="p-4 rounded-xl border border-stone-200 bg-white space-y-3.5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-medium text-stone-700">
          <span className="flex items-center gap-1.5 text-stone-900 font-semibold">
            <Filter className="h-3.5 w-3.5 text-amber-700" />
            Report Parameters
          </span>
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="text-stone-400">Date Presets:</span>
            <button
              onClick={() => applyDatePreset('LAST_7')}
              className="px-2 py-0.5 rounded-md bg-stone-100 hover:bg-stone-200 text-stone-700"
            >
              Last 7 Days
            </button>
            <button
              onClick={() => applyDatePreset('LAST_30')}
              className="px-2 py-0.5 rounded-md bg-stone-100 hover:bg-stone-200 text-stone-700"
            >
              Last 30 Days
            </button>
            <button
              onClick={() => applyDatePreset('THIS_MONTH')}
              className="px-2 py-0.5 rounded-md bg-stone-100 hover:bg-stone-200 text-stone-700"
            >
              This Month
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 pt-1">
          {/* Start Date */}
          <div>
            <label className="block text-[11px] font-medium text-stone-500 mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs rounded-lg border border-stone-200 px-2.5 py-1.5 bg-stone-50/50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-600"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-[11px] font-medium text-stone-500 mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs rounded-lg border border-stone-200 px-2.5 py-1.5 bg-stone-50/50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-600"
            />
          </div>

          {/* Reporting Scope */}
          <div>
            <label className="block text-[11px] font-medium text-stone-500 mb-1">
              Hierarchy Scope
            </label>
            <select
              value={scope}
              onChange={(e) => {
                setScope(e.target.value as 'ALL' | 'DIRECT');
                setPage(1);
              }}
              className="w-full text-xs rounded-lg border border-stone-200 px-2.5 py-1.5 bg-stone-50/50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-600"
            >
              <option value="ALL">Entire Hierarchy (All Reports)</option>
              <option value="DIRECT">Direct Reports Only</option>
            </select>
          </div>

          {/* Employee Filter */}
          <div>
            <label className="block text-[11px] font-medium text-stone-500 mb-1">Team Member</label>
            <select
              value={employeeId}
              onChange={(e) => {
                setEmployeeId(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs rounded-lg border border-stone-200 px-2.5 py-1.5 bg-stone-50/50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-600"
            >
              <option value="">All Team Members</option>
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName} ({m.employeeCode})
                </option>
              ))}
            </select>
          </div>

          {/* Report Specific Filters */}
          {activeReport === 'attendance' && (
            <>
              <div>
                <label className="block text-[11px] font-medium text-stone-500 mb-1">
                  Attendance Status
                </label>
                <select
                  value={attendanceStatus}
                  onChange={(e) => {
                    setAttendanceStatus(e.target.value);
                    setPage(1);
                  }}
                  className="w-full text-xs rounded-lg border border-stone-200 px-2.5 py-1.5 bg-stone-50/50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-600"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PRESENT">Present</option>
                  <option value="LATE">Late Arrival</option>
                  <option value="HALF_DAY">Half Day</option>
                  <option value="ABSENT">Absent</option>
                  <option value="ON_LEAVE">On Leave</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-stone-500 mb-1">
                  Work Mode
                </label>
                <select
                  value={attendanceMode}
                  onChange={(e) => {
                    setAttendanceMode(e.target.value);
                    setPage(1);
                  }}
                  className="w-full text-xs rounded-lg border border-stone-200 px-2.5 py-1.5 bg-stone-50/50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-600"
                >
                  <option value="ALL">All Modes</option>
                  <option value="OFFICE">In-Office</option>
                  <option value="WFH">Work From Home</option>
                  <option value="OFFICIAL_VISIT">Official Visit</option>
                </select>
              </div>
            </>
          )}

          {activeReport === 'exceptions' && (
            <>
              <div>
                <label className="block text-[11px] font-medium text-stone-500 mb-1">
                  Exception Type
                </label>
                <select
                  value={exceptionType}
                  onChange={(e) => {
                    setExceptionType(e.target.value);
                    setPage(1);
                  }}
                  className="w-full text-xs rounded-lg border border-stone-200 px-2.5 py-1.5 bg-stone-50/50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-600"
                >
                  <option value="ALL">All Types</option>
                  <option value="LATE_ARRIVAL">Late Arrival</option>
                  <option value="EARLY_EXIT">Early Exit</option>
                  <option value="MISSING_CHECK_OUT">Missing Check-Out</option>
                  <option value="GEOFENCE_VIOLATION">Geofence Violation</option>
                  <option value="OVERTIME">Overtime</option>
                  <option value="ABSENT_UNPLANNED">Unplanned Absence</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-stone-500 mb-1">
                  Severity & Status
                </label>
                <select
                  value={exceptionSeverity}
                  onChange={(e) => {
                    setExceptionSeverity(e.target.value);
                    setPage(1);
                  }}
                  className="w-full text-xs rounded-lg border border-stone-200 px-2.5 py-1.5 bg-stone-50/50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-600"
                >
                  <option value="ALL">All Severities</option>
                  <option value="HIGH">High Severity</option>
                  <option value="MEDIUM">Medium Severity</option>
                  <option value="LOW">Low Severity</option>
                </select>
              </div>
            </>
          )}

          {activeReport === 'approvals' && (
            <>
              <div>
                <label className="block text-[11px] font-medium text-stone-500 mb-1">
                  Request Type
                </label>
                <select
                  value={approvalType}
                  onChange={(e) => {
                    setApprovalType(e.target.value);
                    setPage(1);
                  }}
                  className="w-full text-xs rounded-lg border border-stone-200 px-2.5 py-1.5 bg-stone-50/50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-600"
                >
                  <option value="ALL">All Workflows</option>
                  <option value="LEAVE">Leave Requests</option>
                  <option value="WFH">WFH Requests</option>
                  <option value="VISIT">Official Visits</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-stone-500 mb-1">
                  Decision Outcome
                </label>
                <select
                  value={approvalDecision}
                  onChange={(e) => {
                    setApprovalDecision(e.target.value);
                    setPage(1);
                  }}
                  className="w-full text-xs rounded-lg border border-stone-200 px-2.5 py-1.5 bg-stone-50/50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-600"
                >
                  <option value="ALL">All Decisions</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              </div>
            </>
          )}

          {activeReport === 'availability' && (
            <div>
              <label className="block text-[11px] font-medium text-stone-500 mb-1">
                Min Availability %
              </label>
              <input
                type="number"
                min="0"
                max="100"
                placeholder="e.g. 75"
                value={minAvailabilityPct}
                onChange={(e) => {
                  setMinAvailabilityPct(e.target.value);
                  setPage(1);
                }}
                className="w-full text-xs rounded-lg border border-stone-200 px-2.5 py-1.5 bg-stone-50/50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-600"
              />
            </div>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-3.5 rounded-xl border border-rose-200 bg-rose-50 flex items-start gap-3 text-rose-800 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
          <div className="flex-1">
            <p className="font-semibold">Unable to load report</p>
            <p className="mt-0.5">{error}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => fetchReport()} className="h-7 text-xs">
            Retry
          </Button>
        </div>
      )}

      {/* Aggregation Summary Metric Cards */}
      {reportData?.aggregations && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {activeReport === 'attendance' && (
            <>
              <KPICard
                title="Total Logs"
                value={String(reportData.aggregations.totalRecords || 0)}
                description="Recorded shifts"
              />
              <KPICard
                title="Total Work Hours"
                value={`${reportData.aggregations.totalWorkHours || 0}h`}
                description="Cumulative team hours"
              />
              <KPICard
                title="Avg Daily Hours"
                value={`${reportData.aggregations.averageDailyWorkHours || 0}h`}
                description="Per employee shift"
              />
              <KPICard
                title="Overtime Hours"
                value={`${reportData.aggregations.totalOvertimeHours || 0}h`}
                description="Approved excess hours"
              />
              <KPICard
                title="Late Arrivals"
                value={String(reportData.aggregations.statusCounts?.LATE || 0)}
                description="Grace window exceeded"
              />
              <KPICard
                title="Office vs Remote"
                value={`${reportData.aggregations.modeCounts?.OFFICE || 0} / ${
                  (reportData.aggregations.modeCounts?.WFH || 0) +
                  (reportData.aggregations.modeCounts?.OFFICIAL_VISIT || 0)
                }`}
                description="Office / Remote"
              />
            </>
          )}

          {activeReport === 'exceptions' && (
            <>
              <KPICard
                title="Total Exceptions"
                value={String(reportData.aggregations.totalExceptions || 0)}
                description="Anomalies detected"
              />
              <KPICard
                title="Open Issues"
                value={String(reportData.aggregations.openCount || 0)}
                description="Pending resolution"
              />
              <KPICard
                title="Resolved Issues"
                value={String(reportData.aggregations.resolvedCount || 0)}
                description="Cleared by manager"
              />
              <KPICard
                title="Late Arrivals"
                value={String(reportData.aggregations.byType?.LATE_ARRIVAL || 0)}
                description="Shift delay events"
              />
              <KPICard
                title="Missing Check-Out"
                value={String(reportData.aggregations.byType?.MISSING_CHECK_OUT || 0)}
                description="Unclosed sessions"
              />
              <KPICard
                title="High Severity"
                value={String(reportData.aggregations.bySeverity?.HIGH || 0)}
                description="Immediate attention"
              />
            </>
          )}

          {activeReport === 'approvals' && (
            <>
              <KPICard
                title="Total Requests"
                value={String(reportData.aggregations.totalRequests || 0)}
                description="Processed workflows"
              />
              <KPICard
                title="Approved"
                value={String(reportData.aggregations.approvedCount || 0)}
                description="Requests authorized"
              />
              <KPICard
                title="Rejected"
                value={String(reportData.aggregations.rejectedCount || 0)}
                description="Requests declined"
              />
              <KPICard
                title="Pending Decision"
                value={String(reportData.aggregations.submittedCount || 0)}
                description="In manager queue"
              />
              <KPICard
                title="Leave vs WFH"
                value={`${reportData.aggregations.leaveCount || 0} / ${reportData.aggregations.wfhCount || 0}`}
                description="Leaves / WFH"
              />
              <KPICard
                title="Avg Turnaround"
                value={`${reportData.aggregations.averageTurnaroundHours || 0}h`}
                description="Decision speed"
              />
            </>
          )}

          {activeReport === 'availability' && (
            <>
              <KPICard
                title="Team Members"
                value={String(reportData.aggregations.totalTeamMembers || 0)}
                description="Reporting staff"
              />
              <KPICard
                title="Team Availability"
                value={`${reportData.aggregations.averageTeamAvailabilityPct || 0}%`}
                description="Average rate"
              />
              <KPICard
                title="Office Days"
                value={String(reportData.aggregations.totalPresentOfficeDays || 0)}
                description="In-office presence"
              />
              <KPICard
                title="WFH Days"
                value={String(reportData.aggregations.totalWfhDays || 0)}
                description="Remote duty"
              />
              <KPICard
                title="Visit Days"
                value={String(reportData.aggregations.totalVisitDays || 0)}
                description="Outdoor client visits"
              />
              <KPICard
                title="Leave Days"
                value={String(reportData.aggregations.totalLeaveDays || 0)}
                description="Approved absences"
              />
            </>
          )}
        </div>
      )}

      {/* Main Table Content */}
      <div className="rounded-xl border border-stone-200 bg-white overflow-hidden shadow-2xs">
        {loading ? (
          <div className="p-12 text-center text-xs text-stone-500 space-y-3">
            <RotateCw className="h-6 w-6 animate-spin text-amber-700 mx-auto" />
            <p>Compiling server-side aggregates and scoped team records...</p>
          </div>
        ) : !reportData?.items || reportData.items.length === 0 ? (
          <div className="p-12 text-center text-xs text-stone-500 space-y-2">
            <Users className="h-8 w-8 text-stone-300 mx-auto mb-2" />
            <p className="font-semibold text-stone-700">
              No records found for the selected filters
            </p>
            <p className="text-[11px] text-stone-400">
              Try adjusting your date range, reporting scope, or status filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50/80 text-[11px] font-semibold text-stone-600">
                  {activeReport === 'attendance' && (
                    <>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Team Member</th>
                      <th className="py-2.5 px-3">Department</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Mode</th>
                      <th className="py-2.5 px-3">First In</th>
                      <th className="py-2.5 px-3">Last Out</th>
                      <th className="py-2.5 px-3 text-right">Work Hours</th>
                      <th className="py-2.5 px-3 text-right">Late (min)</th>
                      <th className="py-2.5 px-3 text-right">Overtime</th>
                    </>
                  )}

                  {activeReport === 'exceptions' && (
                    <>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Team Member</th>
                      <th className="py-2.5 px-3">Department</th>
                      <th className="py-2.5 px-3">Exception Type</th>
                      <th className="py-2.5 px-3">Severity</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Resolved By</th>
                      <th className="py-2.5 px-3">Resolution Notes</th>
                    </>
                  )}

                  {activeReport === 'approvals' && (
                    <>
                      <th className="py-2.5 px-3">Request Type</th>
                      <th className="py-2.5 px-3">Team Member</th>
                      <th className="py-2.5 px-3">Period / Dates</th>
                      <th className="py-2.5 px-3">Duration / Title</th>
                      <th className="py-2.5 px-3">Submitted</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Approver</th>
                      <th className="py-2.5 px-3 text-right">Turnaround</th>
                    </>
                  )}

                  {activeReport === 'availability' && (
                    <>
                      <th className="py-2.5 px-3">Team Member</th>
                      <th className="py-2.5 px-3">Department</th>
                      <th className="py-2.5 px-3 text-center">Scheduled</th>
                      <th className="py-2.5 px-3 text-center">Office</th>
                      <th className="py-2.5 px-3 text-center">WFH</th>
                      <th className="py-2.5 px-3 text-center">Visit</th>
                      <th className="py-2.5 px-3 text-center">Leave</th>
                      <th className="py-2.5 px-3 text-center">Absent</th>
                      <th className="py-2.5 px-3 text-right">Availability %</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-150">
                {reportData.items.map((row: any, idx: number) => (
                  <tr key={row.id || idx} className="hover:bg-stone-50/70 transition-colors">
                    {activeReport === 'attendance' && (
                      <>
                        <td className="py-2 px-3 font-medium text-stone-900">{row.date}</td>
                        <td className="py-2 px-3">
                          <span className="font-semibold text-stone-800 block">
                            {row.employeeName}
                          </span>
                          <span className="text-[10px] text-stone-400 block">
                            {row.employeeCode}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-stone-600">{row.department}</td>
                        <td className="py-2 px-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              row.status === 'PRESENT'
                                ? 'bg-emerald-100 text-emerald-800'
                                : row.status === 'LATE'
                                  ? 'bg-amber-100 text-amber-800'
                                  : row.status === 'ON_LEAVE'
                                    ? 'bg-indigo-100 text-indigo-800'
                                    : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <span className="text-[11px] text-stone-600 font-medium">
                            {row.primaryAttendanceMode}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-stone-600 font-mono text-[11px]">
                          {row.firstCheckIn ? row.firstCheckIn.split('T')[1]?.slice(0, 5) : '-'}
                        </td>
                        <td className="py-2 px-3 text-stone-600 font-mono text-[11px]">
                          {row.lastCheckOut ? row.lastCheckOut.split('T')[1]?.slice(0, 5) : '-'}
                        </td>
                        <td className="py-2 px-3 text-right font-semibold text-stone-900">
                          {row.workHours}h
                        </td>
                        <td className="py-2 px-3 text-right text-stone-600">
                          {row.lateMinutes > 0 ? (
                            <span className="text-amber-700 font-medium">{row.lateMinutes}m</span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="py-2 px-3 text-right text-stone-600">
                          {row.overtimeMinutes > 0 ? (
                            <span className="text-emerald-700 font-medium">
                              +{Math.round((row.overtimeMinutes / 60) * 10) / 10}h
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                      </>
                    )}

                    {activeReport === 'exceptions' && (
                      <>
                        <td className="py-2 px-3 font-medium text-stone-900">{row.date}</td>
                        <td className="py-2 px-3">
                          <span className="font-semibold text-stone-800 block">
                            {row.employeeName}
                          </span>
                          <span className="text-[10px] text-stone-400 block">
                            {row.employeeCode}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-stone-600">{row.department}</td>
                        <td className="py-2 px-3 font-medium text-stone-800">
                          {row.exceptionType.replace('_', ' ')}
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              row.severity === 'HIGH'
                                ? 'bg-rose-100 text-rose-800'
                                : row.severity === 'MEDIUM'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-stone-100 text-stone-700'
                            }`}
                          >
                            {row.severity}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              row.status === 'RESOLVED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-stone-600">{row.resolvedByName || '-'}</td>
                        <td className="py-2 px-3 text-stone-500 truncate max-w-xs">
                          {row.resolutionNotes || '-'}
                        </td>
                      </>
                    )}

                    {activeReport === 'approvals' && (
                      <>
                        <td className="py-2 px-3">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-stone-800">
                            {row.type === 'LEAVE' && (
                              <Calendar className="h-3.5 w-3.5 text-indigo-600" />
                            )}
                            {row.type === 'WFH' && <Home className="h-3.5 w-3.5 text-amber-600" />}
                            {row.type === 'VISIT' && (
                              <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                            )}
                            {row.typeLabel}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <span className="font-semibold text-stone-800 block">
                            {row.employeeName}
                          </span>
                          <span className="text-[10px] text-stone-400 block">
                            {row.employeeCode}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-stone-600">
                          {row.startDate} to {row.endDate}
                        </td>
                        <td className="py-2 px-3 text-stone-700 font-medium">
                          {row.durationLabel}
                        </td>
                        <td className="py-2 px-3 text-stone-500 font-mono text-[11px]">
                          {row.submittedAt?.split('T')[0]}
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              row.status === 'APPROVED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : row.status === 'REJECTED'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-stone-600">{row.approverName || '-'}</td>
                        <td className="py-2 px-3 text-right font-medium text-stone-800">
                          {row.turnaroundHours !== null ? `${row.turnaroundHours}h` : '-'}
                        </td>
                      </>
                    )}

                    {activeReport === 'availability' && (
                      <>
                        <td className="py-2 px-3">
                          <span className="font-semibold text-stone-800 block">
                            {row.employeeName}
                          </span>
                          <span className="text-[10px] text-stone-400 block">
                            {row.employeeCode}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-stone-600">{row.department}</td>
                        <td className="py-2 px-3 text-center text-stone-700 font-medium">
                          {row.scheduledDays}
                        </td>
                        <td className="py-2 px-3 text-center font-medium text-emerald-700">
                          {row.officeDays}
                        </td>
                        <td className="py-2 px-3 text-center font-medium text-amber-700">
                          {row.wfhDays}
                        </td>
                        <td className="py-2 px-3 text-center font-medium text-sky-700">
                          {row.visitDays}
                        </td>
                        <td className="py-2 px-3 text-center font-medium text-indigo-700">
                          {row.leaveDays}
                        </td>
                        <td className="py-2 px-3 text-center font-medium text-rose-700">
                          {row.absentDays}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              row.availabilityPct >= 90
                                ? 'bg-emerald-100 text-emerald-800'
                                : row.availabilityPct >= 75
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {row.availabilityPct}%
                          </span>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Server-Side Pagination Footer */}
        {reportData?.pagination && reportData.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-stone-200 bg-stone-50 text-xs text-stone-600">
            <div>
              Showing page <span className="font-semibold text-stone-900">{page}</span> of{' '}
              <span className="font-semibold text-stone-900">
                {reportData.pagination.totalPages}
              </span>{' '}
              ({reportData.pagination.total} total items)
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-7 text-xs"
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= reportData.pagination.totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
                className="h-7 text-xs"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
