const { EventEmitter } = require('events');
const fs = require('fs').promises;
const path = require('path');

class WebhookEventProcessor extends EventEmitter {
  constructor(services, options = {}) {
    super();
    
    this.services = services;
    this.options = {
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
      maxRetryDelay: options.maxRetryDelay || 30000,
      processingTimeout: options.processingTimeout || 30000,
      persistFailures: options.persistFailures !== false,
      failureLogPath: options.failureLogPath || path.join(process.cwd(), 'logs', 'webhook-failures.log'),
      ...options
    };
    
    // Processing state
    this.processingQueue = new Map();
    this.retryAttempts = new Map();
    this.processingStats = {
      totalProcessed: 0,
      successfullyProcessed: 0,
      permanentlyFailed: 0,
      currentlyRetrying: 0,
      averageProcessingTime: 0,
      eventTypeStats: {}
    };
    
    // Rate limiting
    this.rateLimiter = {
      windowStart: Date.now(),
      windowSize: 60000, // 1 minute
      maxRequestsPerWindow: 100,
      currentRequests: 0
    };
    
    this.initializeFailureLogging();
    console.log('🔄 Webhook Event Processor initialized');
  }

  async initializeFailureLogging() {
    if (this.options.persistFailures) {
      try {
        const logDir = path.dirname(this.options.failureLogPath);
        await fs.mkdir(logDir, { recursive: true });
      } catch (error) {
        console.error('Failed to create failure log directory:', error);
      }
    }
  }

  async processEvent(event, payload, deliveryId, priority = 'normal') {
    const startTime = Date.now();
    const eventKey = `${event}-${deliveryId}`;
    
    try {
      // Check rate limiting
      if (!this.checkRateLimit()) {
        throw new Error('Rate limit exceeded, please try again later');
      }

      // Validate event data
      this.validateEventData(event, payload, deliveryId);

      // Create processing context
      const eventData = {
        event,
        payload,
        deliveryId,
        timestamp: new Date(),
        attempts: 0,
        priority,
        processingId: this.generateProcessingId(),
        startTime
      };

      // Add to processing queue
      this.processingQueue.set(eventKey, eventData);

      console.log(`🎯 Processing event: ${event} (delivery: ${deliveryId}, priority: ${priority})`);

      // Execute event handlers with timeout
      await this.executeEventHandlersWithTimeout(eventData);
      
      // Mark as successful
      await this.markEventSuccess(eventData, startTime);
      
      // Remove from processing queue
      this.processingQueue.delete(eventKey);
      
      console.log(`✅ Event processed successfully: ${event} (${Date.now() - startTime}ms)`);
      
    } catch (error) {
      console.error(`❌ Failed to process event ${event}:`, error.message);
      
      // Handle failure with retry logic
      await this.handleEventFailure(event, payload, deliveryId, error, startTime);
    }
  }

  async executeEventHandlersWithTimeout(eventData) {
    const { event, payload, deliveryId } = eventData;

    // Create timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Event processing timeout after ${this.options.processingTimeout}ms`));
      }, this.options.processingTimeout);
    });

    // Create processing promise
    const processingPromise = this.executeEventHandlers(eventData);

    // Race between processing and timeout
    return Promise.race([processingPromise, timeoutPromise]);
  }

  async executeEventHandlers(eventData) {
    const { event, payload, deliveryId } = eventData;

    try {
      switch (event) {
        case 'push':
          await this.handlePushEvent(payload, deliveryId);
          break;
        case 'workflow_run':
          await this.handleWorkflowEvent(payload, deliveryId);
          break;
        case 'workflow_job':
          await this.handleWorkflowJobEvent(payload, deliveryId);
          break;
        case 'pull_request':
          await this.handlePullRequestEvent(payload, deliveryId);
          break;
        case 'pull_request_review':
          await this.handlePullRequestReviewEvent(payload, deliveryId);
          break;
        case 'repository':
          await this.handleRepositoryEvent(payload, deliveryId);
          break;
        case 'issues':
          await this.handleIssuesEvent(payload, deliveryId);
          break;
        case 'issue_comment':
          await this.handleIssueCommentEvent(payload, deliveryId);
          break;
        case 'release':
          await this.handleReleaseEvent(payload, deliveryId);
          break;
        case 'create':
        case 'delete':
          await this.handleBranchTagEvent(event, payload, deliveryId);
          break;
        case 'security_advisory':
        case 'dependabot_alert':
        case 'code_scanning_alert':
        case 'secret_scanning_alert':
          await this.handleSecurityEvent(event, payload, deliveryId);
          break;
        case 'deployment':
        case 'deployment_status':
          await this.handleDeploymentEvent(event, payload, deliveryId);
          break;
        case 'check_run':
        case 'check_suite':
          await this.handleCheckEvent(event, payload, deliveryId);
          break;
        case 'status':
          await this.handleStatusEvent(payload, deliveryId);
          break;
        default:
          console.log(`⚠️  Unhandled webhook event: ${event}`);
          await this.handleGenericEvent(event, payload, deliveryId);
      }
    } catch (error) {
      // Enhance error with context
      error.eventContext = {
        event,
        deliveryId,
        repository: payload.repository?.full_name,
        timestamp: new Date().toISOString()
      };
      throw error;
    }
  }

  async handlePushEvent(payload, deliveryId) {
    const { repository, commits, ref } = payload;
    
    console.log(`📝 Processing push event for ${repository.full_name}`);

    // Parallel processing of different aspects
    const tasks = [
      this.updateRepositoryMetrics(repository, commits, deliveryId),
      this.checkForConfigurationChanges(repository, commits, deliveryId),
      this.triggerAutomatedActions(repository, commits, ref, deliveryId)
    ];

    await Promise.all(tasks.map(task => 
      task.catch(error => {
        console.error('Push event subtask failed:', error);
        // Don't fail the entire event for individual subtask failures
        return null;
      })
    ));
  }

  async handleWorkflowEvent(payload, deliveryId) {
    const { workflow_run, repository } = payload;
    
    console.log(`🔄 Processing workflow event for ${repository.full_name}: ${workflow_run.name}`);

    const tasks = [
      this.updatePipelineStatus(workflow_run, repository, deliveryId),
      this.recordWorkflowMetrics(workflow_run, repository, deliveryId),
      this.checkWorkflowCompletion(workflow_run, repository, deliveryId)
    ];

    await Promise.all(tasks.map(task => 
      task.catch(error => {
        console.error('Workflow event subtask failed:', error);
        return null;
      })
    ));
  }

  async handlePullRequestEvent(payload, deliveryId) {
    const { action, pull_request, repository } = payload;
    
    console.log(`🔀 Processing PR event for ${repository.full_name}#${pull_request.number}: ${action}`);

    if (['opened', 'synchronize', 'reopened'].includes(action)) {
      const tasks = [
        this.validatePullRequestCompliance(repository, pull_request, deliveryId),
        this.recordPullRequestMetrics(repository, pull_request, action, deliveryId),
        this.triggerPullRequestAutomation(repository, pull_request, action, deliveryId)
      ];

      await Promise.all(tasks.map(task => 
        task.catch(error => {
          console.error('PR event subtask failed:', error);
          return null;
        })
      ));
    }
  }

  async handleSecurityEvent(event, payload, deliveryId) {
    const { repository } = payload;
    
    console.log(`🔒 Processing security event ${event} for ${repository?.full_name || 'Global'}`);

    const tasks = [
      this.recordSecurityMetrics(event, payload, deliveryId),
      this.triggerSecurityAlerts(event, payload, deliveryId),
      this.updateSecurityDashboard(event, payload, deliveryId)
    ];

    await Promise.all(tasks.map(task => 
      task.catch(error => {
        console.error('Security event subtask failed:', error);
        return null;
      })
    ));
  }

  // Event processing implementation methods
  async updateRepositoryMetrics(repository, commits, deliveryId) {
    if (!this.services.metrics?.recordRepositoryActivity) return;

    const metrics = {
      repository: repository.full_name,
      commits: commits.length,
      authors: [...new Set(commits.map(c => c.author?.email).filter(Boolean))].length,
      files: commits.flatMap(c => [...(c.added || []), ...(c.modified || []), ...(c.removed || [])]).length,
      timestamp: new Date(),
      context: { deliveryId }
    };

    await this.services.metrics.recordRepositoryActivity(metrics);
  }

  async checkForConfigurationChanges(repository, commits, deliveryId) {
    const configFiles = [
      '.github/workflows/',
      '.mcp/templates/',
      'Dockerfile',
      'docker-compose.yml',
      'package.json',
      'requirements.txt',
      'pyproject.toml'
    ];

    const changedFiles = commits.flatMap(commit =>
      [...(commit.added || []), ...(commit.modified || [])]
    );

    const hasConfigChanges = changedFiles.some(file =>
      configFiles.some(pattern => file.includes(pattern))
    );

    if (hasConfigChanges && this.services.compliance?.scheduleComplianceCheck) {
      await this.services.compliance.scheduleComplianceCheck(repository.full_name, {
        reason: 'Configuration files changed',
        changedFiles: changedFiles.filter(file => 
          configFiles.some(pattern => file.includes(pattern))
        ),
        deliveryId
      });
    }
  }

  async triggerAutomatedActions(repository, commits, ref, deliveryId) {
    // Check for template changes
    const templateChanges = commits.flatMap(commit =>
      [...(commit.added || []), ...(commit.modified || [])].filter(file =>
        file.startsWith('.mcp/templates/')
      )
    );

    if (templateChanges.length > 0 && this.services.template?.propagateTemplateChanges) {
      await this.services.template.propagateTemplateChanges(
        repository.full_name,
        templateChanges,
        { deliveryId }
      );
    }

    // Trigger audit for main branch changes
    const branch = ref.replace('refs/heads/', '');
    if (branch === repository.default_branch && this.services.audit?.scheduleAudit) {
      await this.services.audit.scheduleAudit(repository.full_name, {
        reason: 'Main branch updated',
        branch,
        commits: commits.length,
        deliveryId
      });
    }
  }

  async updatePipelineStatus(workflowRun, repository, deliveryId) {
    if (!this.services.pipeline?.updatePipelineStatus) return;

    await this.services.pipeline.updatePipelineStatus({
      repository: repository.full_name,
      workflowId: workflowRun.workflow_id,
      runId: workflowRun.id,
      name: workflowRun.name,
      status: workflowRun.status,
      conclusion: workflowRun.conclusion,
      startedAt: workflowRun.created_at,
      completedAt: workflowRun.updated_at,
      branch: workflowRun.head_branch,
      commit: workflowRun.head_sha,
      context: { deliveryId }
    });
  }

  async recordWorkflowMetrics(workflowRun, repository, deliveryId) {
    if (!this.services.metrics?.recordWorkflowCompletion || workflowRun.status !== 'completed') return;

    const duration = this.calculateDuration(workflowRun.created_at, workflowRun.updated_at);

    await this.services.metrics.recordWorkflowCompletion({
      repository: repository.full_name,
      workflow: workflowRun.name,
      conclusion: workflowRun.conclusion,
      duration,
      branch: workflowRun.head_branch,
      timestamp: new Date(),
      context: { deliveryId }
    });
  }

  async checkWorkflowCompletion(workflowRun, repository, deliveryId) {
    if (workflowRun.status !== 'completed') return;

    // Handle compliance workflow completion
    if (workflowRun.name.includes('compliance') || workflowRun.name.includes('template')) {
      if (this.services.compliance?.updateComplianceFromWorkflow) {
        await this.services.compliance.updateComplianceFromWorkflow(
          repository.full_name,
          workflowRun,
          { deliveryId }
        );
      }
    }

    // Handle audit workflow completion
    if (workflowRun.name.includes('audit') || workflowRun.name.includes('security')) {
      if (this.services.audit?.updateAuditFromWorkflow) {
        await this.services.audit.updateAuditFromWorkflow(
          repository.full_name,
          workflowRun,
          { deliveryId }
        );
      }
    }

    // Check for critical workflow failures
    if (workflowRun.conclusion === 'failure' && this.isCriticalWorkflow(workflowRun)) {
      await this.handleCriticalWorkflowFailure(workflowRun, repository, deliveryId);
    }
  }

  async validatePullRequestCompliance(repository, pullRequest, deliveryId) {
    if (!this.services.compliance?.validatePullRequestCompliance) return;

    try {
      // Get PR files (would need GitHub API integration)
      const files = await this.getPullRequestFiles(repository, pullRequest.number);
      
      const hasTemplateChanges = files.some(file => 
        file.filename?.startsWith('.mcp/templates/') ||
        file.filename?.startsWith('.github/workflows/') ||
        file.filename?.startsWith('.github/actions/')
      );

      if (hasTemplateChanges) {
        await this.services.compliance.validatePullRequestCompliance(
          repository.full_name,
          pullRequest.number,
          {
            changedFiles: files.map(f => f.filename),
            deliveryId
          }
        );
      }
    } catch (error) {
      console.error('PR compliance validation failed:', error);
    }
  }

  async recordPullRequestMetrics(repository, pullRequest, action, deliveryId) {
    if (!this.services.metrics?.recordPullRequestActivity) return;

    await this.services.metrics.recordPullRequestActivity({
      repository: repository.full_name,
      action,
      number: pullRequest.number,
      author: pullRequest.user.login,
      baseBranch: pullRequest.base.ref,
      headBranch: pullRequest.head.ref,
      additions: pullRequest.additions,
      deletions: pullRequest.deletions,
      changedFiles: pullRequest.changed_files,
      timestamp: new Date(),
      context: { deliveryId }
    });
  }

  async handleEventFailure(event, payload, deliveryId, error, startTime) {
    const eventKey = `${event}-${deliveryId}`;
    const attempts = (this.retryAttempts.get(eventKey) || 0) + 1;

    console.error(`Event processing failed (attempt ${attempts}):`, {
      event,
      deliveryId,
      repository: payload.repository?.full_name,
      error: error.message,
      attempts
    });

    if (attempts <= this.options.maxRetries) {
      // Calculate exponential backoff delay
      const delay = Math.min(
        this.options.retryDelay * Math.pow(2, attempts - 1),
        this.options.maxRetryDelay
      );

      console.log(`⏰ Retrying event ${event} in ${delay}ms (attempt ${attempts}/${this.options.maxRetries})`);

      this.retryAttempts.set(eventKey, attempts);
      this.processingStats.currentlyRetrying++;

      setTimeout(async () => {
        try {
          this.processingStats.currentlyRetrying--;
          await this.processEvent(event, payload, deliveryId, 'retry');
          this.retryAttempts.delete(eventKey);
        } catch (retryError) {
          console.error(`Retry failed for ${event}:`, retryError);
        }
      }, delay);
    } else {
      // Permanent failure
      await this.handlePermanentFailure(event, payload, deliveryId, error, attempts, startTime);
      this.retryAttempts.delete(eventKey);
    }
  }

  async handlePermanentFailure(event, payload, deliveryId, error, attempts, startTime) {
    const failureData = {
      event,
      deliveryId,
      repository: payload.repository?.full_name,
      error: error.message,
      stack: error.stack,
      attempts,
      processingTime: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      payload: this.sanitizePayload(payload)
    };

    // Update stats
    this.processingStats.permanentlyFailed++;

    // Log permanent failure
    await this.logPermanentFailure(failureData);

    // Emit failure event
    this.emit('event_failed', { event, payload, error, attempts, deliveryId });

    console.error(`💀 Event processing failed permanently:`, {
      event,
      deliveryId,
      repository: payload.repository?.full_name,
      error: error.message,
      attempts
    });
  }

  async logPermanentFailure(failureData) {
    if (!this.options.persistFailures) return;

    try {
      const logLine = JSON.stringify(failureData) + '\n';
      await fs.appendFile(this.options.failureLogPath, logLine);
    } catch (error) {
      console.error('Failed to log permanent failure:', error);
    }
  }

  async markEventSuccess(eventData, startTime) {
    const processingTime = Date.now() - startTime;
    
    // Update stats
    this.processingStats.totalProcessed++;
    this.processingStats.successfullyProcessed++;
    
    // Update average processing time
    this.processingStats.averageProcessingTime = 
      (this.processingStats.averageProcessingTime * (this.processingStats.totalProcessed - 1) + processingTime) / 
      this.processingStats.totalProcessed;

    // Update event type stats
    if (!this.processingStats.eventTypeStats[eventData.event]) {
      this.processingStats.eventTypeStats[eventData.event] = {
        total: 0,
        successful: 0,
        failed: 0,
        averageProcessingTime: 0
      };
    }

    const eventStats = this.processingStats.eventTypeStats[eventData.event];
    eventStats.total++;
    eventStats.successful++;
    eventStats.averageProcessingTime = 
      (eventStats.averageProcessingTime * (eventStats.total - 1) + processingTime) / eventStats.total;

    // Log successful processing
    await this.logSuccessfulProcessing(eventData, processingTime);
  }

  async logSuccessfulProcessing(eventData, processingTime) {
    // Could log to database or metrics system
    console.debug(`✅ Event processed successfully:`, {
      event: eventData.event,
      deliveryId: eventData.deliveryId,
      repository: eventData.payload.repository?.full_name,
      processingTime,
      timestamp: new Date().toISOString()
    });
  }

  // Utility methods
  validateEventData(event, payload, deliveryId) {
    if (!event) {
      throw new Error('Event type is required');
    }
    if (!payload) {
      throw new Error('Payload is required');
    }
    if (!deliveryId) {
      throw new Error('Delivery ID is required');
    }
  }

  generateProcessingId() {
    return `proc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  checkRateLimit() {
    const now = Date.now();
    
    // Reset window if needed
    if (now - this.rateLimiter.windowStart > this.rateLimiter.windowSize) {
      this.rateLimiter.windowStart = now;
      this.rateLimiter.currentRequests = 0;
    }

    if (this.rateLimiter.currentRequests >= this.rateLimiter.maxRequestsPerWindow) {
      return false;
    }

    this.rateLimiter.currentRequests++;
    return true;
  }

  sanitizePayload(payload) {
    // Remove sensitive data from payload for logging
    const sanitized = { ...payload };
    
    // Remove potentially sensitive fields
    delete sanitized.installation;
    delete sanitized.sender?.email;
    
    return sanitized;
  }

  calculateDuration(startTime, endTime) {
    if (!startTime || !endTime) return null;
    return new Date(endTime) - new Date(startTime);
  }

  isCriticalWorkflow(workflowRun) {
    const criticalPatterns = [
      /security/i,
      /deploy/i,
      /release/i,
      /production/i,
      /audit/i,
      /compliance/i
    ];

    return criticalPatterns.some(pattern => pattern.test(workflowRun.name));
  }

  async handleCriticalWorkflowFailure(workflowRun, repository, deliveryId) {
    console.error(`🚨 Critical workflow failure detected:`, {
      workflow: workflowRun.name,
      repository: repository.full_name,
      conclusion: workflowRun.conclusion,
      url: workflowRun.html_url
    });

    // Emit critical failure event
    this.emit('critical_workflow_failure', {
      workflow: workflowRun,
      repository,
      deliveryId
    });
  }

  async getPullRequestFiles(repository, prNumber) {
    // Placeholder - would need GitHub API integration
    return [];
  }

  // Placeholder handlers for events that need service implementations
  async handleWorkflowJobEvent(payload, deliveryId) {
    console.log(`⚙️  Workflow job event: ${payload.workflow_job?.name} - ${payload.action}`);
  }

  async handlePullRequestReviewEvent(payload, deliveryId) {
    console.log(`👀 PR review event: ${payload.review?.state} by ${payload.review?.user?.login}`);
  }

  async handleRepositoryEvent(payload, deliveryId) {
    console.log(`🏠 Repository event: ${payload.action} - ${payload.repository?.full_name}`);
  }

  async handleIssuesEvent(payload, deliveryId) {
    console.log(`📝 Issues event: ${payload.action} - ${payload.issue?.title}`);
  }

  async handleIssueCommentEvent(payload, deliveryId) {
    console.log(`💬 Issue comment event: ${payload.action}`);
  }

  async handleReleaseEvent(payload, deliveryId) {
    console.log(`🚀 Release event: ${payload.action} - ${payload.release?.tag_name}`);
  }

  async handleBranchTagEvent(event, payload, deliveryId) {
    console.log(`🌿 ${event} event: ${payload.ref_type} - ${payload.ref}`);
  }

  async recordSecurityMetrics(event, payload, deliveryId) {
    console.log(`🔒 Recording security metrics for ${event}`);
  }

  async triggerSecurityAlerts(event, payload, deliveryId) {
    console.log(`🚨 Triggering security alerts for ${event}`);
  }

  async updateSecurityDashboard(event, payload, deliveryId) {
    console.log(`📊 Updating security dashboard for ${event}`);
  }

  async triggerPullRequestAutomation(repository, pullRequest, action, deliveryId) {
    console.log(`🤖 Triggering PR automation for ${repository.full_name}#${pullRequest.number}`);
  }

  async handleDeploymentEvent(event, payload, deliveryId) {
    console.log(`🚀 Deployment event: ${event} - ${payload.deployment?.environment}`);
  }

  async handleCheckEvent(event, payload, deliveryId) {
    console.log(`✅ Check event: ${event}`);
  }

  async handleStatusEvent(payload, deliveryId) {
    console.log(`📌 Status event: ${payload.state} - ${payload.description}`);
  }

  async handleGenericEvent(event, payload, deliveryId) {
    console.log(`📋 Generic event handler: ${event}`);
  }

  // Public API
  getProcessingStats() {
    const totalProcessed = this.processingStats.totalProcessed;
    
    return {
      ...this.processingStats,
      successRate: totalProcessed > 0 ? 
        ((this.processingStats.successfullyProcessed / totalProcessed) * 100).toFixed(2) + '%' : '0%',
      failureRate: totalProcessed > 0 ? 
        ((this.processingStats.permanentlyFailed / totalProcessed) * 100).toFixed(2) + '%' : '0%',
      currentQueueSize: this.processingQueue.size,
      pendingRetries: this.retryAttempts.size,
      rateLimitStatus: {
        currentRequests: this.rateLimiter.currentRequests,
        maxRequests: this.rateLimiter.maxRequestsPerWindow,
        windowStart: new Date(this.rateLimiter.windowStart).toISOString(),
        windowSize: this.rateLimiter.windowSize
      },
      lastUpdated: new Date().toISOString()
    };
  }

  getCurrentProcessingQueue() {
    return Array.from(this.processingQueue.values()).map(event => ({
      event: event.event,
      deliveryId: event.deliveryId,
      repository: event.payload.repository?.full_name,
      timestamp: event.timestamp,
      priority: event.priority,
      processingTime: Date.now() - event.startTime
    }));
  }

  async clearFailedEvents() {
    this.retryAttempts.clear();
    this.processingStats.currentlyRetrying = 0;
    console.log('🧹 Cleared all failed event retries');
  }

  async shutdown() {
    console.log('🛑 Shutting down webhook event processor...');
    
    // Clear all pending retries
    this.retryAttempts.clear();
    
    // Remove all listeners
    this.removeAllListeners();
    
    console.log('✅ Webhook event processor shutdown complete');
  }
}

module.exports = WebhookEventProcessor;