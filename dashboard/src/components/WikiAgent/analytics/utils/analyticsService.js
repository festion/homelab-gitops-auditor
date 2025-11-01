// Analytics Service for WikiJS Agent Data Processing

import { AnalyticsConfig, MetricsUtils, TimePeriods } from '../types/metricsTypes';

class AnalyticsService {
  constructor() {
    this.cache = new Map();
    this.subscribers = new Set();
  }

  // Data Collection Methods
  async collectMetrics() {
    try {
      const timestamp = Date.now();
      const [performance, resources, errors] = await Promise.all([
        this.fetchPerformanceMetrics(),
        this.fetchResourceMetrics(),
        this.fetchErrorMetrics()
      ]);

      const metrics = {
        timestamp,
        performance,
        resources,
        errors
      };

      // Store metrics
      await this.storeMetrics(metrics);
      
      // Notify subscribers
      this.notifySubscribers('metrics_update', metrics);
      
      return metrics;
    } catch (error) {
      console.error('Error collecting metrics:', error);
      throw error;
    }
  }

  async fetchPerformanceMetrics() {
    const response = await fetch('/api/wiki-agent/metrics/performance');
    if (!response.ok) throw new Error('Failed to fetch performance metrics');
    return response.json();
  }

  async fetchResourceMetrics() {
    const response = await fetch('/api/wiki-agent/metrics/resources');
    if (!response.ok) throw new Error('Failed to fetch resource metrics');
    return response.json();
  }

  async fetchErrorMetrics() {
    const response = await fetch('/api/wiki-agent/metrics/errors');
    if (!response.ok) throw new Error('Failed to fetch error metrics');
    return response.json();
  }

  async storeMetrics(metrics) {
    const response = await fetch('/api/wiki-agent/metrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metrics)
    });
    
    if (!response.ok) throw new Error('Failed to store metrics');
    return response.json();
  }

  // Data Retrieval Methods
  async getHistoricalData(period = '24h', metricTypes = ['performance', 'resources']) {
    const cacheKey = `historical_${period}_${metricTypes.join('_')}`;
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < AnalyticsConfig.performance.cacheExpiration) {
        return cached.data;
      }
    }

    try {
      const timePeriod = TimePeriods[period.toUpperCase()] || TimePeriods.LAST_24_HOURS;
      const endTime = Date.now();
      const startTime = endTime - timePeriod.duration;

      const response = await fetch(`/api/wiki-agent/metrics/historical?` + 
        `start=${startTime}&end=${endTime}&types=${metricTypes.join(',')}`);
      
      if (!response.ok) throw new Error('Failed to fetch historical data');
      
      const data = await response.json();
      
      // Cache the result
      this.cache.set(cacheKey, {
        timestamp: Date.now(),
        data
      });
      
      return data;
    } catch (error) {
      console.error('Error fetching historical data:', error);
      throw error;
    }
  }

  async getTrendAnalysis(metric, period = '7d') {
    try {
      const data = await this.getHistoricalData(period, [metric]);
      return this.calculateTrends(data[metric] || []);
    } catch (error) {
      console.error('Error getting trend analysis:', error);
      throw error;
    }
  }

  calculateTrends(dataPoints) {
    if (!dataPoints || dataPoints.length < 2) {
      return { trend: 'insufficient_data', change: 0, confidence: 0 };
    }

    // Simple linear regression for trend calculation
    const n = dataPoints.length;
    const sumX = dataPoints.reduce((sum, _, i) => sum + i, 0);
    const sumY = dataPoints.reduce((sum, point) => sum + point.value, 0);
    const sumXY = dataPoints.reduce((sum, point, i) => sum + (i * point.value), 0);
    const sumXX = dataPoints.reduce((sum, _, i) => sum + (i * i), 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Calculate correlation coefficient for confidence
    const avgX = sumX / n;
    const avgY = sumY / n;
    const numerator = dataPoints.reduce((sum, point, i) => sum + ((i - avgX) * (point.value - avgY)), 0);
    const denomX = Math.sqrt(dataPoints.reduce((sum, _, i) => sum + Math.pow(i - avgX, 2), 0));
    const denomY = Math.sqrt(dataPoints.reduce((sum, point) => sum + Math.pow(point.value - avgY, 2), 0));
    
    const correlation = numerator / (denomX * denomY);
    const confidence = Math.abs(correlation) * 100;

    let trend = 'stable';
    if (Math.abs(slope) > 0.1) {
      trend = slope > 0 ? 'increasing' : 'decreasing';
    }

    return {
      trend,
      slope,
      change: slope * (n - 1), // Change over the period
      confidence: Math.round(confidence),
      correlation,
      forecast: this.generateForecast(dataPoints, slope, intercept)
    };
  }

  generateForecast(dataPoints, slope, intercept, periodsAhead = 12) {
    const lastIndex = dataPoints.length - 1;
    const forecast = [];
    
    for (let i = 1; i <= periodsAhead; i++) {
      const predictedValue = slope * (lastIndex + i) + intercept;
      forecast.push({
        timestamp: dataPoints[lastIndex].timestamp + (i * 3600000), // Assume hourly data
        value: Math.max(0, predictedValue), // Ensure non-negative values
        type: 'forecast'
      });
    }
    
    return forecast;
  }

  // KPI Calculation Methods
  calculateKPIs(metrics) {
    const kpis = {};
    
    // Document Processing Rate
    if (metrics.performance) {
      kpis.processingRate = MetricsUtils.calculateRate(
        metrics.performance.documentsProcessed,
        metrics.performance.previousDocumentsProcessed || 0,
        3600000 // 1 hour
      );
      
      // Upload Success Rate
      const totalUploads = metrics.performance.uploadSuccess + metrics.performance.uploadFailures;
      kpis.uploadSuccessRate = MetricsUtils.calculatePercentage(
        metrics.performance.uploadSuccess,
        totalUploads
      );
      
      // Average Processing Time
      kpis.averageProcessingTime = metrics.performance.processingTime;
    }
    
    // System Availability (based on uptime)
    if (metrics.system) {
      kpis.systemAvailability = MetricsUtils.calculatePercentage(
        metrics.system.uptime,
        metrics.system.totalTime || metrics.system.uptime
      );
    }
    
    return kpis;
  }

  // Alert Processing Methods
  async checkAlerts(currentMetrics) {
    const alerts = [];
    
    // Check performance alerts
    if (currentMetrics.performance) {
      const uploadFailureRate = MetricsUtils.calculatePercentage(
        currentMetrics.performance.uploadFailures,
        currentMetrics.performance.uploadSuccess + currentMetrics.performance.uploadFailures
      );
      
      if (uploadFailureRate > 10) {
        alerts.push(this.createAlert('critical', 'upload_failure_rate', uploadFailureRate));
      } else if (uploadFailureRate > 5) {
        alerts.push(this.createAlert('warning', 'upload_failure_rate', uploadFailureRate));
      }
    }
    
    // Check resource alerts
    if (currentMetrics.resources) {
      ['cpu', 'memory', 'disk'].forEach(resource => {
        const usage = currentMetrics.resources[`${resource}Usage`];
        if (usage > 95) {
          alerts.push(this.createAlert('critical', `${resource}_usage`, usage));
        } else if (usage > 80) {
          alerts.push(this.createAlert('warning', `${resource}_usage`, usage));
        }
      });
    }
    
    // Process alerts
    if (alerts.length > 0) {
      await this.processAlerts(alerts);
    }
    
    return alerts;
  }

  createAlert(severity, type, value) {
    return {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      severity,
      type,
      value,
      message: this.getAlertMessage(type, value, severity),
      resolved: false
    };
  }

  getAlertMessage(type, value, severity) {
    const messages = {
      upload_failure_rate: `Upload failure rate is ${value}% (${severity} threshold exceeded)`,
      cpu_usage: `CPU usage is at ${value}% (${severity} threshold exceeded)`,
      memory_usage: `Memory usage is at ${value}% (${severity} threshold exceeded)`,
      disk_usage: `Disk usage is at ${value}% (${severity} threshold exceeded)`
    };
    
    return messages[type] || `${type} alert: ${value}`;
  }

  async processAlerts(alerts) {
    try {
      const response = await fetch('/api/wiki-agent/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alerts })
      });
      
      if (!response.ok) throw new Error('Failed to process alerts');
      
      // Notify subscribers
      this.notifySubscribers('alerts', alerts);
      
      return response.json();
    } catch (error) {
      console.error('Error processing alerts:', error);
      throw error;
    }
  }

  // Report Generation Methods
  async generateReport(reportType, options = {}) {
    try {
      const response = await fetch('/api/wiki-agent/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: reportType,
          options: {
            format: 'PDF',
            includeSummary: true,
            includeCharts: true,
            ...options
          }
        })
      });
      
      if (!response.ok) throw new Error('Failed to generate report');
      
      return response.json();
    } catch (error) {
      console.error('Error generating report:', error);
      throw error;
    }
  }

  // Subscription Management
  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notifySubscribers(event, data) {
    this.subscribers.forEach(callback => {
      try {
        callback(event, data);
      } catch (error) {
        console.error('Error in subscriber callback:', error);
      }
    });
  }

  // Data Export Methods
  async exportData(format, period, metricTypes) {
    try {
      const data = await this.getHistoricalData(period, metricTypes);
      
      switch (format.toLowerCase()) {
        case 'csv':
          return this.exportToCSV(data);
        case 'json':
          return this.exportToJSON(data);
        case 'excel':
          return this.exportToExcel(data);
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }
    } catch (error) {
      console.error('Error exporting data:', error);
      throw error;
    }
  }

  exportToCSV(data) {
    // Convert data to CSV format
    const headers = ['timestamp', 'metric_type', 'metric_name', 'value'];
    let csv = headers.join(',') + '\n';
    
    Object.entries(data).forEach(([metricType, metrics]) => {
      Object.entries(metrics).forEach(([metricName, dataPoints]) => {
        dataPoints.forEach(point => {
          csv += `${new Date(point.timestamp).toISOString()},${metricType},${metricName},${point.value}\n`;
        });
      });
    });
    
    return csv;
  }

  exportToJSON(data) {
    return JSON.stringify(data, null, 2);
  }

  async exportToExcel(data) {
    // This would require a library like xlsx
    // For now, return a placeholder
    throw new Error('Excel export not yet implemented');
  }

  // Cleanup Methods
  clearCache() {
    this.cache.clear();
  }

  async cleanup() {
    this.clearCache();
    this.subscribers.clear();
  }
}

// Create singleton instance
const analyticsService = new AnalyticsService();

export default analyticsService;