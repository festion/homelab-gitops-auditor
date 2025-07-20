/**
 * GitHub Webhook Handler Service
 * Phase 2 - Enhanced Dashboard & Pipeline Integration
 */

const crypto = require('crypto');
const { Webhooks } = require('@octokit/webhooks');
const EventEmitter = require('events');
const EventQueue = require('./webhook/eventQueue');

class WebhookHandler extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.secret = options.secret || process.env.GITHUB_WEBHOOK_SECRET;
    this.port = options.port || process.env.GITHUB_WEBHOOK_PORT || 3074;
    
    if (!this.secret) {
      console.warn('GitHub webhook secret not provided. Webhooks will not be secured.');
    }

    // Initialize event queue
    this.eventQueue = new EventQueue({
      maxRetries: 3,
      retryDelay: 1000,
      maxQueueSize: 1000,
      processingTimeout: 30000
    });

    // Initialize webhook handler
    this.webhooks = new Webhooks({
      secret: this.secret || 'default-secret-for-development'
    });

    this.setupEventHandlers();
    this.setupQueueHandlers();
  }

  /**
   * Setup webhook event handlers
   */
  setupEventHandlers() {
    // Repository events
    this.webhooks.on('repository', ({ id, name, payload }) => {
      this.handleRepositoryEvent(payload);
    });

    // Push events
    this.webhooks.on('push', ({ id, name, payload }) => {
      this.handlePushEvent(payload);
    });

    // Pull request events
    this.webhooks.on('pull_request', ({ id, name, payload }) => {
      this.handlePullRequestEvent(payload);
    });

    // Release events
    this.webhooks.on('release', ({ id, name, payload }) => {
      this.handleReleaseEvent(payload);
    });

    // Issues events
    this.webhooks.on('issues', ({ id, name, payload }) => {
      this.handleIssuesEvent(payload);
    });

    // Workflow run events
    this.webhooks.on('workflow_run', ({ id, name, payload }) => {
      this.handleWorkflowRunEvent(payload);
    });

    // Star events
    this.webhooks.on('star', ({ id, name, payload }) => {
      this.handleStarEvent(payload);
    });

    // Error handling
    this.webhooks.onError((error) => {
      console.error('Webhook error:', error);
      this.emit('error', error);
    });
  }

  /**
   * Setup event queue handlers
   */
  setupQueueHandlers() {
    // Handle processed events from the queue
    this.eventQueue.on('process_repository', (event) => {
      this.emit('repository_event', event);
      this.eventQueue.markSuccess(event._processingId);
    });

    this.eventQueue.on('process_push', (event) => {
      this.emit('push_event', event);
      
      // Trigger audit refresh for main branch pushes
      if (event.branch === event.repository?.defaultBranch) {
        this.emit('audit_refresh_needed', {
          reason: `Push to main branch`,
          repository: event.repository.fullName,
          branch: event.branch
        });
      }
      
      this.eventQueue.markSuccess(event._processingId);
    });

    this.eventQueue.on('process_pull_request', (event) => {
      this.emit('pull_request_event', event);
      
      // Trigger pipeline for PR events
      if (['opened', 'synchronize', 'reopened'].includes(event.action)) {
        this.emit('pipeline_trigger_needed', {
          type: 'pull_request',
          repository: event.repository.fullName,
          pr: event.pullRequest.number,
          branch: event.pullRequest.headBranch
        });
      }
      
      this.eventQueue.markSuccess(event._processingId);
    });

    this.eventQueue.on('process_workflow_run', (event) => {
      this.emit('workflow_run_event', event);
      
      // Track workflow completion for pipeline monitoring
      if (event.action === 'completed') {
        this.emit('workflow_completed', {
          repository: event.repository.fullName,
          workflow: event.workflow.name,
          status: event.workflow.conclusion,
          branch: event.workflow.branch
        });
      }
      
      this.eventQueue.markSuccess(event._processingId);
    });

    this.eventQueue.on('process_release', (event) => {
      this.emit('release_event', event);
      
      // Trigger deployment pipeline for releases
      if (event.action === 'published' && !event.release.prerelease) {
        this.emit('pipeline_trigger_needed', {
          type: 'release',
          repository: event.repository.fullName,
          tag: event.release.tagName
        });
      }
      
      this.eventQueue.markSuccess(event._processingId);
    });

    this.eventQueue.on('process_issues', (event) => {
      // Queue the event for processing
    this.eventQueue.enqueue(event);
      this.eventQueue.markSuccess(event._processingId);
    });

    this.eventQueue.on('process_star', (event) => {
      // Queue the event for processing
    this.eventQueue.enqueue(event);
      this.eventQueue.markSuccess(event._processingId);
    });

    // Handle failed events
    this.eventQueue.on('event_failed', ({ event, error }) => {
      console.error(`💀 Webhook event processing failed permanently:`, {
        type: event.type,
        repository: event.repository?.fullName,
        error: error.message
      });
      this.emit('webhook_error', { event, error });
    });

    console.log('🎯 Event queue handlers configured');
  }

  /**
   * Handle repository events (created, deleted, etc.)
   */
  handleRepositoryEvent(payload) {
    const { action, repository } = payload;
    
    console.log(`Repository ${action}: ${repository.full_name}`);
    
    const event = {
      type: 'repository',
      action,
      repository: {
        id: repository.id,
        name: repository.name,
        fullName: repository.full_name,
        private: repository.private,
        url: repository.html_url,
        cloneUrl: repository.clone_url,
        defaultBranch: repository.default_branch
      },
      timestamp: new Date().toISOString()
    };

    // Queue the event for processing
    this.eventQueue.enqueue(event);
  }

  /**
   * Handle push events
   */
  handlePushEvent(payload) {
    const { ref, repository, commits, pusher } = payload;
    const branch = ref.replace('refs/heads/', '');
    
    console.log(`Push to ${repository.full_name}:${branch} by ${pusher.name}`);
    
    const event = {
      type: 'push',
      repository: {
        name: repository.name,
        fullName: repository.full_name
      },
      branch,
      commits: commits.map(commit => ({
        id: commit.id,
        message: commit.message,
        author: commit.author.name,
        url: commit.url,
        timestamp: commit.timestamp
      })),
      pusher: {
        name: pusher.name,
        email: pusher.email
      },
      timestamp: new Date().toISOString()
    };

    // Queue the event for processing
    this.eventQueue.enqueue(event);
  }

  /**
   * Handle pull request events
   */
  handlePullRequestEvent(payload) {
    const { action, pull_request, repository } = payload;
    
    console.log(`PR ${action}: ${repository.full_name}#${pull_request.number}`);
    
    const event = {
      type: 'pull_request',
      action,
      repository: {
        name: repository.name,
        fullName: repository.full_name
      },
      pullRequest: {
        number: pull_request.number,
        title: pull_request.title,
        state: pull_request.state,
        author: pull_request.user.login,
        baseBranch: pull_request.base.ref,
        headBranch: pull_request.head.ref,
        url: pull_request.html_url
      },
      timestamp: new Date().toISOString()
    };

    // Queue the event for processing
    this.eventQueue.enqueue(event);
  }

  /**
   * Handle release events
   */
  handleReleaseEvent(payload) {
    const { action, release, repository } = payload;
    
    console.log(`Release ${action}: ${repository.full_name} ${release.tag_name}`);
    
    const event = {
      type: 'release',
      action,
      repository: {
        name: repository.name,
        fullName: repository.full_name
      },
      release: {
        id: release.id,
        tagName: release.tag_name,
        name: release.name,
        draft: release.draft,
        prerelease: release.prerelease,
        author: release.author.login,
        url: release.html_url
      },
      timestamp: new Date().toISOString()
    };

    // Queue the event for processing
    this.eventQueue.enqueue(event);
  }

  /**
   * Handle issues events
   */
  handleIssuesEvent(payload) {
    const { action, issue, repository } = payload;
    
    console.log(`Issue ${action}: ${repository.full_name}#${issue.number}`);
    
    const event = {
      type: 'issues',
      action,
      repository: {
        name: repository.name,
        fullName: repository.full_name
      },
      issue: {
        number: issue.number,
        title: issue.title,
        state: issue.state,
        author: issue.user.login,
        labels: issue.labels.map(label => label.name),
        url: issue.html_url
      },
      timestamp: new Date().toISOString()
    };

    // Queue the event for processing
    this.eventQueue.enqueue(event);
  }

  /**
   * Handle workflow run events
   */
  handleWorkflowRunEvent(payload) {
    const { action, workflow_run, repository } = payload;
    
    console.log(`Workflow ${action}: ${repository.full_name} - ${workflow_run.name}`);
    
    const event = {
      type: 'workflow_run',
      action,
      repository: {
        name: repository.name,
        fullName: repository.full_name
      },
      workflow: {
        id: workflow_run.id,
        name: workflow_run.name,
        status: workflow_run.status,
        conclusion: workflow_run.conclusion,
        branch: workflow_run.head_branch,
        url: workflow_run.html_url
      },
      timestamp: new Date().toISOString()
    };

    // Queue the event for processing
    this.eventQueue.enqueue(event);
  }

  /**
   * Handle star events
   */
  handleStarEvent(payload) {
    const { action, repository, sender } = payload;
    
    console.log(`Repository ${action === 'created' ? 'starred' : 'unstarred'}: ${repository.full_name} by ${sender.login}`);
    
    const event = {
      type: 'star',
      action,
      repository: {
        name: repository.name,
        fullName: repository.full_name,
        stargazersCount: repository.stargazers_count
      },
      user: {
        login: sender.login,
        url: sender.html_url
      },
      timestamp: new Date().toISOString()
    };

    // Queue the event for processing
    this.eventQueue.enqueue(event);
  }

  /**
   * Verify webhook signature
   */
  verifySignature(payload, signature) {
    if (!this.secret) {
      console.warn('No webhook secret configured - skipping signature verification');
      return true;
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.secret)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(`sha256=${expectedSignature}`, 'utf8'),
      Buffer.from(signature, 'utf8')
    );
  }

  /**
   * Express middleware for handling webhook requests
   */
  middleware() {
    return async (req, res, next) => {
      try {
        const signature = req.get('X-Hub-Signature-256');
        const event = req.get('X-GitHub-Event');
        const delivery = req.get('X-GitHub-Delivery');

        // Get raw body for signature verification
        const payload = JSON.stringify(req.body);

        // Verify signature if secret is configured
        if (this.secret && !this.verifySignature(payload, signature)) {
          console.error('Invalid webhook signature');
          return res.status(401).json({ error: 'Invalid signature' });
        }

        console.log(`Received GitHub webhook: ${event} (${delivery})`);

        // Process the webhook
        await this.webhooks.receive({
          id: delivery,
          name: event,
          payload: req.body
        });

        res.status(200).json({ status: 'ok', event, delivery });
      } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    };
  }

  /**
   * Get webhook statistics
   */
  getStats() {
    return {
      secret: !!this.secret,
      eventHandlers: Object.keys(this.webhooks._events || {}),
      listenerCount: this.listenerCount('repository_event') + 
                    this.listenerCount('push_event') +
                    this.listenerCount('pull_request_event') +
                    this.listenerCount('release_event'),
      queue: this.eventQueue.getStats()
    };
  }
}

module.exports = WebhookHandler;