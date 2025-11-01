import React from 'react';
import { Activity, HardDrive, Cpu, MemoryStick, Network, TestTube, Clock } from 'lucide-react';
import type { DeploymentMetrics as DeploymentMetricsType, DeploymentStatus } from '../../types/deployment';

interface DeploymentMetricsProps {
  metrics: DeploymentMetricsType;
  deploymentState: DeploymentStatus['state'];
}

export const DeploymentMetrics: React.FC<DeploymentMetricsProps> = ({
  metrics,
  deploymentState
}) => {
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  const getUsageColor = (percentage: number) => {
    if (percentage < 50) return 'text-green-600 bg-green-100';
    if (percentage < 75) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const getUsageBarColor = (percentage: number) => {
    if (percentage < 50) return 'bg-green-500';
    if (percentage < 75) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const MetricCard = ({ 
    icon, 
    label, 
    value, 
    unit, 
    percentage, 
    color = 'text-gray-600' 
  }: {
    icon: React.ReactNode;
    label: string;
    value: number | string;
    unit?: string;
    percentage?: number;
    color?: string;
  }) => (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <div className={color}>
            {icon}
          </div>
          <span className="text-sm font-medium text-gray-700">{label}</span>
        </div>
        <span className="text-lg font-semibold text-gray-900">
          {value}{unit && <span className="text-sm text-gray-500 ml-1">{unit}</span>}
        </span>
      </div>
      {percentage !== undefined && (
        <div className="space-y-1">
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div 
              className={`h-1.5 rounded-full transition-all duration-300 ${getUsageBarColor(percentage)}`}
              style={{ width: `${Math.min(percentage, 100)}%` }}
            />
          </div>
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${getUsageColor(percentage)}`}>
            {percentage.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-900 flex items-center">
          <Activity className="h-4 w-4 mr-2" />
          System Metrics
        </h4>
        <span className={`text-xs px-2 py-1 rounded-full ${
          deploymentState === 'in-progress' ? 'bg-blue-100 text-blue-700' :
          deploymentState === 'completed' ? 'bg-green-100 text-green-700' :
          deploymentState === 'failed' ? 'bg-red-100 text-red-700' :
          'bg-gray-100 text-gray-700'
        }`}>
          {deploymentState === 'in-progress' ? 'Live' : 'Final'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          icon={<Cpu className="h-4 w-4" />}
          label="CPU Usage"
          value={metrics.cpuUsage.toFixed(1)}
          unit="%"
          percentage={metrics.cpuUsage}
          color="text-blue-600"
        />
        
        <MetricCard
          icon={<MemoryStick className="h-4 w-4" />}
          label="Memory Usage"
          value={metrics.memoryUsage.toFixed(1)}
          unit="%"
          percentage={metrics.memoryUsage}
          color="text-purple-600"
        />
        
        <MetricCard
          icon={<HardDrive className="h-4 w-4" />}
          label="Disk Usage"
          value={metrics.diskUsage.toFixed(1)}
          unit="%"
          percentage={metrics.diskUsage}
          color="text-orange-600"
        />
        
        <MetricCard
          icon={<Network className="h-4 w-4" />}
          label="Network I/O"
          value={formatBytes(metrics.networkIO)}
          color="text-green-600"
        />
      </div>

      {(metrics.deploymentDuration !== undefined || 
        metrics.testsRun !== undefined) && (
        <div className="grid grid-cols-2 gap-3">
          {metrics.deploymentDuration !== undefined && (
            <MetricCard
              icon={<Clock className="h-4 w-4" />}
              label="Duration"
              value={formatDuration(metrics.deploymentDuration)}
              color="text-indigo-600"
            />
          )}
          
          {metrics.testsRun !== undefined && (
            <MetricCard
              icon={<TestTube className="h-4 w-4" />}
              label="Tests"
              value={`${metrics.testsPassed || 0}/${metrics.testsRun}`}
              color="text-green-600"
            />
          )}
        </div>
      )}

      {metrics.testsFailed && metrics.testsFailed > 0 && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-center">
            <TestTube className="h-4 w-4 text-red-500 mr-2" />
            <span className="text-sm font-medium text-red-800">
              {metrics.testsFailed} test{metrics.testsFailed !== 1 ? 's' : ''} failed
            </span>
          </div>
        </div>
      )}

      <div className="text-xs text-gray-500 text-center">
        Metrics updated in real-time during deployment
      </div>
    </div>
  );
};