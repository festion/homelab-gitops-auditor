const EventEmitter = require('events');
const os = require('os');

class PerformanceMonitor extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.metrics = {
      sync: {
        totalOperations: 0,
        successfulOperations: 0,
        failedOperations: 0,
        totalTime: 0,
        averageTime: 0,
        operationsPerSecond: 0
      },
      files: {
        totalFiles: 0,
        totalSize: 0,
        averageFileSize: 0,
        largestFile: 0,
        smallestFile: Infinity
      },
      conflicts: {
        totalConflicts: 0,
        autoResolvedConflicts: 0,
        manualConflicts: 0,
        conflictTypes: {}
      },
      system: {
        memoryUsage: {},
        cpuUsage: 0,
        diskUsage: {},
        networkActivity: {}
      },
      queue: {
        currentSize: 0,
        maxSize: 0,
        averageSize: 0,
        processingTime: 0
      }
    };
    
    this.startTime = Date.now();
    this.operationHistory = [];
    this.memoryHistory = [];
    this.cpuHistory = [];
    
    this.isMonitoring = false;
    this.monitoringInterval = null;
  }

  start() {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.startTime = Date.now();
    
    // Start system monitoring
    this.monitoringInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, this.config.monitoring?.metricsInterval || 10000);

    this.emit('monitoring:started');
  }

  stop() {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.emit('monitoring:stopped');
  }

  recordOperation(type, duration, success = true, metadata = {}) {
    const operation = {
      type,
      duration,
      success,
      timestamp: Date.now(),
      metadata
    };

    this.operationHistory.push(operation);
    
    // Keep only recent history to prevent memory leak
    const maxHistory = this.config.monitoring?.maxHistorySize || 1000;
    if (this.operationHistory.length > maxHistory) {
      this.operationHistory = this.operationHistory.slice(-maxHistory);
    }

    // Update sync metrics
    this.metrics.sync.totalOperations++;
    if (success) {
      this.metrics.sync.successfulOperations++;
    } else {
      this.metrics.sync.failedOperations++;
    }

    this.metrics.sync.totalTime += duration;
    this.metrics.sync.averageTime = this.metrics.sync.totalTime / this.metrics.sync.totalOperations;

    // Calculate operations per second
    const timeWindow = 60000; // 1 minute
    const recentOps = this.operationHistory.filter(op => 
      Date.now() - op.timestamp < timeWindow
    );
    this.metrics.sync.operationsPerSecond = recentOps.length / (timeWindow / 1000);

    this.emit('operation:recorded', operation);
  }

  recordFileOperation(filePath, size, type = 'sync') {
    this.metrics.files.totalFiles++;
    this.metrics.files.totalSize += size;
    this.metrics.files.averageFileSize = this.metrics.files.totalSize / this.metrics.files.totalFiles;

    if (size > this.metrics.files.largestFile) {
      this.metrics.files.largestFile = size;
    }

    if (size < this.metrics.files.smallestFile) {
      this.metrics.files.smallestFile = size;
    }

    this.emit('file:recorded', { filePath, size, type });
  }

  recordConflict(conflictType, resolved = false, resolution = null) {
    this.metrics.conflicts.totalConflicts++;
    
    if (resolved) {
      if (resolution === 'auto') {
        this.metrics.conflicts.autoResolvedConflicts++;
      } else {
        this.metrics.conflicts.manualConflicts++;
      }
    }

    if (!this.metrics.conflicts.conflictTypes[conflictType]) {
      this.metrics.conflicts.conflictTypes[conflictType] = 0;
    }
    this.metrics.conflicts.conflictTypes[conflictType]++;

    this.emit('conflict:recorded', { conflictType, resolved, resolution });
  }

  recordQueueSize(size) {
    this.metrics.queue.currentSize = size;
    
    if (size > this.metrics.queue.maxSize) {
      this.metrics.queue.maxSize = size;
    }

    // Calculate rolling average
    const samples = 100;
    if (!this.queueSizeSamples) {
      this.queueSizeSamples = [];
    }
    
    this.queueSizeSamples.push(size);
    if (this.queueSizeSamples.length > samples) {
      this.queueSizeSamples.shift();
    }
    
    this.metrics.queue.averageSize = this.queueSizeSamples.reduce((a, b) => a + b, 0) / this.queueSizeSamples.length;
  }

  collectSystemMetrics() {
    // Memory usage
    const memUsage = process.memoryUsage();
    this.metrics.system.memoryUsage = {
      rss: memUsage.rss,
      heapTotal: memUsage.heapTotal,
      heapUsed: memUsage.heapUsed,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers
    };

    this.memoryHistory.push({
      timestamp: Date.now(),
      ...this.metrics.system.memoryUsage
    });

    // Keep memory history manageable
    const maxHistory = 288; // 24 hours at 5-minute intervals
    if (this.memoryHistory.length > maxHistory) {
      this.memoryHistory = this.memoryHistory.slice(-maxHistory);
    }

    // CPU usage (approximate)
    const cpuUsage = process.cpuUsage();
    if (this.lastCpuUsage) {
      const userDiff = cpuUsage.user - this.lastCpuUsage.user;
      const systemDiff = cpuUsage.system - this.lastCpuUsage.system;
      const totalDiff = userDiff + systemDiff;
      
      // Convert to percentage (rough approximation)
      this.metrics.system.cpuUsage = (totalDiff / 1000000) / (this.config.monitoring?.metricsInterval / 1000) * 100;
    }
    this.lastCpuUsage = cpuUsage;

    this.cpuHistory.push({
      timestamp: Date.now(),
      cpuUsage: this.metrics.system.cpuUsage
    });

    if (this.cpuHistory.length > maxHistory) {
      this.cpuHistory = this.cpuHistory.slice(-maxHistory);
    }

    // System information
    this.metrics.system.platform = os.platform();
    this.metrics.system.arch = os.arch();
    this.metrics.system.nodeVersion = process.version;
    this.metrics.system.uptime = process.uptime();

    this.emit('system:metrics', this.metrics.system);
  }

  getMetrics() {
    return {
      ...this.metrics,
      runtime: {
        startTime: this.startTime,
        uptime: Date.now() - this.startTime,
        isMonitoring: this.isMonitoring
      }
    };
  }

  getOperationStats(timeWindow = 3600000) { // 1 hour default
    const since = Date.now() - timeWindow;
    const recentOps = this.operationHistory.filter(op => op.timestamp >= since);

    const stats = {
      total: recentOps.length,
      successful: recentOps.filter(op => op.success).length,
      failed: recentOps.filter(op => !op.success).length,
      byType: {},
      averageDuration: 0,
      minDuration: Infinity,
      maxDuration: 0
    };

    let totalDuration = 0;

    for (const op of recentOps) {
      // By type
      if (!stats.byType[op.type]) {
        stats.byType[op.type] = { count: 0, avgDuration: 0, totalDuration: 0 };
      }
      stats.byType[op.type].count++;
      stats.byType[op.type].totalDuration += op.duration;

      // Duration stats
      totalDuration += op.duration;
      if (op.duration < stats.minDuration) stats.minDuration = op.duration;
      if (op.duration > stats.maxDuration) stats.maxDuration = op.duration;
    }

    if (recentOps.length > 0) {
      stats.averageDuration = totalDuration / recentOps.length;
      
      // Calculate average duration by type
      for (const type in stats.byType) {
        const typeStats = stats.byType[type];
        typeStats.avgDuration = typeStats.totalDuration / typeStats.count;
      }
    } else {
      stats.minDuration = 0;
    }

    return stats;
  }

  getPerformanceReport() {
    const metrics = this.getMetrics();
    const recentStats = this.getOperationStats();
    
    return {
      summary: {
        uptime: metrics.runtime.uptime,
        totalOperations: metrics.sync.totalOperations,
        successRate: metrics.sync.totalOperations > 0 
          ? (metrics.sync.successfulOperations / metrics.sync.totalOperations * 100).toFixed(2) + '%'
          : '0%',
        averageOperationTime: metrics.sync.averageTime.toFixed(2) + 'ms',
        operationsPerSecond: metrics.sync.operationsPerSecond.toFixed(2)
      },
      files: {
        totalFiles: metrics.files.totalFiles,
        totalSize: this.formatBytes(metrics.files.totalSize),
        averageFileSize: this.formatBytes(metrics.files.averageFileSize),
        largestFile: this.formatBytes(metrics.files.largestFile),
        smallestFile: metrics.files.smallestFile !== Infinity 
          ? this.formatBytes(metrics.files.smallestFile) 
          : '0 B'
      },
      conflicts: {
        total: metrics.conflicts.totalConflicts,
        autoResolved: metrics.conflicts.autoResolvedConflicts,
        manualResolution: metrics.conflicts.manualConflicts,
        byType: metrics.conflicts.conflictTypes
      },
      system: {
        memoryUsage: {
          rss: this.formatBytes(metrics.system.memoryUsage.rss || 0),
          heapUsed: this.formatBytes(metrics.system.memoryUsage.heapUsed || 0),
          heapTotal: this.formatBytes(metrics.system.memoryUsage.heapTotal || 0)
        },
        cpuUsage: (metrics.system.cpuUsage || 0).toFixed(2) + '%',
        platform: metrics.system.platform,
        nodeVersion: metrics.system.nodeVersion,
        uptime: this.formatDuration(metrics.runtime.uptime)
      },
      queue: {
        current: metrics.queue.currentSize,
        maximum: metrics.queue.maxSize,
        average: metrics.queue.averageSize.toFixed(1)
      },
      recent: recentStats
    };
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  exportMetrics() {
    return {
      timestamp: new Date().toISOString(),
      metrics: this.getMetrics(),
      operationHistory: this.operationHistory,
      memoryHistory: this.memoryHistory.slice(-100), // Last 100 samples
      cpuHistory: this.cpuHistory.slice(-100),
      report: this.getPerformanceReport()
    };
  }

  reset() {
    this.metrics = {
      sync: {
        totalOperations: 0,
        successfulOperations: 0,
        failedOperations: 0,
        totalTime: 0,
        averageTime: 0,
        operationsPerSecond: 0
      },
      files: {
        totalFiles: 0,
        totalSize: 0,
        averageFileSize: 0,
        largestFile: 0,
        smallestFile: Infinity
      },
      conflicts: {
        totalConflicts: 0,
        autoResolvedConflicts: 0,
        manualConflicts: 0,
        conflictTypes: {}
      },
      system: {
        memoryUsage: {},
        cpuUsage: 0,
        diskUsage: {},
        networkActivity: {}
      },
      queue: {
        currentSize: 0,
        maxSize: 0,
        averageSize: 0,
        processingTime: 0
      }
    };

    this.startTime = Date.now();
    this.operationHistory = [];
    this.memoryHistory = [];
    this.cpuHistory = [];
    
    this.emit('metrics:reset');
  }

  getHealthStatus() {
    const metrics = this.getMetrics();
    const health = {
      status: 'healthy',
      issues: [],
      warnings: []
    };

    // Check memory usage
    const memUsage = metrics.system.memoryUsage;
    const memUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    
    if (memUsagePercent > 90) {
      health.status = 'critical';
      health.issues.push('High memory usage (>90%)');
    } else if (memUsagePercent > 75) {
      health.warnings.push('Elevated memory usage (>75%)');
    }

    // Check success rate
    const successRate = metrics.sync.totalOperations > 0 
      ? (metrics.sync.successfulOperations / metrics.sync.totalOperations) * 100 
      : 100;
    
    if (successRate < 80) {
      health.status = 'critical';
      health.issues.push(`Low success rate (${successRate.toFixed(1)}%)`);
    } else if (successRate < 95) {
      health.warnings.push(`Reduced success rate (${successRate.toFixed(1)}%)`);
    }

    // Check queue size
    if (metrics.queue.currentSize > 100) {
      health.status = 'critical';
      health.issues.push('Large queue size');
    } else if (metrics.queue.currentSize > 50) {
      health.warnings.push('Growing queue size');
    }

    // Check for recent errors
    const recentErrors = this.operationHistory
      .filter(op => !op.success && Date.now() - op.timestamp < 300000) // 5 minutes
      .length;
    
    if (recentErrors > 10) {
      health.status = 'critical';
      health.issues.push('High error rate in recent operations');
    } else if (recentErrors > 5) {
      health.warnings.push('Increased error rate detected');
    }

    if (health.issues.length === 0 && health.warnings.length > 0) {
      health.status = 'warning';
    }

    return health;
  }
}

module.exports = PerformanceMonitor;