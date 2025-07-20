import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  LineChart, Line, AreaChart, Area, XAxis, YAxis, 
  CartesianGrid, Tooltip, Legend, ResponsiveContainer, Brush 
} from 'recharts';
import { format, subDays } from 'date-fns';
import { TrendingUp, TrendingDown, Activity, AlertCircle } from 'lucide-react';

interface HealthMetric {
  timestamp: string;
  clean: number;
  dirty: number;
  missing: number;
  extra: number;
  totalIssues: number;
  totalRepos: number;
}

interface HealthInsight {
  type: 'improvement' | 'degradation' | 'stable';
  metric: string;
  change: number;
  description: string;
}

const fetchHealthMetrics = async (timeRange: number): Promise<HealthMetric[]> => {
  const endDate = new Date();
  const startDate = subDays(endDate, timeRange);
  
  const response = await fetch(
    `/api/v2/metrics/health?start=${startDate.toISOString()}&end=${endDate.toISOString()}`
  );
  
  if (!response.ok) {
    throw new Error('Failed to fetch health metrics');
  }
  
  const data = await response.json();
  return data.metrics || [];
};

const HealthInsights: React.FC<{ metrics?: HealthMetric[] }> = ({ metrics }) => {
  if (!metrics || metrics.length < 2) return null;

  const firstPoint = metrics[0];
  const lastPoint = metrics[metrics.length - 1];
  
  const insights: HealthInsight[] = [
    {
      type: lastPoint.clean > firstPoint.clean ? 'improvement' : 'degradation',
      metric: 'Clean Repositories',
      change: ((lastPoint.clean - firstPoint.clean) / firstPoint.clean) * 100,
      description: `${Math.abs(lastPoint.clean - firstPoint.clean)} repositories changed status`
    },
    {
      type: lastPoint.totalIssues < firstPoint.totalIssues ? 'improvement' : 'degradation',
      metric: 'Total Issues',
      change: ((lastPoint.totalIssues - firstPoint.totalIssues) / firstPoint.totalIssues) * 100,
      description: `${Math.abs(lastPoint.totalIssues - firstPoint.totalIssues)} issue change`
    }
  ];

  return (
    <div className="mt-6 pt-4 border-t border-gray-200">
      <h4 className="font-medium text-gray-700 mb-3 flex items-center space-x-2">
        <Activity className="w-4 h-4" />
        <span>Key Insights</span>
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {insights.map((insight, index) => (
          <div key={index} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
            {insight.type === 'improvement' ? (
              <TrendingUp className="w-5 h-5 text-green-500 mt-0.5" />
            ) : insight.type === 'degradation' ? (
              <TrendingDown className="w-5 h-5 text-red-500 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-gray-500 mt-0.5" />
            )}
            <div>
              <p className="font-medium text-sm">{insight.metric}</p>
              <p className={`text-sm ${
                insight.type === 'improvement' ? 'text-green-600' : 
                insight.type === 'degradation' ? 'text-red-600' : 'text-gray-600'
              }`}>
                {insight.change > 0 ? '+' : ''}{insight.change.toFixed(1)}%
              </p>
              <p className="text-xs text-gray-600">{insight.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const HealthTimelineSkeleton: React.FC = () => (
  <div className="bg-white rounded-lg shadow-md p-6 animate-pulse">
    <div className="flex justify-between items-center mb-6">
      <div className="h-6 bg-gray-200 rounded w-48"></div>
      <div className="flex space-x-2">
        <div className="h-8 bg-gray-200 rounded w-12"></div>
        <div className="h-8 bg-gray-200 rounded w-12"></div>
        <div className="h-8 bg-gray-200 rounded w-12"></div>
      </div>
    </div>
    <div className="h-80 bg-gray-200 rounded mb-4"></div>
    <div className="h-20 bg-gray-200 rounded"></div>
  </div>
);

export const RepositoryHealthTimeline: React.FC = () => {
  const [timeRange, setTimeRange] = useState<7 | 30 | 90>(30);
  const [selectedMetrics, setSelectedMetrics] = useState(['clean', 'dirty', 'totalIssues']);
  const [chartType, setChartType] = useState<'line' | 'area'>('line');

  const { data: metrics, isLoading, error } = useQuery({
    queryKey: ['analytics', 'health', timeRange],
    queryFn: () => fetchHealthMetrics(timeRange),
    refetchInterval: 300000, // 5 minutes
  });

  const colors = {
    clean: '#10b981',
    dirty: '#ef4444',
    missing: '#f59e0b',
    extra: '#8b5cf6',
    totalIssues: '#6b7280',
    totalRepos: '#3b82f6'
  };

  const metricLabels = {
    clean: 'Clean',
    dirty: 'Dirty',
    missing: 'Missing',
    extra: 'Extra',
    totalIssues: 'Total Issues',
    totalRepos: 'Total Repos'
  };

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="text-center py-8 text-red-500">
          <AlertCircle size={48} className="mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">Error Loading Health Data</h3>
          <p className="text-sm">Please try refreshing the page</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <HealthTimelineSkeleton />;
  }

  const customTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-medium text-gray-900 mb-2">
            {format(new Date(label), 'PPp')}
          </p>
          <div className="space-y-1">
            {payload.map((entry: any, index: number) => (
              <div key={index} className="flex justify-between items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <div 
                    className="w-3 h-3 rounded"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-sm text-gray-600">
                    {metricLabels[entry.dataKey as keyof typeof metricLabels]}:
                  </span>
                </div>
                <span className="font-medium">{entry.value}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 space-y-4 sm:space-y-0">
        <h3 className="text-xl font-semibold">Repository Health Trends</h3>
        
        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
          {/* Chart type toggle */}
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

          {/* Time range selector */}
          <div className="flex space-x-2">
            {([7, 30, 90] as const).map(days => (
              <button
                key={days}
                onClick={() => setTimeRange(days)}
                className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                  timeRange === days
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {days}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Metric toggles */}
      <div className="flex flex-wrap gap-3 mb-6 p-4 bg-gray-50 rounded-lg">
        {Object.entries(colors).map(([metric, color]) => (
          <label key={metric} className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedMetrics.includes(metric)}
              onChange={(e) => {
                if (e.target.checked) {
                  setSelectedMetrics([...selectedMetrics, metric]);
                } else {
                  setSelectedMetrics(selectedMetrics.filter(m => m !== metric));
                }
              }}
              className="rounded"
            />
            <div className="flex items-center space-x-1">
              <div 
                className="w-3 h-3 rounded"
                style={{ backgroundColor: color }}
              />
              <span className="text-sm font-medium">
                {metricLabels[metric as keyof typeof metricLabels]}
              </span>
            </div>
          </label>
        ))}
      </div>

      {/* Chart */}
      <div className="h-96">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'line' ? (
            <LineChart data={metrics}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="timestamp" 
                tickFormatter={(value) => format(new Date(value), 'MM/dd')}
                stroke="#6b7280"
              />
              <YAxis stroke="#6b7280" />
              <Tooltip content={customTooltip} />
              <Legend />
              <Brush 
                dataKey="timestamp" 
                height={30} 
                stroke="#3b82f6"
                tickFormatter={(value) => format(new Date(value), 'MM/dd')}
              />
              
              {selectedMetrics.map(metric => (
                <Line
                  key={metric}
                  type="monotone"
                  dataKey={metric}
                  stroke={colors[metric as keyof typeof colors]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, stroke: colors[metric as keyof typeof colors], strokeWidth: 2 }}
                />
              ))}
            </LineChart>
          ) : (
            <AreaChart data={metrics}>
              <defs>
                {selectedMetrics.map(metric => (
                  <linearGradient key={metric} id={`gradient-${metric}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={colors[metric as keyof typeof colors]} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={colors[metric as keyof typeof colors]} stopOpacity={0}/>
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis 
                dataKey="timestamp" 
                tickFormatter={(value) => format(new Date(value), 'MM/dd')}
                stroke="#6b7280"
              />
              <YAxis stroke="#6b7280" />
              <Tooltip content={customTooltip} />
              <Legend />
              
              {selectedMetrics.map(metric => (
                <Area
                  key={metric}
                  type="monotone"
                  dataKey={metric}
                  stroke={colors[metric as keyof typeof colors]}
                  strokeWidth={2}
                  fillOpacity={1}
                  fill={`url(#gradient-${metric})`}
                />
              ))}
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Insights */}
      <HealthInsights metrics={metrics} />
    </div>
  );
};