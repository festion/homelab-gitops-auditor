import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Calendar, TrendingUp, TrendingDown } from 'lucide-react';

interface TrendData {
  date: string;
  complianceRate: number;
  totalRepos: number;
  compliantRepos: number;
  nonCompliantRepos: number;
  templatesApplied: number;
}

type TimeRange = '7d' | '30d' | '90d' | '6m' | '1y';

const fetchComplianceTrends = async (timeRange: TimeRange): Promise<TrendData[]> => {
  const response = await fetch(`/api/v2/compliance/history?timeRange=${timeRange}&aggregated=true`);
  if (!response.ok) {
    throw new Error('Failed to fetch compliance trends');
  }
  
  const data = await response.json();
  return data.trends || [];
};

const TrendsSkeleton: React.FC = () => (
  <div className="bg-white rounded-lg shadow-md p-6 animate-pulse">
    <div className="h-6 bg-gray-200 rounded w-48 mb-6"></div>
    <div className="h-80 bg-gray-200 rounded"></div>
  </div>
);

export const ComplianceTrends: React.FC = () => {
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [chartType, setChartType] = useState<'line' | 'area'>('line');

  const { data: trends, isLoading, error } = useQuery({
    queryKey: ['compliance', 'trends', timeRange],
    queryFn: () => fetchComplianceTrends(timeRange),
    refetchInterval: 300000, // Refetch every 5 minutes
  });

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="text-center py-8 text-red-500">
          <TrendingDown size={48} className="mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">Error Loading Trends</h3>
          <p className="text-sm">Please try refreshing the page</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <TrendsSkeleton />;
  }

  if (!trends || trends.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-xl font-semibold mb-4">Compliance Trends</h3>
        <div className="text-center py-8 text-gray-500">
          <Calendar size={48} className="mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium mb-2">No Trend Data Available</h3>
          <p>Not enough historical data to show trends</p>
        </div>
      </div>
    );
  }

  // Calculate trend direction
  const firstPoint = trends[0];
  const lastPoint = trends[trends.length - 1];
  const trendDirection = lastPoint.complianceRate > firstPoint.complianceRate ? 'up' : 'down';
  const trendChange = Math.abs(lastPoint.complianceRate - firstPoint.complianceRate);

  const timeRangeOptions = [
    { value: '7d', label: '7 Days' },
    { value: '30d', label: '30 Days' },
    { value: '90d', label: '90 Days' },
    { value: '6m', label: '6 Months' },
    { value: '1y', label: '1 Year' }
  ];

  const formatXAxisLabel = (tickItem: string) => {
    const date = new Date(tickItem);
    if (timeRange === '7d' || timeRange === '30d') {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  };

  const customTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-medium text-gray-900 mb-2">
            {new Date(label).toLocaleDateString('en-US', { 
              month: 'long', 
              day: 'numeric', 
              year: 'numeric' 
            })}
          </p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Compliance Rate:</span>
              <span className="font-medium text-blue-600">{data.complianceRate}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Total Repos:</span>
              <span className="font-medium">{data.totalRepos}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Compliant:</span>
              <span className="font-medium text-green-600">{data.compliantRepos}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Non-Compliant:</span>
              <span className="font-medium text-red-600">{data.nonCompliantRepos}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 space-y-4 sm:space-y-0">
        <div className="flex items-center space-x-4">
          <h3 className="text-xl font-semibold">Compliance Trends</h3>
          <div className="flex items-center space-x-2">
            {trendDirection === 'up' ? (
              <TrendingUp className="w-5 h-5 text-green-500" />
            ) : (
              <TrendingDown className="w-5 h-5 text-red-500" />
            )}
            <span className={`text-sm font-medium ${
              trendDirection === 'up' ? 'text-green-600' : 'text-red-600'
            }`}>
              {trendDirection === 'up' ? '+' : '-'}{trendChange.toFixed(1)}% 
              {timeRange === '7d' ? ' this week' : timeRange === '30d' ? ' this month' : ' in period'}
            </span>
          </div>
        </div>
        
        <div className="flex space-x-3">
          {/* Chart Type Toggle */}
          <div className="flex rounded-lg bg-gray-100 p-1">
            <button
              onClick={() => setChartType('line')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                chartType === 'line'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Line
            </button>
            <button
              onClick={() => setChartType('area')}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                chartType === 'area'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Area
            </button>
          </div>

          {/* Time Range Selector */}
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as TimeRange)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {timeRangeOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      
      <ResponsiveContainer width="100%" height={400}>
        {chartType === 'line' ? (
          <LineChart data={trends}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis 
              dataKey="date" 
              tickFormatter={formatXAxisLabel}
              stroke="#6b7280"
            />
            <YAxis stroke="#6b7280" />
            <Tooltip content={customTooltip} />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="complianceRate" 
              stroke="#3b82f6" 
              strokeWidth={3}
              dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, stroke: '#3b82f6', strokeWidth: 2 }}
              name="Compliance Rate (%)"
            />
            <Line 
              type="monotone" 
              dataKey="totalRepos" 
              stroke="#10b981" 
              strokeWidth={2}
              dot={{ fill: '#10b981', strokeWidth: 1, r: 3 }}
              name="Total Repositories"
            />
          </LineChart>
        ) : (
          <AreaChart data={trends}>
            <defs>
              <linearGradient id="complianceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis 
              dataKey="date" 
              tickFormatter={formatXAxisLabel}
              stroke="#6b7280"
            />
            <YAxis stroke="#6b7280" />
            <Tooltip content={customTooltip} />
            <Legend />
            <Area
              type="monotone"
              dataKey="complianceRate"
              stroke="#3b82f6"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#complianceGradient)"
              name="Compliance Rate (%)"
            />
          </AreaChart>
        )}
      </ResponsiveContainer>
      
      {/* Summary Stats */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-blue-600">{lastPoint.complianceRate}%</p>
            <p className="text-sm text-gray-600">Current Rate</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{lastPoint.totalRepos}</p>
            <p className="text-sm text-gray-600">Total Repos</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-600">{lastPoint.compliantRepos}</p>
            <p className="text-sm text-gray-600">Compliant</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-red-600">{lastPoint.nonCompliantRepos}</p>
            <p className="text-sm text-gray-600">Non-Compliant</p>
          </div>
        </div>
      </div>
    </div>
  );
};