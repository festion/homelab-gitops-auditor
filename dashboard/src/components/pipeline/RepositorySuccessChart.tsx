import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface RepositoryData {
  repository: string;
  successRate: number;
  totalRuns: number;
}

interface RepositorySuccessChartProps {
  data: RepositoryData[];
}

export const RepositorySuccessChart: React.FC<RepositorySuccessChartProps> = ({ data }) => {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="horizontal">
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} />
          <YAxis 
            type="category" 
            dataKey="repository" 
            tick={{ fontSize: 12 }}
            width={100}
          />
          <Tooltip 
            formatter={(value, name) => [
              `${value}%`, 
              'Success Rate'
            ]}
            labelFormatter={(label) => `Repository: ${label}`}
          />
          <Bar 
            dataKey="successRate" 
            fill="#10b981"
            radius={[0, 4, 4, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};