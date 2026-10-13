'use client';

import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Building2 } from 'lucide-react';

export interface DepartmentDistributionDataPoint {
  department: string;
  count: number;
}

export const DepartmentDistributionChart: React.FC<{
  data?: DepartmentDistributionDataPoint[];
}> = ({ data = [] }) => {
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-64 flex flex-col items-center justify-center bg-stone-50/50 rounded-xl border border-dashed border-stone-200 p-6 text-center">
        <Building2 className="h-8 w-8 text-stone-300 mb-2" aria-hidden="true" />
        <p className="text-xs font-semibold text-stone-700">No Department Distribution Data</p>
        <p className="text-[11px] text-stone-400 mt-1 max-w-xs">
          Department distribution will be calculated once employees are assigned to departments.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0ECE4" />
          <XAxis
            dataKey="department"
            tickLine={false}
            axisLine={false}
            tick={{ fill: '#78716C', fontSize: 11 }}
          />
          <YAxis tickLine={false} axisLine={false} tick={{ fill: '#78716C', fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#FFFFFF',
              borderColor: '#E7E2DA',
              borderRadius: '8px',
              fontSize: '12px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.08)',
            }}
          />
          <Bar dataKey="count" name="Employees" fill="#B45309" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
