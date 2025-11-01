const { EventEmitter } = require('events');
const WebhookConfigService = require('../github/webhookConfig');
const { Octokit } = require('@octokit/rest');
const { createLogger } = require('../../utils/logger');
const { 
  errorHandler, 
  createWebhookError, 
  createGitHubAPIError 
} = require('../../utils/errorHandler');

class AutomatedWebhookSetup extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      discoveryInterval: options.discoveryInterval || 300000, // 5 minutes
      batchSize: options.batchSize || 5,
      retryDelay: options.retryDelay || 2000,
      maxRetries: options.maxRetries || 3,
      dryRun: options.dryRun || false,
      autoSetupNewRepos: options.autoSetupNewRepos !== false,
      monitoredOrganizations: options.monitoredOrganizations || [],
      repositoryFilters: options.repositoryFilters || {},
      ...options
    };

    this.octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN
    });

    this.webhookConfigService = new WebhookConfigService();
    
    // Initialize logger
    this.logger = createLogger('automated-webhook-setup');
    
    // State tracking
    this.discoveredRepositories = new Map();
    this.setupQueue = [];
    this.setupHistory = [];
    this.isRunning = false;
    this.stats = {
      totalDiscovered: 0,
      totalConfigured: 0,
      totalFailed: 0,
      lastDiscovery: null,
      lastSetup: null
    };

    this.initializeAutomatedSetup();
    this.logger.info('Automated Webhook Setup initialized');
  }

  async initializeAutomatedSetup() {
    try {
      if (this.options.autoSetupNewRepos) {
        await this.startDiscoveryProcess();
      }
      
      console.log('✅ Automated webhook setup initialized successfully');
    } catch (error) {
      console.error('Failed to initialize automated webhook setup:', error);
    }
  }

  async startDiscoveryProcess() {
    console.log('🔍 Starting repository discovery process');
    
    // Initial discovery
    await this.discoverRepositories();
    
    // Schedule periodic discovery
    this.discoveryTimer = setInterval(async () => {
      try {
        await this.discoverRepositories();
      } catch (error) {
        console.error('Scheduled repository discovery failed:', error);
      }
    }, this.options.discoveryInterval);

    this.isRunning = true;
    console.log(`🔄 Repository discovery scheduled (interval: ${this.options.discoveryInterval}ms)`);
  }

  async discoverRepositories() {
    console.log('🔍 Discovering repositories...');
    
    try {
      const discoveryResults = await Promise.all([
        this.discoverUserRepositories(),
        this.discoverOrganizationRepositories()
      ]);

      const allRepositories = discoveryResults.flat();
      
      // Filter repositories based on criteria
      const filteredRepositories = this.filterRepositories(allRepositories);
      
      // Check which repositories need webhook setup
      const repositoriesNeedingSetup = await this.identifyRepositoriesNeedingSetup(filteredRepositories);
      
      // Add to setup queue
      repositoriesNeedingSetup.forEach(repo => {
        this.addToSetupQueue(repo);
      });

      this.stats.totalDiscovered = allRepositories.length;
      this.stats.lastDiscovery = new Date().toISOString();

      console.log(`📊 Discovery complete: ${allRepositories.length} total, ${filteredRepositories.length} filtered, ${repositoriesNeedingSetup.length} need setup`);
      
      // Process setup queue
      if (repositoriesNeedingSetup.length > 0) {
        await this.processSetupQueue();
      }

      this.emit('discovery_completed', {
        total: allRepositories.length,
        filtered: filteredRepositories.length,
        needingSetup: repositoriesNeedingSetup.length,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Repository discovery failed:', error);
      this.emit('discovery_failed', error);
    }
  }

  async discoverUserRepositories() {
    try {
      console.log('👤 Discovering user repositories...');
      
      const repositories = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await this.octokit.repos.listForAuthenticatedUser({
          visibility: 'all',
          sort: 'updated',
          per_page: 100,
          page
        });

        repositories.push(...response.data);
        hasMore = response.data.length === 100;
        page++;

        // Rate limiting delay
        if (hasMore) {
          await this.delay(100);
        }
      }

      console.log(`📁 Found ${repositories.length} user repositories`);
      return repositories;
    } catch (error) {
      console.error('Failed to discover user repositories:', error);
      return [];
    }
  }

  async discoverOrganizationRepositories() {
    if (this.options.monitoredOrganizations.length === 0) {
      return [];
    }

    console.log(`🏢 Discovering organization repositories for: ${this.options.monitoredOrganizations.join(', ')}`);
    
    const allOrgRepositories = [];

    for (const org of this.options.monitoredOrganizations) {
      try {
        const repositories = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
          const response = await this.octokit.repos.listForOrg({
            org,
            type: 'all',
            sort: 'updated',
            per_page: 100,
            page
          });

          repositories.push(...response.data);
          hasMore = response.data.length === 100;
          page++;

          // Rate limiting delay
          if (hasMore) {
            await this.delay(100);
          }
        }

        console.log(`📁 Found ${repositories.length} repositories for org: ${org}`);
        allOrgRepositories.push(...repositories);

      } catch (error) {
        console.error(`Failed to discover repositories for org ${org}:`, error);
      }
    }

    return allOrgRepositories;
  }

  filterRepositories(repositories) {
    return repositories.filter(repo => {
      // Skip archived repositories
      if (repo.archived && !this.options.repositoryFilters.includeArchived) {
        return false;
      }

      // Skip private repositories if configured
      if (repo.private && this.options.repositoryFilters.excludePrivate) {
        return false;
      }

      // Skip forks if configured
      if (repo.fork && this.options.repositoryFilters.excludeForks) {
        return false;
      }

      // Language filter
      if (this.options.repositoryFilters.languages && this.options.repositoryFilters.languages.length > 0) {
        if (!repo.language || !this.options.repositoryFilters.languages.includes(repo.language.toLowerCase())) {
          return false;
        }
      }

      // Size filter (in KB)
      if (this.options.repositoryFilters.minSize && repo.size < this.options.repositoryFilters.minSize) {
        return false;
      }
      if (this.options.repositoryFilters.maxSize && repo.size > this.options.repositoryFilters.maxSize) {
        return false;
      }

      // Activity filter (last push)
      if (this.options.repositoryFilters.lastActivityDays) {
        const daysSinceUpdate = (Date.now() - new Date(repo.pushed_at)) / (1000 * 60 * 60 * 24);
        if (daysSinceUpdate > this.options.repositoryFilters.lastActivityDays) {
          return false;
        }
      }

      // Name pattern filter
      if (this.options.repositoryFilters.namePattern) {
        const pattern = new RegExp(this.options.repositoryFilters.namePattern, 'i');
        if (!pattern.test(repo.name)) {
          return false;
        }
      }

      // Topic filter
      if (this.options.repositoryFilters.requiredTopics && this.options.repositoryFilters.requiredTopics.length > 0) {
        const repoTopics = repo.topics || [];
        const hasRequiredTopic = this.options.repositoryFilters.requiredTopics.some(topic => 
          repoTopics.includes(topic)
        );
        if (!hasRequiredTopic) {
          return false;
        }
      }

      return true;
    });
  }

  async identifyRepositoriesNeedingSetup(repositories) {
    console.log(`🔍 Checking webhook status for ${repositories.length} repositories...`);
    
    const repositoriesNeedingSetup = [];
    
    // Process in batches to avoid rate limiting
    for (let i = 0; i < repositories.length; i += this.options.batchSize) {
      const batch = repositories.slice(i, i + this.options.batchSize);
      
      const batchPromises = batch.map(async (repo) => {
        try {
          const webhookStatus = await this.webhookConfigService.getRepositoryWebhookStatus(
            repo.owner.login,
            repo.name
          );

          // Update discovered repositories cache
          this.discoveredRepositories.set(repo.full_name, {
            repository: repo,
            webhookConfigured: webhookStatus.configured,
            lastChecked: new Date().toISOString()
          });

          if (!webhookStatus.configured) {
            return {
              repository: repo,
              reason: 'No webhook configured',
              priority: this.calculateSetupPriority(repo)
            };
          }

          // Check if webhook needs updating (different events, URL, etc.)
          if (webhookStatus.webhook && this.needsWebhookUpdate(webhookStatus.webhook)) {
            return {
              repository: repo,
              reason: 'Webhook needs updating',
              priority: this.calculateSetupPriority(repo),
              updateRequired: true
            };
          }

          return null;
        } catch (error) {
          console.error(`Failed to check webhook status for ${repo.full_name}:`, error);
          return {
            repository: repo,
            reason: `Failed to check status: ${error.message}`,
            priority: 'low',
            error: true
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      const needingSetup = batchResults.filter(result => result !== null);
      repositoriesNeedingSetup.push(...needingSetup);

      // Rate limiting delay between batches
      if (i + this.options.batchSize < repositories.length) {
        await this.delay(1000);
      }
    }

    // Sort by priority
    repositoriesNeedingSetup.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

    return repositoriesNeedingSetup;
  }

  calculateSetupPriority(repository) {
    let score = 0;

    // Size and activity indicators
    if (repository.stargazers_count > 10) score += 2;
    if (repository.stargazers_count > 100) score += 2;
    if (repository.forks_count > 5) score += 1;
    
    // Recent activity
    const daysSinceUpdate = (Date.now() - new Date(repository.pushed_at)) / (1000 * 60 * 60 * 24);
    if (daysSinceUpdate < 7) score += 3;
    else if (daysSinceUpdate < 30) score += 2;
    else if (daysSinceUpdate < 90) score += 1;

    // Language preference (can be configured)
    const preferredLanguages = ['javascript', 'typescript', 'python', 'go', 'rust'];
    if (repository.language && preferredLanguages.includes(repository.language.toLowerCase())) {
      score += 2;
    }

    // Has CI/CD indicators
    if (repository.has_workflows) score += 2;
    
    // Organization vs personal
    if (repository.owner.type === 'Organization') score += 1;

    // Determine priority based on score
    if (score >= 8) return 'high';
    if (score >= 4) return 'medium';
    return 'low';
  }

  needsWebhookUpdate(webhook) {
    const expectedEvents = this.webhookConfigService.getWebhookEvents();
    const expectedUrl = process.env.WEBHOOK_URL;

    // Check URL
    if (webhook.url !== expectedUrl) {
      return true;
    }

    // Check events (should have all expected events)
    const missingEvents = expectedEvents.filter(event => !webhook.events.includes(event));
    if (missingEvents.length > 0) {
      return true;
    }

    // Check if webhook is active
    if (!webhook.active) {
      return true;
    }

    return false;
  }

  addToSetupQueue(item) {
    // Avoid duplicates
    const exists = this.setupQueue.find(queued => 
      queued.repository.full_name === item.repository.full_name
    );

    if (!exists) {
      this.setupQueue.push({
        ...item,
        queuedAt: new Date().toISOString(),
        attempts: 0
      });
    }
  }

  async processSetupQueue() {
    if (this.setupQueue.length === 0) {
      return;
    }

    console.log(`⚙️  Processing webhook setup queue: ${this.setupQueue.length} repositories`);

    // Process in batches
    while (this.setupQueue.length > 0) {
      const batch = this.setupQueue.splice(0, this.options.batchSize);
      
      const batchPromises = batch.map(item => this.setupRepositoryWebhook(item));
      await Promise.all(batchPromises);

      // Rate limiting delay between batches
      if (this.setupQueue.length > 0) {
        await this.delay(2000);
      }
    }

    console.log('✅ Webhook setup queue processing complete');
    this.emit('setup_queue_processed');
  }

  async setupRepositoryWebhook(item) {
    const { repository, reason, updateRequired } = item;
    
    console.log(`🔧 Setting up webhook for ${repository.full_name} (${reason})`);

    if (this.options.dryRun) {
      console.log(`🔍 DRY RUN: Would setup webhook for ${repository.full_name}`);
      return this.recordSetupResult(item, true, 'Dry run - no actual setup performed');
    }

    try {
      let result;
      
      if (updateRequired) {
        // Update existing webhook
        result = await this.webhookConfigService.setupRepositoryWebhooks(
          repository.owner.login,
          repository.name
        );
      } else {
        // Create new webhook
        result = await this.webhookConfigService.setupRepositoryWebhooks(
          repository.owner.login,
          repository.name
        );
      }

      // Test the webhook
      const testResult = await this.webhookConfigService.testWebhookDelivery(
        repository.owner.login,
        repository.name
      );

      const success = result && testResult.success;
      const message = success ? 
        'Webhook configured and tested successfully' : 
        `Webhook configured but test failed: ${testResult.error}`;

      await this.recordSetupResult(item, success, message);

      if (success) {
        this.stats.totalConfigured++;
        console.log(`✅ Webhook setup successful for ${repository.full_name}`);
      } else {
        this.stats.totalFailed++;
        console.log(`⚠️  Webhook setup completed with issues for ${repository.full_name}: ${message}`);
      }

      this.emit('webhook_setup_completed', {
        repository: repository.full_name,
        success,
        message,
        updateRequired
      });

    } catch (error) {
      console.error(`❌ Failed to setup webhook for ${repository.full_name}:`, error);
      
      await this.recordSetupResult(item, false, error.message);
      this.stats.totalFailed++;

      // Retry logic
      if (item.attempts < this.options.maxRetries) {
        item.attempts++;
        console.log(`🔄 Retrying setup for ${repository.full_name} (attempt ${item.attempts}/${this.options.maxRetries})`);
        
        setTimeout(() => {
          this.setupQueue.push(item);
        }, this.options.retryDelay * item.attempts);
      }

      this.emit('webhook_setup_failed', {
        repository: repository.full_name,
        error: error.message,
        attempts: item.attempts
      });
    }
  }

  async recordSetupResult(item, success, message) {
    const result = {
      repository: item.repository.full_name,
      reason: item.reason,
      priority: item.priority,
      success,
      message,
      attempts: item.attempts,
      timestamp: new Date().toISOString(),
      updateRequired: item.updateRequired || false
    };

    this.setupHistory.unshift(result);
    
    // Keep only last 1000 results
    if (this.setupHistory.length > 1000) {
      this.setupHistory = this.setupHistory.slice(0, 1000);
    }

    this.stats.lastSetup = result.timestamp;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Public API methods
  async manualSetup(repositoryFullName) {
    const [owner, repo] = repositoryFullName.split('/');
    
    try {
      console.log(`🔧 Manual webhook setup for ${repositoryFullName}`);
      
      const result = await this.webhookConfigService.setupRepositoryWebhooks(owner, repo);
      const testResult = await this.webhookConfigService.testWebhookDelivery(owner, repo);

      return {
        success: true,
        webhook: result,
        test: testResult,
        message: 'Webhook setup completed successfully'
      };
    } catch (error) {
      console.error(`Manual setup failed for ${repositoryFullName}:`, error);
      return {
        success: false,
        error: error.message,
        message: 'Manual webhook setup failed'
      };
    }
  }

  async bulkSetup(repositoryList, options = {}) {
    console.log(`🔧 Bulk webhook setup for ${repositoryList.length} repositories`);
    
    const results = [];
    const batchSize = options.batchSize || this.options.batchSize;
    
    for (let i = 0; i < repositoryList.length; i += batchSize) {
      const batch = repositoryList.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (repoName) => {
        try {
          const result = await this.manualSetup(repoName);
          return { repository: repoName, ...result };
        } catch (error) {
          return {
            repository: repoName,
            success: false,
            error: error.message
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Rate limiting delay between batches
      if (i + batchSize < repositoryList.length) {
        await this.delay(2000);
      }
    }

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`📊 Bulk setup complete: ${successful.length} successful, ${failed.length} failed`);

    return {
      total: repositoryList.length,
      successful: successful.length,
      failed: failed.length,
      results
    };
  }

  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      queueSize: this.setupQueue.length,
      discoveredRepositories: this.discoveredRepositories.size,
      setupHistory: this.setupHistory.length,
      successRate: this.stats.totalConfigured + this.stats.totalFailed > 0 ?
        ((this.stats.totalConfigured / (this.stats.totalConfigured + this.stats.totalFailed)) * 100).toFixed(2) + '%' : '0%',
      lastUpdated: new Date().toISOString()
    };
  }

  getSetupHistory(limit = 50) {
    return this.setupHistory.slice(0, limit);
  }

  getDiscoveredRepositories() {
    return Array.from(this.discoveredRepositories.values()).map(item => ({
      repository: {
        fullName: item.repository.full_name,
        name: item.repository.name,
        owner: item.repository.owner.login,
        private: item.repository.private,
        language: item.repository.language,
        stars: item.repository.stargazers_count,
        lastPush: item.repository.pushed_at
      },
      webhookConfigured: item.webhookConfigured,
      lastChecked: item.lastChecked
    }));
  }

  async forceDiscovery() {
    console.log('🔄 Forcing repository discovery...');
    await this.discoverRepositories();
  }

  updateConfiguration(newOptions) {
    this.options = { ...this.options, ...newOptions };
    console.log('⚙️  Updated automated setup configuration');
    this.emit('configuration_updated', this.options);
  }

  async stop() {
    console.log('🛑 Stopping automated webhook setup...');
    
    this.isRunning = false;
    
    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer);
    }

    this.removeAllListeners();
    console.log('✅ Automated webhook setup stopped');
  }
}

module.exports = AutomatedWebhookSetup;