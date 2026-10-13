'use client';

import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { CalendarDays } from 'lucide-react';

export interface LeaveTrendDataPoint {
  month: string;
  casual: number;
  sick: number;
  privilege: number;
}

export const LeaveTrendChart: React.FC<{ data?: LeaveTrendDataPoint[] }> = ({ data = [] }) => {
  if (!data || data.length === 0) {
    return (
      <div className="w-full h-64 flex flex-col items-center justify-center bg-stone-50/50 rounded-xl border border-dashed border-stone-200 p-6 text-center">
        <CalendarDays className="h-8 w-8 text-stone-300 mb-2" aria-hidden="true" />
        <p className="text-xs font-semibold text-stone-700">No Monthly Leave Trend Data</p>
        <p className="text-[11px] text-stone-400 mt-1 max-w-xs">
          Leave utilization patterns across Casual, Sick, and Privilege balances will render as
          approvals are processed.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0ECE4" />
          <XAxis
            dataKey="month"
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
          <Line
            type="monotone"
            dataKey="casual"
            name="Casual Leave"
            stroke="#F59E0B"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="sick"
            name="Sick Leave"
            stroke="#EF4444"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="privilege"
            name="Privilege Leave"
            stroke="#3B82F6"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
