import React, { useState, useEffect } from 'react';
import { AlertThresholds, KPIDefinitions } from '../types/metricsTypes';
import analyticsService from '../utils/analyticsService';

const AlertingSystem = ({ currentMetrics, onAlertConfigChange }) => {
  const [alerts, setAlerts] = useState([]);
  const [alertRules, setAlertRules] = useState({});
  const [notifications, setNotifications] = useState({
    email: { enabled: false, recipients: [] },
    webhook: { enabled: false, url: '' },
    dashboard: { enabled: true }
  });
  const [silencedAlerts, setSilencedAlerts] = useState(new Set());
  const [alertHistory, setAlertHistory] = useState([]);
  const [showConfiguration, setShowConfiguration] = useState(false);

  // Initialize alert rules from default thresholds
  useEffect(() => {
    const defaultRules = {};
    
    // Performance alert rules
    defaultRules.upload_failure_rate = {
      name: 'Upload Failure Rate',
      metric: 'uploadFailureRate',
      warning: AlertThresholds.UPLOAD_FAILURE_RATE.warning,
      critical: AlertThresholds.UPLOAD_FAILURE_RATE.critical,
      enabled: true,
      description: 'Triggers when upload failure rate exceeds threshold'
    };
    
    defaultRules.processing_delay = {
      name: 'Processing Delay',
      metric: 'processingDelay',
      warning: AlertThresholds.PROCESSING_DELAY.warning,
      critical: AlertThresholds.PROCESSING_DELAY.critical,
      enabled: true,
      description: 'Triggers when processing time exceeds threshold'
    };
    
    // Resource alert rules
    ['cpu', 'memory', 'disk'].forEach(resource => {
      defaultRules[`${resource}_usage`] = {
        name: `${resource.toUpperCase()} Usage`,
        metric: `${resource}Usage`,
        warning: AlertThresholds.RESOURCE_USAGE[resource].warning,
        critical: AlertThresholds.RESOURCE_USAGE[resource].critical,
        enabled: true,
        description: `Triggers when ${resource} usage exceeds threshold`
      };
    });
    
    defaultRules.queue_depth = {
      name: 'Queue Depth',
      metric: 'queueDepth',
      warning: AlertThresholds.QUEUE_DEPTH.warning,
      critical: AlertThresholds.QUEUE_DEPTH.critical,
      enabled: true,
      description: 'Triggers when queue depth exceeds threshold'
    };
    
    defaultRules.error_rate = {
      name: 'Error Rate',
      metric: 'errorRate',
      warning: AlertThresholds.ERROR_RATE.warning,
      critical: AlertThresholds.ERROR_RATE.critical,
      enabled: true,
      description: 'Triggers when error rate exceeds threshold'
    };
    
    setAlertRules(defaultRules);
  }, []);

  // Subscribe to analytics service for alert updates
  useEffect(() => {
    const unsubscribe = analyticsService.subscribe((event, data) => {
      if (event === 'alerts') {
        setAlerts(data);
        updateAlertHistory(data);
      }
    });

    return unsubscribe;
  }, []);

  // Check alerts based on current metrics
  useEffect(() => {
    if (currentMetrics && Object.keys(alertRules).length > 0) {
      checkAlerts(currentMetrics);
    }
  }, [currentMetrics, alertRules]);

  const checkAlerts = async (metrics) => {
    const newAlerts = [];
    
    Object.entries(alertRules).forEach(([ruleId, rule]) => {
      if (!rule.enabled) return;
      
      const metricValue = getMetricValue(metrics, rule.metric);
      if (metricValue === null || metricValue === undefined) return;
      
      let severity = null;
      if (metricValue >= rule.critical) {
        severity = 'critical';
      } else if (metricValue >= rule.warning) {
        severity = 'warning';
      }
      
      if (severity && !silencedAlerts.has(ruleId)) {
        const alert = {
          id: `${ruleId}_${Date.now()}`,
          ruleId,
          name: rule.name,
          severity,
          metric: rule.metric,
          value: metricValue,
          threshold: rule[severity],
          message: `${rule.name}: ${metricValue} exceeds ${severity} threshold (${rule[severity]})`,
          timestamp: Date.now(),
          resolved: false
        };
        
        newAlerts.push(alert);
      }
    });
    
    if (newAlerts.length > 0) {
      setAlerts(prev => [...newAlerts, ...prev.filter(alert => !alert.resolved)]);
      await sendNotifications(newAlerts);
    }
  };

  const getMetricValue = (metrics, metricName) => {
    // Navigate through nested metric structure to find the value
    const paths = metricName.split('.');
    let value = metrics;
    
    for (const path of paths) {
      if (value && typeof value === 'object') {
        value = value[path];
      } else {
        return null;
      }
    }
    
    return typeof value === 'number' ? value : null;
  };

  const sendNotifications = async (newAlerts) => {
    try {
      const payload = {
        alerts: newAlerts,
        notifications: notifications
      };
      
      const response = await fetch('/api/wiki-agent/alerts/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        console.error('Failed to send alert notifications');
      }
    } catch (error) {
      console.error('Error sending notifications:', error);
    }
  };

  const updateAlertHistory = (newAlerts) => {
    setAlertHistory(prev => [...newAlerts, ...prev].slice(0, 100)); // Keep last 100 alerts
  };

  const resolveAlert = async (alertId) => {
    try {
      const response = await fetch(`/api/wiki-agent/alerts/${alertId}/resolve`, {
        method: 'POST'
      });
      
      if (response.ok) {
        setAlerts(prev => prev.map(alert => 
          alert.id === alertId ? { ...alert, resolved: true } : alert
        ));
      }
    } catch (error) {
      console.error('Error resolving alert:', error);
    }
  };

  const silenceAlert = (ruleId, duration = 3600000) => { // 1 hour default
    setSilencedAlerts(prev => new Set([...prev, ruleId]));
    
    // Remove from silenced alerts after duration
    setTimeout(() => {
      setSilencedAlerts(prev => {
        const newSet = new Set(prev);
        newSet.delete(ruleId);
        return newSet;
      });
    }, duration);
  };

  const updateAlertRule = (ruleId, updates) => {
    setAlertRules(prev => ({
      ...prev,
      [ruleId]: { ...prev[ruleId], ...updates }
    }));
    
    if (onAlertConfigChange) {
      onAlertConfigChange({ ...alertRules, [ruleId]: { ...alertRules[ruleId], ...updates } });
    }
  };

  const updateNotificationSettings = (type, settings) => {
    setNotifications(prev => ({
      ...prev,
      [type]: { ...prev[type], ...settings }
    }));
  };

  // Alert severity color mapping
  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800';
      case 'warning': return 'text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800';
      default: return 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
    }
  };

  // Alert severity icon
  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'critical': return '🚨';
      case 'warning': return '⚠️';
      default: return 'ℹ️';
    }
  };

  // Active Alerts Component
  const ActiveAlerts = () => (
    <div className="analytics-card">
      <div className="analytics-card-header">
        <h3 className="analytics-card-title">Active Alerts</h3>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {alerts.filter(a => !a.resolved).length} active
          </span>
          <button
            onClick={() => setShowConfiguration(!showConfiguration)}
            className="analytics-btn-secondary text-sm"
          >
            Configure
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {alerts.filter(alert => !alert.resolved).map(alert => (
          <div
            key={alert.id}
            className={`border rounded-lg p-4 ${getSeverityColor(alert.severity)}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3">
                <span className="text-xl">{getSeverityIcon(alert.severity)}</span>
                <div>
                  <div className="font-medium">
                    {alert.name} - {alert.severity.toUpperCase()}
                  </div>
                  <div className="text-sm mt-1">
                    {alert.message}
                  </div>
                  <div className="text-xs mt-2 opacity-75">
                    {new Date(alert.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => silenceAlert(alert.ruleId)}
                  className="text-xs px-2 py-1 bg-white/20 rounded hover:bg-white/30 transition-colors"
                >
                  Silence 1h
                </button>
                <button
                  onClick={() => resolveAlert(alert.id)}
                  className="text-xs px-2 py-1 bg-white/20 rounded hover:bg-white/30 transition-colors"
                >
                  Resolve
                </button>
              </div>
            </div>
          </div>
        ))}
        
        {alerts.filter(alert => !alert.resolved).length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <span className="text-4xl mb-2 block">✅</span>
            No active alerts
          </div>
        )}
      </div>
    </div>
  );

  // Alert Configuration Component
  const AlertConfiguration = () => (
    showConfiguration && (
      <div className="analytics-card">
        <h3 className="analytics-card-title mb-6">Alert Configuration</h3>
        
        <div className="space-y-6">
          {/* Alert Rules */}
          <div>
            <h4 className="font-medium text-gray-900 dark:text-white mb-4">Alert Rules</h4>
            <div className="space-y-4">
              {Object.entries(alertRules).map(([ruleId, rule]) => (
                <div key={ruleId} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">
                        {rule.name}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {rule.description}
                      </div>
                    </div>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={(e) => updateAlertRule(ruleId, { enabled: e.target.checked })}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="ml-2 text-sm">Enabled</span>
                    </label>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Warning Threshold
                      </label>
                      <input
                        type="number"
                        value={rule.warning}
                        onChange={(e) => updateAlertRule(ruleId, { warning: parseFloat(e.target.value) })}
                        className="filter-input w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Critical Threshold
                      </label>
                      <input
                        type="number"
                        value={rule.critical}
                        onChange={(e) => updateAlertRule(ruleId, { critical: parseFloat(e.target.value) })}
                        className="filter-input w-full"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notification Settings */}
          <div>
            <h4 className="font-medium text-gray-900 dark:text-white mb-4">Notification Settings</h4>
            
            <div className="space-y-4">
              {/* Email Notifications */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">Email Notifications</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Send alerts via email</div>
                  </div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={notifications.email.enabled}
                      onChange={(e) => updateNotificationSettings('email', { enabled: e.target.checked })}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </label>
                </div>
                
                {notifications.email.enabled && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Recipients (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={notifications.email.recipients.join(', ')}
                      onChange={(e) => updateNotificationSettings('email', { 
                        recipients: e.target.value.split(',').map(email => email.trim()).filter(Boolean)
                      })}
                      placeholder="admin@example.com, ops@example.com"
                      className="filter-input w-full"
                    />
                  </div>
                )}
              </div>

              {/* Webhook Notifications */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">Webhook Notifications</div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">Send alerts to webhook URL</div>
                  </div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={notifications.webhook.enabled}
                      onChange={(e) => updateNotificationSettings('webhook', { enabled: e.target.checked })}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </label>
                </div>
                
                {notifications.webhook.enabled && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Webhook URL
                    </label>
                    <input
                      type="url"
                      value={notifications.webhook.url}
                      onChange={(e) => updateNotificationSettings('webhook', { url: e.target.value })}
                      placeholder="https://hooks.slack.com/services/..."
                      className="filter-input w-full"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  );

  // Alert History Component
  const AlertHistory = () => (
    <div className="analytics-card">
      <h3 className="analytics-card-title mb-4">Alert History</h3>
      
      <div className="overflow-x-auto">
        <table className="analytics-table">
          <thead>
            <tr>
              <th>Alert</th>
              <th>Severity</th>
              <th>Value</th>
              <th>Time</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {alertHistory.slice(0, 20).map(alert => (
              <tr key={alert.id}>
                <td className="font-medium">{alert.name}</td>
                <td>
                  <span className={`status-badge ${
                    alert.severity === 'critical' ? 'bg-red-100 text-red-800' :
                    alert.severity === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {alert.severity}
                  </span>
                </td>
                <td>{alert.value}</td>
                <td className="text-sm">
                  {new Date(alert.timestamp).toLocaleString()}
                </td>
                <td>
                  <span className={`status-badge ${
                    alert.resolved ? 'status-online' : 'status-warning'
                  }`}>
                    {alert.resolved ? 'Resolved' : 'Active'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {alertHistory.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No alert history
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <ActiveAlerts />
      <AlertConfiguration />
      <AlertHistory />
    </div>
  );
};

export default AlertingSystem;