const EventEmitter = require('events');
const { createLogger } = require('../../config/logging');
const fs = require('fs').promises;
const path = require('path');

class OrchestrationMonitor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = createLogger('orchestration-monitor');
    this.monitoringInterval = options.monitoringInterval || 5000; // 5 seconds
    this.healthCheckInterval = options.healthCheckInterval || 30000; // 30 seconds
    this.alertThresholds = options.alertThresholds || this.getDefaultThresholds();
    this.metricsRetention = options.metricsRetention || 7 * 24 * 60 * 60 * 1000; // 7 days
    
    this.metrics = {
      orchestrations: new Map(),
      tasks: new Map(),
      system: {
        cpu: [],
        memory: [],
        disk: [],
        network: []
      },
      alerts: [],
      performance: {
        averageExecutionTime: 0,
        successRate: 0,
        throughput: 0,
        errorRate: 0
      }
    };
    
    this.activeOrchestrations = new Map();
    this.alertHandlers = new Map();
    this.recoveryStrategies = new Map();
    this.monitoringActive = false;
    
    this.setupDefaultAlertHandlers();
    this.setupDefaultRecoveryStrategies();
  }

  getDefaultThresholds() {
    return {
      orchestration: {
        maxDuration: 120 * 60 * 1000, // 120 minutes
        maxFailureRate: 0.2, // 20%
        maxConcurrentOrchestrations: 10
      },
      task: {
        maxDuration: 30 * 60 * 1000, // 30 minutes
        maxFailureRate: 0.15, // 15%
        maxRetries: 3
      },
      system: {
        maxCpuUsage: 80, // 80%
        maxMemoryUsage: 85, // 85%
        maxDiskUsage: 90, // 90%
        minDiskSpace: 1024 * 1024 * 1024 // 1GB
      },
      performance: {
        minSuccessRate: 0.95, // 95%
        maxErrorRate: 0.05, // 5%
        maxAverageResponseTime: 60000 // 60 seconds
      }
    };
  }

  setupDefaultAlertHandlers() {
    this.alertHandlers.set('orchestration:timeout', this.handleOrchestrationTimeout.bind(this));
    this.alertHandlers.set('orchestration:failed', this.handleOrchestrationFailure.bind(this));
    this.alertHandlers.set('task:timeout', this.handleTaskTimeout.bind(this));
    this.alertHandlers.set('task:failed', this.handleTaskFailure.bind(this));
    this.alertHandlers.set('system:resource_limit', this.handleResourceLimit.bind(this));
    this.alertHandlers.set('performance:degradation', this.handlePerformanceDegradation.bind(this));
  }

  setupDefaultRecoveryStrategies() {
    this.recoveryStrategies.set('retry', this.retryStrategy.bind(this));
    this.recoveryStrategies.set('failover', this.failoverStrategy.bind(this));
    this.recoveryStrategies.set('circuit_breaker', this.circuitBreakerStrategy.bind(this));
    this.recoveryStrategies.set('graceful_degradation', this.gracefulDegradationStrategy.bind(this));
    this.recoveryStrategies.set('resource_scaling', this.resourceScalingStrategy.bind(this));
  }

  startMonitoring() {
    if (this.monitoringActive) {
      this.logger.warn('Monitoring is already active');
      return;
    }

    this.monitoringActive = true;
    this.logger.info('Starting orchestration monitoring');

    // Start periodic monitoring
    this.monitoringTimer = setInterval(() => {
      this.performMonitoringCycle();
    }, this.monitoringInterval);

    // Start health checks
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.healthCheckInterval);

    this.emit('monitoring:started');
  }

  stopMonitoring() {
    if (!this.monitoringActive) {
      return;
    }

    this.monitoringActive = false;
    this.logger.info('Stopping orchestration monitoring');

    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    this.emit('monitoring:stopped');
  }

  async performMonitoringCycle() {
    try {
      // Update system metrics
      await this.updateSystemMetrics();

      // Check orchestration health
      await this.checkOrchestrationHealth();

      // Update performance metrics
      await this.updatePerformanceMetrics();

      // Check alert conditions
      await this.checkAlertConditions();

      // Clean up old metrics
      await this.cleanupMetrics();

      this.emit('monitoring:cycle_complete');
    } catch (error) {
      this.logger.error('Monitoring cycle failed', error);
      this.emit('monitoring:error', error);
    }
  }

  async updateSystemMetrics() {
    const systemMetrics = {
      timestamp: new Date(),
      cpu: await this.getCpuUsage(),
      memory: await this.getMemoryUsage(),
      disk: await this.getDiskUsage(),
      network: await this.getNetworkUsage()
    };

    // Store metrics (keep last 1000 entries)
    Object.keys(systemMetrics).forEach(key => {
      if (key !== 'timestamp' && this.metrics.system[key]) {
        this.metrics.system[key].push({
          timestamp: systemMetrics.timestamp,
          value: systemMetrics[key]
        });

        // Limit storage
        if (this.metrics.system[key].length > 1000) {
          this.metrics.system[key] = this.metrics.system[key].slice(-500);
        }
      }
    });

    this.emit('metrics:system_updated', systemMetrics);
  }

  async getCpuUsage() {
    // Simulate CPU usage - in real implementation, use system APIs
    return Math.random() * 100;
  }

  async getMemoryUsage() {
    // Simulate memory usage - in real implementation, use system APIs
    return Math.random() * 100;
  }

  async getDiskUsage() {
    // Simulate disk usage - in real implementation, use system APIs
    return Math.random() * 100;
  }

  async getNetworkUsage() {
    // Simulate network usage - in real implementation, use system APIs
    return {
      inbound: Math.random() * 1000000,
      outbound: Math.random() * 1000000
    };
  }

  async checkOrchestrationHealth() {
    for (const [orchestrationId, orchestration] of this.activeOrchestrations) {
      const now = new Date();
      const duration = now - orchestration.startedAt;

      // Check for timeouts
      if (duration > this.alertThresholds.orchestration.maxDuration) {
        await this.triggerAlert('orchestration:timeout', {
          orchestrationId,
          duration,
          threshold: this.alertThresholds.orchestration.maxDuration
        });
      }

      // Check task health
      await this.checkTaskHealth(orchestration);
    }
  }

  async checkTaskHealth(orchestration) {
    if (!orchestration.activeTasks) return;

    for (const [taskId, task] of orchestration.activeTasks) {
      const now = new Date();
      const duration = now - task.startedAt;

      // Check for task timeouts
      if (duration > this.alertThresholds.task.maxDuration) {
        await this.triggerAlert('task:timeout', {
          orchestrationId: orchestration.id,
          taskId,
          duration,
          threshold: this.alertThresholds.task.maxDuration
        });
      }
    }
  }

  async updatePerformanceMetrics() {
    const orchestrations = Array.from(this.metrics.orchestrations.values());
    const tasks = Array.from(this.metrics.tasks.values());

    if (orchestrations.length === 0) return;

    // Calculate success rate
    const successfulOrchestrations = orchestrations.filter(o => o.status === 'completed').length;
    const successRate = successfulOrchestrations / orchestrations.length;

    // Calculate average execution time
    const completedOrchestrations = orchestrations.filter(o => o.completedAt);
    const totalExecutionTime = completedOrchestrations.reduce((sum, o) => 
      sum + (o.completedAt - o.startedAt), 0);
    const averageExecutionTime = completedOrchestrations.length > 0 
      ? totalExecutionTime / completedOrchestrations.length 
      : 0;

    // Calculate error rate
    const failedOrchestrations = orchestrations.filter(o => o.status === 'failed').length;
    const errorRate = failedOrchestrations / orchestrations.length;

    // Calculate throughput (orchestrations per hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentOrchestrations = orchestrations.filter(o => o.startedAt > oneHourAgo);
    const throughput = recentOrchestrations.length;

    this.metrics.performance = {
      successRate,
      averageExecutionTime,
      errorRate,
      throughput,
      lastUpdated: new Date()
    };

    this.emit('metrics:performance_updated', this.metrics.performance);
  }

  async checkAlertConditions() {
    // Check performance thresholds
    if (this.metrics.performance.successRate < this.alertThresholds.performance.minSuccessRate) {
      await this.triggerAlert('performance:degradation', {
        metric: 'success_rate',
        value: this.metrics.performance.successRate,
        threshold: this.alertThresholds.performance.minSuccessRate
      });
    }

    if (this.metrics.performance.errorRate > this.alertThresholds.performance.maxErrorRate) {
      await this.triggerAlert('performance:degradation', {
        metric: 'error_rate',
        value: this.metrics.performance.errorRate,
        threshold: this.alertThresholds.performance.maxErrorRate
      });
    }

    // Check system resource thresholds
    const latestSystemMetrics = this.getLatestSystemMetrics();
    if (latestSystemMetrics.cpu > this.alertThresholds.system.maxCpuUsage) {
      await this.triggerAlert('system:resource_limit', {
        resource: 'cpu',
        value: latestSystemMetrics.cpu,
        threshold: this.alertThresholds.system.maxCpuUsage
      });
    }

    if (latestSystemMetrics.memory > this.alertThresholds.system.maxMemoryUsage) {
      await this.triggerAlert('system:resource_limit', {
        resource: 'memory',
        value: latestSystemMetrics.memory,
        threshold: this.alertThresholds.system.maxMemoryUsage
      });
    }
  }

  getLatestSystemMetrics() {
    return {
      cpu: this.metrics.system.cpu.length > 0 
        ? this.metrics.system.cpu[this.metrics.system.cpu.length - 1].value 
        : 0,
      memory: this.metrics.system.memory.length > 0 
        ? this.metrics.system.memory[this.metrics.system.memory.length - 1].value 
        : 0,
      disk: this.metrics.system.disk.length > 0 
        ? this.metrics.system.disk[this.metrics.system.disk.length - 1].value 
        : 0
    };
  }

  async triggerAlert(alertType, details) {
    const alert = {
      id: this.generateAlertId(),
      type: alertType,
      severity: this.getAlertSeverity(alertType),
      timestamp: new Date(),
      details,
      status: 'active',
      acknowledged: false
    };

    this.metrics.alerts.push(alert);
    this.logger.warn(`Alert triggered: ${alertType}`, details);

    this.emit('alert:triggered', alert);

    // Execute alert handler
    const handler = this.alertHandlers.get(alertType);
    if (handler) {
      try {
        await handler(alert);
      } catch (error) {
        this.logger.error(`Alert handler failed for ${alertType}`, error);
      }
    }

    return alert;
  }

  getAlertSeverity(alertType) {
    const severityMap = {
      'orchestration:timeout': 'high',
      'orchestration:failed': 'high',
      'task:timeout': 'medium',
      'task:failed': 'medium',
      'system:resource_limit': 'high',
      'performance:degradation': 'medium'
    };

    return severityMap[alertType] || 'low';
  }

  async handleOrchestrationTimeout(alert) {
    this.logger.info(`Handling orchestration timeout: ${alert.details.orchestrationId}`);
    
    // Attempt to cancel the timed-out orchestration
    const orchestration = this.activeOrchestrations.get(alert.details.orchestrationId);
    if (orchestration && orchestration.cancelable !== false) {
      await this.executeRecoveryStrategy('graceful_degradation', {
        orchestrationId: alert.details.orchestrationId,
        reason: 'timeout'
      });
    }
  }

  async handleOrchestrationFailure(alert) {
    this.logger.info(`Handling orchestration failure: ${alert.details.orchestrationId}`);
    
    // Attempt retry if within retry limits
    const orchestration = this.activeOrchestrations.get(alert.details.orchestrationId);
    if (orchestration && (orchestration.retryCount || 0) < this.alertThresholds.task.maxRetries) {
      await this.executeRecoveryStrategy('retry', {
        orchestrationId: alert.details.orchestrationId,
        delay: Math.pow(2, orchestration.retryCount || 0) * 1000 // Exponential backoff
      });
    }
  }

  async handleTaskTimeout(alert) {
    this.logger.info(`Handling task timeout: ${alert.details.taskId}`);
    
    await this.executeRecoveryStrategy('circuit_breaker', {
      taskId: alert.details.taskId,
      orchestrationId: alert.details.orchestrationId
    });
  }

  async handleTaskFailure(alert) {
    this.logger.info(`Handling task failure: ${alert.details.taskId}`);
    
    await this.executeRecoveryStrategy('retry', {
      taskId: alert.details.taskId,
      orchestrationId: alert.details.orchestrationId
    });
  }

  async handleResourceLimit(alert) {
    this.logger.info(`Handling resource limit: ${alert.details.resource}`);
    
    await this.executeRecoveryStrategy('resource_scaling', {
      resource: alert.details.resource,
      currentValue: alert.details.value,
      threshold: alert.details.threshold
    });
  }

  async handlePerformanceDegradation(alert) {
    this.logger.info(`Handling performance degradation: ${alert.details.metric}`);
    
    await this.executeRecoveryStrategy('graceful_degradation', {
      metric: alert.details.metric,
      value: alert.details.value
    });
  }

  async executeRecoveryStrategy(strategyName, context) {
    this.logger.info(`Executing recovery strategy: ${strategyName}`, context);
    
    const strategy = this.recoveryStrategies.get(strategyName);
    if (!strategy) {
      this.logger.error(`Unknown recovery strategy: ${strategyName}`);
      return false;
    }

    try {
      const result = await strategy(context);
      this.logger.info(`Recovery strategy ${strategyName} completed`, result);
      this.emit('recovery:strategy_executed', { strategy: strategyName, context, result });
      return result;
    } catch (error) {
      this.logger.error(`Recovery strategy ${strategyName} failed`, error);
      this.emit('recovery:strategy_failed', { strategy: strategyName, context, error });
      return false;
    }
  }

  async retryStrategy(context) {
    // Implement retry logic
    await new Promise(resolve => setTimeout(resolve, context.delay || 1000));
    
    return {
      action: 'retry',
      context,
      timestamp: new Date()
    };
  }

  async failoverStrategy(context) {
    // Implement failover logic
    return {
      action: 'failover',
      context,
      timestamp: new Date()
    };
  }

  async circuitBreakerStrategy(context) {
    // Implement circuit breaker logic
    return {
      action: 'circuit_breaker',
      context,
      timestamp: new Date()
    };
  }

  async gracefulDegradationStrategy(context) {
    // Implement graceful degradation logic
    return {
      action: 'graceful_degradation',
      context,
      timestamp: new Date()
    };
  }

  async resourceScalingStrategy(context) {
    // Implement resource scaling logic
    return {
      action: 'resource_scaling',
      context,
      timestamp: new Date()
    };
  }

  async performHealthCheck() {
    const healthCheck = {
      timestamp: new Date(),
      status: 'healthy',
      checks: {
        monitoring: this.monitoringActive,
        activeOrchestrations: this.activeOrchestrations.size,
        alertCount: this.metrics.alerts.filter(a => a.status === 'active').length,
        systemResources: this.getLatestSystemMetrics(),
        performance: this.metrics.performance
      }
    };

    // Determine overall health status
    if (healthCheck.checks.alertCount > 5) {
      healthCheck.status = 'degraded';
    }

    const systemMetrics = healthCheck.checks.systemResources;
    if (systemMetrics.cpu > 90 || systemMetrics.memory > 90) {
      healthCheck.status = 'unhealthy';
    }

    this.emit('health:check_complete', healthCheck);
    return healthCheck;
  }

  async cleanupMetrics() {
    const cutoffTime = new Date(Date.now() - this.metricsRetention);

    // Clean up old orchestration metrics
    for (const [id, orchestration] of this.metrics.orchestrations) {
      if (orchestration.startedAt < cutoffTime) {
        this.metrics.orchestrations.delete(id);
      }
    }

    // Clean up old task metrics
    for (const [id, task] of this.metrics.tasks) {
      if (task.startedAt < cutoffTime) {
        this.metrics.tasks.delete(id);
      }
    }

    // Clean up old alerts
    this.metrics.alerts = this.metrics.alerts.filter(alert => 
      alert.timestamp > cutoffTime
    );

    // Clean up old system metrics
    Object.keys(this.metrics.system).forEach(key => {
      if (Array.isArray(this.metrics.system[key])) {
        this.metrics.system[key] = this.metrics.system[key].filter(metric => 
          metric.timestamp > cutoffTime
        );
      }
    });
  }

  // Orchestration lifecycle methods
  registerOrchestration(orchestration) {
    this.activeOrchestrations.set(orchestration.id, orchestration);
    this.metrics.orchestrations.set(orchestration.id, {
      id: orchestration.id,
      startedAt: orchestration.startedAt,
      status: orchestration.status,
      repositories: orchestration.repositories?.length || 0,
      stages: orchestration.stages?.length || 0
    });

    this.emit('orchestration:registered', orchestration);
  }

  updateOrchestration(orchestrationId, updates) {
    const orchestration = this.activeOrchestrations.get(orchestrationId);
    if (orchestration) {
      Object.assign(orchestration, updates);
    }

    const metrics = this.metrics.orchestrations.get(orchestrationId);
    if (metrics) {
      Object.assign(metrics, updates);
    }

    this.emit('orchestration:updated', { orchestrationId, updates });
  }

  completeOrchestration(orchestrationId, result) {
    const orchestration = this.activeOrchestrations.get(orchestrationId);
    if (orchestration) {
      orchestration.status = result.status;
      orchestration.completedAt = result.completedAt;
      this.activeOrchestrations.delete(orchestrationId);
    }

    const metrics = this.metrics.orchestrations.get(orchestrationId);
    if (metrics) {
      metrics.status = result.status;
      metrics.completedAt = result.completedAt;
      metrics.duration = result.completedAt - metrics.startedAt;
    }

    this.emit('orchestration:completed', { orchestrationId, result });
  }

  // Alert management
  acknowledgeAlert(alertId) {
    const alert = this.metrics.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedAt = new Date();
      this.emit('alert:acknowledged', alert);
      return true;
    }
    return false;
  }

  resolveAlert(alertId, resolution) {
    const alert = this.metrics.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.status = 'resolved';
      alert.resolvedAt = new Date();
      alert.resolution = resolution;
      this.emit('alert:resolved', alert);
      return true;
    }
    return false;
  }

  getActiveAlerts() {
    return this.metrics.alerts.filter(alert => alert.status === 'active');
  }

  getMetrics(timeRange = '1h') {
    const now = new Date();
    const ranges = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000
    };

    const cutoff = new Date(now - ranges[timeRange]);

    return {
      orchestrations: Array.from(this.metrics.orchestrations.values())
        .filter(o => o.startedAt > cutoff),
      tasks: Array.from(this.metrics.tasks.values())
        .filter(t => t.startedAt > cutoff),
      system: {
        cpu: this.metrics.system.cpu.filter(m => m.timestamp > cutoff),
        memory: this.metrics.system.memory.filter(m => m.timestamp > cutoff),
        disk: this.metrics.system.disk.filter(m => m.timestamp > cutoff),
        network: this.metrics.system.network.filter(m => m.timestamp > cutoff)
      },
      alerts: this.metrics.alerts.filter(a => a.timestamp > cutoff),
      performance: this.metrics.performance,
      timeRange,
      generatedAt: now
    };
  }

  generateAlertId() {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

module.exports = OrchestrationMonitor;