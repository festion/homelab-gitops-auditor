const crypto = require('crypto');
const { EventEmitter } = require('events');
const WebhookConfigService = require('../github/webhookConfig');
const { createLogger } = require('../../utils/logger');
const { 
  errorHandler, 
  createWebhookError, 
  createValidationError,
  createTimeoutError 
} = require('../../utils/errorHandler');

class EnhancedWebhookHandler extends EventEmitter {
  constructor(services) {
    super();
    
    this.secret = process.env.GITHUB_WEBHOOK_SECRET;
    this.auditService = services.audit;
    this.complianceService = services.compliance;
    this.websocketService = services.websocket;
    this.pipelineService = services.pipeline;
    this.metricsService = services.metrics;
    
    // Initialize logging
    this.logger = createLogger('enhanced-webhook-handler');
    
    // Initialize processing metrics
    this.processingStats = {
      totalProcessed: 0,
      successfulProcessed: 0,
      failedProcessed: 0,
      averageProcessingTime: 0,
      eventCounts: {}
    };
    
    this.setupEventHandlers();
    this.logger.info('Enhanced Webhook Handler initialized');
  }

  /**
   * Verify webhook signature
   */
  verifySignature(payload, signature) {
    if (!this.secret) {
      this.logger.warn('No webhook secret configured - skipping signature verification');
      return true;
    }

    if (!signature) {
      this.logger.error('No signature provided in webhook headers');
      return false;
    }

    try {
      const hmac = crypto.createHmac('sha256', this.secret);
      hmac.update(payload);
      const digest = 'sha256=' + hmac.digest('hex');
      
      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(digest)
      );

      if (!isValid) {
        this.logger.error('Webhook signature verification failed', {
          expectedSignature: digest.substring(0, 20) + '...',
          receivedSignature: signature.substring(0, 20) + '...'
        });
      }
      
      return isValid;
    } catch (error) {
      this.logger.error('Error during signature verification', { error: error.message });
      return false;
    }
  }

  /**
   * Process incoming webhook
   */
  async processWebhook(headers, body) {
    const startTime = Date.now();
    const signature = headers['x-hub-signature-256'];
    const event = headers['x-github-event'];
    const deliveryId = headers['x-github-delivery'];
    const repository = headers['x-github-repository'] || 'unknown';

    const context = {
      event,
      deliveryId,
      repository,
      userAgent: headers['user-agent'],
      contentLength: headers['content-length']
    };

    try {
      // Validate required headers
      if (!event) {
        throw createValidationError('Missing x-github-event header', 'x-github-event', event, context);
      }
      
      if (!deliveryId) {
        throw createValidationError('Missing x-github-delivery header', 'x-github-delivery', deliveryId, context);
      }

      // Log webhook received
      await this.logger.logWebhookReceived(event, deliveryId, repository, headers);

      // Verify signature
      if (!this.verifySignature(body, signature)) {
        throw createWebhookError('Invalid webhook signature', 'INVALID_SIGNATURE', context);
      }

      let payload;
      try {
        payload = JSON.parse(body);
      } catch (parseError) {
        throw createWebhookError('Invalid JSON payload', 'INVALID_JSON', { ...context, parseError: parseError.message });
      }

      // Enhanced repository context
      const enhancedRepository = payload.repository?.full_name || repository;
      const enhancedContext = { ...context, repository: enhancedRepository };

      this.logger.debug('Processing webhook event', enhancedContext);

      // Update processing stats
      const processingTime = Date.now() - startTime;
      this.updateProcessingStats(event, true, processingTime);

      // Emit event for processing with error handling
      try {
        this.emit(event, payload, deliveryId);
      } catch (eventError) {
        await this.logger.logWebhookProcessed(event, deliveryId, enhancedRepository, processingTime, false, eventError);
        throw createWebhookError(`Event processing failed: ${eventError.message}`, 'EVENT_PROCESSING_FAILED', enhancedContext);
      }

      await this.logger.logWebhookProcessed(event, deliveryId, enhancedRepository, processingTime, true);

      // Emit successful processing event
      this.emit('webhook_processed', {
        event,
        deliveryId,
        repository: enhancedRepository,
        success: true,
        processingTime
      });

      return { 
        success: true, 
        event, 
        deliveryId, 
        repository: enhancedRepository,
        processingTime 
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      // Handle the error through error handler
      const handledError = await errorHandler.handleError(error, context);
      
      // Update failure stats
      this.updateProcessingStats(event, false, processingTime);
      
      // Log webhook processing failure
      await this.logger.logWebhookProcessed(event, deliveryId, repository, processingTime, false, error);

      // Emit failed processing event
      this.emit('webhook_processed', {
        event,
        deliveryId,
        repository,
        success: false,
        processingTime,
        error: error.message
      });

      // Re-throw the enhanced error
      throw error;
    }
  }

  /**
   * Setup comprehensive event handlers
   */
  setupEventHandlers() {
    // Repository dispatch events (for automated deployments)
    this.on('repository_dispatch', async (payload, deliveryId) => {
      const startTime = Date.now();
      const repository = payload.repository?.full_name;
      
      try {
        await this.handleRepositoryDispatchEvent(payload, deliveryId);
        await this.logger.logPerformanceMetric('repository_dispatch_event_handling', Date.now() - startTime, true, { 
          repository, 
          deliveryId,
          action: payload.action 
        });
      } catch (error) {
        await this.logger.logServiceError('webhook-handler', 'handleRepositoryDispatchEvent', error, { 
          repository, 
          deliveryId,
          action: payload.action 
        });
        await this.logger.logPerformanceMetric('repository_dispatch_event_handling', Date.now() - startTime, false, { 
          repository, 
          deliveryId 
        });
        this.emit('webhook_error', { event: 'repository_dispatch', payload, error });
      }
    });

    // Repository push events
    this.on('push', async (payload, deliveryId) => {
      const startTime = Date.now();
      const repository = payload.repository?.full_name;
      
      try {
        await this.handlePushEvent(payload, deliveryId);
        await this.logger.logPerformanceMetric('push_event_handling', Date.now() - startTime, true, { 
          repository, 
          deliveryId 
        });
      } catch (error) {
        await this.logger.logServiceError('webhook-handler', 'handlePushEvent', error, { 
          repository, 
          deliveryId 
        });
        await this.logger.logPerformanceMetric('push_event_handling', Date.now() - startTime, false, { 
          repository, 
          deliveryId 
        });
        this.emit('webhook_error', { event: 'push', payload, error });
      }
    });

    // Workflow run events
    this.on('workflow_run', async (payload, deliveryId) => {
      try {
        await this.handleWorkflowRunEvent(payload, deliveryId);
      } catch (error) {
        console.error('Workflow run event handling failed:', error);
        this.emit('webhook_error', { event: 'workflow_run', payload, error });
      }
    });

    // Workflow job events
    this.on('workflow_job', async (payload, deliveryId) => {
      try {
        await this.handleWorkflowJobEvent(payload, deliveryId);
      } catch (error) {
        console.error('Workflow job event handling failed:', error);
        this.emit('webhook_error', { event: 'workflow_job', payload, error });
      }
    });

    // Pull request events
    this.on('pull_request', async (payload, deliveryId) => {
      try {
        await this.handlePullRequestEvent(payload, deliveryId);
      } catch (error) {
        console.error('Pull request event handling failed:', error);
        this.emit('webhook_error', { event: 'pull_request', payload, error });
      }
    });

    // Pull request review events
    this.on('pull_request_review', async (payload, deliveryId) => {
      try {
        await this.handlePullRequestReviewEvent(payload, deliveryId);
      } catch (error) {
        console.error('Pull request review event handling failed:', error);
        this.emit('webhook_error', { event: 'pull_request_review', payload, error });
      }
    });

    // Repository events
    this.on('repository', async (payload, deliveryId) => {
      try {
        await this.handleRepositoryEvent(payload, deliveryId);
      } catch (error) {
        console.error('Repository event handling failed:', error);
        this.emit('webhook_error', { event: 'repository', payload, error });
      }
    });

    // Issue events
    this.on('issues', async (payload, deliveryId) => {
      try {
        await this.handleIssuesEvent(payload, deliveryId);
      } catch (error) {
        console.error('Issues event handling failed:', error);
        this.emit('webhook_error', { event: 'issues', payload, error });
      }
    });

    // Issue comment events
    this.on('issue_comment', async (payload, deliveryId) => {
      try {
        await this.handleIssueCommentEvent(payload, deliveryId);
      } catch (error) {
        console.error('Issue comment event handling failed:', error);
        this.emit('webhook_error', { event: 'issue_comment', payload, error });
      }
    });

    // Release events
    this.on('release', async (payload, deliveryId) => {
      try {
        await this.handleReleaseEvent(payload, deliveryId);
      } catch (error) {
        console.error('Release event handling failed:', error);
        this.emit('webhook_error', { event: 'release', payload, error });
      }
    });

    // Create/Delete events (branches, tags)
    this.on('create', async (payload, deliveryId) => {
      try {
        await this.handleCreateEvent(payload, deliveryId);
      } catch (error) {
        console.error('Create event handling failed:', error);
        this.emit('webhook_error', { event: 'create', payload, error });
      }
    });

    this.on('delete', async (payload, deliveryId) => {
      try {
        await this.handleDeleteEvent(payload, deliveryId);
      } catch (error) {
        console.error('Delete event handling failed:', error);
        this.emit('webhook_error', { event: 'delete', payload, error });
      }
    });

    // Security events
    this.on('security_advisory', async (payload, deliveryId) => {
      try {
        await this.handleSecurityAdvisoryEvent(payload, deliveryId);
      } catch (error) {
        console.error('Security advisory event handling failed:', error);
        this.emit('webhook_error', { event: 'security_advisory', payload, error });
      }
    });

    this.on('dependabot_alert', async (payload, deliveryId) => {
      try {
        await this.handleDependabotAlertEvent(payload, deliveryId);
      } catch (error) {
        console.error('Dependabot alert event handling failed:', error);
        this.emit('webhook_error', { event: 'dependabot_alert', payload, error });
      }
    });

    this.on('code_scanning_alert', async (payload, deliveryId) => {
      try {
        await this.handleCodeScanningAlertEvent(payload, deliveryId);
      } catch (error) {
        console.error('Code scanning alert event handling failed:', error);
        this.emit('webhook_error', { event: 'code_scanning_alert', payload, error });
      }
    });

    this.on('secret_scanning_alert', async (payload, deliveryId) => {
      try {
        await this.handleSecretScanningAlertEvent(payload, deliveryId);
      } catch (error) {
        console.error('Secret scanning alert event handling failed:', error);
        this.emit('webhook_error', { event: 'secret_scanning_alert', payload, error });
      }
    });

    // Deployment events
    this.on('deployment', async (payload, deliveryId) => {
      try {
        await this.handleDeploymentEvent(payload, deliveryId);
      } catch (error) {
        console.error('Deployment event handling failed:', error);
        this.emit('webhook_error', { event: 'deployment', payload, error });
      }
    });

    this.on('deployment_status', async (payload, deliveryId) => {
      try {
        await this.handleDeploymentStatusEvent(payload, deliveryId);
      } catch (error) {
        console.error('Deployment status event handling failed:', error);
        this.emit('webhook_error', { event: 'deployment_status', payload, error });
      }
    });

    // Check events
    this.on('check_run', async (payload, deliveryId) => {
      try {
        await this.handleCheckRunEvent(payload, deliveryId);
      } catch (error) {
        console.error('Check run event handling failed:', error);
        this.emit('webhook_error', { event: 'check_run', payload, error });
      }
    });

    this.on('check_suite', async (payload, deliveryId) => {
      try {
        await this.handleCheckSuiteEvent(payload, deliveryId);
      } catch (error) {
        console.error('Check suite event handling failed:', error);
        this.emit('webhook_error', { event: 'check_suite', payload, error });
      }
    });

    // Status events
    this.on('status', async (payload, deliveryId) => {
      try {
        await this.handleStatusEvent(payload, deliveryId);
      } catch (error) {
        console.error('Status event handling failed:', error);
        this.emit('webhook_error', { event: 'status', payload, error });
      }
    });
  }

  /**
   * Handle push events
   */
  async handlePushEvent(payload, deliveryId) {
    const { repository, ref, commits, pusher, before, after } = payload;
    const branch = ref.replace('refs/heads/', '');
    
    console.log(`📝 Push to ${repository.full_name}:${branch} by ${pusher.name} (${commits.length} commits)`);

    // Check if this affects monitored files
    const affectedFiles = commits.flatMap(c => [...(c.added || []), ...(c.modified || []), ...(c.removed || [])]);
    const shouldAudit = this.shouldTriggerAudit(affectedFiles);
    
    if (shouldAudit) {
      console.log(`🔍 Scheduling audit for ${repository.full_name} due to affected files`);
      if (this.auditService?.scheduleAudit) {
        await this.auditService.scheduleAudit(repository.full_name, {
          reason: 'Push event with monitored file changes',
          branch,
          commits: commits.length,
          deliveryId
        });
      }
    }

    // Check for CI/CD file changes
    const ciFiles = affectedFiles.filter(file => 
      file.startsWith('.github/workflows/') || 
      file.startsWith('.github/actions/') ||
      file.includes('Dockerfile') ||
      file.includes('docker-compose') ||
      file.startsWith('.mcp/templates/')
    );

    if (ciFiles.length > 0) {
      console.log(`⚙️  CI/CD files changed in ${repository.full_name}, scheduling compliance check`);
      if (this.complianceService?.scheduleComplianceCheck) {
        await this.complianceService.scheduleComplianceCheck(repository.full_name, {
          reason: 'CI/CD configuration changes',
          changedFiles: ciFiles,
          deliveryId
        });
      }
    }

    // Record metrics
    if (this.metricsService?.recordRepositoryActivity) {
      await this.metricsService.recordRepositoryActivity({
        repository: repository.full_name,
        event: 'push',
        branch,
        commits: commits.length,
        files: affectedFiles.length,
        pusher: pusher.name,
        timestamp: new Date()
      });
    }

    // Emit real-time update
    if (this.websocketService?.emitToRepository) {
      this.websocketService.emitToRepository(repository.full_name, 'repo:push', {
        repository: repository.full_name,
        branch,
        commits: commits.length,
        pusher: pusher.name,
        files: affectedFiles.length,
        before: before.substring(0, 7),
        after: after.substring(0, 7),
        timestamp: new Date().toISOString()
      });
    }

    // Broadcast general push event
    if (this.websocketService?.broadcast) {
      this.websocketService.broadcast('activity:push', {
        repository: repository.full_name,
        branch,
        pusher: pusher.name,
        commits: commits.length,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Handle workflow run events
   */
  async handleWorkflowRunEvent(payload, deliveryId) {
    const { workflow_run, repository, action } = payload;
    
    console.log(`🔄 Workflow ${action}: ${repository.full_name} - ${workflow_run.name} (${workflow_run.status})`);

    // Update pipeline status
    if (this.pipelineService?.updatePipelineStatus) {
      await this.pipelineService.updatePipelineStatus({
        repository: repository.full_name,
        workflowId: workflow_run.workflow_id,
        runId: workflow_run.id,
        name: workflow_run.name,
        status: workflow_run.status,
        conclusion: workflow_run.conclusion,
        startedAt: workflow_run.created_at,
        completedAt: workflow_run.updated_at,
        branch: workflow_run.head_branch,
        commit: workflow_run.head_sha,
        event: workflow_run.event,
        deliveryId
      });
    }

    // Record metrics for workflow completion
    if (workflow_run.status === 'completed' && this.metricsService?.recordWorkflowCompletion) {
      await this.metricsService.recordWorkflowCompletion({
        repository: repository.full_name,
        workflow: workflow_run.name,
        conclusion: workflow_run.conclusion,
        duration: this.calculateWorkflowDuration(workflow_run),
        branch: workflow_run.head_branch,
        timestamp: new Date()
      });
    }

    // Emit real-time update
    if (this.websocketService?.emitToRepository) {
      this.websocketService.emitToRepository(repository.full_name, 'pipeline:status', {
        repository: repository.full_name,
        workflow: workflow_run.name,
        status: workflow_run.status,
        conclusion: workflow_run.conclusion,
        runId: workflow_run.id,
        url: workflow_run.html_url,
        branch: workflow_run.head_branch,
        timestamp: new Date().toISOString()
      });
    }

    // Handle completed workflows
    if (workflow_run.status === 'completed') {
      await this.handleWorkflowCompletion(workflow_run, repository, deliveryId);
    }

    // Handle failed critical workflows
    if (workflow_run.conclusion === 'failure' && this.isCriticalWorkflow(workflow_run)) {
      if (this.websocketService?.broadcast) {
        this.websocketService.broadcast('system:alert', {
          level: 'error',
          type: 'critical_workflow_failure',
          message: `Critical workflow failed: ${workflow_run.name} in ${repository.full_name}`,
          details: {
            workflow: workflow_run.name,
            repository: repository.full_name,
            runId: workflow_run.id,
            url: workflow_run.html_url,
            branch: workflow_run.head_branch,
            conclusion: workflow_run.conclusion
          },
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  /**
   * Handle workflow job events
   */
  async handleWorkflowJobEvent(payload, deliveryId) {
    const { workflow_job, repository, action } = payload;
    
    console.log(`⚙️  Job ${action}: ${repository.full_name} - ${workflow_job.name} (${workflow_job.status})`);

    // Record job metrics
    if (workflow_job.status === 'completed' && this.metricsService?.recordJobCompletion) {
      await this.metricsService.recordJobCompletion({
        repository: repository.full_name,
        workflow: workflow_job.workflow_name,
        job: workflow_job.name,
        conclusion: workflow_job.conclusion,
        duration: this.calculateJobDuration(workflow_job),
        runner: workflow_job.runner_name,
        timestamp: new Date()
      });
    }

    // Emit real-time job status
    if (this.websocketService?.emitToRepository) {
      this.websocketService.emitToRepository(repository.full_name, 'pipeline:job', {
        repository: repository.full_name,
        workflow: workflow_job.workflow_name,
        job: workflow_job.name,
        status: workflow_job.status,
        conclusion: workflow_job.conclusion,
        url: workflow_job.html_url,
        runner: workflow_job.runner_name,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Handle pull request events
   */
  async handlePullRequestEvent(payload, deliveryId) {
    const { action, pull_request, repository, changes } = payload;
    
    console.log(`🔀 PR ${action}: ${repository.full_name}#${pull_request.number} - ${pull_request.title}`);

    if (action === 'opened' || action === 'synchronize' || action === 'reopened') {
      // Check if PR includes template or CI changes
      if (this.complianceService?.validatePullRequestCompliance) {
        try {
          const files = await this.getPullRequestFiles(repository, pull_request.number);
          const hasTemplateChanges = files.some(file => 
            file.filename.startsWith('.mcp/templates/') ||
            file.filename.startsWith('.github/workflows/') ||
            file.filename.startsWith('.github/actions/')
          );

          if (hasTemplateChanges) {
            console.log(`📋 PR includes template/CI changes, validating compliance`);
            await this.complianceService.validatePullRequestCompliance(
              repository.full_name,
              pull_request.number,
              {
                changedFiles: files.map(f => f.filename),
                deliveryId
              }
            );
          }
        } catch (error) {
          console.error('Failed to validate PR compliance:', error);
        }
      }
    }

    // Record PR metrics
    if (this.metricsService?.recordPullRequestActivity) {
      await this.metricsService.recordPullRequestActivity({
        repository: repository.full_name,
        action,
        number: pull_request.number,
        author: pull_request.user.login,
        baseBranch: pull_request.base.ref,
        headBranch: pull_request.head.ref,
        additions: pull_request.additions,
        deletions: pull_request.deletions,
        changedFiles: pull_request.changed_files,
        timestamp: new Date()
      });
    }

    // Emit real-time update
    if (this.websocketService?.broadcast) {
      this.websocketService.broadcast('repo:pr', {
        repository: repository.full_name,
        action,
        number: pull_request.number,
        title: pull_request.title,
        user: pull_request.user.login,
        state: pull_request.state,
        url: pull_request.html_url,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Handle repository events (created, deleted, etc.)
   */
  async handleRepositoryEvent(payload, deliveryId) {
    const { action, repository, sender } = payload;
    
    console.log(`🏠 Repository ${action}: ${repository.full_name} by ${sender.login}`);
    
    if (action === 'created') {
      // Auto-setup webhook for new repositories
      try {
        await this.setupNewRepositoryWebhook(repository);
        
        // Schedule initial audit
        if (this.auditService?.scheduleAudit) {
          await this.auditService.scheduleAudit(repository.full_name, {
            reason: 'New repository created',
            deliveryId
          });
        }
      } catch (error) {
        console.error('Failed to setup new repository:', error);
      }
    } else if (action === 'deleted') {
      // Clean up repository data
      await this.cleanupRepositoryData(repository.full_name);
    }

    // Broadcast repository event
    if (this.websocketService?.broadcast) {
      this.websocketService.broadcast('repo:repository', {
        action,
        repository: repository.full_name,
        private: repository.private,
        description: repository.description,
        language: repository.language,
        topics: repository.topics,
        user: sender.login,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Handle security-related events
   */
  async handleSecurityAdvisoryEvent(payload, deliveryId) {
    const { action, security_advisory, repository } = payload;
    
    console.log(`🔒 Security Advisory ${action}: ${repository?.full_name || 'Global'}`);

    if (this.websocketService?.broadcast) {
      this.websocketService.broadcast('security:advisory', {
        action,
        repository: repository?.full_name,
        advisory: {
          id: security_advisory.ghsa_id,
          summary: security_advisory.summary,
          severity: security_advisory.severity,
          cve_id: security_advisory.cve_id,
          published_at: security_advisory.published_at,
          url: security_advisory.html_url
        },
        timestamp: new Date().toISOString()
      });
    }
  }

  async handleDependabotAlertEvent(payload, deliveryId) {
    const { action, alert, repository } = payload;
    
    console.log(`🤖 Dependabot Alert ${action}: ${repository.full_name} - ${alert.security_advisory.summary}`);

    if (this.websocketService?.broadcast) {
      this.websocketService.broadcast('security:dependabot', {
        action,
        repository: repository.full_name,
        alert: {
          number: alert.number,
          state: alert.state,
          dependency: alert.dependency.package.name,
          severity: alert.security_advisory.severity,
          summary: alert.security_advisory.summary,
          url: alert.html_url
        },
        timestamp: new Date().toISOString()
      });
    }
  }

  async handleCodeScanningAlertEvent(payload, deliveryId) {
    const { action, alert, repository } = payload;
    
    console.log(`🔍 Code Scanning Alert ${action}: ${repository.full_name} - ${alert.rule.description}`);

    if (this.websocketService?.broadcast) {
      this.websocketService.broadcast('security:code_scanning', {
        action,
        repository: repository.full_name,
        alert: {
          number: alert.number,
          state: alert.state,
          severity: alert.rule.severity,
          description: alert.rule.description,
          tool: alert.tool.name,
          url: alert.html_url
        },
        timestamp: new Date().toISOString()
      });
    }
  }

  async handleSecretScanningAlertEvent(payload, deliveryId) {
    const { action, alert, repository } = payload;
    
    console.log(`🔐 Secret Scanning Alert ${action}: ${repository.full_name} - ${alert.secret_type_display_name}`);

    if (this.websocketService?.broadcast) {
      this.websocketService.broadcast('security:secret_scanning', {
        action,
        repository: repository.full_name,
        alert: {
          number: alert.number,
          state: alert.state,
          secret_type: alert.secret_type_display_name,
          resolution: alert.resolution,
          url: alert.html_url
        },
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Handle release events
   */
  async handleReleaseEvent(payload, deliveryId) {
    const { action, release, repository } = payload;
    
    console.log(`🚀 Release ${action}: ${repository.full_name} - ${release.tag_name}`);
    
    if (action === 'published') {
      // Trigger deployment pipelines if configured
      await this.triggerDeploymentPipelines(repository, release, deliveryId);
    }

    if (this.websocketService?.broadcast) {
      this.websocketService.broadcast('repo:release', {
        action,
        repository: repository.full_name,
        tag: release.tag_name,
        name: release.name,
        draft: release.draft,
        prerelease: release.prerelease,
        author: release.author.login,
        url: release.html_url,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Utility methods
   */
  shouldTriggerAudit(files) {
    const auditTriggerPatterns = [
      /^\.gitignore$/,
      /^README\.md$/,
      /^package\.json$/,
      /^requirements\.txt$/,
      /^pyproject\.toml$/,
      /^Cargo\.toml$/,
      /^\.github\//,
      /Dockerfile/,
      /docker-compose/,
      /^\.mcp\//
    ];

    return files.some(file => 
      auditTriggerPatterns.some(pattern => pattern.test(file))
    );
  }

  async handleWorkflowCompletion(workflowRun, repository, deliveryId) {
    // Update compliance status if this was a compliance check
    if (workflowRun.name.includes('compliance') || workflowRun.name.includes('template')) {
      if (this.complianceService?.updateComplianceFromWorkflow) {
        await this.complianceService.updateComplianceFromWorkflow(
          repository.full_name,
          workflowRun,
          { deliveryId }
        );
      }
    }

    // Check for audit-related workflows
    if (workflowRun.name.includes('audit') || workflowRun.name.includes('security')) {
      if (this.auditService?.updateAuditFromWorkflow) {
        await this.auditService.updateAuditFromWorkflow(
          repository.full_name,
          workflowRun,
          { deliveryId }
        );
      }
    }
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

  async setupNewRepositoryWebhook(repository) {
    try {
      const webhookConfig = new WebhookConfigService();
      await webhookConfig.setupRepositoryWebhooks(
        repository.owner.login,
        repository.name
      );
      console.log(`✅ Webhook setup complete for ${repository.full_name}`);
    } catch (error) {
      console.error(`Failed to setup webhook for ${repository.full_name}:`, error);
    }
  }

  async cleanupRepositoryData(repositoryFullName) {
    console.log(`🧹 Cleaning up data for deleted repository: ${repositoryFullName}`);
    
    // Cleanup could include:
    // - Removing from audit schedules
    // - Clearing cached data
    // - Removing metrics data
    // - Cleaning up pipeline data
    
    // Emit cleanup event
    if (this.websocketService?.broadcast) {
      this.websocketService.broadcast('repo:cleanup', {
        repository: repositoryFullName,
        timestamp: new Date().toISOString()
      });
    }
  }

  async triggerDeploymentPipelines(repository, release, deliveryId) {
    // Check for deployment configuration
    if (this.pipelineService?.getDeploymentConfig) {
      try {
        const deploymentConfig = await this.pipelineService.getDeploymentConfig(repository.full_name);
        
        if (deploymentConfig?.autoDeployOnRelease) {
          console.log(`🚀 Triggering deployment for ${repository.full_name} release ${release.tag_name}`);
          
          await this.pipelineService.triggerWorkflow(
            repository.full_name,
            deploymentConfig.deploymentWorkflow,
            { 
              tag: release.tag_name,
              deliveryId 
            }
          );
        }
      } catch (error) {
        console.error('Failed to trigger deployment pipeline:', error);
      }
    }
  }

  async getPullRequestFiles(repository, prNumber) {
    // This would need GitHub API integration
    // For now, return empty array
    return [];
  }

  calculateWorkflowDuration(workflowRun) {
    if (workflowRun.created_at && workflowRun.updated_at) {
      return new Date(workflowRun.updated_at) - new Date(workflowRun.created_at);
    }
    return null;
  }

  calculateJobDuration(workflowJob) {
    if (workflowJob.started_at && workflowJob.completed_at) {
      return new Date(workflowJob.completed_at) - new Date(workflowJob.started_at);
    }
    return null;
  }

  updateProcessingStats(event, success, processingTime) {
    this.processingStats.totalProcessed++;
    
    if (success) {
      this.processingStats.successfulProcessed++;
    } else {
      this.processingStats.failedProcessed++;
    }

    // Update average processing time
    this.processingStats.averageProcessingTime = 
      (this.processingStats.averageProcessingTime * (this.processingStats.totalProcessed - 1) + processingTime) / 
      this.processingStats.totalProcessed;

    // Update event counts
    this.processingStats.eventCounts[event] = (this.processingStats.eventCounts[event] || 0) + 1;
  }

  getProcessingStats() {
    return {
      ...this.processingStats,
      successRate: this.processingStats.totalProcessed > 0 ? 
        (this.processingStats.successfulProcessed / this.processingStats.totalProcessed * 100).toFixed(2) + '%' : '0%',
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Placeholder handlers for remaining events
   */
  async handlePullRequestReviewEvent(payload, deliveryId) {
    const { action, review, pull_request, repository } = payload;
    console.log(`👀 PR Review ${action}: ${repository.full_name}#${pull_request.number} by ${review.user.login}`);
  }

  async handleIssuesEvent(payload, deliveryId) {
    const { action, issue, repository } = payload;
    console.log(`📝 Issue ${action}: ${repository.full_name}#${issue.number} - ${issue.title}`);
    
    // Track security-related issues
    if (this.isSecurityIssue(issue)) {
      if (this.websocketService?.broadcast) {
        this.websocketService.broadcast('security:issue', {
          action,
          repository: repository.full_name,
          issue: {
            number: issue.number,
            title: issue.title,
            labels: issue.labels.map(l => l.name),
            user: issue.user.login,
            url: issue.html_url
          },
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  async handleIssueCommentEvent(payload, deliveryId) {
    const { action, comment, issue, repository } = payload;
    console.log(`💬 Comment ${action}: ${repository.full_name}#${issue.number} by ${comment.user.login}`);
  }

  async handleCreateEvent(payload, deliveryId) {
    const { ref_type, ref, repository } = payload;
    console.log(`➕ Created ${ref_type}: ${repository.full_name}/${ref}`);
  }

  async handleDeleteEvent(payload, deliveryId) {
    const { ref_type, ref, repository } = payload;
    console.log(`➖ Deleted ${ref_type}: ${repository.full_name}/${ref}`);
  }

  async handleDeploymentEvent(payload, deliveryId) {
    const { deployment, repository } = payload;
    console.log(`🚀 Deployment: ${repository.full_name} to ${deployment.environment}`);
  }

  async handleDeploymentStatusEvent(payload, deliveryId) {
    const { deployment_status, repository } = payload;
    console.log(`📊 Deployment Status: ${repository.full_name} - ${deployment_status.state}`);
  }

  async handleCheckRunEvent(payload, deliveryId) {
    const { action, check_run, repository } = payload;
    console.log(`✅ Check Run ${action}: ${repository.full_name} - ${check_run.name}`);
  }

  async handleCheckSuiteEvent(payload, deliveryId) {
    const { action, check_suite, repository } = payload;
    console.log(`📋 Check Suite ${action}: ${repository.full_name}`);
  }

  async handleStatusEvent(payload, deliveryId) {
    const { state, description, repository } = payload;
    console.log(`📌 Status: ${repository.full_name} - ${state}: ${description}`);
  }

  /**
   * Handle repository_dispatch events for automated deployments
   * @param {Object} payload - Repository dispatch payload
   * @param {string} deliveryId - GitHub delivery ID
   */
  async handleRepositoryDispatchEvent(payload, deliveryId) {
    const { action, repository, client_payload, sender } = payload;
    
    console.log(`🚀 Repository dispatch: ${repository.full_name} - Action: ${action}`);
    
    try {
      // Initialize WebhookProcessor if not already done
      if (!this.webhookProcessor) {
        const { WebhookProcessor } = require('../webhook-processor');
        this.webhookProcessor = new WebhookProcessor();
        await this.webhookProcessor.initialize();
      }
      
      // Process the repository dispatch event
      const result = await this.webhookProcessor.processRepositoryDispatch(payload);
      
      console.log(`Repository dispatch processed successfully:`, {
        deliveryId,
        repository: repository.full_name,
        action,
        deploymentId: result.deploymentId
      });
      
      // Emit deployment triggered event
      this.emit('deployment_triggered', {
        deploymentId: result.deploymentId,
        repository: repository.full_name,
        action,
        trigger: 'repository_dispatch',
        deliveryId,
        sender: sender?.login
      });
      
      return result;
    } catch (error) {
      console.error(`Repository dispatch handling failed for ${repository.full_name}:`, error);
      
      // Emit deployment failed event
      this.emit('deployment_failed', {
        repository: repository.full_name,
        action,
        error: error.message,
        deliveryId,
        sender: sender?.login
      });
      
      throw error;
    }
  }

  isSecurityIssue(issue) {
    const securityLabels = ['security', 'vulnerability', 'cve', 'bug'];
    const issueLabels = issue.labels.map(l => l.name.toLowerCase());
    
    return securityLabels.some(label => issueLabels.includes(label)) ||
           /security|vulnerability|cve|exploit/i.test(issue.title);
  }
}

module.exports = EnhancedWebhookHandler;