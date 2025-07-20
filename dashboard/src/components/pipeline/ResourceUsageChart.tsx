import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface ResourceData {
  date: string;
  cpu: number;
  memory: number;
  storage: number;
}

interface ResourceUsageChartProps {
  data: ResourceData[];
}

export const ResourceUsageChart: React.FC<ResourceUsageChartProps> = ({ data }) => {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis 
            dataKey="date" 
            tick={{ fontSize: 12 }}
            tickFormatter={(value) => new Date(value).toLocaleDateString()}
          />
          <YAxis 
            tick={{ fontSize: 12 }}
            domain={[0, 100]}
            tickFormatter={(value) => `${value}%`}
          />
          <Tooltip 
            labelFormatter={(value) => `Date: ${new Date(value).toLocaleDateString()}`}
            formatter={(value, name) => [
              `${value}%`, 
              name === 'cpu' ? 'CPU' : name === 'memory' ? 'Memory' : 'Storage'
            ]}
          />
          <Area
            type="monotone"
            dataKey="cpu"
            stackId="1"
            stroke="#3b82f6"
            fill="#3b82f6"
            fillOpacity={0.6}
            name="CPU"
          />
          <Area
            type="monotone"
            dataKey="memory"
            stackId="1"
            stroke="#10b981"
            fill="#10b981"
            fillOpacity={0.6}
            name="Memory"
          />
          <Area
            type="monotone"
            dataKey="storage"
            stackId="1"
            stroke="#f59e0b"
            fill="#f59e0b"
            fillOpacity={0.6}
            name="Storage"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};