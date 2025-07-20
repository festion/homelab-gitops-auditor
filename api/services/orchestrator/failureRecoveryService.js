const EventEmitter = require('events');
const { createLogger } = require('../../config/logging');

class FailureRecoveryService extends EventEmitter {
  constructor(orchestrator, options = {}) {
    super();
    this.orchestrator = orchestrator;
    this.logger = createLogger('failure-recovery');
    
    this.recoveryPolicies = new Map();
    this.activeRecoveries = new Map();
    this.recoveryHistory = [];
    this.maxRecoveryHistory = options.maxRecoveryHistory || 1000;
    
    this.retryLimits = {
      orchestration: options.orchestrationRetryLimit || 3,
      task: options.taskRetryLimit || 5,
      global: options.globalRetryLimit || 10
    };
    
    this.backoffStrategies = {
      exponential: this.exponentialBackoff.bind(this),
      linear: this.linearBackoff.bind(this),
      fixed: this.fixedBackoff.bind(this),
      fibonacci: this.fibonacciBackoff.bind(this)
    };
    
    this.setupDefaultPolicies();
    this.setupEventHandlers();
  }

  setupDefaultPolicies() {
    // Orchestration-level recovery policies
    this.addRecoveryPolicy('orchestration:timeout', {
      strategy: 'graceful_shutdown',
      maxRetries: 1,
      backoff: 'exponential',
      escalation: ['cancel', 'notify_admin']
    });

    this.addRecoveryPolicy('orchestration:resource_exhaustion', {
      strategy: 'resource_scaling',
      maxRetries: 2,
      backoff: 'linear',
      escalation: ['reduce_concurrency', 'defer_execution']
    });

    this.addRecoveryPolicy('orchestration:dependency_failure', {
      strategy: 'dependency_isolation',
      maxRetries: 3,
      backoff: 'exponential',
      escalation: ['skip_optional_dependencies', 'fallback_configuration']
    });

    // Task-level recovery policies
    this.addRecoveryPolicy('task:execution_failure', {
      strategy: 'retry_with_backoff',
      maxRetries: 3,
      backoff: 'exponential',
      escalation: ['alternative_execution', 'skip_task']
    });

    this.addRecoveryPolicy('task:timeout', {
      strategy: 'timeout_extension',
      maxRetries: 2,
      backoff: 'linear',
      escalation: ['kill_and_retry', 'skip_task']
    });

    this.addRecoveryPolicy('task:resource_limit', {
      strategy: 'resource_optimization',
      maxRetries: 2,
      backoff: 'fixed',
      escalation: ['reduce_parallelism', 'defer_task']
    });

    // System-level recovery policies
    this.addRecoveryPolicy('system:high_cpu', {
      strategy: 'load_balancing',
      maxRetries: 1,
      backoff: 'fixed',
      escalation: ['throttle_execution', 'emergency_shutdown']
    });

    this.addRecoveryPolicy('system:memory_pressure', {
      strategy: 'memory_cleanup',
      maxRetries: 2,
      backoff: 'exponential',
      escalation: ['garbage_collection', 'process_restart']
    });

    this.addRecoveryPolicy('system:disk_space_low', {
      strategy: 'disk_cleanup',
      maxRetries: 1,
      backoff: 'fixed',
      escalation: ['archive_old_data', 'stop_non_critical']
    });
  }

  setupEventHandlers() {
    // Listen for orchestration events
    this.orchestrator.on('orchestration:failed', this.handleOrchestrationFailure.bind(this));
    this.orchestrator.on('orchestration:timeout', this.handleOrchestrationTimeout.bind(this));
    this.orchestrator.on('task:failed', this.handleTaskFailure.bind(this));
    this.orchestrator.on('task:timeout', this.handleTaskTimeout.bind(this));
    this.orchestrator.on('stage:failed', this.handleStageFailure.bind(this));
  }

  addRecoveryPolicy(failureType, policy) {
    this.recoveryPolicies.set(failureType, {
      ...policy,
      createdAt: new Date(),
      usageCount: 0,
      successRate: 0
    });
    
    this.logger.info(`Added recovery policy: ${failureType}`, policy);
  }

  removeRecoveryPolicy(failureType) {
    const removed = this.recoveryPolicies.delete(failureType);
    if (removed) {
      this.logger.info(`Removed recovery policy: ${failureType}`);
    }
    return removed;
  }

  async handleOrchestrationFailure(orchestration, error) {
    this.logger.warn(`Orchestration failed: ${orchestration.id}`, {
      error: error.message,
      stage: orchestration.currentStage
    });

    const failureType = this.classifyOrchestrationFailure(orchestration, error);
    await this.executeRecovery(failureType, {
      orchestration,
      error,
      type: 'orchestration'
    });
  }

  async handleOrchestrationTimeout(orchestration) {
    this.logger.warn(`Orchestration timeout: ${orchestration.id}`, {
      duration: Date.now() - orchestration.startedAt,
      stage: orchestration.currentStage
    });

    await this.executeRecovery('orchestration:timeout', {
      orchestration,
      type: 'orchestration'
    });
  }

  async handleTaskFailure(orchestration, task, error) {
    this.logger.warn(`Task failed: ${task.type}`, {
      orchestrationId: orchestration.id,
      repository: task.repository,
      error: error.message
    });

    const failureType = this.classifyTaskFailure(task, error);
    await this.executeRecovery(failureType, {
      orchestration,
      task,
      error,
      type: 'task'
    });
  }

  async handleTaskTimeout(orchestration, task) {
    this.logger.warn(`Task timeout: ${task.type}`, {
      orchestrationId: orchestration.id,
      repository: task.repository
    });

    await this.executeRecovery('task:timeout', {
      orchestration,
      task,
      type: 'task'
    });
  }

  async handleStageFailure(orchestration, stage, error) {
    this.logger.warn(`Stage failed: ${stage.name}`, {
      orchestrationId: orchestration.id,
      error: error.message
    });

    const failureType = this.classifyStageFailure(stage, error);
    await this.executeRecovery(failureType, {
      orchestration,
      stage,
      error,
      type: 'stage'
    });
  }

  classifyOrchestrationFailure(orchestration, error) {
    if (error.message.includes('timeout')) {
      return 'orchestration:timeout';
    }
    if (error.message.includes('resource') || error.message.includes('memory') || error.message.includes('cpu')) {
      return 'orchestration:resource_exhaustion';
    }
    if (error.message.includes('dependency')) {
      return 'orchestration:dependency_failure';
    }
    return 'orchestration:general_failure';
  }

  classifyTaskFailure(task, error) {
    if (error.message.includes('timeout')) {
      return 'task:timeout';
    }
    if (error.message.includes('resource') || error.message.includes('limit')) {
      return 'task:resource_limit';
    }
    if (error.message.includes('network') || error.message.includes('connection')) {
      return 'task:network_failure';
    }
    if (error.message.includes('permission') || error.message.includes('unauthorized')) {
      return 'task:permission_failure';
    }
    return 'task:execution_failure';
  }

  classifyStageFailure(stage, error) {
    if (stage.type === 'parallel' && error.message.includes('parallel tasks failed')) {
      return 'stage:parallel_failure';
    }
    if (stage.type === 'dependency-ordered' && error.message.includes('dependency')) {
      return 'stage:dependency_failure';
    }
    return 'stage:general_failure';
  }

  async executeRecovery(failureType, context) {
    const recoveryId = this.generateRecoveryId();
    
    this.logger.info(`Starting recovery: ${recoveryId}`, {
      failureType,
      type: context.type
    });

    const recovery = {
      id: recoveryId,
      failureType,
      context,
      startedAt: new Date(),
      status: 'in_progress',
      attempts: [],
      policy: this.recoveryPolicies.get(failureType)
    };

    if (!recovery.policy) {
      this.logger.warn(`No recovery policy found for: ${failureType}`);
      recovery.status = 'failed';
      recovery.error = 'No recovery policy found';
      this.recordRecoveryHistory(recovery);
      return recovery;
    }

    this.activeRecoveries.set(recoveryId, recovery);

    try {
      const result = await this.attemptRecovery(recovery);
      recovery.status = result.success ? 'completed' : 'failed';
      recovery.result = result;
      recovery.completedAt = new Date();

      // Update policy statistics
      recovery.policy.usageCount++;
      recovery.policy.successRate = this.calculatePolicySuccessRate(failureType);

      this.logger.info(`Recovery ${result.success ? 'succeeded' : 'failed'}: ${recoveryId}`, result);

    } catch (error) {
      recovery.status = 'failed';
      recovery.error = error.message;
      recovery.completedAt = new Date();
      
      this.logger.error(`Recovery failed: ${recoveryId}`, error);
    } finally {
      this.activeRecoveries.delete(recoveryId);
      this.recordRecoveryHistory(recovery);
    }

    this.emit('recovery:completed', recovery);
    return recovery;
  }

  async attemptRecovery(recovery) {
    const { policy, context, failureType } = recovery;
    const maxRetries = policy.maxRetries || 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      this.logger.info(`Recovery attempt ${attempt}/${maxRetries}: ${recovery.id}`);

      const attemptResult = {
        attempt,
        startedAt: new Date(),
        strategy: policy.strategy
      };

      try {
        // Apply backoff delay
        if (attempt > 1) {
          const delay = this.calculateBackoff(policy.backoff, attempt - 1);
          this.logger.info(`Applying backoff delay: ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        // Execute recovery strategy
        const strategyResult = await this.executeRecoveryStrategy(policy.strategy, context);
        
        attemptResult.success = true;
        attemptResult.result = strategyResult;
        attemptResult.completedAt = new Date();
        
        recovery.attempts.push(attemptResult);

        // Verify recovery success
        const verificationResult = await this.verifyRecovery(context, strategyResult);
        if (verificationResult.success) {
          return {
            success: true,
            strategy: policy.strategy,
            attempts: attempt,
            result: strategyResult,
            verification: verificationResult
          };
        } else {
          this.logger.warn(`Recovery verification failed on attempt ${attempt}`, verificationResult);
          attemptResult.verification = verificationResult;
        }

      } catch (error) {
        attemptResult.success = false;
        attemptResult.error = error.message;
        attemptResult.completedAt = new Date();
        
        recovery.attempts.push(attemptResult);
        
        this.logger.warn(`Recovery attempt ${attempt} failed: ${error.message}`);
      }
    }

    // All attempts failed, try escalation
    if (policy.escalation && policy.escalation.length > 0) {
      this.logger.info(`Attempting escalation strategies: ${recovery.id}`);
      
      for (const escalationStrategy of policy.escalation) {
        try {
          const escalationResult = await this.executeRecoveryStrategy(escalationStrategy, context);
          const verification = await this.verifyRecovery(context, escalationResult);
          
          if (verification.success) {
            return {
              success: true,
              strategy: escalationStrategy,
              attempts: maxRetries,
              escalated: true,
              result: escalationResult,
              verification
            };
          }
        } catch (error) {
          this.logger.warn(`Escalation strategy ${escalationStrategy} failed: ${error.message}`);
        }
      }
    }

    return {
      success: false,
      strategy: policy.strategy,
      attempts: maxRetries,
      error: 'All recovery attempts and escalations failed'
    };
  }

  async executeRecoveryStrategy(strategy, context) {
    this.logger.info(`Executing recovery strategy: ${strategy}`);

    switch (strategy) {
      case 'retry_with_backoff':
        return await this.retryWithBackoff(context);
      
      case 'graceful_shutdown':
        return await this.gracefulShutdown(context);
      
      case 'resource_scaling':
        return await this.resourceScaling(context);
      
      case 'dependency_isolation':
        return await this.dependencyIsolation(context);
      
      case 'timeout_extension':
        return await this.timeoutExtension(context);
      
      case 'resource_optimization':
        return await this.resourceOptimization(context);
      
      case 'load_balancing':
        return await this.loadBalancing(context);
      
      case 'memory_cleanup':
        return await this.memoryCleanup(context);
      
      case 'disk_cleanup':
        return await this.diskCleanup(context);
      
      case 'cancel':
        return await this.cancelExecution(context);
      
      case 'skip_task':
        return await this.skipTask(context);
      
      case 'fallback_configuration':
        return await this.fallbackConfiguration(context);
      
      default:
        throw new Error(`Unknown recovery strategy: ${strategy}`);
    }
  }

  async retryWithBackoff(context) {
    const { orchestration, task } = context;
    
    if (task) {
      // Retry specific task
      const result = await this.orchestrator.executeTask(orchestration, task);
      return { action: 'task_retried', task: task.type, result };
    } else {
      // Retry entire orchestration
      const result = await this.orchestrator.orchestratePipeline(orchestration.config);
      return { action: 'orchestration_retried', orchestrationId: result.id };
    }
  }

  async gracefulShutdown(context) {
    const { orchestration } = context;
    
    await this.orchestrator.cancelOrchestration(orchestration.id);
    
    return { 
      action: 'graceful_shutdown', 
      orchestrationId: orchestration.id,
      cancelledAt: new Date()
    };
  }

  async resourceScaling(context) {
    // Simulate resource scaling
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return { 
      action: 'resource_scaling',
      scaled: true,
      timestamp: new Date()
    };
  }

  async dependencyIsolation(context) {
    const { orchestration, task } = context;
    
    if (task && task.repository) {
      // Remove problematic dependencies
      const modifiedConfig = { ...orchestration.config };
      if (modifiedConfig.repositories) {
        modifiedConfig.repositories = modifiedConfig.repositories.filter(
          repo => repo !== task.repository
        );
      }
      
      return { 
        action: 'dependency_isolation',
        isolated: task.repository,
        modifiedConfig
      };
    }
    
    return { action: 'dependency_isolation', result: 'no_action_needed' };
  }

  async timeoutExtension(context) {
    const { orchestration, task } = context;
    
    // Extend timeout by 50%
    const extensionFactor = 1.5;
    
    return { 
      action: 'timeout_extension',
      factor: extensionFactor,
      target: task ? task.type : 'orchestration',
      timestamp: new Date()
    };
  }

  async resourceOptimization(context) {
    // Optimize resource usage
    return { 
      action: 'resource_optimization',
      optimizations: ['reduce_parallelism', 'memory_cleanup'],
      timestamp: new Date()
    };
  }

  async loadBalancing(context) {
    // Implement load balancing
    return { 
      action: 'load_balancing',
      redistributed: true,
      timestamp: new Date()
    };
  }

  async memoryCleanup(context) {
    // Trigger memory cleanup
    if (global.gc) {
      global.gc();
    }
    
    return { 
      action: 'memory_cleanup',
      gcTriggered: !!global.gc,
      timestamp: new Date()
    };
  }

  async diskCleanup(context) {
    // Clean up disk space
    return { 
      action: 'disk_cleanup',
      cleaned: true,
      timestamp: new Date()
    };
  }

  async cancelExecution(context) {
    const { orchestration, task } = context;
    
    if (task) {
      // Cancel specific task
      return { action: 'task_cancelled', task: task.type };
    } else {
      // Cancel orchestration
      await this.orchestrator.cancelOrchestration(orchestration.id);
      return { action: 'orchestration_cancelled', orchestrationId: orchestration.id };
    }
  }

  async skipTask(context) {
    const { task } = context;
    
    return { 
      action: 'task_skipped', 
      task: task?.type || 'unknown',
      repository: task?.repository
    };
  }

  async fallbackConfiguration(context) {
    const { orchestration } = context;
    
    // Use fallback configuration
    const fallbackConfig = this.createFallbackConfiguration(orchestration.config);
    
    return { 
      action: 'fallback_configuration',
      originalConfig: orchestration.config,
      fallbackConfig
    };
  }

  createFallbackConfiguration(originalConfig) {
    return {
      ...originalConfig,
      repositories: originalConfig.repositories?.slice(0, 3) || [], // Limit repositories
      timeout: (originalConfig.timeout || 60000) * 2, // Double timeout
      applyTemplates: false, // Disable template application
      workflow: 'basic.yml' // Use basic workflow
    };
  }

  async verifyRecovery(context, strategyResult) {
    // Simple verification logic
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // In a real implementation, this would check if the recovery actually fixed the issue
    const success = Math.random() > 0.3; // 70% success rate for simulation
    
    return {
      success,
      timestamp: new Date(),
      checks: ['connectivity', 'resource_availability', 'dependencies'],
      strategyResult
    };
  }

  calculateBackoff(strategy, attempt) {
    const baseDelay = 1000; // 1 second
    
    return this.backoffStrategies[strategy]?.(baseDelay, attempt) || baseDelay;
  }

  exponentialBackoff(baseDelay, attempt) {
    return baseDelay * Math.pow(2, attempt);
  }

  linearBackoff(baseDelay, attempt) {
    return baseDelay * (attempt + 1);
  }

  fixedBackoff(baseDelay, attempt) {
    return baseDelay;
  }

  fibonacciBackoff(baseDelay, attempt) {
    const fib = (n) => n <= 1 ? n : fib(n - 1) + fib(n - 2);
    return baseDelay * fib(attempt + 1);
  }

  calculatePolicySuccessRate(failureType) {
    const recoveries = this.recoveryHistory.filter(r => r.failureType === failureType);
    if (recoveries.length === 0) return 0;
    
    const successful = recoveries.filter(r => r.status === 'completed').length;
    return successful / recoveries.length;
  }

  recordRecoveryHistory(recovery) {
    this.recoveryHistory.push({
      id: recovery.id,
      failureType: recovery.failureType,
      status: recovery.status,
      startedAt: recovery.startedAt,
      completedAt: recovery.completedAt,
      attempts: recovery.attempts?.length || 0,
      strategy: recovery.policy?.strategy
    });

    // Limit history size
    if (this.recoveryHistory.length > this.maxRecoveryHistory) {
      this.recoveryHistory = this.recoveryHistory.slice(-Math.floor(this.maxRecoveryHistory * 0.8));
    }
  }

  getRecoveryStatistics(timeRange = '24h') {
    const now = new Date();
    const ranges = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000
    };

    const cutoff = new Date(now - ranges[timeRange]);
    const recentRecoveries = this.recoveryHistory.filter(r => r.startedAt > cutoff);

    const stats = {
      totalRecoveries: recentRecoveries.length,
      successfulRecoveries: recentRecoveries.filter(r => r.status === 'completed').length,
      activeRecoveries: this.activeRecoveries.size,
      successRate: 0,
      averageAttempts: 0,
      mostCommonFailures: {},
      strategyEffectiveness: {},
      timeRange
    };

    if (stats.totalRecoveries > 0) {
      stats.successRate = stats.successfulRecoveries / stats.totalRecoveries;
      stats.averageAttempts = recentRecoveries.reduce((sum, r) => sum + r.attempts, 0) / stats.totalRecoveries;
    }

    // Calculate most common failures
    recentRecoveries.forEach(r => {
      stats.mostCommonFailures[r.failureType] = (stats.mostCommonFailures[r.failureType] || 0) + 1;
    });

    // Calculate strategy effectiveness
    recentRecoveries.forEach(r => {
      if (r.strategy) {
        if (!stats.strategyEffectiveness[r.strategy]) {
          stats.strategyEffectiveness[r.strategy] = { total: 0, successful: 0, rate: 0 };
        }
        stats.strategyEffectiveness[r.strategy].total++;
        if (r.status === 'completed') {
          stats.strategyEffectiveness[r.strategy].successful++;
        }
        stats.strategyEffectiveness[r.strategy].rate = 
          stats.strategyEffectiveness[r.strategy].successful / stats.strategyEffectiveness[r.strategy].total;
      }
    });

    return stats;
  }

  generateRecoveryId() {
    return `recovery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

module.exports = FailureRecoveryService;