import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface PerformanceData {
  date: string;
  success: number;
  failed: number;
  duration: number;
}

interface PipelinePerformanceChartProps {
  data: PerformanceData[];
}

export const PipelinePerformanceChart: React.FC<PipelinePerformanceChartProps> = ({ data }) => {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis 
            dataKey="date" 
            tick={{ fontSize: 12 }}
            tickFormatter={(value) => new Date(value).toLocaleDateString()}
          />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip 
            labelFormatter={(value) => `Date: ${new Date(value).toLocaleDateString()}`}
            formatter={(value, name) => [value, name === 'success' ? 'Success' : name === 'failed' ? 'Failed' : 'Avg Duration (min)']}
          />
          <Legend />
          <Line 
            type="monotone" 
            dataKey="success" 
            stroke="#10b981" 
            strokeWidth={2}
            name="Success"
          />
          <Line 
            type="monotone" 
            dataKey="failed" 
            stroke="#ef4444" 
            strokeWidth={2}
            name="Failed"
          />
          <Line 
            type="monotone" 
            dataKey="duration" 
            stroke="#8b5cf6" 
            strokeWidth={2}
            name="Avg Duration (min)"
            yAxisId="right"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};