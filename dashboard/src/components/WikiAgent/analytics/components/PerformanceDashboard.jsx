import React, { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from '../../../hooks/useWebSocket';
import analyticsService from '../utils/analyticsService';
import { KPIDefinitions, TimePeriods, MetricsUtils } from '../types/metricsTypes';
import TrendCharts from './TrendCharts';
import ErrorAnalysis from './ErrorAnalysis';
import ResourceMonitor from './ResourceMonitor';
import '../styles/analytics.css';

const PerformanceDashboard = () => {
  const [selectedPeriod, setSelectedPeriod] = useState('24h');
  const [kpiData, setKpiData] = useState({});
  const [historicalData, setHistoricalData] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  const { lastMessage } = useWebSocket('/api/wiki-agent/ws');

  // Handle real-time updates
  useEffect(() => {
    if (lastMessage) {
      const data = JSON.parse(lastMessage);
      if (data.type === 'metrics_update') {
        handleMetricsUpdate(data.payload);
      } else if (data.type === 'alerts') {
        setAlerts(data.payload);
      }
    }
  }, [lastMessage]);

  // Fetch initial data
  useEffect(() => {
    fetchDashboardData();
  }, [selectedPeriod]);

  // Subscribe to analytics service updates
  useEffect(() => {
    const unsubscribe = analyticsService.subscribe((event, data) => {
      if (event === 'metrics_update') {
        handleMetricsUpdate(data);
      } else if (event === 'alerts') {
        setAlerts(data);
      }
    });

    return unsubscribe;
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [historical, currentMetrics] = await Promise.all([
        analyticsService.getHistoricalData(selectedPeriod, ['performance', 'resources', 'errors']),
        fetch('/api/wiki-agent/metrics/current').then(res => res.json())
      ]);

      setHistoricalData(historical);
      const kpis = analyticsService.calculateKPIs(currentMetrics);
      setKpiData(kpis);
      setLastUpdate(Date.now());
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMetricsUpdate = useCallback((newMetrics) => {
    const kpis = analyticsService.calculateKPIs(newMetrics);
    setKpiData(prev => ({ ...prev, ...kpis }));
    setLastUpdate(Date.now());
  }, []);

  const KPICard = ({ title, value, target, unit, trend, icon, color = 'blue' }) => {
    const percentage = target ? (value / target) * 100 : 0;
    const status = percentage >= 100 ? 'success' : percentage >= 80 ? 'warning' : 'danger';
    
    const statusColors = {
      success: 'text-green-600 dark:text-green-400',
      warning: 'text-yellow-600 dark:text-yellow-400',
      danger: 'text-red-600 dark:text-red-400'
    };

    const formatValue = (val) => {
      if (unit === '%') return `${val.toFixed(1)}%`;
      if (unit === 'ms') return MetricsUtils.formatDuration(val);
      if (unit === 'docs/hour') return `${Math.round(val)}`;
      return val.toString();
    };

    return (
      <div className="kpi-card">
        <div className="kpi-icon">{icon}</div>
        <div className="space-y-2">
          <div className="kpi-label">{title}</div>
          <div className={`kpi-value ${statusColors[status]}`}>
            {formatValue(value)}
          </div>
          {target && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Target: {formatValue(target)}
            </div>
          )}
          {trend && (
            <div className={`kpi-trend ${
              trend > 0 ? 'kpi-trend-up' : trend < 0 ? 'kpi-trend-down' : 'kpi-trend-stable'
            }`}>
              <span>{trend > 0 ? '↗' : trend < 0 ? '↘' : '→'}</span>
              <span>{Math.abs(trend).toFixed(1)}%</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const AlertBanner = ({ alert }) => {
    const severityClasses = {
      critical: 'alert-critical',
      warning: 'alert-warning',
      info: 'alert-info'
    };

    const severityIcons = {
      critical: '🚨',
      warning: '⚠️',
      info: 'ℹ️'
    };

    return (
      <div className={`alert-banner ${severityClasses[alert.severity]}`}>
        <div className="flex items-start">
          <div className="alert-icon">
            {severityIcons[alert.severity]}
          </div>
          <div className="alert-content">
            <div className="alert-title">
              {alert.severity.toUpperCase()} Alert
            </div>
            <div className="alert-message">
              {alert.message}
            </div>
            <div className="text-xs mt-1">
              {new Date(alert.timestamp).toLocaleString()}
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="analytics-dashboard">
        <div className="analytics-card">
          <div className="analytics-skeleton h-8 w-48 mb-4"></div>
          <div className="analytics-metrics-grid">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="analytics-skeleton h-32"></div>
            ))}
          </div>
        </div>
        <div className="analytics-chart-grid">
          <div className="analytics-skeleton h-80"></div>
          <div className="analytics-skeleton h-80"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-dashboard">
      {/* Header */}
      <div className="analytics-card">
        <div className="analytics-card-header">
          <div>
            <h1 className="analytics-card-title">Performance Dashboard</h1>
            <p className="analytics-card-subtitle">
              Real-time analytics for WikiJS Agent performance and system health
            </p>
          </div>
          
          {/* Time Period Selector */}
          <div className="time-selector">
            {Object.entries(TimePeriods).map(([key, period]) => (
              <button
                key={key}
                onClick={() => setSelectedPeriod(period.value)}
                className={`time-selector-button ${
                  selectedPeriod === period.value 
                    ? 'time-selector-button-active' 
                    : 'time-selector-button-inactive'
                }`}
              >
                {period.label}
              </button>
            ))}
          </div>
        </div>

        {lastUpdate && (
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Last updated: {new Date(lastUpdate).toLocaleString()}
          </div>
        )}
      </div>

      {/* Active Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-3">
          {alerts.slice(0, 3).map((alert) => (
            <AlertBanner key={alert.id} alert={alert} />
          ))}
          {alerts.length > 3 && (
            <div className="text-center">
              <button className="analytics-btn-secondary text-sm">
                View {alerts.length - 3} more alerts
              </button>
            </div>
          )}
        </div>
      )}

      {/* KPI Grid */}
      <div className="analytics-card">
        <h2 className="analytics-card-title mb-6">Key Performance Indicators</h2>
        <div className="analytics-metrics-grid">
          <KPICard
            title="Processing Rate"
            value={kpiData.processingRate || 0}
            target={KPIDefinitions.DOCUMENT_PROCESSING_RATE.target}
            unit="docs/hour"
            icon="📊"
            trend={5.2}
          />
          <KPICard
            title="Upload Success Rate"
            value={kpiData.uploadSuccessRate || 0}
            target={KPIDefinitions.UPLOAD_SUCCESS_RATE.target}
            unit="%"
            icon="✅"
            trend={-1.3}
          />
          <KPICard
            title="Avg Processing Time"
            value={kpiData.averageProcessingTime || 0}
            target={KPIDefinitions.AVERAGE_PROCESSING_TIME.target}
            unit="ms"
            icon="⏱️"
            trend={-8.7}
          />
          <KPICard
            title="System Availability"
            value={kpiData.systemAvailability || 0}
            target={KPIDefinitions.SYSTEM_AVAILABILITY.target}
            unit="%"
            icon="🟢"
            trend={0.1}
          />
        </div>
      </div>

      {/* Charts Grid */}
      <div className="analytics-chart-grid">
        {/* Performance Trends */}
        <div className="analytics-card">
          <div className="analytics-card-header">
            <h3 className="analytics-card-title">Performance Trends</h3>
            <select 
              className="filter-select"
              defaultValue="processingRate"
            >
              <option value="processingRate">Processing Rate</option>
              <option value="uploadSuccess">Upload Success</option>
              <option value="processingTime">Processing Time</option>
              <option value="queueDepth">Queue Depth</option>
            </select>
          </div>
          <TrendCharts
            data={historicalData.performance || []}
            period={selectedPeriod}
            metric="processingRate"
            height="medium"
          />
        </div>

        {/* Resource Monitoring */}
        <div className="analytics-card">
          <div className="analytics-card-header">
            <h3 className="analytics-card-title">System Resources</h3>
            <div className="flex items-center space-x-2">
              <span className="status-badge status-online">Healthy</span>
            </div>
          </div>
          <ResourceMonitor
            data={historicalData.resources || []}
            period={selectedPeriod}
          />
        </div>

        {/* Error Analysis */}
        <div className="analytics-card analytics-full-width">
          <div className="analytics-card-header">
            <h3 className="analytics-card-title">Error Analysis</h3>
            <div className="flex items-center space-x-2">
              <select className="filter-select">
                <option value="all">All Categories</option>
                <option value="network">Network</option>
                <option value="processing">Processing</option>
                <option value="storage">Storage</option>
                <option value="sync">Synchronization</option>
              </select>
            </div>
          </div>
          <ErrorAnalysis
            data={historicalData.errors || []}
            period={selectedPeriod}
          />
        </div>
      </div>

      {/* Document Processing Stats */}
      <div className="analytics-card">
        <h3 className="analytics-card-title mb-4">Document Processing Statistics</h3>
        <div className="overflow-x-auto">
          <table className="analytics-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Current Period</th>
                <th>Previous Period</th>
                <th>Change</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="font-medium">Documents Discovered</td>
                <td>{historicalData.performance?.documentsDiscovered?.slice(-1)[0]?.value || 0}</td>
                <td>{historicalData.performance?.documentsDiscovered?.slice(-2)[0]?.value || 0}</td>
                <td className="text-green-600">+15%</td>
                <td><span className="status-badge status-online">Good</span></td>
              </tr>
              <tr>
                <td className="font-medium">Documents Processed</td>
                <td>{historicalData.performance?.documentsProcessed?.slice(-1)[0]?.value || 0}</td>
                <td>{historicalData.performance?.documentsProcessed?.slice(-2)[0]?.value || 0}</td>
                <td className="text-green-600">+12%</td>
                <td><span className="status-badge status-online">Good</span></td>
              </tr>
              <tr>
                <td className="font-medium">Upload Failures</td>
                <td>{historicalData.performance?.uploadFailures?.slice(-1)[0]?.value || 0}</td>
                <td>{historicalData.performance?.uploadFailures?.slice(-2)[0]?.value || 0}</td>
                <td className="text-red-600">+8%</td>
                <td><span className="status-badge status-warning">Attention</span></td>
              </tr>
              <tr>
                <td className="font-medium">Queue Depth</td>
                <td>{historicalData.performance?.queueDepth?.slice(-1)[0]?.value || 0}</td>
                <td>{historicalData.performance?.queueDepth?.slice(-2)[0]?.value || 0}</td>
                <td className="text-green-600">-5%</td>
                <td><span className="status-badge status-online">Good</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="analytics-card">
        <h3 className="analytics-card-title mb-4">Quick Actions</h3>
        <div className="flex flex-wrap items-center gap-4">
          <button 
            className="analytics-btn-primary"
            onClick={fetchDashboardData}
          >
            <svg className="analytics-btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh Data
          </button>
          
          <button className="analytics-btn-secondary">
            <svg className="analytics-btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Export Report
          </button>
          
          <button className="analytics-btn-secondary">
            <svg className="analytics-btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Configure Alerts
          </button>
          
          <button className="analytics-btn-secondary">
            <svg className="analytics-btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            View Details
          </button>
        </div>
      </div>
    </div>
  );
};

export default PerformanceDashboard;