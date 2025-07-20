import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  PlayIcon, 
  CheckCircleIcon, 
  XCircleIcon, 
  ClockIcon,
  ArrowTrendingUpIcon as TrendingUpIcon,
  ArrowTrendingDownIcon as TrendingDownIcon,
  MinusIcon
} from '@heroicons/react/24/outline';
import { MetricCard } from './MetricCard';
import { PipelinePerformanceChart } from './PipelinePerformanceChart';
import { RepositorySuccessChart } from './RepositorySuccessChart';
import { FailureAnalysisChart } from './FailureAnalysisChart';
import { ResourceUsageChart } from './ResourceUsageChart';

interface PipelineMetricsData {
  totalRuns: number;
  totalRunsChange: number;
  successRate: number;
  successRateChange: number;
  avgDuration: number;
  durationChange: number;
  failedRuns: number;
  failedRunsChange: number;
  performance: Array<{
    date: string;
    success: number;
    failed: number;
    duration: number;
  }>;
  repositorySuccess: Array<{
    repository: string;
    successRate: number;
    totalRuns: number;
  }>;
  failureAnalysis: Array<{
    reason: string;
    count: number;
    percentage: number;
  }>;
  resourceUsage: Array<{
    date: string;
    cpu: number;
    memory: number;
    storage: number;
  }>;
}

const fetchPipelineMetrics = async (timeRange: string): Promise<PipelineMetricsData> => {
  const response = await fetch(`/api/pipeline-metrics?timeRange=${timeRange}`);
  if (!response.ok) {
    throw new Error('Failed to fetch pipeline metrics');
  }
  return response.json();
};

const formatDuration = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (hours > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }
  return `${minutes}m ${seconds % 60}s`;
};

export const PipelineMetrics: React.FC = () => {
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('7d');
  
  const { data: metrics, isLoading, error } = useQuery({
    queryKey: ['pipeline-metrics', timeRange],
    queryFn: () => fetchPipelineMetrics(timeRange),
    refetchInterval: 300000 // Refresh every 5 minutes
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div className="bg-red-50 p-4 rounded-lg">
        <p className="text-red-600">Error loading pipeline metrics</p>
      </div>
    );
  }

  const getChangeIcon = (change: number) => {
    if (change > 0) return <TrendingUpIcon className="h-4 w-4" />;
    if (change < 0) return <TrendingDownIcon className="h-4 w-4" />;
    return <MinusIcon className="h-4 w-4" />;
  };

  return (
    <div>
      {/* Time range selector */}
      <div className="mb-6 flex justify-end">
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value as any)}
          className="border rounded px-3 py-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="24h">Last 24 Hours</option>
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
        </select>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          title="Total Runs"
          value={metrics.totalRuns.toLocaleString()}
          change={metrics.totalRunsChange}
          changeLabel={`${Math.abs(metrics.totalRunsChange)}% from previous period`}
          icon={PlayIcon}
          iconColor="text-blue-600"
          changeIcon={getChangeIcon(metrics.totalRunsChange)}
        />
        <MetricCard
          title="Success Rate"
          value={`${metrics.successRate.toFixed(1)}%`}
          change={metrics.successRateChange}
          changeLabel={`${Math.abs(metrics.successRateChange).toFixed(1)}% from previous period`}
          icon={CheckCircleIcon}
          iconColor="text-green-600"
          changeIcon={getChangeIcon(metrics.successRateChange)}
        />
        <MetricCard
          title="Avg Duration"
          value={formatDuration(metrics.avgDuration)}
          change={metrics.durationChange}
          changeLabel={`${Math.abs(metrics.durationChange)}% from previous period`}
          icon={ClockIcon}
          iconColor="text-purple-600"
          changeIcon={getChangeIcon(metrics.durationChange)}
          negative={metrics.durationChange > 0} // Longer duration is negative
        />
        <MetricCard
          title="Failed Runs"
          value={metrics.failedRuns.toLocaleString()}
          change={metrics.failedRunsChange}
          changeLabel={`${Math.abs(metrics.failedRunsChange)}% from previous period`}
          icon={XCircleIcon}
          iconColor="text-red-600"
          changeIcon={getChangeIcon(metrics.failedRunsChange)}
          negative={metrics.failedRunsChange > 0} // More failures is negative
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Pipeline Performance</h3>
          <PipelinePerformanceChart data={metrics.performance} />
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Success Rate by Repository</h3>
          <RepositorySuccessChart data={metrics.repositorySuccess} />
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Failure Analysis</h3>
          <FailureAnalysisChart data={metrics.failureAnalysis} />
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">Resource Usage</h3>
          <ResourceUsageChart data={metrics.resourceUsage} />
        </div>
      </div>
    </div>
  );
};