const path = require('path');
const { ConfigManager } = require('../config/utils/config-manager');

/**
 * WebhookProcessor Class
 * 
 * Processes GitHub webhook events and triggers automated deployments.
 * Integrates with the Home Assistant deployment service for CI/CD automation.
 */
class WebhookProcessor {
  constructor() {
    this.configManager = new ConfigManager();
    this.config = null;
    this.deploymentService = null;
  }

  /**
   * Initialize the webhook processor with configuration and services
   */
  async initialize() {
    try {
      this.config = await this.configManager.load(process.env.NODE_ENV || 'production');
      
      // Load deployment service dynamically to avoid circular dependencies
      const { HomeAssistantDeployer } = require('../../scripts/services/home-assistant-deployer');
      this.deploymentService = new HomeAssistantDeployer();
      
      console.log('WebhookProcessor initialized successfully');
    } catch (error) {
      console.error('Failed to initialize WebhookProcessor:', error);
      throw error;
    }
  }

  /**
   * Process a GitHub webhook event
   * @param {Object} payload - The webhook payload
   * @param {Object} headers - The request headers
   * @returns {Object} Processing result
   */
  async processWebhook(payload, headers) {
    const eventType = headers['x-github-event'];
    const delivery = headers['x-github-delivery'];
    
    console.log(`Processing webhook event: ${eventType} (${delivery})`);
    
    try {
      switch (eventType) {
        case 'repository_dispatch':
          return await this.processRepositoryDispatch(payload);
        case 'push':
          return await this.processPushEvent(payload);
        case 'pull_request':
          return await this.processPullRequestEvent(payload);
        case 'ping':
          return this.processPingEvent(payload);
        default:
          console.log(`Ignoring unsupported event type: ${eventType}`);
          return { 
            message: `Event type ${eventType} is not supported for deployment automation`,
            deploymentId: null 
          };
      }
    } catch (error) {
      console.error(`Error processing ${eventType} event:`, error);
      throw error;
    }
  }

  /**
   * Process repository_dispatch event for automated deployments
   * @param {Object} payload - The repository_dispatch payload
   * @returns {Object} Deployment result
   */
  async processRepositoryDispatch(payload) {
    const { action, repository, client_payload } = payload;
    
    console.log(`Processing repository_dispatch: action=${action}, repository=${repository?.full_name}`);
    
    // Validate repository dispatch event
    if (action !== 'deploy-home-assistant-config') {
      throw new Error(`Unsupported repository dispatch action: ${action}`);
    }
    
    // Validate repository
    const configRepo = this.config.deployment.homeAssistantConfig.repository;
    if (repository.full_name !== configRepo) {
      throw new Error(`Invalid repository: ${repository.full_name} (expected: ${configRepo})`);
    }
    
    // Extract deployment parameters
    const deploymentParams = {
      repository: repository.full_name,
      branch: this.extractBranchName(client_payload.ref || 'refs/heads/main'),
      commit: client_payload.sha,
      requestedBy: client_payload.author || 'github-webhook',
      trigger: 'github-webhook-repository-dispatch',
      webhookData: {
        action,
        delivery: client_payload.delivery_id,
        sender: payload.sender?.login,
        repository: repository.full_name
      },
      parameters: {
        reason: 'Automated deployment from CI/CD repository dispatch',
        source: 'github-webhook',
        eventType: 'repository_dispatch'
      }
    };
    
    // Trigger deployment
    const deploymentId = await this.deploymentService.triggerDeployment(deploymentParams);
    
    console.log(`Repository dispatch deployment triggered: ${deploymentId}`);
    
    return {
      deploymentId,
      message: 'Deployment triggered successfully from repository dispatch',
      repository: repository.full_name,
      branch: deploymentParams.branch,
      commit: deploymentParams.commit
    };
  }

  /**
   * Process push event for main branch deployments
   * @param {Object} payload - The push event payload
   * @returns {Object} Deployment result
   */
  async processPushEvent(payload) {
    const { repository, ref, after, pusher, commits } = payload;
    
    console.log(`Processing push event: ref=${ref}, repository=${repository?.full_name}`);
    
    // Only process pushes to main branch
    if (ref !== 'refs/heads/main') {
      return { 
        message: 'Ignoring push to non-main branch', 
        deploymentId: null,
        branch: this.extractBranchName(ref)
      };
    }
    
    // Validate repository
    const configRepo = this.config.deployment.homeAssistantConfig.repository;
    if (repository.full_name !== configRepo) {
      throw new Error(`Invalid repository: ${repository.full_name} (expected: ${configRepo})`);
    }
    
    // Skip if this is a forced push that removes commits
    if (after === '0000000000000000000000000000000000000000') {
      return { 
        message: 'Ignoring branch deletion or forced push', 
        deploymentId: null 
      };
    }
    
    // Extract deployment parameters
    const deploymentParams = {
      repository: repository.full_name,
      branch: 'main',
      commit: after,
      requestedBy: pusher.name || pusher.email,
      trigger: 'github-webhook-push',
      webhookData: {
        ref,
        before: payload.before,
        after,
        pusher: pusher.name,
        commits: commits.map(c => ({
          id: c.id,
          message: c.message,
          author: c.author.name,
          url: c.url
        }))
      },
      parameters: {
        reason: 'Automated deployment from push to main branch',
        source: 'github-webhook',
        eventType: 'push',
        commitCount: commits.length
      }
    };
    
    // Trigger deployment
    const deploymentId = await this.deploymentService.triggerDeployment(deploymentParams);
    
    console.log(`Push event deployment triggered: ${deploymentId}`);
    
    return {
      deploymentId,
      message: 'Deployment triggered successfully from push event',
      repository: repository.full_name,
      branch: 'main',
      commit: after,
      commitCount: commits.length
    };
  }

  /**
   * Process pull request event for merged PRs
   * @param {Object} payload - The pull request event payload
   * @returns {Object} Deployment result
   */
  async processPullRequestEvent(payload) {
    const { action, pull_request, repository } = payload;
    
    console.log(`Processing pull request event: action=${action}, number=${pull_request?.number}`);
    
    // Only process merged PRs to main branch
    if (action !== 'closed' || !pull_request.merged || pull_request.base.ref !== 'main') {
      return { 
        message: 'Ignoring PR event (not a merged PR to main)', 
        deploymentId: null,
        action,
        merged: pull_request.merged,
        targetBranch: pull_request.base.ref
      };
    }
    
    // Validate repository
    const configRepo = this.config.deployment.homeAssistantConfig.repository;
    if (repository.full_name !== configRepo) {
      throw new Error(`Invalid repository: ${repository.full_name} (expected: ${configRepo})`);
    }
    
    // Extract deployment parameters
    const deploymentParams = {
      repository: repository.full_name,
      branch: 'main',
      commit: pull_request.merge_commit_sha,
      requestedBy: pull_request.user.login,
      trigger: 'github-webhook-pr-merge',
      webhookData: {
        prNumber: pull_request.number,
        prTitle: pull_request.title,
        prUrl: pull_request.html_url,
        author: pull_request.user.login,
        mergedBy: pull_request.merged_by?.login,
        mergedAt: pull_request.merged_at
      },
      parameters: {
        reason: `Automated deployment from PR #${pull_request.number}: ${pull_request.title}`,
        source: 'github-webhook',
        eventType: 'pull_request',
        prNumber: pull_request.number
      }
    };
    
    // Trigger deployment
    const deploymentId = await this.deploymentService.triggerDeployment(deploymentParams);
    
    console.log(`PR merge deployment triggered: ${deploymentId}`);
    
    return {
      deploymentId,
      message: `Deployment triggered successfully from PR #${pull_request.number} merge`,
      repository: repository.full_name,
      branch: 'main',
      commit: pull_request.merge_commit_sha,
      prNumber: pull_request.number
    };
  }

  /**
   * Process ping event for webhook validation
   * @param {Object} payload - The ping event payload
   * @returns {Object} Ping result
   */
  processPingEvent(payload) {
    console.log('Processing ping event for webhook validation');
    
    return {
      message: 'Webhook is configured and responding correctly',
      deploymentId: null,
      hook_id: payload.hook_id,
      zen: payload.zen
    };
  }

  /**
   * Extract branch name from Git ref
   * @param {string} ref - Git reference (e.g., refs/heads/main)
   * @returns {string} Branch name
   */
  extractBranchName(ref) {
    return ref.replace('refs/heads/', '');
  }

  /**
   * Validate deployment parameters
   * @param {Object} params - Deployment parameters
   * @throws {Error} If parameters are invalid
   */
  validateDeploymentParams(params) {
    if (!params.repository) {
      throw new Error('Repository is required for deployment');
    }
    
    if (!params.commit) {
      throw new Error('Commit SHA is required for deployment');
    }
    
    if (!params.branch) {
      throw new Error('Branch is required for deployment');
    }
    
    // Validate commit SHA format (40-character hex string)
    if (!/^[a-f0-9]{40}$/i.test(params.commit)) {
      throw new Error(`Invalid commit SHA format: ${params.commit}`);
    }
  }
}

module.exports = { WebhookProcessor };