'use client';

import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

const mockData = [
  { department: 'Engineering', count: 42 },
  { department: 'HR & People', count: 8 },
  { department: 'Operations', count: 16 },
  { department: 'Finance', count: 6 },
];

export const DepartmentDistributionChart: React.FC = () => {
  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={mockData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
