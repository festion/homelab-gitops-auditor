import React, { useState, useEffect } from 'react';
import {
  Activity,
  Heart,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Server,
  Database,
  Wifi,
  HardDrive,
  Cpu,
  MemoryStick,
  RefreshCw,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { useDeploymentService } from '../../services/deploymentService';
import { useDeploymentUpdates } from '../../hooks/useDeploymentUpdates';
import type { HealthMetrics, ServiceHealth } from '../../types/deployment';

interface HealthMonitoringDashboardProps {
  className?: string;
}

export const HealthMonitoringDashboard: React.FC<HealthMonitoringDashboardProps> = ({
  className = ''
}) => {
  const { getHealthMetrics, isLoading } = useDeploymentService();
  const { subscribe } = useDeploymentUpdates();
  const [healthData, setHealthData] = useState<HealthMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchHealthMetrics = async () => {
    try {
      setError(null);
      const metrics = await getHealthMetrics();
      setHealthData(metrics);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Failed to fetch health metrics:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch health metrics');
    }
  };

  useEffect(() => {
    fetchHealthMetrics();
  }, []);

  // Subscribe to real-time health updates
  useEffect(() => {
    const unsubscribe = subscribe('health_event', (event) => {
      if (event.metrics) {
        setHealthData(event.metrics);
        setLastRefresh(new Date());
      }
    });

    return unsubscribe;
  }, [subscribe]);

  const getHealthIcon = (status: ServiceHealth['status']) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'critical':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getHealthColor = (status: ServiceHealth['status']) => {
    switch (status) {
      case 'healthy':
        return 'text-green-700 bg-green-50 border-green-200';
      case 'warning':
        return 'text-yellow-700 bg-yellow-50 border-yellow-200';
      case 'critical':
        return 'text-red-700 bg-red-50 border-red-200';
      default:
        return 'text-gray-700 bg-gray-50 border-gray-200';
    }
  };

  const getServiceIcon = (serviceName: string) => {
    const name = serviceName.toLowerCase();
    if (name.includes('database') || name.includes('postgres') || name.includes('redis')) {
      return <Database className="h-4 w-4" />;
    }
    if (name.includes('api') || name.includes('server') || name.includes('service')) {
      return <Server className="h-4 w-4" />;
    }
    if (name.includes('network') || name.includes('proxy') || name.includes('nginx')) {
      return <Wifi className="h-4 w-4" />;
    }
    return <Activity className="h-4 w-4" />;
  };

  const formatUptime = (uptime: number) => {
    const days = Math.floor(uptime / (24 * 60 * 60));
    const hours = Math.floor((uptime % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((uptime % (60 * 60)) / 60);
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const formatResponseTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const OverallHealthCard = () => {
    if (!healthData?.overall) return null;

    const { overall } = healthData;
    const scoreColor = overall.score >= 90 ? 'text-green-600' : 
                     overall.score >= 70 ? 'text-yellow-600' : 'text-red-600';

    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <Heart className="h-5 w-5 mr-2" />
            Overall System Health
          </h3>
          <div className="flex items-center space-x-2">
            {getHealthIcon(overall.status)}
            <span className={`text-2xl font-bold ${scoreColor}`}>
              {overall.score}%
            </span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div 
              className={`h-3 rounded-full transition-all duration-500 ${
                overall.score >= 90 ? 'bg-green-500' :
                overall.score >= 70 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${overall.score}%` }}
            />
          </div>

          {overall.issues.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-red-900">Active Issues</h4>
              <ul className="space-y-1">
                {overall.issues.map((issue, index) => (
                  <li key={index} className="text-sm text-red-700 flex items-center">
                    <XCircle className="h-3 w-3 mr-2 flex-shrink-0" />
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {overall.recommendations.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-blue-900">Recommendations</h4>
              <ul className="space-y-1">
                {overall.recommendations.map((rec, index) => (
                  <li key={index} className="text-sm text-blue-700 flex items-center">
                    <TrendingUp className="h-3 w-3 mr-2 flex-shrink-0" />
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={`space-y-6 ${className}`}>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <Activity className="h-5 w-5 mr-2" />
              System Health Monitoring
            </h2>
            <div className="flex items-center space-x-3">
              <span className="text-xs text-gray-500">
                Last updated: {lastRefresh.toLocaleTimeString()}
              </span>
              <button
                onClick={fetchHealthMetrics}
                disabled={isLoading}
                className="p-1 rounded-md hover:bg-gray-100 transition-colors"
                title="Refresh metrics"
              >
                <RefreshCw className={`h-4 w-4 text-gray-500 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
              <div className="flex items-center">
                <XCircle className="h-5 w-5 text-red-400 mr-2" />
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          )}

          {isLoading && !healthData && (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-blue-500 mr-2" />
              <span className="text-sm text-gray-600">Loading health metrics...</span>
            </div>
          )}

          {healthData && (
            <div className="space-y-6">
              <OverallHealthCard />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {healthData.services.map((service) => (
                  <div 
                    key={service.name}
                    className={`border rounded-lg p-4 ${getHealthColor(service.status)}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-2">
                        {getServiceIcon(service.name)}
                        <h4 className="font-medium">{service.name}</h4>
                      </div>
                      <div className="flex items-center space-x-2">
                        {getHealthIcon(service.status)}
                        <span className="text-xs font-medium uppercase tracking-wide">
                          {service.status}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="flex items-center text-gray-600 mb-1">
                          <Clock className="h-3 w-3 mr-1" />
                          Response Time
                        </div>
                        <span className="font-medium">
                          {formatResponseTime(service.response_time)}
                        </span>
                      </div>

                      <div>
                        <div className="flex items-center text-gray-600 mb-1">
                          <TrendingUp className="h-3 w-3 mr-1" />
                          Uptime
                        </div>
                        <span className="font-medium">
                          {formatUptime(service.uptime)}
                        </span>
                      </div>

                      {service.version && (
                        <div>
                          <div className="text-gray-600 mb-1">Version</div>
                          <span className="font-mono text-xs">{service.version}</span>
                        </div>
                      )}

                      <div>
                        <div className="text-gray-600 mb-1">Last Check</div>
                        <span className="text-xs">
                          {new Date(service.lastCheck).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>

                    {service.details && Object.keys(service.details).length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <h5 className="text-xs font-medium text-gray-700 mb-2">Additional Details</h5>
                        <div className="grid grid-cols-1 gap-1 text-xs">
                          {Object.entries(service.details).map(([key, value]) => (
                            <div key={key} className="flex justify-between">
                              <span className="text-gray-600">{key}:</span>
                              <span className="font-medium">{String(value)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Quick Stats Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-blue-600">Healthy Services</p>
                      <p className="text-2xl font-bold text-blue-900">
                        {healthData.services.filter(s => s.status === 'healthy').length}
                      </p>
                    </div>
                    <CheckCircle className="h-8 w-8 text-blue-500" />
                  </div>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-yellow-600">Warnings</p>
                      <p className="text-2xl font-bold text-yellow-900">
                        {healthData.services.filter(s => s.status === 'warning').length}
                      </p>
                    </div>
                    <AlertTriangle className="h-8 w-8 text-yellow-500" />
                  </div>
                </div>

                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-red-600">Critical Issues</p>
                      <p className="text-2xl font-bold text-red-900">
                        {healthData.services.filter(s => s.status === 'critical').length}
                      </p>
                    </div>
                    <XCircle className="h-8 w-8 text-red-500" />
                  </div>
                </div>

                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-green-600">Avg Response</p>
                      <p className="text-2xl font-bold text-green-900">
                        {formatResponseTime(
                          healthData.services.reduce((acc, s) => acc + s.response_time, 0) / healthData.services.length
                        )}
                      </p>
                    </div>
                    <TrendingDown className="h-8 w-8 text-green-500" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};