/**
 * WebSocket Integration Example
 * 
 * This file demonstrates how to integrate the real-time WebSocket system
 * into existing components across the dashboard.
 */

import React, { useState } from 'react';
import { WebSocketProvider } from '../../contexts/WebSocketContext';
import { ConnectionStatus } from '../websocket/ConnectionStatus';
import { LiveActivityFeed } from '../activity/LiveActivityFeed';
import { 
  useRealTimeUpdates, 
  usePipelineRealTimeUpdates,
  useAuditRealTimeUpdates 
} from '../../hooks/useRealTimeUpdates';
import { useOptimisticUpdates } from '../../hooks/useOptimisticUpdates';

// Example: Enhanced Repository Card with Real-time Updates
const RealtimeRepositoryCard: React.FC<{ repository: string }> = ({ repository }) => {
  const [repoData, setRepoData] = useState<any>({ name: repository, status: 'unknown' });
  const { updateRepository } = useOptimisticUpdates();

  // Subscribe to repository-specific events
  useRealTimeUpdates(`repo:updated`, (data: any) => {
    if (data.repository === repository) {
      setRepoData((prev: any) => ({ ...prev, ...data.changes, lastUpdated: data.timestamp }));
    }
  }, [repository]);

  // Subscribe to compliance changes
  useRealTimeUpdates('compliance:changed', (data: any) => {
    if (data.repository === repository) {
      setRepoData((prev: any) => ({ ...prev, compliant: data.compliant }));
    }
  }, [repository]);

  const handleUpdateCompliance = async () => {
    try {
      await updateRepository(repository, { compliant: !repoData.compliant });
    } catch (error) {
      console.error('Failed to update compliance:', error);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-4 border">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">{repoData.name}</h3>
        <div className={`w-3 h-3 rounded-full ${repoData.compliant ? 'bg-green-500' : 'bg-red-500'}`} />
      </div>
      
      <div className="text-sm text-gray-600 space-y-1">
        <p>Status: {repoData.status}</p>
        <p>Compliant: {repoData.compliant ? 'Yes' : 'No'}</p>
        {repoData.lastUpdated && (
          <p>Updated: {new Date(repoData.lastUpdated).toLocaleTimeString()}</p>
        )}
      </div>

      <button
        onClick={handleUpdateCompliance}
        className="mt-3 px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
      >
        Toggle Compliance
      </button>
    </div>
  );
};

// Example: Pipeline Status with Real-time Updates
const RealtimePipelineStatus: React.FC<{ repository: string; workflow?: string }> = ({ 
  repository, 
  workflow 
}) => {
  const [pipelineStatus, setPipelineStatus] = useState<any>({ status: 'idle', runs: [] });
  const { triggerPipeline } = useOptimisticUpdates();

  // Subscribe to pipeline events for this repository/workflow
  usePipelineRealTimeUpdates(repository, (event: string, data: any) => {
    switch (event) {
      case 'pipeline:started':
        setPipelineStatus((prev: any) => ({
          ...prev,
          status: 'running',
          currentRun: data.runId
        }));
        break;
      
      case 'pipeline:completed':
        setPipelineStatus((prev: any) => ({
          ...prev,
          status: data.conclusion,
          lastRun: data.runId,
          duration: data.duration
        }));
        break;
      
      case 'pipeline:failed':
        setPipelineStatus((prev: any) => ({
          ...prev,
          status: 'failed',
          error: data.error,
          failedStep: data.failedStep
        }));
        break;
    }
  }, workflow, [repository, workflow]);

  const handleTriggerPipeline = async () => {
    if (!workflow) return;
    
    try {
      await triggerPipeline(repository, workflow);
    } catch (error) {
      console.error('Failed to trigger pipeline:', error);
    }
  };

  const getStatusColor = () => {
    switch (pipelineStatus.status) {
      case 'running': return 'text-blue-500';
      case 'success': return 'text-green-500';
      case 'failed': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-4 border">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">Pipeline: {workflow || 'All'}</h3>
        <span className={`text-sm font-medium ${getStatusColor()}`}>
          {pipelineStatus.status}
        </span>
      </div>

      <div className="text-sm text-gray-600 space-y-1">
        <p>Repository: {repository}</p>
        {pipelineStatus.currentRun && (
          <p>Current Run: #{pipelineStatus.currentRun}</p>
        )}
        {pipelineStatus.duration && (
          <p>Duration: {pipelineStatus.duration}s</p>
        )}
        {pipelineStatus.error && (
          <p className="text-red-600">Error: {pipelineStatus.error}</p>
        )}
      </div>

      {workflow && (
        <button
          onClick={handleTriggerPipeline}
          disabled={pipelineStatus.status === 'running'}
          className="mt-3 px-3 py-1 bg-purple-500 text-white rounded text-sm hover:bg-purple-600 disabled:opacity-50"
        >
          {pipelineStatus.status === 'running' ? 'Running...' : 'Trigger Pipeline'}
        </button>
      )}
    </div>
  );
};

// Example: Audit Dashboard with Real-time Updates
const RealtimeAuditDashboard: React.FC = () => {
  const [auditState, setAuditState] = useState<any>({
    running: false,
    progress: 0,
    results: null
  });

  // Subscribe to audit events
  useAuditRealTimeUpdates((event, data) => {
    switch (event) {
      case 'audit:started':
        setAuditState((prev: any) => ({
          ...prev,
          running: true,
          startedAt: data.timestamp,
          progress: 0
        }));
        break;
      
      case 'audit:progress':
        setAuditState((prev: any) => ({
          ...prev,
          progress: data.progress,
          currentRepo: data.currentRepo
        }));
        break;
      
      case 'audit:completed':
        setAuditState((prev: any) => ({
          ...prev,
          running: false,
          results: data.results,
          duration: data.duration,
          completedAt: new Date().toISOString()
        }));
        break;
    }
  });

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-4">Audit Dashboard</h2>
      
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-50 p-4 rounded">
          <h3 className="font-semibold mb-2">Status</h3>
          <p className={`text-lg ${auditState.running ? 'text-blue-500' : 'text-gray-500'}`}>
            {auditState.running ? 'Running' : 'Idle'}
          </p>
          {auditState.running && (
            <div className="mt-2">
              <div className="bg-blue-200 rounded-full h-2">
                <div 
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${auditState.progress}%` }}
                />
              </div>
              <p className="text-sm text-gray-600 mt-1">
                {auditState.progress}% complete
              </p>
              {auditState.currentRepo && (
                <p className="text-sm text-gray-600">
                  Scanning: {auditState.currentRepo}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="bg-gray-50 p-4 rounded">
          <h3 className="font-semibold mb-2">Last Results</h3>
          {auditState.results ? (
            <div className="text-sm">
              <p>Compliant: {auditState.results.compliant || 0}</p>
              <p>Non-compliant: {auditState.results.nonCompliant || 0}</p>
              <p>Duration: {auditState.duration}s</p>
            </div>
          ) : (
            <p className="text-gray-500">No recent results</p>
          )}
        </div>
      </div>
    </div>
  );
};

// Main Example Component showing integration
export const WebSocketIntegrationExample: React.FC = () => {
  return (
    <WebSocketProvider>
      <div className="min-h-screen bg-gray-100 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold">WebSocket Integration Example</h1>
            <ConnectionStatus />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="lg:col-span-2 space-y-6">
              {/* Audit Dashboard */}
              <RealtimeAuditDashboard />

              {/* Repository Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <RealtimeRepositoryCard repository="repo-1" />
                <RealtimeRepositoryCard repository="repo-2" />
              </div>

              {/* Pipeline Status */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <RealtimePipelineStatus repository="repo-1" workflow="CI" />
                <RealtimePipelineStatus repository="repo-2" workflow="Deploy" />
              </div>
            </div>

            {/* Activity Feed */}
            <div className="lg:col-span-1">
              <LiveActivityFeed compact={false} />
            </div>
          </div>

          {/* Integration Notes */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-blue-900 mb-3">
              Integration Notes
            </h2>
            <div className="text-blue-800 text-sm space-y-2">
              <p>• All components automatically receive real-time updates via WebSocket</p>
              <p>• Optimistic updates provide immediate feedback before server confirmation</p>
              <p>• Connection status is monitored and displayed to users</p>
              <p>• Activity feed shows live system events and changes</p>
              <p>• Failed operations are automatically rolled back</p>
              <p>• Components only subscribe to relevant events for performance</p>
            </div>
          </div>
        </div>
      </div>
    </WebSocketProvider>
  );
};

export default WebSocketIntegrationExample;