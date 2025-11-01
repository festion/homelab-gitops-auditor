import React, { useState, useEffect } from 'react';
import { useWebSocket } from '../../hooks/useWebSocket';
import StatusIndicator from './shared/StatusIndicator';
import MetricsCard from './shared/MetricsCard';
import ProgressBar from './shared/ProgressBar';
import './styles/WikiAgent.css';

const WikiAgentOverview = () => {
  const [agentStatus, setAgentStatus] = useState({
    status: 'offline',
    health: 'unknown',
    uptime: 0,
    lastCheck: null
  });

  const [metrics, setMetrics] = useState({
    documentsDiscovered: 0,
    documentsUploaded: 0,
    documentsFailed: 0,
    documentsQueued: 0,
    syncProgress: 0,
    lastSync: null
  });

  const [systemResources, setSystemResources] = useState({
    cpu: 0,
    memory: 0,
    disk: 0
  });

  const [isLoading, setIsLoading] = useState(true);

  // WebSocket connection for real-time updates
  const { isConnected, lastMessage } = useWebSocket('/api/wiki-agent/ws');

  useEffect(() => {
    // Handle WebSocket messages
    if (lastMessage) {
      const data = JSON.parse(lastMessage);
      switch (data.type) {
        case 'status_update':
          setAgentStatus(data.payload);
          break;
        case 'metrics_update':
          setMetrics(data.payload);
          break;
        case 'resources_update':
          setSystemResources(data.payload);
          break;
      }
    }
  }, [lastMessage]);

  useEffect(() => {
    // Initial data fetch
    fetchAgentData();
  }, []);

  const fetchAgentData = async () => {
    try {
      setIsLoading(true);
      const [statusRes, metricsRes, resourcesRes] = await Promise.all([
        fetch('/api/wiki-agent/status'),
        fetch('/api/wiki-agent/metrics'),
        fetch('/api/wiki-agent/resources')
      ]);

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setAgentStatus(statusData);
      }

      if (metricsRes.ok) {
        const metricsData = await metricsRes.json();
        setMetrics(metricsData);
      }

      if (resourcesRes.ok) {
        const resourcesData = await resourcesRes.json();
        setSystemResources(resourcesData);
      }
    } catch (error) {
      console.error('Error fetching agent data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAgentAction = async (action) => {
    try {
      const response = await fetch(`/api/wiki-agent/control/${action}`, {
        method: 'POST'
      });

      if (response.ok) {
        // Refresh data after action
        fetchAgentData();
      }
    } catch (error) {
      console.error(`Error performing action ${action}:`, error);
    }
  };

  const formatUptime = (seconds) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const getHealthStatus = () => {
    if (agentStatus.status === 'offline') return 'offline';
    if (agentStatus.health === 'healthy') return 'online';
    if (agentStatus.health === 'degraded') return 'processing';
    return 'error';
  };

  if (isLoading) {
    return (
      <div className="wiki-agent-panel">
        <div className="space-y-4">
          <div className="wiki-agent-skeleton h-8 w-48"></div>
          <div className="wiki-agent-metrics-grid">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="wiki-agent-skeleton h-32"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with status and actions */}
      <div className="wiki-agent-panel">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
          <div className="flex items-center space-x-4">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">WikiJS Agent</h2>
            <StatusIndicator status={getHealthStatus()} size="large" />
            {isConnected && (
              <span className="text-xs text-green-500">● Live</span>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleAgentAction('start')}
              disabled={agentStatus.status === 'online'}
              className="wiki-agent-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Start Agent
            </button>
            <button
              onClick={() => handleAgentAction('stop')}
              disabled={agentStatus.status === 'offline'}
              className="wiki-agent-btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Stop Agent
            </button>
            <button
              onClick={() => handleAgentAction('force-discovery')}
              disabled={agentStatus.status !== 'online'}
              className="wiki-agent-btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Force Discovery
            </button>
            <button
              onClick={() => handleAgentAction('emergency-stop')}
              className="wiki-agent-btn-danger"
            >
              Emergency Stop
            </button>
          </div>
        </div>

        {/* Agent info */}
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Uptime</p>
            <p className="text-lg font-medium text-gray-900 dark:text-white">
              {formatUptime(agentStatus.uptime)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Last Check</p>
            <p className="text-lg font-medium text-gray-900 dark:text-white">
              {agentStatus.lastCheck ? new Date(agentStatus.lastCheck).toLocaleTimeString() : 'Never'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Health Status</p>
            <p className="text-lg font-medium text-gray-900 dark:text-white capitalize">
              {agentStatus.health}
            </p>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="wiki-agent-metrics-grid">
        <MetricsCard
          title="Documents Discovered"
          value={metrics.documentsDiscovered}
          icon="📄"
          color="blue"
          trend="up"
          trendValue="+12"
        />
        <MetricsCard
          title="Documents Uploaded"
          value={metrics.documentsUploaded}
          icon="✅"
          color="green"
          subtitle={`${Math.round((metrics.documentsUploaded / metrics.documentsDiscovered) * 100)}% success rate`}
        />
        <MetricsCard
          title="Failed Uploads"
          value={metrics.documentsFailed}
          icon="❌"
          color="red"
          trend={metrics.documentsFailed > 0 ? "up" : "neutral"}
          trendValue={metrics.documentsFailed > 0 ? "+3" : "0"}
        />
        <MetricsCard
          title="Queue Size"
          value={metrics.documentsQueued}
          icon="⏳"
          color="yellow"
          subtitle="Awaiting processing"
        />
      </div>

      {/* System Resources */}
      <div className="wiki-agent-panel">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">System Resources</h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">CPU Usage</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">{systemResources.cpu}%</span>
            </div>
            <ProgressBar 
              progress={systemResources.cpu} 
              color={systemResources.cpu > 80 ? 'red' : systemResources.cpu > 60 ? 'yellow' : 'green'}
              height="small"
              showPercentage={false}
            />
          </div>
          
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Memory Usage</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">{systemResources.memory}%</span>
            </div>
            <ProgressBar 
              progress={systemResources.memory} 
              color={systemResources.memory > 80 ? 'red' : systemResources.memory > 60 ? 'yellow' : 'blue'}
              height="small"
              showPercentage={false}
            />
          </div>
          
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Disk Usage</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">{systemResources.disk}%</span>
            </div>
            <ProgressBar 
              progress={systemResources.disk} 
              color={systemResources.disk > 90 ? 'red' : systemResources.disk > 75 ? 'yellow' : 'purple'}
              height="small"
              showPercentage={false}
            />
          </div>
        </div>
      </div>

      {/* Sync Progress */}
      {metrics.syncProgress > 0 && metrics.syncProgress < 100 && (
        <div className="wiki-agent-panel">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Sync Progress</h3>
          <ProgressBar 
            progress={metrics.syncProgress} 
            color="blue"
            height="large"
            animated={true}
          />
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Last sync: {metrics.lastSync ? new Date(metrics.lastSync).toLocaleString() : 'Never'}
          </p>
        </div>
      )}
    </div>
  );
};

export default WikiAgentOverview;