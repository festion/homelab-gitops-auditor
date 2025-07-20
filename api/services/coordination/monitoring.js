const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

/**
 * Comprehensive monitoring and logging system for cross-repository coordination
 */
class CoordinationMonitor extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      logLevel: options.logLevel || 'info',
      logFile: options.logFile || 'logs/coordination.log',
      metricsInterval: options.metricsInterval || 60000, // 1 minute
      alertThresholds: options.alertThresholds || {
        conflictRate: 0.3, // 30% conflict rate
        avgResolutionTime: 300000, // 5 minutes
        failureRate: 0.1 // 10% failure rate
      },
      retentionDays: options.retentionDays || 30
    };

    this.metrics = {
      operations: new Map(),
      conflicts: new Map(),
      resolutions: new Map(),
      performance: new Map(),
      errors: new Map()
    };

    this.activeOperations = new Map();
    this.alertHistory = [];
    
    this.initializeLogging();
    this.startMetricsCollection();
  }

  async initializeLogging() {
    try {
      const logDir = path.dirname(this.options.logFile);
      await fs.mkdir(logDir, { recursive: true });
      
      this.log('info', 'Coordination monitoring initialized', {
        logFile: this.options.logFile,
        metricsInterval: this.options.metricsInterval
      });
    } catch (error) {
      console.error('Failed to initialize logging:', error.message);
    }
  }

  startMetricsCollection() {
    this.metricsInterval = setInterval(() => {
      this.collectMetrics();
      this.checkAlerts();
      this.cleanupOldData();
    }, this.options.metricsInterval);
  }

  /**
   * Log coordination operations
   */
  async log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      message,
      data,
      component: 'coordination'
    };

    // Console output
    if (this.shouldLog(level)) {
      console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`, 
        Object.keys(data).length > 0 ? data : '');
    }

    // File output
    try {
      const logLine = JSON.stringify(logEntry) + '\n';
      await fs.appendFile(this.options.logFile, logLine);
    } catch (error) {
      console.error('Failed to write to log file:', error.message);
    }

    // Emit for real-time monitoring
    this.emit('log', logEntry);
  }

  shouldLog(level) {
    const levels = { error: 0, warn: 1, info: 2, debug: 3 };
    return levels[level] <= levels[this.options.logLevel];
  }

  /**
   * Track dependency analysis operations
   */
  trackDependencyAnalysis(operationId, repositories) {
    const operation = {
      id: operationId,
      type: 'dependency_analysis',
      repositories,
      startTime: Date.now(),
      status: 'started'
    };

    this.activeOperations.set(operationId, operation);
    
    this.log('info', 'Dependency analysis started', {
      operationId,
      repositoryCount: repositories.length,
      repositories
    });

    return operation;
  }

  /**
   * Complete dependency analysis tracking
   */
  completeDependencyAnalysis(operationId, result) {
    const operation = this.activeOperations.get(operationId);
    if (!operation) return;

    const duration = Date.now() - operation.startTime;
    operation.endTime = Date.now();
    operation.duration = duration;
    operation.status = result.success ? 'completed' : 'failed';
    operation.result = result;

    // Store metrics
    this.recordOperationMetrics('dependency_analysis', duration, result.success);

    this.log(result.success ? 'info' : 'error', 'Dependency analysis completed', {
      operationId,
      duration,
      success: result.success,
      dependencyCount: result.dependencyCount || 0,
      circularDependencies: result.circularDependencies || 0,
      error: result.error
    });

    this.activeOperations.delete(operationId);
    this.emit('operationCompleted', operation);
  }

  /**
   * Track deployment coordination
   */
  trackDeploymentCoordination(coordinationId, repositories, options) {
    const operation = {
      id: coordinationId,
      type: 'deployment_coordination',
      repositories,
      options,
      startTime: Date.now(),
      status: 'started'
    };

    this.activeOperations.set(coordinationId, operation);
    
    this.log('info', 'Deployment coordination started', {
      coordinationId,
      repositoryCount: repositories.length,
      repositories,
      options
    });

    return operation;
  }

  /**
   * Complete deployment coordination tracking
   */
  completeDeploymentCoordination(coordinationId, result) {
    const operation = this.activeOperations.get(coordinationId);
    if (!operation) return;

    const duration = Date.now() - operation.startTime;
    operation.endTime = Date.now();
    operation.duration = duration;
    operation.status = result.success ? 'completed' : 'failed';
    operation.result = result;

    this.recordOperationMetrics('deployment_coordination', duration, result.success);

    this.log(result.success ? 'info' : 'error', 'Deployment coordination completed', {
      coordinationId,
      duration,
      success: result.success,
      phases: result.phases?.length || 0,
      conflicts: result.conflicts?.length || 0,
      error: result.error
    });

    this.activeOperations.delete(coordinationId);
    this.emit('operationCompleted', operation);
  }

  /**
   * Track resource conflicts
   */
  trackResourceConflict(conflictId, conflict) {
    const conflictData = {
      id: conflictId,
      type: conflict.type,
      severity: conflict.severity,
      repositories: conflict.repositories || [],
      detectedAt: Date.now(),
      status: 'detected'
    };

    this.recordConflictMetrics(conflict.type, conflict.severity);

    this.log('warn', 'Resource conflict detected', {
      conflictId,
      type: conflict.type,
      severity: conflict.severity,
      repositories: conflict.repositories,
      resource: conflict.resource
    });

    this.emit('conflictDetected', conflictData);
    return conflictData;
  }

  /**
   * Track conflict resolution
   */
  trackConflictResolution(resolutionId, conflictId, strategy) {
    const resolution = {
      id: resolutionId,
      conflictId,
      strategy: strategy.name,
      startTime: Date.now(),
      status: 'started'
    };

    this.log('info', 'Conflict resolution started', {
      resolutionId,
      conflictId,
      strategy: strategy.name,
      automatic: strategy.automatic,
      confidence: strategy.confidence
    });

    return resolution;
  }

  /**
   * Complete conflict resolution tracking
   */
  completeConflictResolution(resolutionId, result) {
    const duration = Date.now() - (result.startTime || Date.now());
    
    this.recordResolutionMetrics(result.strategy, duration, result.success);

    this.log(result.success ? 'info' : 'error', 'Conflict resolution completed', {
      resolutionId,
      duration,
      success: result.success,
      strategy: result.strategy,
      changesApplied: result.changesApplied || 0,
      error: result.error
    });

    this.emit('resolutionCompleted', {
      id: resolutionId,
      duration,
      success: result.success,
      strategy: result.strategy
    });
  }

  /**
   * Track resource claim operations
   */
  trackResourceClaim(claimId, resourceId, repository, operation) {
    this.log('debug', 'Resource claimed', {
      claimId,
      resourceId,
      repository,
      operationType: operation.type,
      exclusive: operation.exclusive
    });

    this.recordResourceUsageMetrics(resourceId, 'claimed');
  }

  /**
   * Track resource release operations
   */
  trackResourceRelease(claimId, resourceId, repository) {
    this.log('debug', 'Resource released', {
      claimId,
      resourceId,
      repository
    });

    this.recordResourceUsageMetrics(resourceId, 'released');
  }

  /**
   * Record operation metrics
   */
  recordOperationMetrics(operationType, duration, success) {
    const key = `${operationType}_${success ? 'success' : 'failure'}`;
    
    if (!this.metrics.operations.has(key)) {
      this.metrics.operations.set(key, {
        count: 0,
        totalDuration: 0,
        avgDuration: 0,
        lastUpdate: Date.now()
      });
    }

    const metric = this.metrics.operations.get(key);
    metric.count++;
    metric.totalDuration += duration;
    metric.avgDuration = metric.totalDuration / metric.count;
    metric.lastUpdate = Date.now();
  }

  /**
   * Record conflict metrics
   */
  recordConflictMetrics(conflictType, severity) {
    const key = `${conflictType}_${severity}`;
    
    if (!this.metrics.conflicts.has(key)) {
      this.metrics.conflicts.set(key, {
        count: 0,
        lastOccurrence: Date.now()
      });
    }

    const metric = this.metrics.conflicts.get(key);
    metric.count++;
    metric.lastOccurrence = Date.now();
  }

  /**
   * Record resolution metrics
   */
  recordResolutionMetrics(strategy, duration, success) {
    const key = `${strategy}_${success ? 'success' : 'failure'}`;
    
    if (!this.metrics.resolutions.has(key)) {
      this.metrics.resolutions.set(key, {
        count: 0,
        totalDuration: 0,
        avgDuration: 0,
        lastUpdate: Date.now()
      });
    }

    const metric = this.metrics.resolutions.get(key);
    metric.count++;
    metric.totalDuration += duration;
    metric.avgDuration = metric.totalDuration / metric.count;
    metric.lastUpdate = Date.now();
  }

  /**
   * Record resource usage metrics
   */
  recordResourceUsageMetrics(resourceId, action) {
    const key = `${resourceId}_${action}`;
    
    if (!this.metrics.performance.has(key)) {
      this.metrics.performance.set(key, {
        count: 0,
        lastUpdate: Date.now()
      });
    }

    const metric = this.metrics.performance.get(key);
    metric.count++;
    metric.lastUpdate = Date.now();
  }

  /**
   * Collect comprehensive metrics
   */
  collectMetrics() {
    const metrics = {
      timestamp: Date.now(),
      activeOperations: this.activeOperations.size,
      operations: this.getOperationMetrics(),
      conflicts: this.getConflictMetrics(),
      resolutions: this.getResolutionMetrics(),
      performance: this.getPerformanceMetrics(),
      system: this.getSystemMetrics()
    };

    this.emit('metrics', metrics);
    
    this.log('debug', 'Metrics collected', {
      activeOperations: metrics.activeOperations,
      totalOperations: Object.values(metrics.operations).reduce((sum, op) => sum + op.count, 0),
      totalConflicts: Object.values(metrics.conflicts).reduce((sum, c) => sum + c.count, 0)
    });

    return metrics;
  }

  getOperationMetrics() {
    const operations = {};
    for (const [key, metric] of this.metrics.operations) {
      operations[key] = { ...metric };
    }
    return operations;
  }

  getConflictMetrics() {
    const conflicts = {};
    for (const [key, metric] of this.metrics.conflicts) {
      conflicts[key] = { ...metric };
    }
    return conflicts;
  }

  getResolutionMetrics() {
    const resolutions = {};
    for (const [key, metric] of this.metrics.resolutions) {
      resolutions[key] = { ...metric };
    }
    return resolutions;
  }

  getPerformanceMetrics() {
    return {
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
      activeOperations: this.activeOperations.size,
      metricsCollected: Date.now()
    };
  }

  getSystemMetrics() {
    return {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid
    };
  }

  /**
   * Check alert conditions
   */
  checkAlerts() {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    
    // Calculate recent operation metrics
    const recentOperations = Array.from(this.metrics.operations.entries())
      .filter(([key, metric]) => now - metric.lastUpdate < oneHour);

    if (recentOperations.length === 0) return;

    // Check conflict rate
    const totalOps = recentOperations.reduce((sum, [key, metric]) => sum + metric.count, 0);
    const conflicts = Array.from(this.metrics.conflicts.values())
      .filter(metric => now - metric.lastOccurrence < oneHour)
      .reduce((sum, metric) => sum + metric.count, 0);

    const conflictRate = totalOps > 0 ? conflicts / totalOps : 0;
    
    if (conflictRate > this.options.alertThresholds.conflictRate) {
      this.createAlert('high_conflict_rate', {
        conflictRate,
        threshold: this.options.alertThresholds.conflictRate,
        totalOperations: totalOps,
        conflicts
      });
    }

    // Check failure rate
    const failures = recentOperations
      .filter(([key]) => key.includes('failure'))
      .reduce((sum, [key, metric]) => sum + metric.count, 0);

    const failureRate = totalOps > 0 ? failures / totalOps : 0;
    
    if (failureRate > this.options.alertThresholds.failureRate) {
      this.createAlert('high_failure_rate', {
        failureRate,
        threshold: this.options.alertThresholds.failureRate,
        totalOperations: totalOps,
        failures
      });
    }

    // Check average resolution time
    const resolutionTimes = Array.from(this.metrics.resolutions.values())
      .filter(metric => now - metric.lastUpdate < oneHour)
      .map(metric => metric.avgDuration);

    if (resolutionTimes.length > 0) {
      const avgResolutionTime = resolutionTimes.reduce((sum, time) => sum + time, 0) / resolutionTimes.length;
      
      if (avgResolutionTime > this.options.alertThresholds.avgResolutionTime) {
        this.createAlert('slow_resolution_time', {
          avgResolutionTime,
          threshold: this.options.alertThresholds.avgResolutionTime,
          sampleSize: resolutionTimes.length
        });
      }
    }
  }

  /**
   * Create and emit alerts
   */
  createAlert(type, data) {
    const alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      severity: this.getAlertSeverity(type),
      timestamp: Date.now(),
      data,
      acknowledged: false
    };

    this.alertHistory.push(alert);
    
    this.log('warn', `Alert: ${type}`, {
      alertId: alert.id,
      severity: alert.severity,
      data
    });

    this.emit('alert', alert);
    return alert;
  }

  getAlertSeverity(type) {
    const severityMap = {
      'high_conflict_rate': 'medium',
      'high_failure_rate': 'high',
      'slow_resolution_time': 'medium',
      'resource_exhaustion': 'high',
      'system_degradation': 'high'
    };

    return severityMap[type] || 'low';
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId) {
    const alert = this.alertHistory.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedAt = Date.now();
      
      this.log('info', 'Alert acknowledged', { alertId });
      this.emit('alertAcknowledged', alert);
    }
  }

  /**
   * Get recent alerts
   */
  getRecentAlerts(hours = 24) {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    return this.alertHistory
      .filter(alert => alert.timestamp > cutoff)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Clean up old data
   */
  cleanupOldData() {
    const cutoff = Date.now() - (this.options.retentionDays * 24 * 60 * 60 * 1000);
    
    // Clean up old alerts
    this.alertHistory = this.alertHistory.filter(alert => alert.timestamp > cutoff);
    
    // Clean up old metrics (keep aggregated data)
    for (const [key, metric] of this.metrics.operations) {
      if (metric.lastUpdate < cutoff) {
        this.metrics.operations.delete(key);
      }
    }

    for (const [key, metric] of this.metrics.conflicts) {
      if (metric.lastOccurrence < cutoff) {
        this.metrics.conflicts.delete(key);
      }
    }

    for (const [key, metric] of this.metrics.resolutions) {
      if (metric.lastUpdate < cutoff) {
        this.metrics.resolutions.delete(key);
      }
    }
  }

  /**
   * Export metrics for external monitoring systems
   */
  exportMetrics(format = 'json') {
    const metrics = this.collectMetrics();
    
    switch (format) {
      case 'prometheus':
        return this.formatPrometheusMetrics(metrics);
      case 'json':
      default:
        return JSON.stringify(metrics, null, 2);
    }
  }

  formatPrometheusMetrics(metrics) {
    let output = '';
    
    // Operation metrics
    for (const [key, metric] of Object.entries(metrics.operations)) {
      const [operation, status] = key.split('_');
      output += `coordination_operation_total{operation="${operation}",status="${status}"} ${metric.count}\n`;
      output += `coordination_operation_duration_avg{operation="${operation}",status="${status}"} ${metric.avgDuration}\n`;
    }
    
    // Conflict metrics
    for (const [key, metric] of Object.entries(metrics.conflicts)) {
      const [type, severity] = key.split('_');
      output += `coordination_conflicts_total{type="${type}",severity="${severity}"} ${metric.count}\n`;
    }
    
    // System metrics
    output += `coordination_active_operations ${metrics.activeOperations}\n`;
    output += `coordination_memory_usage ${metrics.performance.memoryUsage.heapUsed}\n`;
    output += `coordination_uptime_seconds ${metrics.performance.uptime}\n`;
    
    return output;
  }

  /**
   * Get comprehensive health status
   */
  getHealthStatus() {
    const metrics = this.collectMetrics();
    const recentAlerts = this.getRecentAlerts(1); // Last hour
    
    let status = 'healthy';
    const issues = [];
    
    if (recentAlerts.filter(a => a.severity === 'high').length > 0) {
      status = 'critical';
      issues.push('High severity alerts detected');
    } else if (recentAlerts.filter(a => a.severity === 'medium').length > 3) {
      status = 'warning';
      issues.push('Multiple medium severity alerts');
    }
    
    if (this.activeOperations.size > 10) {
      status = status === 'healthy' ? 'warning' : status;
      issues.push('High number of active operations');
    }
    
    return {
      status,
      issues,
      metrics: {
        activeOperations: this.activeOperations.size,
        recentAlerts: recentAlerts.length,
        uptime: metrics.performance.uptime,
        memoryUsage: metrics.performance.memoryUsage.heapUsed
      },
      lastCheck: Date.now()
    };
  }

  /**
   * Shutdown monitoring
   */
  shutdown() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    
    this.log('info', 'Coordination monitoring shutdown', {
      activeOperations: this.activeOperations.size,
      totalAlerts: this.alertHistory.length
    });
  }
}

module.exports = CoordinationMonitor;