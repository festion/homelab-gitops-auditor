const { EventEmitter } = require('events');
const fs = require('fs').promises;
const path = require('path');
const { createLogger } = require('../../utils/logger');
const { errorHandler } = require('../../utils/errorHandler');

class WebhookMonitor extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      monitoringInterval: options.monitoringInterval || 60000, // 1 minute
      alertThresholds: {
        failureRate: options.failureRateThreshold || 10, // %
        avgProcessingTime: options.avgProcessingTimeThreshold || 5000, // ms
        consecutiveFailures: options.consecutiveFailuresThreshold || 5,
        queueBacklog: options.queueBacklogThreshold || 100
      },
      retentionPeriod: options.retentionPeriod || 7 * 24 * 60 * 60 * 1000, // 7 days
      metricsPath: options.metricsPath || path.join(process.cwd(), 'logs', 'webhook-metrics.json'),
      alertsPath: options.alertsPath || path.join(process.cwd(), 'logs', 'webhook-alerts.json'),
      ...options
    };

    // Initialize logger
    this.logger = createLogger('webhook-monitor');

    // Monitoring state
    this.metrics = {
      deliveries: [],
      alerts: [],
      systemHealth: {
        uptime: 0,
        lastRestart: new Date(),
        totalDeliveries: 0,
        successfulDeliveries: 0,
        failedDeliveries: 0,
        averageProcessingTime: 0,
        currentBacklog: 0
      },
      realTimeStats: {
        deliveriesLastMinute: 0,
        deliveriesLastHour: 0,
        failuresLastMinute: 0,
        failuresLastHour: 0,
        currentThroughput: 0
      },
      repositoryStats: {},
      eventTypeStats: {},
      errorPatterns: {}
    };

    // Health check state
    this.healthChecks = {
      lastCheck: null,
      status: 'unknown',
      checks: {},
      consecutiveFailures: 0
    };

    // Alert state
    this.activeAlerts = new Map();
    this.alertHistory = [];

    this.initializeMonitoring();
    this.logger.info('Webhook Monitor initialized');
  }

  async initializeMonitoring() {
    try {
      // Ensure log directories exist
      await fs.mkdir(path.dirname(this.options.metricsPath), { recursive: true });
      await fs.mkdir(path.dirname(this.options.alertsPath), { recursive: true });

      // Load existing metrics and alerts
      await this.loadPersistedData();

      // Start monitoring interval
      this.startMonitoring();

      console.log('✅ Webhook monitoring initialized successfully');
    } catch (error) {
      console.error('Failed to initialize webhook monitoring:', error);
    }
  }

  async loadPersistedData() {
    try {
      // Load metrics
      if (await this.fileExists(this.options.metricsPath)) {
        const metricsData = await fs.readFile(this.options.metricsPath, 'utf8');
        const persistedMetrics = JSON.parse(metricsData);
        this.metrics = { ...this.metrics, ...persistedMetrics };
      }

      // Load alerts
      if (await this.fileExists(this.options.alertsPath)) {
        const alertsData = await fs.readFile(this.options.alertsPath, 'utf8');
        this.alertHistory = JSON.parse(alertsData);
      }

      console.log('📁 Loaded persisted monitoring data');
    } catch (error) {
      console.error('Failed to load persisted monitoring data:', error);
    }
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  startMonitoring() {
    // Main monitoring interval
    this.monitoringTimer = setInterval(() => {
      this.performHealthChecks();
      this.updateRealTimeStats();
      this.checkAlertConditions();
      this.cleanupOldData();
    }, this.options.monitoringInterval);

    // More frequent real-time stats update
    this.statsTimer = setInterval(() => {
      this.updateRealTimeStats();
    }, 10000); // 10 seconds

    console.log(`🔄 Started webhook monitoring (interval: ${this.options.monitoringInterval}ms)`);
  }

  recordWebhookDelivery(delivery) {
    const deliveryRecord = {
      id: delivery.deliveryId,
      event: delivery.event,
      repository: delivery.repository,
      success: delivery.success,
      processingTime: delivery.processingTime,
      timestamp: new Date().toISOString(),
      error: delivery.error || null,
      retryCount: delivery.retryCount || 0
    };

    // Add to deliveries array
    this.metrics.deliveries.unshift(deliveryRecord);

    // Update system health
    this.metrics.systemHealth.totalDeliveries++;
    if (delivery.success) {
      this.metrics.systemHealth.successfulDeliveries++;
      this.healthChecks.consecutiveFailures = 0;
    } else {
      this.metrics.systemHealth.failedDeliveries++;
      this.healthChecks.consecutiveFailures++;
    }

    // Update average processing time
    const total = this.metrics.systemHealth.totalDeliveries;
    this.metrics.systemHealth.averageProcessingTime = 
      (this.metrics.systemHealth.averageProcessingTime * (total - 1) + delivery.processingTime) / total;

    // Update repository stats
    if (delivery.repository) {
      if (!this.metrics.repositoryStats[delivery.repository]) {
        this.metrics.repositoryStats[delivery.repository] = {
          total: 0,
          successful: 0,
          failed: 0,
          averageProcessingTime: 0,
          lastDelivery: null
        };
      }

      const repoStats = this.metrics.repositoryStats[delivery.repository];
      repoStats.total++;
      repoStats.lastDelivery = deliveryRecord.timestamp;
      
      if (delivery.success) {
        repoStats.successful++;
      } else {
        repoStats.failed++;
      }

      repoStats.averageProcessingTime = 
        (repoStats.averageProcessingTime * (repoStats.total - 1) + delivery.processingTime) / repoStats.total;
    }

    // Update event type stats
    if (!this.metrics.eventTypeStats[delivery.event]) {
      this.metrics.eventTypeStats[delivery.event] = {
        total: 0,
        successful: 0,
        failed: 0,
        averageProcessingTime: 0
      };
    }

    const eventStats = this.metrics.eventTypeStats[delivery.event];
    eventStats.total++;
    
    if (delivery.success) {
      eventStats.successful++;
    } else {
      eventStats.failed++;
    }

    eventStats.averageProcessingTime = 
      (eventStats.averageProcessingTime * (eventStats.total - 1) + delivery.processingTime) / eventStats.total;

    // Track error patterns
    if (!delivery.success && delivery.error) {
      const errorKey = this.categorizeError(delivery.error);
      this.metrics.errorPatterns[errorKey] = (this.metrics.errorPatterns[errorKey] || 0) + 1;
    }

    // Emit monitoring event
    this.emit('delivery_recorded', deliveryRecord);

    // Check for immediate alerts
    this.checkImmediateAlerts(deliveryRecord);

    console.log(`📊 Recorded webhook delivery: ${delivery.event} (${delivery.success ? 'success' : 'failed'})`);
  }

  async performHealthChecks() {
    const checks = {};
    
    try {
      // Check system uptime
      checks.uptime = {
        status: 'healthy',
        value: process.uptime(),
        threshold: 60, // minimum 1 minute uptime
        message: `System uptime: ${Math.floor(process.uptime())}s`
      };

      // Check memory usage
      const memUsage = process.memoryUsage();
      const memUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
      checks.memory = {
        status: memUsagePercent < 90 ? 'healthy' : 'warning',
        value: memUsagePercent,
        threshold: 90,
        message: `Memory usage: ${memUsagePercent.toFixed(2)}%`
      };

      // Check recent failure rate
      const recentDeliveries = this.getRecentDeliveries(60000); // Last minute
      const failureRate = recentDeliveries.length > 0 ? 
        (recentDeliveries.filter(d => !d.success).length / recentDeliveries.length) * 100 : 0;
      checks.failureRate = {
        status: failureRate < this.options.alertThresholds.failureRate ? 'healthy' : 'critical',
        value: failureRate,
        threshold: this.options.alertThresholds.failureRate,
        message: `Failure rate: ${failureRate.toFixed(2)}%`
      };

      // Check average processing time
      const recentSuccessful = recentDeliveries.filter(d => d.success);
      const avgProcessingTime = recentSuccessful.length > 0 ?
        recentSuccessful.reduce((sum, d) => sum + d.processingTime, 0) / recentSuccessful.length : 0;
      checks.processingTime = {
        status: avgProcessingTime < this.options.alertThresholds.avgProcessingTime ? 'healthy' : 'warning',
        value: avgProcessingTime,
        threshold: this.options.alertThresholds.avgProcessingTime,
        message: `Avg processing time: ${avgProcessingTime.toFixed(2)}ms`
      };

      // Check consecutive failures
      checks.consecutiveFailures = {
        status: this.healthChecks.consecutiveFailures < this.options.alertThresholds.consecutiveFailures ? 'healthy' : 'critical',
        value: this.healthChecks.consecutiveFailures,
        threshold: this.options.alertThresholds.consecutiveFailures,
        message: `Consecutive failures: ${this.healthChecks.consecutiveFailures}`
      };

      // Overall health status
      const criticalChecks = Object.values(checks).filter(check => check.status === 'critical');
      const warningChecks = Object.values(checks).filter(check => check.status === 'warning');
      
      let overallStatus;
      if (criticalChecks.length > 0) {
        overallStatus = 'critical';
      } else if (warningChecks.length > 0) {
        overallStatus = 'warning';
      } else {
        overallStatus = 'healthy';
      }

      this.healthChecks = {
        lastCheck: new Date().toISOString(),
        status: overallStatus,
        checks,
        consecutiveFailures: this.healthChecks.consecutiveFailures
      };

      console.log(`🏥 Health check completed: ${overallStatus}`);
      this.emit('health_check_completed', this.healthChecks);

    } catch (error) {
      console.error('Health check failed:', error);
      this.healthChecks.status = 'unknown';
      this.healthChecks.lastCheck = new Date().toISOString();
    }
  }

  updateRealTimeStats() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneHourAgo = now - 3600000;

    const deliveriesLastMinute = this.metrics.deliveries.filter(d => 
      new Date(d.timestamp).getTime() > oneMinuteAgo
    );
    
    const deliveriesLastHour = this.metrics.deliveries.filter(d => 
      new Date(d.timestamp).getTime() > oneHourAgo
    );

    this.metrics.realTimeStats = {
      deliveriesLastMinute: deliveriesLastMinute.length,
      deliveriesLastHour: deliveriesLastHour.length,
      failuresLastMinute: deliveriesLastMinute.filter(d => !d.success).length,
      failuresLastHour: deliveriesLastHour.filter(d => !d.success).length,
      currentThroughput: deliveriesLastMinute.length, // per minute
      lastUpdated: new Date().toISOString()
    };
  }

  checkAlertConditions() {
    const alerts = [];

    // Check failure rate
    const recentDeliveries = this.getRecentDeliveries(300000); // Last 5 minutes
    if (recentDeliveries.length >= 10) { // Only check if we have enough data
      const failureRate = (recentDeliveries.filter(d => !d.success).length / recentDeliveries.length) * 100;
      if (failureRate > this.options.alertThresholds.failureRate) {
        alerts.push({
          type: 'failure_rate',
          severity: 'critical',
          message: `High failure rate: ${failureRate.toFixed(2)}% (threshold: ${this.options.alertThresholds.failureRate}%)`,
          value: failureRate,
          threshold: this.options.alertThresholds.failureRate
        });
      }
    }

    // Check consecutive failures
    if (this.healthChecks.consecutiveFailures >= this.options.alertThresholds.consecutiveFailures) {
      alerts.push({
        type: 'consecutive_failures',
        severity: 'critical',
        message: `${this.healthChecks.consecutiveFailures} consecutive failures detected`,
        value: this.healthChecks.consecutiveFailures,
        threshold: this.options.alertThresholds.consecutiveFailures
      });
    }

    // Check processing time
    const recentSuccessful = recentDeliveries.filter(d => d.success);
    if (recentSuccessful.length > 0) {
      const avgProcessingTime = recentSuccessful.reduce((sum, d) => sum + d.processingTime, 0) / recentSuccessful.length;
      if (avgProcessingTime > this.options.alertThresholds.avgProcessingTime) {
        alerts.push({
          type: 'slow_processing',
          severity: 'warning',
          message: `Slow processing detected: ${avgProcessingTime.toFixed(2)}ms average (threshold: ${this.options.alertThresholds.avgProcessingTime}ms)`,
          value: avgProcessingTime,
          threshold: this.options.alertThresholds.avgProcessingTime
        });
      }
    }

    // Process new alerts
    alerts.forEach(alert => this.processAlert(alert));
  }

  checkImmediateAlerts(delivery) {
    // Check for specific error patterns that need immediate attention
    if (!delivery.success && delivery.error) {
      const errorType = this.categorizeError(delivery.error);
      
      if (errorType === 'authentication_error') {
        this.processAlert({
          type: 'authentication_failure',
          severity: 'critical',
          message: `Authentication failure for ${delivery.repository || 'unknown repository'}: ${delivery.error}`,
          deliveryId: delivery.id,
          repository: delivery.repository
        });
      } else if (errorType === 'timeout_error') {
        this.processAlert({
          type: 'processing_timeout',
          severity: 'warning',
          message: `Processing timeout for ${delivery.event}: ${delivery.error}`,
          deliveryId: delivery.id,
          event: delivery.event
        });
      }
    }
  }

  processAlert(alert) {
    const alertKey = `${alert.type}_${alert.repository || 'global'}`;
    const now = new Date();

    // Check if this alert is already active (avoid spam)
    const existingAlert = this.activeAlerts.get(alertKey);
    if (existingAlert && (now - existingAlert.lastTriggered) < 300000) { // 5 minutes cooldown
      return;
    }

    // Create alert record
    const alertRecord = {
      id: this.generateAlertId(),
      type: alert.type,
      severity: alert.severity,
      message: alert.message,
      value: alert.value,
      threshold: alert.threshold,
      repository: alert.repository,
      deliveryId: alert.deliveryId,
      event: alert.event,
      timestamp: now.toISOString(),
      resolved: false
    };

    // Add to active alerts
    this.activeAlerts.set(alertKey, {
      ...alertRecord,
      lastTriggered: now
    });

    // Add to alert history
    this.alertHistory.unshift(alertRecord);
    this.metrics.alerts.unshift(alertRecord);

    // Emit alert event
    this.emit('alert_triggered', alertRecord);

    console.log(`🚨 Alert triggered: ${alert.type} - ${alert.message}`);
  }

  categorizeError(errorMessage) {
    const errorMessage_lower = errorMessage.toLowerCase();
    
    if (errorMessage_lower.includes('signature') || errorMessage_lower.includes('authentication')) {
      return 'authentication_error';
    } else if (errorMessage_lower.includes('timeout')) {
      return 'timeout_error';
    } else if (errorMessage_lower.includes('rate limit')) {
      return 'rate_limit_error';
    } else if (errorMessage_lower.includes('network') || errorMessage_lower.includes('connection')) {
      return 'network_error';
    } else if (errorMessage_lower.includes('json') || errorMessage_lower.includes('parse')) {
      return 'parsing_error';
    } else {
      return 'unknown_error';
    }
  }

  getRecentDeliveries(timeWindow) {
    const cutoff = Date.now() - timeWindow;
    return this.metrics.deliveries.filter(d => 
      new Date(d.timestamp).getTime() > cutoff
    );
  }

  cleanupOldData() {
    const cutoff = Date.now() - this.options.retentionPeriod;
    
    // Clean up old deliveries
    const initialDeliveries = this.metrics.deliveries.length;
    this.metrics.deliveries = this.metrics.deliveries.filter(d => 
      new Date(d.timestamp).getTime() > cutoff
    );
    
    // Clean up old alerts
    const initialAlerts = this.metrics.alerts.length;
    this.metrics.alerts = this.metrics.alerts.filter(a => 
      new Date(a.timestamp).getTime() > cutoff
    );

    const deliveriesRemoved = initialDeliveries - this.metrics.deliveries.length;
    const alertsRemoved = initialAlerts - this.metrics.alerts.length;

    if (deliveriesRemoved > 0 || alertsRemoved > 0) {
      console.log(`🧹 Cleaned up old data: ${deliveriesRemoved} deliveries, ${alertsRemoved} alerts`);
    }
  }

  async persistMetrics() {
    try {
      // Persist metrics
      await fs.writeFile(
        this.options.metricsPath, 
        JSON.stringify(this.metrics, null, 2)
      );

      // Persist alerts
      await fs.writeFile(
        this.options.alertsPath,
        JSON.stringify(this.alertHistory, null, 2)
      );

      console.log('💾 Persisted monitoring data');
    } catch (error) {
      console.error('Failed to persist monitoring data:', error);
    }
  }

  generateAlertId() {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public API methods
  getSystemHealth() {
    return {
      ...this.healthChecks,
      metrics: this.metrics.systemHealth,
      realTimeStats: this.metrics.realTimeStats
    };
  }

  getMetrics(period = '1h') {
    let timeWindow;
    switch (period) {
      case '5m':
        timeWindow = 5 * 60 * 1000;
        break;
      case '1h':
        timeWindow = 60 * 60 * 1000;
        break;
      case '24h':
        timeWindow = 24 * 60 * 60 * 1000;
        break;
      case '7d':
        timeWindow = 7 * 24 * 60 * 60 * 1000;
        break;
      default:
        timeWindow = 60 * 60 * 1000;
    }

    const recentDeliveries = this.getRecentDeliveries(timeWindow);
    
    return {
      period,
      timeWindow,
      totalDeliveries: recentDeliveries.length,
      successfulDeliveries: recentDeliveries.filter(d => d.success).length,
      failedDeliveries: recentDeliveries.filter(d => !d.success).length,
      averageProcessingTime: recentDeliveries.length > 0 ?
        recentDeliveries.reduce((sum, d) => sum + d.processingTime, 0) / recentDeliveries.length : 0,
      repositoryBreakdown: this.getRepositoryBreakdown(recentDeliveries),
      eventTypeBreakdown: this.getEventTypeBreakdown(recentDeliveries),
      errorPatterns: this.getErrorPatterns(recentDeliveries),
      lastUpdated: new Date().toISOString()
    };
  }

  getRepositoryBreakdown(deliveries) {
    const breakdown = {};
    deliveries.forEach(d => {
      if (d.repository) {
        if (!breakdown[d.repository]) {
          breakdown[d.repository] = { total: 0, successful: 0, failed: 0 };
        }
        breakdown[d.repository].total++;
        if (d.success) {
          breakdown[d.repository].successful++;
        } else {
          breakdown[d.repository].failed++;
        }
      }
    });
    return breakdown;
  }

  getEventTypeBreakdown(deliveries) {
    const breakdown = {};
    deliveries.forEach(d => {
      if (!breakdown[d.event]) {
        breakdown[d.event] = { total: 0, successful: 0, failed: 0 };
      }
      breakdown[d.event].total++;
      if (d.success) {
        breakdown[d.event].successful++;
      } else {
        breakdown[d.event].failed++;
      }
    });
    return breakdown;
  }

  getErrorPatterns(deliveries) {
    const patterns = {};
    deliveries.filter(d => !d.success && d.error).forEach(d => {
      const pattern = this.categorizeError(d.error);
      patterns[pattern] = (patterns[pattern] || 0) + 1;
    });
    return patterns;
  }

  getActiveAlerts() {
    return Array.from(this.activeAlerts.values());
  }

  getAlertHistory(limit = 100) {
    return this.alertHistory.slice(0, limit);
  }

  resolveAlert(alertId) {
    // Find and resolve alert
    const alert = this.alertHistory.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      alert.resolvedAt = new Date().toISOString();
      
      // Remove from active alerts
      for (const [key, activeAlert] of this.activeAlerts) {
        if (activeAlert.id === alertId) {
          this.activeAlerts.delete(key);
          break;
        }
      }
      
      console.log(`✅ Resolved alert: ${alertId}`);
      this.emit('alert_resolved', alert);
      return true;
    }
    return false;
  }

  async shutdown() {
    console.log('🛑 Shutting down webhook monitor...');
    
    // Clear timers
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
    }
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
    }

    // Persist final data
    await this.persistMetrics();

    // Remove all listeners
    this.removeAllListeners();

    console.log('✅ Webhook monitor shutdown complete');
  }
}

module.exports = WebhookMonitor;