'use client';

import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { GraduationCap } from 'lucide-react';

export interface EmployeeProgressTrack {
  track: string;
  completed: number;
  inProgress: number;
}

interface EmployeeProgressChartProps {
  data?: EmployeeProgressTrack[];
}

export const EmployeeProgressChart: React.FC<EmployeeProgressChartProps> = ({ data = [] }) => {
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-64 flex flex-col items-center justify-center text-center p-6 bg-stone-50/50 rounded-lg border border-dashed border-stone-200">
        <GraduationCap className="h-8 w-8 text-stone-300 mb-2" />
        <p className="text-xs font-semibold text-stone-600">No Enablement Modules Assigned</p>
        <p className="text-[11px] text-stone-400 mt-1 max-w-xs">
          Training tracks, certifications, and onboarding milestones will appear here when
          configured in the system.
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
            dataKey="track"
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
            }}
          />
          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
          <Bar dataKey="completed" name="Completed" fill="#10B981" radius={[4, 4, 0, 0]} />
          <Bar dataKey="inProgress" name="In Progress" fill="#F59E0B" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
