'use client';

import React from 'react';
import { AppShell } from '../../layouts/AppShell';
import { useRole } from '../../context/RoleContext';
import { AdminDashboard } from '../../features/dashboard/components/AdminDashboard';
import { HRDashboard } from '../../features/dashboard/components/HRDashboard';
import { ManagerDashboard } from '../../features/dashboard/components/ManagerDashboard';
import { EmployeeDashboard } from '../../features/dashboard/components/EmployeeDashboard';

export default function DashboardPage() {
  const { role } = useRole();

  return (
    <AppShell>
      {role === 'ADMIN' && <AdminDashboard />}
      {role === 'HR' && <HRDashboard />}
      {role === 'MANAGER' && <ManagerDashboard />}
      {role === 'EMPLOYEE' && <EmployeeDashboard />}
    </AppShell>
  );
}
