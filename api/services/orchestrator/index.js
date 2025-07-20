const PipelineOrchestrator = require('./pipelineOrchestrator');
const DependencyAnalyzer = require('./dependencyAnalyzer');
const TaskExecutionEngine = require('./taskExecutionEngine');
const OrchestrationMonitor = require('./orchestrationMonitor');
const FailureRecoveryService = require('./failureRecoveryService');
const { createLogger } = require('../../config/logging');

class OrchestrationService {
  constructor(services = {}) {
    this.logger = createLogger('orchestration-service');
    this.services = services;
    
    // Initialize components
    this.orchestrator = new PipelineOrchestrator(services);
    this.dependencyAnalyzer = new DependencyAnalyzer();
    this.taskExecutionEngine = new TaskExecutionEngine(services);
    this.monitor = new OrchestrationMonitor({
      monitoringInterval: 10000, // 10 seconds
      healthCheckInterval: 60000, // 1 minute
      metricsRetention: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    this.recoveryService = new FailureRecoveryService(this.orchestrator);
    
    this.setupIntegrations();
    this.isInitialized = false;
  }

  setupIntegrations() {
    // Integrate orchestrator with monitor
    this.orchestrator.on('orchestration:started', (orchestration) => {
      this.monitor.registerOrchestration(orchestration);
    });

    this.orchestrator.on('orchestration:completed', (orchestration) => {
      this.monitor.completeOrchestration(orchestration.id, {
        status: orchestration.status,
        completedAt: orchestration.completedAt
      });
    });

    this.orchestrator.on('orchestration:failed', (orchestration, error) => {
      this.monitor.updateOrchestration(orchestration.id, {
        status: 'failed',
        error: error.message,
        failedAt: new Date()
      });
    });

    // Integrate monitor with recovery service
    this.monitor.on('alert:triggered', async (alert) => {
      this.logger.info(`Alert triggered, checking for recovery: ${alert.type}`);
      
      // Let recovery service handle the alert if it has a policy
      if (this.recoveryService.recoveryPolicies.has(alert.type)) {
        await this.recoveryService.executeRecovery(alert.type, {
          alert,
          orchestration: alert.details.orchestrationId 
            ? this.orchestrator.orchestrationJobs.get(alert.details.orchestrationId)
            : null
        });
      }
    });

    // Enhanced task execution integration
    this.orchestrator.executeTask = async (orchestration, task) => {
      return await this.taskExecutionEngine.executeTask(task, {
        id: orchestration.id,
        startedAt: orchestration.startedAt
      });
    };

    // Enhanced dependency analysis integration
    this.orchestrator.analyzeDependencies = async (repositories) => {
      return await this.dependencyAnalyzer.analyzeDependencies(repositories);
    };

    this.logger.info('Orchestration service integrations configured');
  }

  async initialize() {
    if (this.isInitialized) {
      this.logger.warn('Orchestration service already initialized');
      return;
    }

    try {
      this.logger.info('Initializing orchestration service...');

      // Start monitoring
      this.monitor.startMonitoring();

      // Set up event forwarding to external services
      if (this.services.websocket) {
        this.setupWebSocketIntegration();
      }

      if (this.services.metrics) {
        this.setupMetricsIntegration();
      }

      this.isInitialized = true;
      this.logger.info('Orchestration service initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize orchestration service', error);
      throw error;
    }
  }

  setupWebSocketIntegration() {
    // Forward orchestration events to WebSocket clients
    const forwardToWebSocket = (eventType) => {
      return (data) => {
        this.services.websocket.broadcast(eventType, {
          ...data,
          timestamp: new Date(),
          source: 'orchestration'
        });
      };
    };

    this.orchestrator.on('orchestration:started', forwardToWebSocket('orchestration:started'));
    this.orchestrator.on('orchestration:completed', forwardToWebSocket('orchestration:completed'));
    this.orchestrator.on('orchestration:failed', forwardToWebSocket('orchestration:failed'));
    this.orchestrator.on('stage:started', forwardToWebSocket('orchestration:stage_started'));
    this.orchestrator.on('stage:completed', forwardToWebSocket('orchestration:stage_completed'));
    this.orchestrator.on('task:started', forwardToWebSocket('orchestration:task_started'));
    this.orchestrator.on('task:completed', forwardToWebSocket('orchestration:task_completed'));

    this.monitor.on('alert:triggered', forwardToWebSocket('orchestration:alert'));
    this.monitor.on('health:check_complete', forwardToWebSocket('orchestration:health'));

    this.recoveryService.on('recovery:completed', forwardToWebSocket('orchestration:recovery'));

    this.logger.info('WebSocket integration configured');
  }

  setupMetricsIntegration() {
    // Forward metrics to external metrics service
    this.monitor.on('metrics:performance_updated', (metrics) => {
      this.services.metrics.emit('orchestration:performance', metrics);
    });

    this.monitor.on('metrics:system_updated', (metrics) => {
      this.services.metrics.emit('orchestration:system', metrics);
    });

    this.orchestrator.on('orchestration:completed', (orchestration) => {
      this.services.metrics.emit('orchestration:duration', {
        duration: orchestration.completedAt - orchestration.startedAt,
        repositories: orchestration.repositories?.length || 0,
        stages: orchestration.stages?.length || 0
      });
    });

    this.logger.info('Metrics integration configured');
  }

  async shutdown() {
    if (!this.isInitialized) {
      return;
    }

    this.logger.info('Shutting down orchestration service...');

    try {
      // Stop monitoring
      this.monitor.stopMonitoring();

      // Cancel all active orchestrations
      const activeOrchestrations = this.orchestrator.listActiveOrchestrations();
      for (const orchestration of activeOrchestrations) {
        try {
          await this.orchestrator.cancelOrchestration(orchestration.id);
        } catch (error) {
          this.logger.warn(`Failed to cancel orchestration ${orchestration.id}`, error);
        }
      }

      // Cancel all active tasks
      await this.taskExecutionEngine.cancelAllTasks();

      // Clean up event listeners
      this.orchestrator.removeAllListeners();
      this.monitor.removeAllListeners();
      this.recoveryService.removeAllListeners();
      this.taskExecutionEngine.removeAllListeners();

      this.isInitialized = false;
      this.logger.info('Orchestration service shut down successfully');

    } catch (error) {
      this.logger.error('Error during orchestration service shutdown', error);
      throw error;
    }
  }

  // Convenience methods for external access
  async startOrchestration(config) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return await this.orchestrator.orchestratePipeline(config);
  }

  async cancelOrchestration(orchestrationId) {
    return await this.orchestrator.cancelOrchestration(orchestrationId);
  }

  getOrchestrationStatus(orchestrationId) {
    return this.orchestrator.getOrchestrationStatus(orchestrationId);
  }

  listActiveOrchestrations() {
    return this.orchestrator.listActiveOrchestrations();
  }

  getMetrics(timeRange = '1h') {
    return this.monitor.getMetrics(timeRange);
  }

  getActiveAlerts() {
    return this.monitor.getActiveAlerts();
  }

  acknowledgeAlert(alertId) {
    return this.monitor.acknowledgeAlert(alertId);
  }

  resolveAlert(alertId, resolution) {
    return this.monitor.resolveAlert(alertId, resolution);
  }

  getRecoveryStatistics(timeRange = '24h') {
    return this.recoveryService.getRecoveryStatistics(timeRange);
  }

  async analyzeDependencies(repositories) {
    return await this.dependencyAnalyzer.analyzeDependencies(repositories);
  }

  async performHealthCheck() {
    return await this.monitor.performHealthCheck();
  }

  getSystemStatus() {
    return {
      initialized: this.isInitialized,
      monitoring: this.monitor.monitoringActive,
      activeOrchestrations: this.orchestrator.runningOrchestrations.size,
      activeTasks: this.taskExecutionEngine.getActiveTaskCount(),
      activeAlerts: this.monitor.getActiveAlerts().length,
      uptime: this.isInitialized ? Date.now() - this.monitor.startTime : 0
    };
  }

  // Configuration management
  updateMonitoringConfig(config) {
    this.monitor.alertThresholds = { ...this.monitor.alertThresholds, ...config.alertThresholds };
    this.monitor.monitoringInterval = config.monitoringInterval || this.monitor.monitoringInterval;
    this.monitor.healthCheckInterval = config.healthCheckInterval || this.monitor.healthCheckInterval;
    
    this.logger.info('Monitoring configuration updated', config);
  }

  addRecoveryPolicy(failureType, policy) {
    this.recoveryService.addRecoveryPolicy(failureType, policy);
    this.logger.info(`Added recovery policy: ${failureType}`);
  }

  removeRecoveryPolicy(failureType) {
    const removed = this.recoveryService.removeRecoveryPolicy(failureType);
    if (removed) {
      this.logger.info(`Removed recovery policy: ${failureType}`);
    }
    return removed;
  }

  // Event subscription for external services
  on(event, listener) {
    switch (event) {
      case 'orchestration:started':
      case 'orchestration:completed':
      case 'orchestration:failed':
      case 'stage:started':
      case 'stage:completed':
      case 'task:started':
      case 'task:completed':
        this.orchestrator.on(event, listener);
        break;
      
      case 'alert:triggered':
      case 'alert:acknowledged':
      case 'alert:resolved':
      case 'health:check_complete':
      case 'monitoring:started':
      case 'monitoring:stopped':
        this.monitor.on(event, listener);
        break;
      
      case 'recovery:completed':
      case 'recovery:strategy_executed':
      case 'recovery:strategy_failed':
        this.recoveryService.on(event, listener);
        break;
      
      default:
        this.logger.warn(`Unknown event type: ${event}`);
    }
  }

  off(event, listener) {
    this.orchestrator.off(event, listener);
    this.monitor.off(event, listener);
    this.recoveryService.off(event, listener);
  }
}

// Singleton instance for the application
let orchestrationServiceInstance = null;

function createOrchestrationService(services) {
  if (!orchestrationServiceInstance) {
    orchestrationServiceInstance = new OrchestrationService(services);
  }
  return orchestrationServiceInstance;
}

function getOrchestrationService() {
  if (!orchestrationServiceInstance) {
    throw new Error('Orchestration service not initialized. Call createOrchestrationService() first.');
  }
  return orchestrationServiceInstance;
}

module.exports = {
  OrchestrationService,
  createOrchestrationService,
  getOrchestrationService,
  
  // Export individual components for advanced usage
  PipelineOrchestrator,
  DependencyAnalyzer,
  TaskExecutionEngine,
  OrchestrationMonitor,
  FailureRecoveryService
};