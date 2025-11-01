import React, { useEffect, useState, useCallback } from 'react';
import { useWebSocket } from '../../hooks/useWebSocket';
import { Pipeline } from '../../types/pipeline';
import { PipelineCard } from './PipelineCard';
import { PipelineTimeline } from './PipelineTimeline';
import { PipelineDetailsModal } from './PipelineDetailsModal';

// Development configuration
const API_BASE_URL = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3070';

interface PipelineStatusProps {
  className?: string;
}

export const PipelineStatus: React.FC<PipelineStatusProps> = ({ className = '' }) => {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  // WebSocket connection for real-time updates
  const { isConnected, lastMessage, sendMessage } = useWebSocket(
    `ws://${window.location.hostname}:3070/ws`,
    {
      reconnect: true,
      maxReconnectAttempts: 5,
      onMessage: handleWebSocketMessage,
      onConnect: () => {
        console.log('Pipeline WebSocket connected');
        // Subscribe to pipeline updates
        sendMessage({ type: 'subscribe', channel: 'pipelines' });
      },
      onError: (error) => {
        console.error('Pipeline WebSocket error:', error);
        setError('WebSocket connection failed');
      }
    }
  );

  // Handle WebSocket messages
  function handleWebSocketMessage(message: any) {
    if (message.type === 'pipeline:status') {
      setPipelines(message.data || []);
    } else if (message.type === 'pipeline:update') {
      setPipelines(prev => {
        const updated = [...prev];
        const index = updated.findIndex(p => p.runId === message.data.runId);
        if (index >= 0) {
          updated[index] = { ...updated[index], ...message.data };
        }
        return updated;
      });
    }
  }

  // Fetch initial pipeline data
  const fetchPipelineData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`${API_BASE_URL}/api/v2/pipelines`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setPipelines(data.pipelines || []);
    } catch (err) {
      console.error('Failed to fetch pipeline data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load pipeline data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Trigger pipeline run
  const handleTriggerPipeline = useCallback(async (pipeline: Pipeline) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v2/pipelines/trigger`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          repository: pipeline.repository,
          branch: pipeline.branch,
          workflowName: pipeline.workflowName
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to trigger pipeline: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Pipeline triggered:', result);
      
      // Refresh data after triggering
      setTimeout(fetchPipelineData, 1000);
    } catch (err) {
      console.error('Failed to trigger pipeline:', err);
      alert(`Failed to trigger pipeline: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [fetchPipelineData]);

  // Show pipeline details
  const handleViewDetails = useCallback((pipeline: Pipeline) => {
    setSelectedPipeline(pipeline);
    setShowDetails(true);
  }, []);

  // Close details modal
  const handleCloseDetails = useCallback(() => {
    setShowDetails(false);
    setSelectedPipeline(null);
  }, []);

  // Load initial data
  useEffect(() => {
    fetchPipelineData();
  }, [fetchPipelineData]);

  // Auto-refresh if WebSocket is not connected
  useEffect(() => {
    if (!isConnected) {
      const interval = setInterval(fetchPipelineData, 30000); // 30 seconds
      return () => clearInterval(interval);
    }
  }, [isConnected, fetchPipelineData]);

  // Filter pipelines by status for display
  const runningPipelines = pipelines.filter(p => p.status === 'running');
  const recentPipelines = pipelines
    .sort((a, b) => new Date(b.lastRun).getTime() - new Date(a.lastRun).getTime())
    .slice(0, 10);

  if (loading) {
    return (
      <div className={`pipeline-status-container ${className}`}>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading pipelines...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`pipeline-status-container ${className}`}>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Pipeline Error</h3>
              <div className="mt-2 text-sm text-red-700">{error}</div>
              <div className="mt-4">
                <button
                  onClick={fetchPipelineData}
                  className="bg-red-100 hover:bg-red-200 text-red-800 px-3 py-1 rounded text-sm"
                >
                  Retry
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`pipeline-status-container space-y-6 ${className}`}>
      {/* Header with connection status */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Pipeline Status</h2>
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`}></div>
          <span className="text-sm text-gray-600">
            {isConnected ? 'Live' : 'Polling'}
          </span>
          <button
            onClick={fetchPipelineData}
            className="ml-2 px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Running pipelines section */}
      {runningPipelines.length > 0 && (
        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-3">Currently Running</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {runningPipelines.map((pipeline) => (
              <PipelineCard
                key={`${pipeline.repository}-${pipeline.runId}`}
                pipeline={pipeline}
                onTrigger={handleTriggerPipeline}
                onViewDetails={handleViewDetails}
              />
            ))}
          </div>
        </div>
      )}

      {/* All pipelines grid */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-3">
          All Pipelines ({pipelines.length})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pipelines.map((pipeline) => (
            <PipelineCard
              key={`${pipeline.repository}-${pipeline.runId}`}
              pipeline={pipeline}
              onTrigger={handleTriggerPipeline}
              onViewDetails={handleViewDetails}
            />
          ))}
        </div>
      </div>

      {/* Timeline section */}
      {recentPipelines.length > 0 && (
        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-3">Recent Activity</h3>
          <PipelineTimeline pipelines={recentPipelines} />
        </div>
      )}

      {/* Details modal */}
      {selectedPipeline && (
        <PipelineDetailsModal
          pipeline={selectedPipeline}
          isOpen={showDetails}
          onClose={handleCloseDetails}
        />
      )}
    </div>
  );
};

// Utility functions
export const formatDuration = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
};

export const formatRelativeTime = (timestamp: string): string => {
  const now = new Date();
  const time = new Date(timestamp);
  const diff = now.getTime() - time.getTime();
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'Just now';
};