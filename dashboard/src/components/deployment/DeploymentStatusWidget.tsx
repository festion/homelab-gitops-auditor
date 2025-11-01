import React, { useState } from 'react';
import { 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Loader2, 
  Clock,
  User,
  GitBranch,
  RefreshCw
} from 'lucide-react';
import { useDeploymentStatus } from '../../hooks/useDeploymentStatus';
import { useDeploymentUpdates } from '../../hooks/useDeploymentUpdates';
import { DeploymentProgress } from './DeploymentProgress';
import { DeploymentMetrics } from './DeploymentMetrics';

interface DeploymentStatusWidgetProps {
  repositoryName: string;
  className?: string;
}

export const DeploymentStatusWidget: React.FC<DeploymentStatusWidgetProps> = ({
  repositoryName,
  className = ''
}) => {
  const { status, metrics, isLoading, error, refetch } = useDeploymentStatus(repositoryName);
  const { isConnected, lastUpdate } = useDeploymentUpdates();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const getStatusIcon = () => {
    if (isLoading || isRefreshing) return <Loader2 className="h-4 w-4 animate-spin" />;
    
    switch (status?.state) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'in-progress':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
      case 'queued':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      default:
        return <CheckCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusBadgeColor = () => {
    switch (status?.state) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'in-progress':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'queued':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatDuration = (startTime: string, endTime?: string) => {
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date();
    const duration = Math.floor((end.getTime() - start.getTime()) / 1000);
    
    if (duration < 60) return `${duration}s`;
    if (duration < 3600) return `${Math.floor(duration / 60)}m ${duration % 60}s`;
    return `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m`;
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 ${className} transition-all duration-200 hover:shadow-md`}>
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {getStatusIcon()}
            <h3 className="text-lg font-semibold text-gray-900">Deployment Status</h3>
          </div>
          <div className="flex items-center space-x-3">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusBadgeColor()}`}>
              {status?.state || 'idle'}
            </span>
            <div className="flex items-center space-x-2">
              <div 
                className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} 
                title={isConnected ? 'Connected' : 'Disconnected'} 
              />
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="p-1 rounded-md hover:bg-gray-100 transition-colors"
                title="Refresh status"
              >
                <RefreshCw className={`h-4 w-4 text-gray-500 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <div className="p-6">
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <div className="flex items-center">
              <XCircle className="h-5 w-5 text-red-400 mr-2" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
            <button 
              onClick={handleRefresh}
              className="mt-2 px-3 py-1 bg-red-100 text-red-700 text-sm rounded-md hover:bg-red-200 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {!status && !isLoading && (
          <div className="text-center py-8">
            <CheckCircle className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No active deployment</p>
            <p className="text-xs text-gray-400 mt-1">System is ready for new deployments</p>
          </div>
        )}

        {status && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-3">
                <div>
                  <p className="text-gray-500 mb-1">Deployment ID</p>
                  <p className="font-mono text-xs bg-gray-50 px-2 py-1 rounded border">
                    {status.deploymentId}
                  </p>
                </div>
                <div>
                  <div className="flex items-center text-gray-500 mb-1">
                    <GitBranch className="h-3 w-3 mr-1" />
                    Repository
                  </div>
                  <p className="font-medium">{status.repository}</p>
                </div>
                <div>
                  <p className="text-gray-500 mb-1">Branch</p>
                  <p className="font-medium">{status.branch}</p>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center text-gray-500 mb-1">
                    <User className="h-3 w-3 mr-1" />
                    Author
                  </div>
                  <p className="font-medium">{status.author || 'System'}</p>
                </div>
                <div>
                  <p className="text-gray-500 mb-1">Started</p>
                  <p className="font-medium">
                    {new Date(status.startTime).toLocaleTimeString()}
                  </p>
                </div>
                <div>
                  <div className="flex items-center text-gray-500 mb-1">
                    <Clock className="h-3 w-3 mr-1" />
                    Duration
                  </div>
                  <p className="font-medium">
                    {formatDuration(status.startTime, status.endTime)}
                  </p>
                </div>
              </div>
            </div>

            {status.state === 'in-progress' && (
              <DeploymentProgress
                deploymentId={status.deploymentId}
                currentStage={status.currentStage}
                stages={status.stages}
                progress={status.progress}
              />
            )}

            {metrics && (
              <DeploymentMetrics
                metrics={metrics}
                deploymentState={status.state}
              />
            )}

            {status.error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                <div className="flex items-start">
                  <AlertCircle className="h-5 w-5 text-red-400 mr-2 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-800">Deployment Error</p>
                    <p className="text-sm text-red-700 mt-1">{status.error}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {lastUpdate && (
          <div className="mt-6 pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Last updated: {new Date(lastUpdate).toLocaleTimeString()}</span>
              <span className={`flex items-center ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
                <div className={`h-1.5 w-1.5 rounded-full mr-1 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                {isConnected ? 'Live' : 'Offline'}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};