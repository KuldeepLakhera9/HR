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

const mockData = [
  { day: 'Mon', present: 64, leave: 5, absent: 3 },
  { day: 'Tue', present: 67, leave: 3, absent: 2 },
  { day: 'Wed', present: 65, leave: 5, absent: 2 },
  { day: 'Thu', present: 68, leave: 2, absent: 2 },
  { day: 'Fri', present: 62, leave: 7, absent: 3 },
  { day: 'Sat', present: 22, leave: 2, absent: 1 },
];

export const AttendanceTrendChart: React.FC = () => {
  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={mockData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
