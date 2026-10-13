'use client';

import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { CalendarDays } from 'lucide-react';

export interface AttendanceTrendDataPoint {
  day: string;
  present: number;
  leave: number;
  absent: number;
}

export const AttendanceTrendChart: React.FC<{ data?: AttendanceTrendDataPoint[] }> = ({
  data = [],
}) => {
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-64 flex flex-col items-center justify-center bg-stone-50/50 rounded-xl border border-dashed border-stone-200 p-6 text-center">
        <CalendarDays className="h-8 w-8 text-stone-300 mb-2" aria-hidden="true" />
        <p className="text-xs font-semibold text-stone-700">No Attendance Records Yet</p>
        <p className="text-[11px] text-stone-400 mt-1 max-w-xs">
          Daily attendance trend will appear dynamically as employee clock-in punches are recorded
          in the system.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="colorPresent" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#D97706" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#D97706" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="colorLeave" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0ECE4" />
          <XAxis
            dataKey="day"
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
          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
          <Area
            type="monotone"
            dataKey="present"
            name="Present"
            stroke="#D97706"
            strokeWidth={2.5}
            fillOpacity={1}
            fill="url(#colorPresent)"
          />
          <Area
            type="monotone"
            dataKey="leave"
            name="On Leave"
            stroke="#3B82F6"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorLeave)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
