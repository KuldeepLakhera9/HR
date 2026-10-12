'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { AppShell } from '../../layouts/AppShell';
import { useAuth } from '../../context/AuthContext';
import { authApi, employeesApi } from '../../lib/api-client';
import { UserSessionItem, UserNotificationPreferences } from '@hrms/types';
import {
  Input,
  Switch,
  Button,
  Badge,
  Toast,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Skeleton,
} from '@hrms/ui';
import {
  Settings,
  Save,
  ShieldCheck,
  MapPin,
  Lock,
  KeyRound,
  Laptop,
  Smartphone,
  Globe,
  LogOut,
  Bell,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Building2,
  UserCheck,
  ShieldAlert,
  Clock,
} from 'lucide-react';

const NOTIFICATION_PREF_KEY = 'hrms_notification_preferences';

const DEFAULT_PREFERENCES: UserNotificationPreferences = {
  leaveUpdates: true,
  attendanceAlerts: true,
  announcements: true,
  wfhUpdates: true,
  officialVisitUpdates: true,
};

export default function SettingsPage() {
  const { user, hasRole, hasPermission, logout } = useAuth();
  const canManageSystem = hasRole('ADMIN') || hasPermission('SETTING_VIEW');

  // Active Tab for Admin (Account & Security vs System Governance)
  const [activeTab, setActiveTab] = useState<'account' | 'governance'>('account');

  // Notification Toast state
  const [toastMessage, setToastMessage] = useState<{
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
  } | null>(null);

  // Employee details state
  const [employeeDetails, setEmployeeDetails] = useState<any>(null);
  const [isLoadingEmployee, setIsLoadingEmployee] = useState(false);

  // Password Change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Active Sessions state
  const [sessions, setSessions] = useState<UserSessionItem[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isRevokingOther, setIsRevokingOther] = useState(false);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);

  // Notification preferences state
  const [notificationPrefs, setNotificationPrefs] =
    useState<UserNotificationPreferences>(DEFAULT_PREFERENCES);
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);

  // Fetch permitted employee record
  const fetchEmployeeData = useCallback(async () => {
    try {
      setIsLoadingEmployee(true);
      const data = await employeesApi.getMe();
      setEmployeeDetails(data);
    } catch {
      // Non-critical if user is standalone admin without linked employee profile
    } finally {
      setIsLoadingEmployee(false);
    }
  }, []);

  // Fetch active sessions
  const fetchSessions = useCallback(async () => {
    try {
      setIsLoadingSessions(true);
      const data = await authApi.getSessions();
      setSessions(data);
    } catch {
      // Session fetch error handled gracefully
    } finally {
      setIsLoadingSessions(false);
    }
  }, []);

  // Load preferences from local persistence
  useEffect(() => {
    try {
      const saved = localStorage.getItem(NOTIFICATION_PREF_KEY);
      if (saved) {
        setNotificationPrefs(JSON.parse(saved));
      }
    } catch {
      // Ignore storage read error
    }
    fetchEmployeeData();
    fetchSessions();
  }, [fetchEmployeeData, fetchSessions]);

  // Handle Password Change
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    if (!currentPassword) {
      setPasswordError('Current password is required to authorize this change.');
      return;
    }

    if (!newPassword || newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }

    try {
      setIsChangingPassword(true);
      const res = await authApi.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      setToastMessage({
        type: 'success',
        title: 'Password Updated',
        message:
          res.message ||
          'Your account password has been updated. Other active login sessions were terminated.',
      });

      // Refresh active sessions list
      fetchSessions();
    } catch (err: any) {
      const msg =
        err?.message ||
        'Failed to change password. Please verify your current credentials and password policy.';
      setPasswordError(msg);
      setToastMessage({
        type: 'error',
        title: 'Password Change Failed',
        message: msg,
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  // Revoke Individual Session
  const handleRevokeSession = async (sessionId: string) => {
    try {
      setRevokingSessionId(sessionId);
      await authApi.revokeSession(sessionId);
      setToastMessage({
        type: 'success',
        title: 'Session Revoked',
        message: 'The selected device session has been signed out.',
      });
      fetchSessions();
    } catch (err: any) {
      setToastMessage({
        type: 'error',
        title: 'Revocation Failed',
        message: err?.message || 'Failed to revoke the selected session.',
      });
    } finally {
      setRevokingSessionId(null);
    }
  };

  // Revoke All Other Sessions
  const handleRevokeOtherSessions = async () => {
    try {
      setIsRevokingOther(true);
      const res = await authApi.revokeOtherSessions();
      setToastMessage({
        type: 'success',
        title: 'Other Sessions Terminated',
        message: `Successfully terminated ${res.revokedCount} other active login session(s).`,
      });
      fetchSessions();
    } catch (err: any) {
      setToastMessage({
        type: 'error',
        title: 'Failed to Terminate Sessions',
        message: err?.message || 'Could not terminate other sessions.',
      });
    } finally {
      setIsRevokingOther(false);
    }
  };

  // Save Notification Preferences
  const handleSavePreferences = () => {
    try {
      setIsSavingPrefs(true);
      localStorage.setItem(NOTIFICATION_PREF_KEY, JSON.stringify(notificationPrefs));
      setToastMessage({
        type: 'success',
        title: 'Preferences Saved',
        message: 'Your personal in-app notification preferences have been saved.',
      });
    } catch {
      setToastMessage({
        type: 'error',
        title: 'Save Failed',
        message: 'Could not store preferences in local storage.',
      });
    } finally {
      setIsSavingPrefs(false);
    }
  };

  // Helper for device icon
  const getDeviceIcon = (userAgent: string | null) => {
    if (!userAgent) return <Globe className="h-4 w-4 text-stone-500" />;
    const ua = userAgent.toLowerCase();
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
      return <Smartphone className="h-4 w-4 text-amber-800" />;
    }
    return <Laptop className="h-4 w-4 text-stone-700" />;
  };

  return (
    <AppShell>
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50">
          <Toast
            type={toastMessage.type}
            title={toastMessage.title}
            message={toastMessage.message}
            onClose={() => setToastMessage(null)}
          />
        </div>
      )}

      <div className="max-w-4xl space-y-6 pb-12">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-200 pb-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-stone-900 flex items-center gap-2">
              <Settings className="h-6 w-6 text-amber-800" /> Settings & Security
            </h1>
            <p className="text-xs md:text-sm text-stone-500 mt-1">
              Manage your personal authentication credentials, active device sessions, and account
              preferences.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => logout()}
              leftIcon={<LogOut className="h-4 w-4 text-rose-600" />}
            >
              Sign Out
            </Button>
          </div>
        </div>

        {/* Tab Switcher for Admin Roles */}
        {canManageSystem && (
          <div className="flex border-b border-stone-200 gap-4">
            <button
              onClick={() => setActiveTab('account')}
              className={`pb-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'account'
                  ? 'border-amber-800 text-amber-950 font-semibold'
                  : 'border-transparent text-stone-500 hover:text-stone-800'
              }`}
            >
              Account & Security
            </button>
            <button
              onClick={() => setActiveTab('governance')}
              className={`pb-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'governance'
                  ? 'border-amber-800 text-amber-950 font-semibold'
                  : 'border-transparent text-stone-500 hover:text-stone-800'
              }`}
            >
              System Governance & Geofencing
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 1: ACCOUNT & SECURITY (EMPLOYEE SELF-SERVICE SETTINGS)                 */}
        {/* ========================================================================= */}
        {activeTab === 'account' && (
          <div className="space-y-6">
            {/* 1. Account Information (Read-Only & Protected Fields) */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-stone-900">
                      <UserCheck className="h-4 w-4 text-amber-800" /> Account Identity & Assignment
                    </CardTitle>
                    <CardDescription>
                      Authoritative account credentials, organizational assignment, and RBAC status.
                    </CardDescription>
                  </div>
                  <Badge variant="success">Account Active</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-medium text-stone-500 block mb-1">
                      Full Name
                    </label>
                    <div className="text-sm font-medium text-stone-900 bg-stone-50 px-3 py-2 rounded border border-stone-200">
                      {user
                        ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email
                        : '—'}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-stone-500 block mb-1">
                      Employee Code
                    </label>
                    <div className="flex items-center justify-between text-sm font-medium text-stone-900 bg-stone-50 px-3 py-2 rounded border border-stone-200">
                      <span className="font-mono">{user?.employeeCode || 'EMP-AUTH'}</span>
                      <span title="Protected corporate identifier">
                        <Lock className="h-3.5 w-3.5 text-stone-400" />
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-stone-500 block mb-1">
                      Work Email
                    </label>
                    <div className="flex items-center justify-between text-sm font-medium text-stone-900 bg-stone-50 px-3 py-2 rounded border border-stone-200">
                      <span className="truncate">{user?.email || '—'}</span>
                      <span title="Corporate login identity">
                        <Lock className="h-3.5 w-3.5 text-stone-400" />
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-stone-500 block mb-1">
                      Assigned Role(s)
                    </label>
                    <div className="flex flex-wrap gap-1.5 bg-stone-50 px-3 py-2 rounded border border-stone-200 min-h-[38px] items-center">
                      {user?.roles && user.roles.length > 0 ? (
                        user.roles.map((r) => (
                          <Badge key={r} variant="default" size="sm">
                            {r}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-stone-400">EMPLOYEE</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-stone-500 block mb-1">
                      Department & Designation
                    </label>
                    <div className="text-sm text-stone-900 bg-stone-50 px-3 py-2 rounded border border-stone-200">
                      {employeeDetails?.department?.name || 'Assigned Department'}
                      {employeeDetails?.designation?.title
                        ? ` • ${employeeDetails.designation.title}`
                        : ''}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-stone-500 block mb-1">
                      Organization
                    </label>
                    <div className="flex items-center gap-1.5 text-sm text-stone-900 bg-stone-50 px-3 py-2 rounded border border-stone-200">
                      <Building2 className="h-3.5 w-3.5 text-stone-500" />
                      <span>PeopleOS Technologies</span>
                    </div>
                  </div>
                </div>

                {/* Protected Fields Notice Banner */}
                <div className="mt-4 p-3 bg-amber-50/70 border border-amber-200/80 rounded-lg flex items-start gap-2.5">
                  <ShieldAlert className="h-4 w-4 text-amber-800 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-950">
                    <span className="font-semibold">Security Governance Policy:</span> Core identity
                    fields such as Employee Code, Corporate Roles, System Permissions, and Account
                    Status are authoritatively locked. To update personal contact details or address
                    proof, submit a staged{' '}
                    <Link href="/profile" className="font-semibold underline hover:text-amber-900">
                      Profile Change Request
                    </Link>{' '}
                    for HR review.
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 2. Password & Security Credentials Flow */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-stone-900">
                  <KeyRound className="h-4 w-4 text-amber-800" /> Password & Account Security
                </CardTitle>
                <CardDescription>
                  Update your account password. Conforming passwords terminate all other active
                  sessions for defense-in-depth.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handlePasswordChange} className="space-y-4 max-w-xl">
                  {passwordError && (
                    <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-md text-xs flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                      <span>{passwordError}</span>
                    </div>
                  )}

                  <Input
                    label="Current Password"
                    type="password"
                    placeholder="Enter your current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    helperText="Reauthenticates your session before sensitive credential changes."
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="New Password"
                      type="password"
                      placeholder="Minimum 8 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                    />
                    <Input
                      label="Confirm New Password"
                      type="password"
                      placeholder="Re-enter new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                  </div>

                  <div className="text-xs text-stone-500 bg-stone-50 p-2.5 rounded border border-stone-200">
                    <span className="font-medium text-stone-700">
                      Password Policy Requirements:
                    </span>
                    <ul className="list-disc list-inside mt-1 space-y-0.5 text-stone-600">
                      <li>Must contain at least 8 characters</li>
                      <li>Must include a combination of letters, numbers, or symbols</li>
                      <li>Cannot match previous immediate password hashes</li>
                    </ul>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <Button
                      type="submit"
                      size="sm"
                      isLoading={isChangingPassword}
                      leftIcon={<Lock className="h-3.5 w-3.5" />}
                    >
                      Update Password
                    </Button>
                    <span className="text-xs text-stone-500">
                      Other devices will be prompted to re-authenticate.
                    </span>
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* 3. Active Sessions & Device Management */}
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-stone-900">
                      <Laptop className="h-4 w-4 text-amber-800" /> Active Login Sessions
                    </CardTitle>
                    <CardDescription>
                      Review authorized sessions authenticated via secure HttpOnly refresh tokens.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={fetchSessions}
                      disabled={isLoadingSessions}
                      leftIcon={
                        <RefreshCw
                          className={`h-3.5 w-3.5 ${isLoadingSessions ? 'animate-spin' : ''}`}
                        />
                      }
                    >
                      Refresh
                    </Button>
                    {sessions.filter((s) => !s.isCurrent).length > 0 && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={handleRevokeOtherSessions}
                        isLoading={isRevokingOther}
                      >
                        Sign Out Other Devices
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {isLoadingSessions ? (
                  <div className="space-y-3">
                    <Skeleton className="h-14 w-full rounded" />
                    <Skeleton className="h-14 w-full rounded" />
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="text-center py-6 text-xs text-stone-500 bg-stone-50 rounded border border-stone-200">
                    No active sessions found.
                  </div>
                ) : (
                  <div className="divide-y divide-stone-100 border border-stone-200 rounded-lg overflow-hidden">
                    {sessions.map((sess) => (
                      <div
                        key={sess.id}
                        className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          sess.isCurrent ? 'bg-amber-50/30' : 'bg-white hover:bg-stone-50/50'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="p-2 bg-stone-100 rounded-lg shrink-0 mt-0.5">
                            {getDeviceIcon(sess.userAgent)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-stone-900">
                                {sess.deviceName || 'Web Browser'}
                              </span>
                              {sess.isCurrent ? (
                                <Badge variant="success" size="sm">
                                  Current Session
                                </Badge>
                              ) : (
                                <Badge variant="default" size="sm">
                                  Authorized
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-stone-500 mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                              <span>IP: {sess.ipAddress || '127.0.0.1'}</span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" /> Last Active:{' '}
                                {new Date(sess.lastUsedAt).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center">
                          {sess.isCurrent ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => logout()}
                              leftIcon={<LogOut className="h-3.5 w-3.5 text-stone-600" />}
                            >
                              Sign Out
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRevokeSession(sess.id)}
                              isLoading={revokingSessionId === sess.id}
                              className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                            >
                              Revoke
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 4. Notification Preferences */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-stone-900">
                      <Bell className="h-4 w-4 text-amber-800" /> In-App Notification Preferences
                    </CardTitle>
                    <CardDescription>
                      Configure which alerts and notices appear on your employee dashboard header.
                    </CardDescription>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleSavePreferences}
                    isLoading={isSavingPrefs}
                    leftIcon={<Save className="h-3.5 w-3.5" />}
                  >
                    Save Preferences
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Switch
                    label="Leave & Absence Request Updates"
                    description="Receive in-app status notifications when your leave requests are approved or rejected."
                    checked={notificationPrefs.leaveUpdates}
                    onChange={(e) =>
                      setNotificationPrefs((prev) => ({ ...prev, leaveUpdates: e.target.checked }))
                    }
                  />

                  <Switch
                    label="Attendance Geofence & Shift Notices"
                    description="Receive alerts regarding shift start times, punch exceptions, and grace period boundaries."
                    checked={notificationPrefs.attendanceAlerts}
                    onChange={(e) =>
                      setNotificationPrefs((prev) => ({
                        ...prev,
                        attendanceAlerts: e.target.checked,
                      }))
                    }
                  />

                  <Switch
                    label="Company Announcements & Policy Bulletins"
                    description="Highlight official HR notices and corporate announcements on your dashboard."
                    checked={notificationPrefs.announcements}
                    onChange={(e) =>
                      setNotificationPrefs((prev) => ({ ...prev, announcements: e.target.checked }))
                    }
                  />

                  <Switch
                    label="Work From Home (WFH) Approvals"
                    description="Instant alerts for manager decisions regarding remote work requests."
                    checked={notificationPrefs.wfhUpdates}
                    onChange={(e) =>
                      setNotificationPrefs((prev) => ({ ...prev, wfhUpdates: e.target.checked }))
                    }
                  />

                  <Switch
                    label="Official Visit Location Verifications"
                    description="Notifications regarding outdoor duty approvals and arrival confirmation alerts."
                    checked={notificationPrefs.officialVisitUpdates}
                    onChange={(e) =>
                      setNotificationPrefs((prev) => ({
                        ...prev,
                        officialVisitUpdates: e.target.checked,
                      }))
                    }
                  />

                  <div className="pt-2 text-xs text-stone-500 border-t border-stone-100 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    <span>
                      In-app notification preferences take effect immediately. Critical compliance
                      dispatches (e.g., password reset emails) are enforced unconditionally by
                      organizational policy.
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: SYSTEM GOVERNANCE (ADMINISTRATIVE CONTROLS PRESERVED)               */}
        {/* ========================================================================= */}
        {activeTab === 'governance' && canManageSystem && (
          <div className="space-y-6">
            {/* Organization Information */}
            <Card>
              <CardHeader>
                <CardTitle>Organization Identity</CardTitle>
                <CardDescription>
                  Legal corporate entity name, base timezone, and operating currency.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="Organization Name" defaultValue="PeopleOS Technologies Inc." />
                  <Input label="Organization Code" defaultValue="PEOPLEOS" disabled />
                  <Input label="Default Timezone" defaultValue="Asia/Kolkata (IST)" />
                  <Input label="Operating Currency" defaultValue="INR (₹)" />
                </div>
              </CardContent>
            </Card>

            {/* Geofence & Attendance Rules */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Attendance Geofence Configuration</CardTitle>
                    <CardDescription>
                      Controls perimeter enforcement for Office punches.
                    </CardDescription>
                  </div>
                  <Badge variant="success">Geofencing Active</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Switch
                    label="Enforce GPS Geofence for Office Attendance"
                    description="Requires employees to be within verified branch perimeter when attendance mode is Office."
                    defaultChecked={true}
                  />

                  <Switch
                    label="Allow Outdoor Duty (Official Visit) Geofence Bypass"
                    description="Permits punches outside geofence when manager-approved Official Visit is active."
                    defaultChecked={true}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                    <Input
                      label="HQ Geofence Radius (Meters)"
                      type="number"
                      defaultValue="150"
                      helperText="Allowed circular radius around branch coordinates."
                    />
                    <Input
                      label="Attendance Grace Period (Minutes)"
                      type="number"
                      defaultValue="15"
                      helperText="Minutes allowed after scheduled shift before flagging late."
                    />
                  </div>

                  <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-stone-100">
                    <div className="text-xs text-stone-500">
                      Configure physical office locations, GPS coordinates, and test perimeters.
                    </div>
                    <Link href="/settings/office-locations">
                      <Button
                        size="sm"
                        variant="outline"
                        leftIcon={<MapPin className="h-3.5 w-3.5 text-amber-800" />}
                      >
                        Manage Office Locations & Geofences
                      </Button>
                    </Link>
                  </div>

                  <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-stone-100">
                    <div className="text-xs text-stone-500">
                      Configure working hours, shifts, grace periods, full/half day thresholds &
                      employee assignments.
                    </div>
                    <Link href="/settings/attendance-policies">
                      <Button
                        size="sm"
                        variant="outline"
                        leftIcon={<Settings className="h-3.5 w-3.5 text-stone-700" />}
                      >
                        Manage Attendance Policies & Shifts
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Data Protection & Self-Hosting */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" /> Self-Hosted Data Center
                  Controls
                </CardTitle>
                <CardDescription>
                  All user data, attendance GPS captures, documents, and audit logs are stored
                  strictly inside your organization's PostgreSQL and local storage cluster without
                  external cloud dependencies.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-stone-700">Storage Location:</span>
                  <span className="text-xs bg-stone-100 text-stone-800 px-2 py-0.5 rounded font-mono">
                    /var/lib/postgresql/data (Mounted Volume)
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  );
}
