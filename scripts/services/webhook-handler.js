const crypto = require('crypto');
const { EventEmitter } = require('events');

class WebhookHandler extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.secret = options.secret;
    this.allowedEvents = options.allowedEvents || ['repository_dispatch', 'push'];
    this.logger = options.logger;
    this.security = options.security;
    
    this.supportedEvents = new Set(this.allowedEvents);
    this.eventHandlers = new Map();
    
    this.setupDefaultHandlers();
  }

  setupDefaultHandlers() {
    this.eventHandlers.set('repository_dispatch', this.handleRepositoryDispatch.bind(this));
    this.eventHandlers.set('push', this.handlePush.bind(this));
    this.eventHandlers.set('pull_request', this.handlePullRequest.bind(this));
    this.eventHandlers.set('release', this.handleRelease.bind(this));
  }

  async validateSignature(signature, payload) {
    if (!this.secret) {
      this.logger?.warn('Webhook secret not configured, skipping signature validation');
      return true;
    }
    
    if (!signature) {
      this.logger?.warn('No signature provided in webhook request');
      return false;
    }
    
    const expectedSignature = this.calculateSignature(payload);
    const providedSignature = signature.replace('sha256=', '');
    
    const isValid = crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(providedSignature, 'hex')
    );
    
    if (!isValid) {
      this.logger?.warn('Webhook signature validation failed', {
        providedSignature: providedSignature.substring(0, 8) + '...',
        expectedSignature: expectedSignature.substring(0, 8) + '...'
      });
    }
    
    return isValid;
  }

  calculateSignature(payload) {
    const hmac = crypto.createHmac('sha256', this.secret);
    hmac.update(JSON.stringify(payload), 'utf8');
    return hmac.digest('hex');
  }

  async processWebhook(webhookData) {
    const { event, delivery, payload, correlationId } = webhookData;
    
    this.logger?.info('Processing webhook', {
      event,
      delivery,
      correlationId,
      repository: payload.repository?.full_name,
      action: payload.action
    });
    
    if (!this.supportedEvents.has(event)) {
      this.logger?.info('Ignoring unsupported webhook event', { event, delivery });
      return {
        processed: false,
        reason: 'unsupported_event',
        event,
        delivery,
        shouldDeploy: false
      };
    }
    
    const handler = this.eventHandlers.get(event);
    if (!handler) {
      this.logger?.warn('No handler found for event', { event, delivery });
      return {
        processed: false,
        reason: 'no_handler',
        event,
        delivery,
        shouldDeploy: false
      };
    }
    
    try {
      const result = await handler(payload, { event, delivery, correlationId });
      
      this.logger?.info('Webhook processed successfully', {
        event,
        delivery,
        correlationId,
        shouldDeploy: result.shouldDeploy,
        repository: result.repository,
        branch: result.branch
      });
      
      this.emit('webhook_processed', {
        ...result,
        event,
        delivery,
        correlationId
      });
      
      return {
        processed: true,
        ...result,
        event,
        delivery
      };
      
    } catch (error) {
      this.logger?.error('Webhook processing failed', {
        event,
        delivery,
        correlationId,
        error: error.message,
        stack: error.stack
      });
      
      this.emit('webhook_error', {
        event,
        delivery,
        correlationId,
        error: error.message
      });
      
      return {
        processed: false,
        reason: 'processing_error',
        error: error.message,
        event,
        delivery,
        shouldDeploy: false
      };
    }
  }

  async handleRepositoryDispatch(payload, context) {
    const { action, repository, client_payload } = payload;
    
    this.logger?.info('Processing repository_dispatch webhook', {
      action,
      repository: repository?.full_name,
      clientPayload: client_payload,
      correlationId: context.correlationId
    });
    
    const allowedActions = [
      'deploy-home-assistant-config',
      'deploy-home-assistant',
      'trigger-deployment'
    ];
    
    if (!allowedActions.includes(action)) {
      return {
        shouldDeploy: false,
        reason: 'action_not_allowed',
        action,
        allowedActions
      };
    }
    
    if (!repository) {
      return {
        shouldDeploy: false,
        reason: 'no_repository_data'
      };
    }
    
    const allowedRepositories = [
      'festion/home-assistant-config',
      'homelab-gitops-auditor/home-assistant-config'
    ];
    
    if (!allowedRepositories.includes(repository.full_name)) {
      return {
        shouldDeploy: false,
        reason: 'repository_not_allowed',
        repository: repository.full_name,
        allowedRepositories
      };
    }
    
    const branch = client_payload?.branch || 'main';
    const environment = client_payload?.environment || 'production';
    const dryRun = client_payload?.dry_run || false;
    
    return {
      shouldDeploy: true,
      repository: repository.full_name,
      branch,
      environment,
      dryRun,
      trigger: 'repository_dispatch',
      action,
      clientPayload: client_payload,
      deploymentReason: `Repository dispatch: ${action}`,
      priority: client_payload?.priority || 'normal'
    };
  }

  async handlePush(payload, context) {
    const { ref, repository, commits, pusher } = payload;
    
    this.logger?.info('Processing push webhook', {
      ref,
      repository: repository?.full_name,
      commits: commits?.length,
      pusher: pusher?.name,
      correlationId: context.correlationId
    });
    
    if (!repository) {
      return {
        shouldDeploy: false,
        reason: 'no_repository_data'
      };
    }
    
    const allowedRepositories = [
      'festion/home-assistant-config'
    ];
    
    if (!allowedRepositories.includes(repository.full_name)) {
      return {
        shouldDeploy: false,
        reason: 'repository_not_allowed',
        repository: repository.full_name
      };
    }
    
    const branch = ref?.replace('refs/heads/', '');
    const allowedBranches = ['main', 'master', 'production'];
    
    if (!allowedBranches.includes(branch)) {
      return {
        shouldDeploy: false,
        reason: 'branch_not_allowed',
        branch,
        allowedBranches
      };
    }
    
    const hasConfigChanges = this.checkForConfigChanges(commits);
    if (!hasConfigChanges) {
      return {
        shouldDeploy: false,
        reason: 'no_config_changes',
        commits: commits?.length
      };
    }
    
    const shouldSkipCI = commits?.some(commit => 
      commit.message?.includes('[skip ci]') || 
      commit.message?.includes('[ci skip]') ||
      commit.message?.includes('[skip deploy]')
    );
    
    if (shouldSkipCI) {
      return {
        shouldDeploy: false,
        reason: 'ci_skipped',
        skipReason: 'commit_message_directive'
      };
    }
    
    return {
      shouldDeploy: true,
      repository: repository.full_name,
      branch,
      trigger: 'push',
      commits: commits?.length,
      pusher: pusher?.name,
      deploymentReason: `Push to ${branch} branch with config changes`,
      priority: 'normal',
      commitSha: payload.after,
      beforeSha: payload.before
    };
  }

  async handlePullRequest(payload, context) {
    const { action, pull_request, repository } = payload;
    
    this.logger?.info('Processing pull_request webhook', {
      action,
      repository: repository?.full_name,
      pullRequest: pull_request?.number,
      correlationId: context.correlationId
    });
    
    const deploymentActions = ['closed'];
    
    if (!deploymentActions.includes(action)) {
      return {
        shouldDeploy: false,
        reason: 'action_not_deployment_trigger',
        action
      };
    }
    
    if (action === 'closed' && !pull_request?.merged) {
      return {
        shouldDeploy: false,
        reason: 'pull_request_not_merged',
        action
      };
    }
    
    const targetBranch = pull_request?.base?.ref;
    const allowedBranches = ['main', 'master', 'production'];
    
    if (!allowedBranches.includes(targetBranch)) {
      return {
        shouldDeploy: false,
        reason: 'target_branch_not_allowed',
        targetBranch,
        allowedBranches
      };
    }
    
    return {
      shouldDeploy: true,
      repository: repository.full_name,
      branch: targetBranch,
      trigger: 'pull_request_merged',
      pullRequestNumber: pull_request.number,
      deploymentReason: `Pull request #${pull_request.number} merged to ${targetBranch}`,
      priority: 'normal',
      commitSha: pull_request.merge_commit_sha
    };
  }

  async handleRelease(payload, context) {
    const { action, release, repository } = payload;
    
    this.logger?.info('Processing release webhook', {
      action,
      repository: repository?.full_name,
      release: release?.tag_name,
      correlationId: context.correlationId
    });
    
    if (action !== 'published') {
      return {
        shouldDeploy: false,
        reason: 'action_not_published',
        action
      };
    }
    
    if (release?.prerelease) {
      return {
        shouldDeploy: false,
        reason: 'prerelease_not_deployed',
        tagName: release.tag_name
      };
    }
    
    return {
      shouldDeploy: true,
      repository: repository.full_name,
      branch: 'main',
      trigger: 'release',
      releaseTag: release.tag_name,
      releaseName: release.name,
      deploymentReason: `Release ${release.tag_name} published`,
      priority: 'high',
      commitSha: release.target_commitish
    };
  }

  checkForConfigChanges(commits) {
    if (!commits || commits.length === 0) {
      return false;
    }
    
    const configPaths = [
      'configuration.yaml',
      'automations.yaml',
      'scripts.yaml',
      'scenes.yaml',
      'groups.yaml',
      'customize.yaml',
      'secrets.yaml',
      'packages/',
      'lovelace/',
      'integrations/',
      'custom_components/'
    ];
    
    const hasChanges = commits.some(commit => {
      const allFiles = [
        ...(commit.added || []),
        ...(commit.modified || []),
        ...(commit.removed || [])
      ];
      
      return allFiles.some(file => 
        configPaths.some(path => 
          file.startsWith(path) || file.includes(path)
        )
      );
    });
    
    this.logger?.debug('Config changes check', {
      commits: commits.length,
      hasChanges,
      configPaths
    });
    
    return hasChanges;
  }

  registerEventHandler(event, handler) {
    if (typeof handler !== 'function') {
      throw new Error('Handler must be a function');
    }
    
    this.eventHandlers.set(event, handler);
    this.supportedEvents.add(event);
    
    this.logger?.info('Custom event handler registered', { event });
  }

  unregisterEventHandler(event) {
    const removed = this.eventHandlers.delete(event);
    this.supportedEvents.delete(event);
    
    this.logger?.info('Event handler unregistered', { event, removed });
    
    return removed;
  }

  getSupportedEvents() {
    return [...this.supportedEvents];
  }

  getEventHandlers() {
    return [...this.eventHandlers.keys()];
  }

  validateWebhookPayload(payload, event) {
    const requiredFields = {
      'repository_dispatch': ['action', 'repository'],
      'push': ['ref', 'repository', 'commits'],
      'pull_request': ['action', 'pull_request', 'repository'],
      'release': ['action', 'release', 'repository']
    };
    
    const required = requiredFields[event];
    if (!required) {
      return { valid: true };
    }
    
    const missing = required.filter(field => {
      const fieldPath = field.split('.');
      let value = payload;
      
      for (const part of fieldPath) {
        value = value?.[part];
      }
      
      return value === undefined || value === null;
    });
    
    if (missing.length > 0) {
      return {
        valid: false,
        missingFields: missing,
        error: `Missing required fields: ${missing.join(', ')}`
      };
    }
    
    return { valid: true };
  }

  getWebhookStats() {
    return {
      supportedEvents: this.getSupportedEvents(),
      registeredHandlers: this.getEventHandlers(),
      secretConfigured: !!this.secret,
      allowedEvents: this.allowedEvents
    };
  }

  async cleanup() {
    this.eventHandlers.clear();
    this.supportedEvents.clear();
    this.removeAllListeners();
    
    this.logger?.info('Webhook handler cleaned up');
  }
}

module.exports = WebhookHandler;